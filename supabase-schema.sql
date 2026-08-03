create type public.user_role as enum ('usuario', 'gestor', 'tic');
create type public.ticket_type as enum ('incidente', 'requisicao');
create type public.ticket_status as enum (
  'novo',
  'atribuido',
  'planejado',
  'pendente',
  'solucionado',
  'fechado',
  'excluido'
);
create type public.priority_level as enum ('baixa', 'media', 'alta', 'critica');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.user_role not null default 'usuario',
  department_id uuid references public.departments (id),
  managed_department_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sla_rules (
  id uuid primary key default gen_random_uuid(),
  priority public.priority_level not null unique,
  response_hours numeric(6, 2) not null,
  solution_hours numeric(6, 2) not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.tickets (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null,
  type public.ticket_type not null,
  category text not null,
  status public.ticket_status not null default 'novo',
  priority public.priority_level not null default 'media',
  requester_id uuid not null references public.profiles (id),
  department_id uuid references public.departments (id),
  assigned_id uuid references public.profiles (id),
  observer_ids uuid[] not null default '{}',
  response_due_at timestamptz not null,
  solution_due_at timestamptz not null,
  response_started_at timestamptz,
  solved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  uploaded_by uuid references public.profiles (id),
  file_name text not null,
  file_size_bytes integer not null check (file_size_bytes <= 2097152),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete cascade,
  channel text not null check (channel in ('email', 'platforma', 'browser')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.sla_rules enable row level security;

-- As policies devem ser ajustadas ao mapeamento final de departamentos.
-- Regra base: usuário vê seus próprios chamados, gestor vê departamentos autorizados,
-- TIC vê e administra todos os registros operacionais.
