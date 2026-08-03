-- Padroniza o estado de leitura das notificações no formato usado pela aplicação.
begin;

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

alter table public.notifications
  add constraint notifications_channel_check
  check (channel in ('plataforma', 'navegador'));

notify pgrst, 'reload schema';
commit;
