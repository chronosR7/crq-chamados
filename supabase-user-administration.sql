-- Execute uma vez no SQL Editor do Supabase.
-- A criação e exclusão definitiva de usuários ocorre pela Edge Function manage-user,
-- que usa service_role e valida TIC/gestor no servidor. As políticas abaixo
-- removem permissões diretas antigas que poderiam contornar esse fluxo.

alter table public.profiles enable row level security;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles drop column if exists phone;
alter table public.tickets drop column if exists response_due_at;
alter table public.tickets drop column if exists solution_due_at;
drop table if exists public.sla_rules;

drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
drop policy if exists profiles_manager_insert on public.profiles;
drop policy if exists profiles_manager_delete on public.profiles;

-- Nenhum cliente autenticado cria ou apaga profiles diretamente.
-- A service_role da Edge Function ignora RLS de forma controlada.
revoke insert, delete on table public.profiles from authenticated;

-- Leitura continua limitada pela profiles_read_scope já instalada.
-- Atualização administrativa existente permanece separada; criação/exclusão
-- sempre passa pela função manage-user e suas verificações de departamento.

-- Em Authentication > Providers > Email, mantenha "Allow new users to sign up"
-- ativado e desative apenas "Confirm email" se o primeiro acesso não deve enviar e-mail.
