-- Permite abrir chamados em qualquer departamento ao qual o usuário esteja vinculado.
-- Os vínculos continuam sendo administrados exclusivamente pela TIC/Edge Function.
begin;

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

notify pgrst, 'reload schema';
commit;
