-- Base de Conhecimento administrável do CRQ-12.
-- Execute uma única vez no SQL Editor do Supabase. O script é idempotente.
begin;

create table if not exists public.knowledge_tutorials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  summary text not null check (char_length(summary) between 3 and 300),
  category text not null check (char_length(category) between 2 and 60),
  icon text not null default 'book-open',
  audience_roles text[] not null default array['usuario','gestor','tic'],
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0),
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_audience_valid check (
    cardinality(audience_roles) > 0 and audience_roles <@ array['usuario','gestor','tic']::text[]
  )
);

alter table public.knowledge_tutorials enable row level security;
grant select on public.knowledge_tutorials to authenticated;
grant insert, update, delete on public.knowledge_tutorials to authenticated;

drop policy if exists knowledge_read_audience on public.knowledge_tutorials;
create policy knowledge_read_audience on public.knowledge_tutorials for select to authenticated using (
  public.current_user_role() = 'tic'
  or (published = true and public.current_user_role()::text = any(audience_roles))
);
drop policy if exists knowledge_tic_insert on public.knowledge_tutorials;
create policy knowledge_tic_insert on public.knowledge_tutorials for insert to authenticated with check (
  public.current_user_role() = 'tic' and created_by::text = auth.uid()::text
);
drop policy if exists knowledge_tic_update on public.knowledge_tutorials;
create policy knowledge_tic_update on public.knowledge_tutorials for update to authenticated
  using (public.current_user_role() = 'tic') with check (public.current_user_role() = 'tic');
drop policy if exists knowledge_tic_delete on public.knowledge_tutorials;
create policy knowledge_tic_delete on public.knowledge_tutorials for delete to authenticated
  using (public.current_user_role() = 'tic');

-- Conteúdo inicial: depois da instalação, todos estes itens podem ser editados ou excluídos pela TIC.
insert into public.knowledge_tutorials (id,title,summary,category,icon,audience_roles,steps,published,created_by) values
('10000000-0000-4000-8000-000000000001','Como abrir um chamado','Registre uma solicitação com categoria, prioridade, descrição e anexos.','Chamados','square-plus',array['usuario','gestor','tic'],
 '[{"title":"Acesse Novo chamado","text":"Use Novo chamado no menu lateral ou o botão + no topo.","button":"Novo chamado","view":"new-ticket"},{"title":"Classifique a solicitação","text":"Escolha Incidente para erros e Requisição para acessos, instalações, orientações ou melhorias."},{"title":"Informe e envie","text":"Preencha categoria, prioridade, departamento, título e descrição; anexe evidências e clique em Abrir chamado.","button":"Abrir chamado"}]',true,null),
('10000000-0000-4000-8000-000000000002','Consultar e acompanhar chamados','Localize um chamado, interprete o status e abra os detalhes.','Chamados','list-filter',array['usuario','gestor','tic'],
 '[{"title":"Abra a fila","text":"Entre em Fila de Chamados para visualizar os chamados permitidos ao seu perfil.","button":"Fila de Chamados","view":"tickets"},{"title":"Use os filtros","text":"Pesquise por ID, título, descrição, requerente, departamento, status ou prioridade."},{"title":"Abra os detalhes","text":"Clique na linha do chamado para consultar dados, anexos, ações e histórico."}]',true,null),
('10000000-0000-4000-8000-000000000003','Complementar chamado e anexar arquivos','Adicione informações ao histórico e notifique os participantes.','Chamados','message-square-plus',array['usuario','gestor','tic'],
 '[{"title":"Abra o chamado","text":"Localize o chamado na fila e abra os detalhes.","view":"tickets"},{"title":"Registre o complemento","text":"Digite a informação, inclua os arquivos necessários e clique em Adicionar.","button":"Adicionar"},{"title":"Confirme o histórico","text":"A mensagem ficará registrada com autor e horário e notificará os participantes."}]',true,null),
('10000000-0000-4000-8000-000000000004','Usar a central de notificações','Leia avisos de respostas, mudanças de status e agendamentos.','Comunicação','bell',array['usuario','gestor','tic'],
 '[{"title":"Abra Notificações","text":"Clique no sino superior ou em Notificações no menu lateral.","button":"Notificações","view":"notifications"},{"title":"Leia as atualizações","text":"Cada aviso informa o chamado relacionado e o motivo."},{"title":"Organize os avisos","text":"Marcar como lidas retira o destaque; limpar avisos não exclui chamados."}]',true,null),
('10000000-0000-4000-8000-000000000005','Alterar foto, nome e senha','Mantenha seus dados pessoais e sua senha atualizados.','Conta','settings',array['usuario','gestor','tic'],
 '[{"title":"Abra Configurações","text":"Acesse Configurações no menu lateral.","button":"Configurações","view":"settings"},{"title":"Atualize seus dados","text":"Altere a foto ou o nome utilizando as ações disponíveis."},{"title":"Troque a senha","text":"Informe a senha atual e uma nova senha com pelo menos 8 caracteres."}]',true,null),
