-- Estabilização do Sistema de Chamados CRQ-12
-- Execute uma única vez no SQL Editor do Supabase, após fazer backup.

alter table public.profiles add column if not exists pending_approval boolean not null default false;
-- Usa text para funcionar tanto em instalações antigas (role em text) quanto
-- nas novas (role em enum). A validação mantém os mesmos valores permitidos.
alter table public.profiles add column if not exists requested_role text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_requested_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_requested_role_check
      check (requested_role is null or requested_role in ('usuario', 'gestor', 'tic'));
  end if;
end $$;

alter table public.profiles add column if not exists approved_by_tic boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles drop column if exists phone;
create unique index if not exists profiles_email_lower_unique on public.profiles (lower(email));

alter table public.tickets add column if not exists planned_for timestamptz;
alter table public.tickets add column if not exists planned_notification_sent boolean not null default false;
alter table public.tickets add column if not exists pending_started_at timestamptz;
alter table public.tickets add column if not exists total_pending_ms bigint not null default 0;
alter table public.ticket_attachments add column if not exists mime_type text;
alter table public.ticket_attachments add column if not exists event_id uuid references public.ticket_events (id) on delete set null;
create index if not exists ticket_attachments_event_idx on public.ticket_attachments (event_id);
alter table public.notifications add column if not exists read boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'read_at'
  ) then
    update public.notifications set read = (read_at is not null);
    alter table public.notifications drop column read_at;
  end if;
end $$;

alter table public.notifications drop constraint if exists notifications_channel_check;
update public.notifications
set channel = case
  when channel in ('platforma', 'email') then 'plataforma'
  when channel = 'browser' then 'navegador'
  else channel
end;
alter table public.notifications add constraint notifications_channel_check check (channel in ('plataforma', 'navegador'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-attachments', 'ticket-attachments', false, 2097152)
on conflict (id) do update set public = false, file_size_limit = 2097152;

-- Garante que todo usuário autenticado tenha perfil, sem aceitar papel privilegiado do cliente.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, active, pending_approval)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    'usuario',
    true,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Recupera contas que continuam no Auth, mas tiveram a linha de profiles apagada.
insert into public.profiles (id, full_name, email, role, active, pending_approval)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(u.email, ''), '@', 1)),
  coalesce(u.email, ''),
  'usuario',
  true,
  false
from auth.users u
where not exists (select 1 from public.profiles p where p.id::text = u.id::text)
on conflict (id) do nothing;

-- IMPORTANTE: depois da recuperação, confirme o administrador TIC manualmente:
-- update public.profiles
-- set role = 'tic', active = true, pending_approval = false, approved_by_tic = true
-- where email = 'SEU_EMAIL_INSTITUCIONAL';

create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$ select role::text from public.profiles where id::text = auth.uid()::text $$;

create or replace function public.current_department_ids()
returns text[]
language sql stable security definer set search_path = public
as $$
  select array_remove(array_prepend(department_id::text, managed_department_ids::text[]), null)
  from public.profiles where id::text = auth.uid()::text
$$;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (true);
drop policy if exists departments_tic_write on public.departments;
create policy departments_tic_write on public.departments for all to authenticated
using (public.current_user_role() = 'tic') with check (public.current_user_role() = 'tic');

drop policy if exists profiles_read_scope on public.profiles;
create policy profiles_read_scope on public.profiles for select to authenticated using (
  id::text = auth.uid()::text
  or public.current_user_role() = 'tic'
  or (public.current_user_role() = 'gestor' and (
    department_id::text = any(public.current_department_ids())
    or managed_department_ids::text[] && public.current_department_ids()
  ))
);
drop policy if exists profiles_tic_update on public.profiles;
create policy profiles_tic_update on public.profiles for update to authenticated
using (public.current_user_role() = 'tic' or id::text = auth.uid()::text)
with check (public.current_user_role() = 'tic' or (id::text = auth.uid()::text and role::text = public.current_user_role()));

drop policy if exists tickets_read_scope on public.tickets;
create policy tickets_read_scope on public.tickets for select to authenticated using (
  public.current_user_role() = 'tic'
  or requester_id::text = auth.uid()::text
  or assigned_id::text = auth.uid()::text
  or auth.uid()::text = any(observer_ids::text[])
  or department_id::text = any(public.current_department_ids())
);
drop policy if exists tickets_create_own on public.tickets;
create policy tickets_create_own on public.tickets for insert to authenticated
with check (requester_id::text = auth.uid()::text);
drop policy if exists tickets_update_scope on public.tickets;
create policy tickets_update_scope on public.tickets for update to authenticated
using (public.current_user_role() = 'tic' or requester_id::text = auth.uid()::text or (public.current_user_role() = 'gestor' and department_id::text = any(public.current_department_ids())))
with check (public.current_user_role() = 'tic' or requester_id::text = auth.uid()::text or (public.current_user_role() = 'gestor' and department_id::text = any(public.current_department_ids())));
drop policy if exists tickets_tic_delete on public.tickets;
create policy tickets_tic_delete on public.tickets for delete to authenticated using (public.current_user_role() = 'tic');

drop policy if exists ticket_events_read_scope on public.ticket_events;
create policy ticket_events_read_scope on public.ticket_events for select to authenticated using (
  exists (select 1 from public.tickets t where t.id::text = ticket_id::text)
);
drop policy if exists ticket_events_create_scope on public.ticket_events;
create policy ticket_events_create_scope on public.ticket_events for insert to authenticated with check (
  actor_id::text = auth.uid()::text and exists (select 1 from public.tickets t where t.id::text = ticket_id::text)
);

drop policy if exists attachments_read_scope on public.ticket_attachments;
create policy attachments_read_scope on public.ticket_attachments for select to authenticated using (
  exists (select 1 from public.tickets t where t.id::text = ticket_id::text)
);
drop policy if exists attachments_create_scope on public.ticket_attachments;
create policy attachments_create_scope on public.ticket_attachments for insert to authenticated with check (
  uploaded_by is null or uploaded_by::text = auth.uid()::text
);

drop policy if exists ticket_files_read_scope on storage.objects;
create policy ticket_files_read_scope on storage.objects for select to authenticated using (
  bucket_id = 'ticket-attachments'
  and exists (
    select 1 from public.tickets t
    where t.id::text = (storage.foldername(name))[1]
  )
);
drop policy if exists ticket_files_create_scope on storage.objects;
create policy ticket_files_create_scope on storage.objects for insert to authenticated with check (
  bucket_id = 'ticket-attachments'
  and exists (
    select 1 from public.tickets t
    where t.id::text = (storage.foldername(name))[1]
  )
);
drop policy if exists ticket_files_tic_delete on storage.objects;
create policy ticket_files_tic_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ticket-attachments' and public.current_user_role() = 'tic'
);

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id::text = auth.uid()::text);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);
drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated on public.notifications for insert to authenticated with check (auth.uid() is not null);
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id::text = auth.uid()::text);

alter table public.tickets drop column if exists response_due_at;
alter table public.tickets drop column if exists solution_due_at;
drop table if exists public.sla_rules;

-- Realtime para comentários, mudanças de status, notificações e presença.
do $$
begin
  alter publication supabase_realtime add table public.tickets, public.ticket_events, public.notifications, public.profiles;
exception when duplicate_object then null;
end $$;
