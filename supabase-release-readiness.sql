-- Ajustes finais idempotentes para a publicação do CRQ-12.
-- Execute no SQL Editor depois de supabase-production-hardening.sql.
begin;

-- Preserva o estado correto quando um chamado sai da lixeira após recarregar a aplicação.
alter table public.tickets add column if not exists status_before_delete text;

-- As notificações e seus anexos acompanham a exclusão definitiva do chamado.
alter table public.notifications drop constraint if exists notifications_ticket_id_fkey;
alter table public.notifications add constraint notifications_ticket_id_fkey
  foreign key (ticket_id) references public.tickets(id) on delete cascade;

-- Impede prioridades e estados inválidos no novo campo de restauração.
alter table public.tickets drop constraint if exists tickets_status_before_delete_check;
alter table public.tickets add constraint tickets_status_before_delete_check
  check (status_before_delete is null or status_before_delete in ('novo','atribuido','planejado','pendente','solucionado','fechado'));

notify pgrst, 'reload schema';
commit;
