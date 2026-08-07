-- Preferência persistente da nota de atualização v1.1.
-- O texto guarda a última versão reconhecida e permite reutilizar o mesmo fluxo
-- em atualizações futuras sem criar uma coluna para cada lançamento.
alter table public.profiles
  add column if not exists acknowledged_release_version text;

grant select (acknowledged_release_version) on public.profiles to authenticated;
grant update (acknowledged_release_version) on public.profiles to authenticated;

comment on column public.profiles.acknowledged_release_version is
  'Última nota de atualização que o usuário optou por não visualizar novamente.';

select pg_notify('pgrst', 'reload schema');
