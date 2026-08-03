-- Hardening final para produção do Sistema de Chamados CRQ-12.
-- Execute uma única vez no SQL Editor, autenticado como administrador do projeto.
begin;

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.ticket_attachments add column if not exists event_id uuid references public.ticket_events(id) on delete set null;
alter table public.ticket_attachments add column if not exists mime_type text;
alter table public.tickets add column if not exists status_before_delete text;
create index if not exists ticket_attachments_event_idx on public.ticket_attachments (event_id);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public
as $$ select role::text from public.profiles where id::text = auth.uid()::text and active = true $$;

create or replace function public.current_department_ids()
returns text[] language sql stable security definer set search_path = public
as $$
  select array_remove(array_prepend(department_id::text, managed_department_ids::text[]), null)
  from public.profiles where id::text = auth.uid()::text and active = true
$$;

-- 1. Perfil inicial: o usuário só escolhe o setor uma vez, logo após o cadastro.
create or replace function public.complete_own_profile(p_full_name text, p_department_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_new public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'Nome inválido'; end if;
  if not exists (select 1 from public.departments where id::text = p_department_id) then
    raise exception 'Departamento inválido';
  end if;

  select * into v_profile from public.profiles where id::text = auth.uid()::text and department_id is null for update;
  if not found then raise exception 'Perfil já concluído ou não encontrado'; end if;
  v_new := jsonb_populate_record(v_profile, jsonb_build_object('department_id', p_department_id));

  update public.profiles
  set full_name = trim(p_full_name), department_id = v_new.department_id,
      role = 'usuario', managed_department_ids = '{}', active = true,
      pending_approval = false, requested_role = null, approved_by_tic = false,
      updated_at = now()
  where id::text = auth.uid()::text;
end;
$$;

revoke all on function public.complete_own_profile(text, text) from public;
grant execute on function public.complete_own_profile(text, text) to authenticated;

-- 2. Atualização de chamado centralizada: somente a TIC altera campos operacionais.
create or replace function public.update_ticket_secure(p_ticket_id bigint, p_patch jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_new public.tickets%rowtype;
  v_role text;
  v_actor_depts text[];
  v_requested_status text;
  v_is_requester boolean;
  v_is_manager boolean;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select role::text,
         array_remove(array_prepend(department_id::text, managed_department_ids::text[]), null)
    into v_role, v_actor_depts
  from public.profiles where id::text = auth.uid()::text and active = true;
  if v_role is null then raise exception 'Perfil inativo ou inexistente'; end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'Chamado não encontrado'; end if;

  v_is_requester := v_ticket.requester_id::text = auth.uid()::text;
  v_is_manager := v_role = 'gestor' and v_ticket.department_id::text = any(v_actor_depts);
  if v_role <> 'tic' and not v_is_requester and not v_is_manager then
    raise exception 'Sem permissão para atualizar este chamado';
  end if;

  if v_role = 'tic' then
    -- jsonb_populate_record converte conforme os tipos reais da instalação,
    -- funcionando tanto com enum quanto com varchar/text.
    v_new := jsonb_populate_record(v_ticket, p_patch);
    update public.tickets set
      status = v_new.status,
      priority = v_new.priority,
      assigned_id = v_new.assigned_id,
      observer_ids = v_new.observer_ids,
      updated_at = v_new.updated_at,
      response_started_at = v_new.response_started_at,
      solved_at = v_new.solved_at,
      closed_at = v_new.closed_at,
      planned_for = v_new.planned_for,
      planned_notification_sent = v_new.planned_notification_sent,
      pending_started_at = v_new.pending_started_at,
      total_pending_ms = v_new.total_pending_ms
      ,status_before_delete = v_new.status_before_delete
    where id = p_ticket_id;
  else
    v_requested_status := coalesce(nullif(p_patch->>'status', ''), v_ticket.status::text);
    if v_requested_status not in (v_ticket.status::text, 'excluido') then
      raise exception 'Somente a TIC pode alterar o andamento do chamado';
    end if;
    v_new := jsonb_populate_record(v_ticket, jsonb_build_object(
      'status', v_requested_status,
      'updated_at', coalesce(nullif(p_patch->>'updated_at', ''), now()::text)
    ));
    update public.tickets set status = v_new.status, updated_at = v_new.updated_at where id = p_ticket_id;
  end if;
  return true;
end;
$$;

revoke all on function public.update_ticket_secure(bigint, jsonb) from public;
grant execute on function public.update_ticket_secure(bigint, jsonb) to authenticated;

-- 3. Um usuário comum vê somente seus chamados/observações. Gestor vê sua equipe.
drop policy if exists tickets_read_scope on public.tickets;
create policy tickets_read_scope on public.tickets for select to authenticated using (
  public.current_user_role() = 'tic'
  or requester_id::text = auth.uid()::text
  or assigned_id::text = auth.uid()::text
  or auth.uid()::text = any(observer_ids::text[])
  or (public.current_user_role() = 'gestor' and department_id::text = any(public.current_department_ids()))
);

drop policy if exists tickets_create_own on public.tickets;
create policy tickets_create_own on public.tickets for insert to authenticated with check (
  requester_id::text = auth.uid()::text
  and status::text = 'novo'
  and assigned_id is null
  and response_started_at is null and solved_at is null and closed_at is null
  and (
    public.current_user_role() = 'tic'
    or department_id::text = any(public.current_department_ids())
  )
);

drop policy if exists tickets_update_scope on public.tickets;
revoke update on table public.tickets from authenticated;

-- 4. Perfil próprio: somente campos pessoais. Administração passa pela Edge Function.
drop policy if exists profiles_tic_update on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id::text = auth.uid()::text and active = true)
with check (id::text = auth.uid()::text and active = true);
revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, onboarding_completed_at, must_change_password) on public.profiles to authenticated;

-- 5. Anexos somente em chamados visíveis e ligados ao evento correto.
drop policy if exists attachments_create_scope on public.ticket_attachments;
create policy attachments_create_scope on public.ticket_attachments for insert to authenticated with check (
  uploaded_by::text = auth.uid()::text
  and exists (select 1 from public.tickets t where t.id::text = ticket_id::text)
  and (event_id is null or exists (
    select 1 from public.ticket_events e where e.id::text = event_id::text and e.ticket_id::text = ticket_id::text
  ))
);

drop policy if exists ticket_files_create_scope on storage.objects;
create policy ticket_files_create_scope on storage.objects for insert to authenticated with check (
  bucket_id = 'ticket-attachments'
  and lower(storage.extension(name)) = any(array['pdf','png','jpg','jpeg','webp','txt','csv','doc','docx','xls','xlsx','ppt','pptx','odt','ods'])
  and exists (select 1 from public.tickets t where t.id::text = (storage.foldername(name))[1])
);

-- 6. Notificações só podem alcançar participantes legítimos de um chamado.
drop policy if exists notifications_insert_authenticated on public.notifications;
drop policy if exists notifications_insert_scoped on public.notifications;
create policy notifications_insert_scoped on public.notifications for insert to authenticated with check (
  public.current_user_role() = 'tic'
  or (
    ticket_id is not null
    and exists (
      select 1 from public.tickets t
      where t.id::text = ticket_id::text
      and (
        t.requester_id::text = user_id::text or t.assigned_id::text = user_id::text or user_id::text = any(t.observer_ids::text[])
        or exists (select 1 from public.profiles p where p.id::text = user_id::text and p.role::text = 'tic' and p.active = true)
      )
    )
  )
);

notify pgrst, 'reload schema';
commit;
