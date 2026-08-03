-- Vincula anexos aos complementos individuais do histórico.
-- Execute este arquivo uma vez no SQL Editor do Supabase.
begin;

alter table public.ticket_attachments
  add column if not exists event_id uuid
  references public.ticket_events (id) on delete set null;

create index if not exists ticket_attachments_event_idx
  on public.ticket_attachments (event_id);

notify pgrst, 'reload schema';

commit;
