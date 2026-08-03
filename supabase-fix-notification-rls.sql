-- Corrige o envio de notificações de Usuário/Gestor para a equipe TIC.
-- A função consulta somente se um perfil é uma TIC ativa e evita que a RLS de
-- profiles esconda o destinatário durante a validação da notificação.
begin;

create or replace function public.is_active_tic_user(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id::text = p_user_id
      and p.role::text = 'tic'
      and p.active = true
  );
$$;

revoke all on function public.is_active_tic_user(text) from public;
grant execute on function public.is_active_tic_user(text) to authenticated;

drop policy if exists notifications_insert_authenticated on public.notifications;
drop policy if exists notifications_insert_scoped on public.notifications;

create policy notifications_insert_scoped
on public.notifications
for insert
to authenticated
with check (
  public.current_user_role() = 'tic'
  or (
    ticket_id is not null
    and exists (
      select 1
      from public.tickets t
      where t.id::text = ticket_id::text
        and (
          t.requester_id::text = user_id::text
          or t.assigned_id::text = user_id::text
          or user_id::text = any(coalesce(t.observer_ids::text[], array[]::text[]))
          or public.is_active_tic_user(user_id::text)
        )
    )
  )
);

notify pgrst, 'reload schema';
commit;

