// Definições de tipos e perfis de usuário do sistema
export type Role = "usuario" | "gestor" | "tic";

// Modos de exibição da tela de autenticação
export type AuthMode = "login" | "signup" | "reset" | "update-password";

// Páginas/telas disponíveis na navegação
export type View = "dashboard" | "tickets" | "new-ticket" | "users" | "notifications" | "trash" | "departments" | "reports" | "knowledge" | "settings" | "accessibility";

// Status possíveis de um chamado durante seu ciclo de vida
export type TicketStatus = "novo" | "atribuido" | "planejado" | "pendente" | "solucionado" | "fechado" | "excluido";

// Tipos de atendimento
export type TicketType = "incidente" | "requisicao";

// Níveis de urgência/prioridade
export type Priority = "baixa" | "media" | "alta" | "critica";

// Canais por onde a notificação pode ser enviada
export type Channel = "plataforma" | "navegador";

/** Dados do departamento ou setor da organização */
export interface Department {
  id: string;
  name: string;
}

/** Informações do usuário da plataforma */
export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string;
  managedDepartmentIds: string[];
  active: boolean;
  avatarUrl?: string;
  pendingApproval?: boolean;
  requestedRole?: Role;
  approvedByTic?: boolean;
  onboardingCompletedAt?: string;
  acknowledgedReleaseVersion?: string;
  mustChangePassword?: boolean;
}

/** Registro de histórico de alteração ou comentário em um chamado */
export interface TicketEvent {
  id: string;
  actorId: string;
  type: string;
  message: string;
  createdAt: string;
}

/** Arquivo anexado ao chamado */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  url?: string;
  type?: string;
  /** Evento do histórico ao qual o arquivo pertence; vazio quando anexado na abertura. */
  eventId?: string;
}

/** Estrutura completa de um chamado no sistema */
export interface Ticket {
  id: number;
  type: TicketType;
  category: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  requesterId: string;
  departmentId: string;
  assignedId?: string;
  observerIds: string[];
  createdAt: string;
  updatedAt: string;
  responseStartedAt?: string;
  solvedAt?: string;
  closedAt?: string;
  attachments: Attachment[];
  events: TicketEvent[];
  statusBeforeDelete?: TicketStatus;
  plannedFor?: string;
  plannedNotificationSent?: boolean;
  pendingStartedAt?: string;
  totalPendingMs?: number;
}

/** Item de notificação enviado ao usuário */
export interface NotificationItem {
  id: string;
  userId: string;
  ticketId?: number;
  channel: Channel;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** Etapa configurável de um tutorial da Base de Conhecimento. */
export interface KnowledgeStep {
  title: string;
  text: string;
  button?: string;
  view?: View;
}

/** Tutorial persistido no Supabase e publicado para perfis selecionados. */
export interface KnowledgeTutorial {
  id: string;
  title: string;
  summary: string;
  category: string;
  icon: string;
  roles: Role[];
  steps: KnowledgeStep[];
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Estrutura de dados principal armazenada pela aplicação */
export interface AppData {
  version: number;
  departments: Department[];
  users: User[];
  tickets: Ticket[];
  notifications: NotificationItem[];
}

/** Opções de filtro ativas na listagem de chamados */
export interface Filters {
  status: "todos" | TicketStatus;
  search: string;
  priority: "todas" | Priority;
  requesterId: "todos" | string;
  departmentId: "todos" | string;
}

/** Estado de execução mantido em memória durante o uso */
export interface RuntimeState {
  currentUserId?: string;
  view: View;
  selectedTicketId?: number;
  ticketDetailOpen: boolean;
  ticketDetailWidth: number;
  ticketPage: number;
  ticketsPerPage: number;
  filters: Filters;
  authMode: AuthMode;
  loginRole: Role;
  editingUserId?: string;
  sidebarCollapsed?: boolean;
  onlineUsersExpanded?: boolean;
}
