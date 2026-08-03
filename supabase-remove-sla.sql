-- Remove definitivamente cronômetros e configurações de SLA.
-- Prioridade, status, datas de abertura/atualização e agendamento permanecem.

begin;

alter table public.tickets drop column if exists response_due_at;
alter table public.tickets drop column if exists solution_due_at;
drop table if exists public.sla_rules;

-- Bancos criados nas primeiras versões podem ter tickets.id sem sequence.
-- Garante IDs globais e atômicos sem sobrescrever uma identity já existente.
do $$
declare
  sequence_name text;
  next_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.tickets', 'id');
  if sequence_name is null then
    create sequence if not exists public.tickets_id_seq;
    alter sequence public.tickets_id_seq owned by public.tickets.id;
    alter table public.tickets alter column id set default nextval('public.tickets_id_seq');
    sequence_name := 'public.tickets_id_seq';
  end if;

  select coalesce(max(id), 0) + 1 into next_id from public.tickets;
  perform setval(sequence_name::regclass, next_id, false);
end $$;

notify pgrst, 'reload schema';

commit;
