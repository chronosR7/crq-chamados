-- Permite excluir definitivamente uma conta sem apagar o histórico dos chamados.
-- Execute uma vez antes de publicar a nova Edge Function manage-user.
begin;

-- Ao apagar profiles, referências históricas passam a indicar "Usuário removido".
alter table public.tickets alter column requester_id drop not null;

alter table public.tickets drop constraint if exists tickets_requester_id_fkey;
alter table public.tickets add constraint tickets_requester_id_fkey
  foreign key (requester_id) references public.profiles(id) on delete set null;

alter table public.tickets drop constraint if exists tickets_assigned_id_fkey;
alter table public.tickets add constraint tickets_assigned_id_fkey
  foreign key (assigned_id) references public.profiles(id) on delete set null;

-- Neste projeto actor_id é varchar por compatibilidade com históricos antigos,
-- enquanto profiles.id é uuid. Não criamos uma FK incompatível: o texto do
-- evento e o identificador do autor permanecem preservados após a exclusão.
alter table public.ticket_events drop constraint if exists ticket_events_actor_id_fkey;

-- uploaded_by também é varchar neste banco legado. Mantemos o identificador
-- textual no anexo sem tentar relacioná-lo a profiles.id (uuid).
alter table public.ticket_attachments drop constraint if exists ticket_attachments_uploaded_by_fkey;

notify pgrst, 'reload schema';
commit;