('10000000-0000-4000-8000-000000000006','Gerenciar usuários da equipe','Crie ou remova usuários dentro dos departamentos gerenciados.','Gestão','users',array['gestor'],
 '[{"title":"Abra Usuários e Acessos","text":"A tela exibirá somente perfis dos departamentos sob sua gestão.","view":"users"},{"title":"Crie um usuário","text":"Informe nome, e-mail e departamentos autorizados; comunique a senha temporária."},{"title":"Gerencie com segurança","text":"O Gestor somente pode administrar usuários comuns dentro de seus departamentos."}]',true,null),
('10000000-0000-4000-8000-000000000007','Triar e atender um chamado','Atribua responsável, prioridade e conduza o ciclo do atendimento.','Operação TIC','activity',array['tic'],
 '[{"title":"Abra a fila TIC","text":"Filtre os chamados por status, prioridade, departamento ou requerente.","view":"tickets"},{"title":"Faça a triagem","text":"Valide descrição e anexos, defina o responsável e ajuste a prioridade."},{"title":"Registre e conclua","text":"Inicie o atendimento, registre interações e solucione ou feche corretamente.","button":"Iniciar"}]',true,null),
('10000000-0000-4000-8000-000000000008','Agendar ou pendenciar atendimento','Registre data programada ou dependência de informação.','Operação TIC','calendar-clock',array['tic'],
 '[{"title":"Abra os detalhes","text":"Selecione o chamado na fila e localize as ações operacionais.","view":"tickets"},{"title":"Agende","text":"Informe data e horário futuros; o requerente será avisado.","button":"Agendar"},{"title":"Pendencie e retome","text":"Descreva a dependência e retome o atendimento quando ela for resolvida."}]',true,null),
('10000000-0000-4000-8000-000000000009','Administrar contas e senhas temporárias','Crie contas, ajuste acessos e redefina credenciais.','Administração','users',array['tic'],
 '[{"title":"Abra Usuários e Acessos","text":"Consulte os perfis ativos e pendentes.","view":"users"},{"title":"Crie ou redefina","text":"Crie a conta ou gere uma nova senha temporária."},{"title":"Acesso obrigatório","text":"No próximo login o usuário deverá definir sua própria senha."}]',true,null),
('10000000-0000-4000-8000-000000000010','Excluir, restaurar e esvaziar a lixeira','Controle chamados excluídos e exclusões definitivas.','Administração','trash-2',array['tic'],
 '[{"title":"Mova para a lixeira","text":"No detalhe do chamado, use Excluir chamado."},{"title":"Abra a Lixeira","text":"Consulte os itens excluídos e restaure quando necessário.","view":"trash"},{"title":"Exclusão definitiva","text":"Esvaziar a lixeira remove os registros e anexos permanentemente."}]',true,null),
('10000000-0000-4000-8000-000000000011','Gerar relatório Word','Consolide indicadores e chamados de um período de até 31 dias.','Relatórios','file-text',array['gestor','tic'],
 '[{"title":"Abra Relatórios","text":"Acesse Relatórios no menu lateral.","view":"reports"},{"title":"Escolha o período e setor","text":"Informe até 31 dias e selecione um departamento autorizado."},{"title":"Gere o documento","text":"Clique em Gerar relatório Word para baixar indicadores e a tabela de chamados.","button":"Gerar relatório Word"}]',true,null)
on conflict (id) do nothing;

create or replace function public.knowledge_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists knowledge_touch_updated_at on public.knowledge_tutorials;
create trigger knowledge_touch_updated_at before update on public.knowledge_tutorials
for each row execute function public.knowledge_touch_updated_at();

-- O aviso nasce no banco somente na primeira publicação (criação publicada ou rascunho que virou publicado).
create or replace function public.notify_new_knowledge_tutorial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.published = true and (tg_op = 'INSERT' or old.published = false) then
    insert into public.notifications (user_id, ticket_id, channel, title, body, read)
    select p.id, null, 'plataforma', 'Novo tutorial disponível',
           '“' || new.title || '” foi publicado na Base de Conhecimento.', false
    from public.profiles p
    where p.active = true and p.role::text = any(new.audience_roles);
  end if;
  return new;
end $$;
drop trigger if exists notify_new_knowledge_tutorial on public.knowledge_tutorials;
create trigger notify_new_knowledge_tutorial after insert or update of published on public.knowledge_tutorials
for each row execute function public.notify_new_knowledge_tutorial();

do $$ begin
  alter publication supabase_realtime add table public.knowledge_tutorials;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
