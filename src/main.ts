import {
  Activity,
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  Camera,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  Clock,
  ContactRound,
  Copy,
  Edit3,
  FileText,
  FolderOpen,
  HelpCircle,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  MonitorUp,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  PieChart,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SquarePlus,
  Sun,
  TimerReset,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  UploadCloud,
  User as UserIcon,
  UserPlus,
  Users,
  X,
  createIcons
} from "lucide";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import "bulma/css/bulma.min.css";
import "./styles.css";
import { getRoleLabel } from './auth';
import { createInitialData } from './local-data';
import { renderLoginView } from './login-view';
import { createUuid } from './id';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, validateAttachment } from './files';
import { activeUsersForDepartment, authorizedDepartmentIds, canUserSeeTicket, reportRangeError } from './ticket-rules';
import { completeOwnProfileInSupabase, createNotificationsInSupabase, createTemporaryPasswordInSupabase, createTicketEventInSupabase, createTicketInSupabase, createUserInSupabase, deleteDepartmentFromSupabase, deleteKnowledgeTutorial, deleteTicketFromSupabase, deleteUserFromSupabase, deleteUserNotificationsFromSupabase, emptyTrashInSupabase, isSupabaseConfigured, loadDataFromSupabase, loadKnowledgeTutorials, markNotificationsReadInSupabase, saveDataToSupabase, saveKnowledgeTutorial, supabase, updateManagedUserInSupabase, updateTicketInSupabase, uploadTicketAttachments } from './supabase';
import { getPublicAppUrl } from './app-url';
import type { AppData, Attachment, AuthMode, Department, KnowledgeStep, KnowledgeTutorial, NotificationItem, Priority, Role, RuntimeState, Ticket, TicketEvent, TicketStatus, TicketType, User, View } from './types';

// Configurações e limites globais
const MB_2 = MAX_ATTACHMENT_BYTES;
const APP_VERSION = "1.0";
const THEME_STORAGE_KEY = "crq-theme";

function devWarn(...args: any[]) {
  if (import.meta.env.DEV) console.warn(...args);
}

function devError(...args: any[]) {
  if (import.meta.env.DEV) console.error(...args);
}

// Lista de ícones usados na interface gráfica
const usedIcons = {
  Activity,
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  Camera,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  Clock,
  ContactRound,
  Copy,
  Edit3,
  FileText,
  FolderOpen,
  HelpCircle,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  MonitorUp,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  PieChart,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SquarePlus,
  Sun,
  TimerReset,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  UploadCloud,
  User: UserIcon,
  UserPlus,
  Users,
  X
};

// Elemento principal onde a aplicação é desenhada
const app = document.querySelector<HTMLDivElement>("#app");

// Textos amigáveis para exibir status, prioridades e perfis
const statusLabels: Record<TicketStatus, string> = {
  novo: "Novo",
  atribuido: "Em atendimento (Atribuído)",
  planejado: "Agendado",
  pendente: "Pendente",
  solucionado: "Solucionado",
  fechado: "Fechado",
  excluido: "Excluído"
};

const statusOrder: TicketStatus[] = ["novo", "atribuido", "planejado", "pendente", "solucionado", "fechado", "excluido"];

const priorityLabels: Record<Priority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica"
};

const roleLabels: Record<Role, string> = {
  usuario: "Usuário",
  gestor: "Gestor",
  tic: "TIC"
};

const categoryOptions = [
  "Acesso e senha",
  "Equipamentos",
  "Rede e internet",
  "Sistemas internos",
  "E-mail institucional",
  "Telefonia",
  "Solicitação administrativa",
  "Outros"
];

// Dados em memória e estado padrão da navegação
let data: AppData = createInitialData();

const defaultState: RuntimeState = {
  view: "dashboard",
  ticketDetailOpen: false,
  ticketDetailWidth: 430,
  filters: {
    status: "todos",
    search: "",
    priority: "todas",
    requesterId: "todos",
    departmentId: "todos"
  },
  authMode: "login",
  loginRole: "usuario"
};

let state: RuntimeState = { ...defaultState, filters: { ...defaultState.filters } };
let realtimeChannel: any = null;
const onlineUserIds = new Set<string>();
let realtimeRefreshTimer: number | undefined;

async function refreshFromServer() {
  const remote = await loadDataFromSupabase();
  if (!remote) return;
  const selectedId = state.selectedTicketId;
  data = remote;
  ensureSeedData();
  if (selectedId && !data.tickets.some((ticket) => ticket.id === selectedId)) {
    state.selectedTicketId = undefined;
    state.ticketDetailOpen = false;
  }
  render();
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => void refreshFromServer(), 250);
}

async function refreshKnowledgeFromServer() {
  const remoteTutorials = await loadKnowledgeTutorials();
  knowledgeTutorials = remoteTutorials;
  if (state.view === "knowledge") render();
}

async function stopRealtime() {
  onlineUserIds.clear();
  if (realtimeChannel && supabase) await supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function startRealtime(user: User) {
  if (!supabase) return;
  await stopRealtime();
  realtimeChannel = supabase.channel("crq-online", { config: { presence: { key: user.id } } });
  realtimeChannel
    .on("presence", { event: "sync" }, () => {
      onlineUserIds.clear();
      const presence = realtimeChannel.presenceState() as Record<string, Array<{ user_id?: string }>>;
      Object.values(presence).flat().forEach((entry) => {
        if (entry.user_id) onlineUserIds.add(entry.user_id);
      });
      updatePresenceDom();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "ticket_events" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_tutorials" }, () => void refreshKnowledgeFromServer())
    .subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") await realtimeChannel.track({ user_id: user.id, online_at: nowIso() });
    });
}

function updatePresenceDom() {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".online-user-item[data-presence-user]"));
  items.forEach((item) => {
    const userId = item.dataset.presenceUser ?? "";
    const isOnline = onlineUserIds.has(userId);
    item.classList.toggle("online", isOnline);
    item.classList.toggle("offline", !isOnline);
    item.dataset.online = isOnline ? "1" : "0";
    const dot = item.querySelector<HTMLElement>(".status-dot");
    if (dot) {
      dot.style.background = isOnline ? "var(--teal)" : "var(--muted)";
      dot.style.boxShadow = isOnline ? "" : "none";
    }
    const name = item.querySelector<HTMLElement>(".online-name");
    if (name) name.style.color = isOnline ? "var(--text)" : "var(--muted)";
    const role = item.querySelector<HTMLElement>(".online-role");
    if (role) role.textContent = isOnline ? "Online" : (item.dataset.roleLabel ?? "Offline");
  });
  const list = document.querySelector<HTMLElement>(".online-users-list");
  if (list) {
    items.sort((first, second) =>
      Number(second.dataset.online ?? 0) - Number(first.dataset.online ?? 0)
      || (first.dataset.name ?? "").localeCompare(second.dataset.name ?? "", "pt-BR")
    ).forEach((item) => list.appendChild(item));
  }
  const count = document.querySelector<HTMLElement>(".online-count");
  if (count) count.textContent = String(items.filter((item) => item.dataset.online === "1").length);
}

// Funções de apoio gerais
function makeId(prefix: string): string {
  void prefix;
  return createUuid();
}

function nowIso() {
  return new Date().toISOString();
}

const initialUrlHash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
const initialUrlSearch = typeof window !== 'undefined' ? (window.location.search || '') : '';
let isRecoveryLinkDetected =
  initialUrlHash.includes('type=recovery') ||
  initialUrlHash.includes('type=invite') ||
  initialUrlHash.includes('type=signup') ||
  initialUrlSearch.includes('type=recovery') ||
  initialUrlSearch.includes('type=invite') ||
  initialUrlSearch.includes('type=signup');

function ensureSeedData() {
  // Seeds locais são proibidos: departamentos, usuários e chamados vêm do banco.
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Data inválida";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "Data inválida";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return "Data inválida";
  }
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}

/* Funções para sincronizar dados com o backend Supabase */
// ===== FUNÇÕES DE SINCRONIZAÇÃO COM SUPABASE =====

/**
 * Persiste dados operacionais exclusivamente no Supabase.
 * O navegador não mantém uma segunda base de usuários/chamados.
 */
async function saveDataToAppStorage() {
  if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.");
  await saveDataToSupabase(data);
}



// Busca os dados do usuário conectado e seus setores
function currentUser() {
  return data.users.find((u) => u.id === state.currentUserId);
}

function userById(id?: string) {
  return data.users.find((u) => u.id === id);
}

function departmentById(id?: string) {
  return data.departments.find((d) => d.id === id);
}

// Regras para saber quais chamados cada usuário pode visualizar
function visibleDepartmentIds(user: User) {
  return authorizedDepartmentIds(user, data.departments);
}

function canSeeTicket(user: User, ticket: Ticket) {
  return canUserSeeTicket(user, ticket, data.departments);
}

function linkedDepartments(user: User) {
  return [...new Set([user.departmentId, ...user.managedDepartmentIds])]
    .map((id) => departmentById(id))
    .filter((department): department is Department => Boolean(department));
}

function renderDepartmentBadges(user: User, compact = false) {
  const departments = linkedDepartments(user);
  if (!departments.length) return `<span class="department-empty">Sem departamento</span>`;
  return `<div class="department-badges ${compact ? "compact" : ""}" title="${escapeHtml(departments.map((department) => department.name).join(", "))}">
    ${departments.map((department, index) => `<span class="department-badge ${index === 0 ? "primary" : ""}">${escapeHtml(department.name)}</span>`).join("")}
  </div>`;
}

function visibleTickets() {
  const user = currentUser();
  if (!user) return [];
  return data.tickets
    .filter((t) => canSeeTicket(user, t))
    .filter((t) => {
      if (state.view === "trash") return t.status === "excluido";
      return t.status !== "excluido";
    });
}

function filteredTickets() {
  const search = state.filters.search.trim().toLowerCase();
  return visibleTickets().filter((ticket) => {
    const requester = userById(ticket.requesterId);
    const assigned = userById(ticket.assignedId);
    const haystack = [
      ticket.id.toString(),
      `#${ticket.id}`,
      ticket.title,
      ticket.description,
      ticket.type === "incidente" ? "Incidente" : "Requisição",
      ticket.category,
      statusLabels[ticket.status],
      priorityLabels[ticket.priority],
      requester?.fullName ?? "",
      requester?.email ?? "",
      assigned?.fullName ?? "",
      assigned?.email ?? "",
      departmentById(ticket.departmentId)?.name ?? "",
      ticket.events.map((event) => event.message).join(" "),
      ticket.attachments.map((attachment) => attachment.name).join(" ")
    ].join(" ").toLowerCase();

    if (state.filters.status !== "todos" && ticket.status !== state.filters.status) return false;
    if (state.filters.priority !== "todas" && ticket.priority !== state.filters.priority) return false;
    if (state.filters.requesterId !== "todos" && ticket.requesterId !== state.filters.requesterId) return false;
    if (state.filters.departmentId !== "todos" && ticket.departmentId !== state.filters.departmentId) return false;
    if (search && !haystack.includes(search)) return false;
    return true;
  });
}

function ticketIsCritical(ticket: Ticket) {
  const active = !["solucionado", "fechado", "excluido"].includes(ticket.status);
  return active && ticket.priority === "critica";
}

function ticketRequiresReopen(ticket: Ticket) {
  return ticket.status === "solucionado" || ticket.status === "fechado";
}

function invalidCredentialsMessage(email: string) {
  const knownUser = data.users.find((user) => user.email.toLowerCase() === email);
  if (!knownUser) {
    return "Não encontramos uma conta ativa para este e-mail. Crie sua conta ou solicite o cadastro à TIC.";
  }
  if (knownUser.active === false || knownUser.pendingApproval) {
    return "Esta conta ainda não está liberada para acesso. Aguarde a aprovação ou fale com a TIC.";
  }
  return "E-mail cadastrado, mas a senha não confere. Use a senha temporária mais recente ou peça para a TIC gerar uma nova senha.";
}

function nextTicketId() {
  if (!data.tickets.length) return 1;
  return Math.max(0, ...data.tickets.map((t) => t.id)) + 1;
}

function addNotification(userId: string, notification: Omit<NotificationItem, "id" | "userId" | "read" | "createdAt">, allowDuplicate = false): NotificationItem | undefined {
  const isDuplicate = data.notifications.some(
    (n) => n.userId === userId && n.title === notification.title && n.body === notification.body && n.ticketId === notification.ticketId
  );
  if (isDuplicate && !allowDuplicate) return undefined;

  const created: NotificationItem = {
    id: makeId("ntf"),
    userId,
    read: false,
    createdAt: nowIso(),
    ...notification
  };
  data.notifications.unshift(created);
  return created;
}

function notifyTicket(ticket: Ticket, title: string, body: string, includeTic = true) {
  const recipients = new Set<string>([ticket.requesterId, ...ticket.observerIds]);
  if (ticket.assignedId) recipients.add(ticket.assignedId);
  if (includeTic) data.users.filter((u) => u.role === "tic" && u.active !== false).forEach((u) => recipients.add(u.id));

  const created: NotificationItem[] = [];
  recipients.forEach((userId) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) return;

    const notification = addNotification(userId, { ticketId: ticket.id, channel: "plataforma", title, body });
    if (notification) created.push(notification);
  });
  return created;
}

function notifyCommentAdded(ticket: Ticket, text: string) {
  const title = `Nova mensagem no chamado #${ticket.id}`;
  const recipients = new Set<string>();
  if (ticket.requesterId) recipients.add(ticket.requesterId);
  if (ticket.assignedId) recipients.add(ticket.assignedId);
  ticket.observerIds.forEach((id) => recipients.add(id));
  data.users.filter((u) => u.role === "tic" && u.active !== false).forEach((u) => recipients.add(u.id));

  const created: NotificationItem[] = [];
  for (const userId of recipients) {
    const notification = addNotification(userId, { ticketId: ticket.id, channel: "plataforma", title, body: text }, true);
    if (notification) created.push(notification);
  }
  return created;
}

function maybeBrowserNotify(ticket: Ticket) {
  const user = currentUser();
  if (!user || user.role !== "tic" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(`Novo chamado #${ticket.id}`, { body: ticket.title });
  }
}

async function saveData() {
  await saveDataToAppStorage();
}

/* Funções de renderização de componentes da UI */
// ===== FUNÇÕES DE RENDER =====

let _lastView: string | null = null;

/** Aplica os componentes semânticos do Bulma ao HTML gerado pelas views. */
function applyBulmaComponentClasses() {
  const mappings: Array<[string, string[]]> = [
    [".primary-button", ["button", "is-primary"]],
    [".secondary-button", ["button", "is-link", "is-light"]],
    [".ghost-button", ["button", "is-light"]],
    [".danger-button", ["button", "is-danger"]],
    [".icon-button", ["button", "is-small"]],
    [".panel", ["box"]],
    ["table", ["table", "is-fullwidth", "is-hoverable"]],
    [".pill", ["tag", "is-rounded"]],
    [".form-error", ["notification", "is-danger", "is-light"]],
    ["input:not([type='file'])", ["input"]],
    ["textarea", ["textarea"]]
  ];
  mappings.forEach(([selector, classes]) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => element.classList.add(...classes));
  });
  document.querySelectorAll<HTMLLabelElement>("label").forEach((label) => label.classList.add("label"));
  document.querySelectorAll<HTMLElement>(".row-actions, .focus-actions, .system-modal-actions").forEach((group) => group.classList.add("buttons"));
  document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    if (select.parentElement?.classList.contains("select")) return;
    const wrapper = document.createElement("div");
    wrapper.className = `select is-fullwidth${select.multiple ? " is-multiple" : ""}`;
    select.parentNode?.insertBefore(wrapper, select);
    wrapper.appendChild(select);
  });
}

function render() {
  if (!app) return;
  const currentView = state.currentUserId ? (state.view ?? 'dashboard') : '__login__';
  const viewChanged = currentView !== _lastView;
  _lastView = currentView;

  try {
    const user = currentUser();
    app.innerHTML = user ? renderShell(user) : renderLogin();
    applyBulmaComponentClasses();
    createIcons({ icons: usedIcons });
    bindEvents();
    if (user) {
      saveViewState();
    }
    if (viewChanged) {
      const contentEl = document.querySelector('.content');
      if (contentEl) {
        contentEl.classList.add('view-fade-in');
      }
    }
  } catch (err) {
    devError('Erro ao renderizar:', err);
    app.innerHTML = `
      <div style="padding: 2rem; text-align: center; font-family: sans-serif;">
        <h2>❌ Erro ao carregar o sistema</h2>
        <p>Verifique o console (F12) para mais detalhes.</p>
        <pre style="background: #f4f4f4; padding: 1rem; text-align: left; max-width: 600px; margin: 1rem auto; border-radius: 4px; font-size: 14px;">${escapeHtml(String(err))}</pre>
        <button onclick="location.reload();" style="padding: 0.5rem 1rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">🔄 Recarregar</button>
      </div>
    `;
  }
}

/** Exibe um guia no primeiro acesso e uma saudação curta nos acessos seguintes. */
function showWelcomeScreen(user: User) {
  if (!user.onboardingCompletedAt) {
    showOnboarding(user);
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-content">
      <div class="welcome-logo">
        <i data-lucide="shield-check" style="width:56px;height:56px;"></i>
      </div>
      <p class="welcome-greeting">Bem-vindo de volta,</p>
      <h1 class="welcome-name">${escapeHtml(user.fullName.split(' ')[0])}</h1>
      <p class="welcome-sub">Sistema de Chamados CRQ-12</p>
    </div>
  `;
  document.body.appendChild(overlay);
  createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });

  // Fade in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

  // Mantém por 1.6s e faz fade out
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 600);
  }, 1600);
}

function showOnboarding(user: User) {
  const steps = [
    { icon: "square-plus", title: "Abra sua solicitação", text: "Use “Novo chamado” para descrever a demanda e anexar arquivos de até 2 MB." },
    { icon: "list-filter", title: "Acompanhe o atendimento", text: "Em “Chamados”, consulte o status, o agendamento e toda a conversa com a TIC." },
    { icon: "bell", title: "Não perca atualizações", text: "A central de notificações avisa quando a TIC responder ou alterar seu chamado." }
  ];
  let index = 0;
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";

  const draw = () => {
    const step = steps[index];
    overlay.innerHTML = `
      <section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <span class="onboarding-step">Primeiro acesso · ${index + 1} de ${steps.length}</span>
        <div class="onboarding-icon"><i data-lucide="${step.icon}"></i></div>
        <h2 id="onboarding-title">${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.text)}</p>
        <div class="onboarding-dots">${steps.map((_, i) => `<span class="${i === index ? "active" : ""}"></span>`).join("")}</div>
        <div class="onboarding-actions">
          ${index > 0 ? '<button class="ghost-button" id="onboarding-back" type="button">Voltar</button>' : '<span></span>'}
          <button class="primary-button" id="onboarding-next" type="button">${index === steps.length - 1 ? "Começar" : "Próximo"}</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    createIcons({ icons: usedIcons });
    overlay.querySelector("#onboarding-back")?.addEventListener("click", () => { index -= 1; draw(); });
    overlay.querySelector("#onboarding-next")?.addEventListener("click", async () => {
      if (index < steps.length - 1) { index += 1; draw(); return; }
      user.onboardingCompletedAt = nowIso();
      if (supabase) {
        await supabase.from("profiles").update({ onboarding_completed_at: user.onboardingCompletedAt }).eq("id", user.id);
      }
      await saveDataToAppStorage();
      overlay.remove();
    });
  };
  draw();
}

// Desenha a tela de entrada (login e cadastro)
function renderLogin() {
  return renderLoginView(data, state.authMode, state.loginRole);
}

// Desenha a estrutura completa da plataforma após o login
function renderShell(user: User) {
  const unread = getUserNotifications(user).filter((n) => !n.read).length;
  const isCollapsed = Boolean(state.sidebarCollapsed);
  const presenceUsers = Array.from(new Map(
    data.users
      .filter((candidate) => candidate.active !== false && candidate.id && candidate.email)
      .filter((candidate) => candidate.id !== user.id && candidate.email.toLowerCase() !== user.email.toLowerCase())
      .map((candidate) => [candidate.email.toLowerCase(), candidate])
  ).values()).sort((first, second) => {
    const onlineDifference = Number(onlineUserIds.has(second.id)) - Number(onlineUserIds.has(first.id));
    return onlineDifference || first.fullName.localeCompare(second.fullName, "pt-BR");
  });
  const onlineUsersCount = presenceUsers.filter((candidate) => onlineUserIds.has(candidate.id)).length;

  return `
    <div class="tech-bg-overlay"></div>
    <div class="app-shell ${isCollapsed ? 'sidebar-collapsed' : ''}">
      
      <!-- MENU SUPERIOR TECNOLÓGICO -->
      <header class="top-nav-bar" aria-label="Ações rápidas">
        <div class="top-nav-right">
          <div class="top-search-wrapper">
            <i data-lucide="list-filter"></i>
            <input type="search" id="global-top-search" placeholder="Pesquisar nos chamados..." value="${escapeHtml(state.filters.search)}" />
          </div>

          <button id="toggle-theme-top" class="icon-button top-icon-btn" type="button" aria-label="Alternar modo escuro/claro" title="Alternar Tema">
            <i data-lucide="${localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'sun' : 'moon'}"></i>
          </button>

          <button id="open-notifications" class="icon-button top-icon-btn" type="button" aria-label="Notificações" title="Notificações">
            <i data-lucide="bell"></i>
            ${unread ? `<span class="badge-dot">${unread}</span>` : ""}
          </button>

          <button id="quick-new-ticket" class="primary-button compact tech-quick-btn" type="button">
            <i data-lucide="square-plus"></i>
            Novo
          </button>
        </div>
      </header>

      <div class="app-body-layout ${isCollapsed ? 'collapsed' : ''}">
        <button id="mobile-sidebar-toggle" class="mobile-sidebar-toggle" type="button" aria-label="${isCollapsed ? 'Abrir menu' : 'Fechar menu'}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <i data-lucide="${isCollapsed ? 'menu' : 'x'}"></i>
        </button>
        <button id="mobile-sidebar-backdrop" class="mobile-sidebar-backdrop" type="button" aria-label="Fechar menu"></button>
        <aside class="sidebar ${isCollapsed ? 'collapsed' : ''}">
          <div class="profile-block sidebar-profile-card">
            <button id="toggle-sidebar" class="sidebar-toggle-btn profile-sidebar-toggle" type="button" title="${isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}" aria-label="${isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}">
              <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-left'}"></i>
            </button>
            <div class="sidebar-profile-main">
              <button id="sidebar-avatar-btn" class="sidebar-avatar-button" type="button" aria-label="Alterar foto de perfil" title="Alterar foto de perfil">
                ${renderAvatarHTML(user)}
                <span class="sidebar-avatar-overlay" aria-hidden="true"><i data-lucide="camera"></i></span>
              </button>
              <input type="file" id="sidebar-avatar-input" accept="image/png,image/jpeg,image/webp" hidden />
              <div class="profile-meta">
                <span class="profile-context-label">Perfil ativo</span>
                <strong>${escapeHtml(user.fullName)}</strong>
                <span class="profile-role-badge">${roleLabels[user.role]}</span>
              </div>
            </div>
            <div class="sidebar-profile-departments">
              <span class="profile-context-label">Departamentos vinculados</span>
              ${renderDepartmentBadges(user, true)}
            </div>
          </div>

          <span class="nav-section-label">Navegação</span>
          <nav class="main-nav" aria-label="Navegação principal">
            ${navButton("dashboard", "layout-dashboard", user.role === "tic" ? "Dashboard TIC" : "Resumo")}
            ${navButton("tickets", "list-filter", "Fila de Chamados")}
            ${navButton("new-ticket", "square-plus", "Novo chamado")}
            ${user.role !== "usuario" ? navButton("users", "contact-round", "Usuários & Acessos") : ""}
            ${user.role === "tic" ? navButton("departments", "folder-open", "Departamentos") : ""}
            ${user.role !== "usuario" ? navButton("reports", "file-text", "Relatórios") : ""}
            ${navButton("knowledge", "book-open", "Base de conhecimento")}
            ${navButton("notifications", "bell", `Notificações${unread ? ` (${unread})` : ""}`)}
            ${user.role === "tic" ? navButton("trash", "trash-2", "Lixeira") : ""}
            ${navButton("settings", "settings", "Configurações")}
          </nav>

          ${user.role === "tic" ? `
            <div class="sidebar-online-widget ${state.onlineUsersExpanded ? "expanded" : ""}" id="users-accordion">
              <button class="online-widget-header" id="toggle-users-btn" type="button" aria-expanded="${state.onlineUsersExpanded ? "true" : "false"}" aria-controls="online-users-container">
                <div class="tech-pulse-dot" style="width: 8px; height: 8px; box-shadow: 0 0 6px var(--teal);"></div>
                <span class="action-label" style="flex: 1; text-align: left;">Usuários online <b class="online-count">${onlineUsersCount}</b></span>
                <i data-lucide="${state.onlineUsersExpanded ? "chevron-up" : "chevron-down"}" class="action-label accordion-icon"></i>
              </button>
              <div class="online-users-wrapper" id="online-users-container">
                <div class="online-users-list">
                  ${presenceUsers.length ? presenceUsers.map(u => {
                    const isOnline = onlineUserIds.has(u.id);
                    return `
                    <div class="online-user-item ${isOnline ? 'online' : 'offline'}" data-presence-user="${u.id}" data-online="${isOnline ? '1' : '0'}" data-name="${escapeHtml(u.fullName)}" data-role-label="${roleLabels[u.role]}" title="${escapeHtml(u.fullName)} (${escapeHtml(u.email)})">
                      <div class="online-avatar-wrapper">
                        ${renderAvatarHTML(u, "avatar-sm", isOnline ? "" : "background: var(--surface-hover); color: var(--muted);")}
                        <div class="status-dot" style="background: ${isOnline ? 'var(--teal)' : 'var(--muted)'}; ${isOnline ? '' : 'box-shadow: none;'} border-color: var(--surface-soft);"></div>
                      </div>
                      <div class="online-user-info action-label">
                        <span class="online-name" style="color: ${isOnline ? 'var(--text)' : 'var(--muted)'};">${escapeHtml(u.fullName.split(' ')[0])}</span>
                        <span class="online-role" style="color: var(--text-faint);">${isOnline ? 'Online' : roleLabels[u.role]}</span>
                      </div>
                    </div>
                  `}).join('') : `<p class="online-empty-state">Nenhum outro usuário ativo.</p>`}
                </div>
              </div>
            </div>
          ` : ""}

          <button id="logout-button" class="sidebar-action" type="button" title="Sair do sistema">
            <i data-lucide="log-out"></i>
            <span class="action-label">Sair</span>
          </button>
        </aside>

        <main class="workspace">
          <header class="topbar">
            <div>
              <span class="section-kicker">${roleLabels[user.role]} · ${escapeHtml(departmentById(user.departmentId)?.name ?? "CRQ-12")}</span>
              <h1>${viewTitle(user)}</h1>
            </div>
          </header>

          <section class="content">
            ${renderView(user)}
          </section>

          <footer class="app-footer">
            <span>CRQ-12 · Sistema Integrado de Chamados e Suporte em Tecnologia da Informação</span>
          </footer>
        </main>
      </div>

      <!-- BOTÃO FLUTUANTE WHATSAPP -->
      <a
        href="https://wa.me/556232404629"
        target="_blank"
        rel="noopener noreferrer"
        class="floating-whatsapp-btn"
        title="Falar com Suporte TIC no WhatsApp"
        aria-label="Atendimento via WhatsApp"
      >
        <div class="whatsapp-btn-tooltip">Suporte WhatsApp TIC</div>
        <svg class="whatsapp-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3 18.6-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      </a>
      ${user.mustChangePassword ? renderForcedPasswordChange() : ""}
    </div>
  `;
}

function renderForcedPasswordChange() {
  return `
    <div class="system-modal-overlay forced-password-overlay">
      <div class="system-modal" role="dialog" aria-modal="true" aria-labelledby="forced-password-title">
        <div class="system-modal-icon"><i data-lucide="key-round"></i></div>
        <h3 id="forced-password-title">Defina sua senha pessoal</h3>
        <p>Você entrou com uma senha temporária. Antes de usar o sistema, escolha uma nova senha conhecida somente por você.</p>
        <form id="forced-password-form" class="modal-form">
          <label>Nova senha<input id="forced-new-password" type="password" minlength="8" required autocomplete="new-password" /></label>
          <label>Confirmar nova senha<input id="forced-confirm-password" type="password" minlength="8" required autocomplete="new-password" /></label>
          <p id="forced-password-error" class="form-error" role="alert"></p>
          <button class="primary-button" type="submit"><i data-lucide="shield-check"></i> Salvar e acessar</button>
        </form>
      </div>
    </div>`;
}


/** Cria um botão de navegação para a barra lateral */
function navButton(view: View, icon: string, label: string) {
  return `
    <button class="nav-button ${state.view === view ? "active" : ""}" type="button" data-view="${view}" title="${escapeHtml(label)}">
      <i data-lucide="${icon}"></i>
      <span class="nav-label">${label}</span>
    </button>
  `;
}

/** Retorna o título da view atual baseado no papel do usuário */
function viewTitle(user: User) {
  const map: Record<View, string> = {
    dashboard: user.role === "tic" ? "Painel TIC" : "Meus chamados",
    tickets: "Lista de chamados",
    "new-ticket": "Criar chamado",
    users: "Gestão de usuários",
    notifications: "Notificações",
    trash: "Lixeira",
    departments: "Departamentos",
    reports: "Relatórios",
    knowledge: "Base de conhecimento",
    settings: "Configurações"
  };
  return map[state.view] || "Dashboard";
}

/** Dispara a renderização baseada na view atual */
function renderView(user: User) {
  if (state.view === "dashboard") return renderCleanDashboard(user);
  if (state.view === "tickets") return renderTickets(user);
  if (state.view === "new-ticket") return renderNewTicket(user);
  if (state.view === "users") return renderUsers(user);
  if (state.view === "notifications") return renderNotifications(user);
  if (state.view === "trash") return renderTrash(user);
  if (state.view === "departments") return renderDepartments(user);
  if (state.view === "reports" && user.role !== "usuario") return renderReports(user);
  if (state.view === "knowledge") return renderKnowledgeBase(user);
  if (state.view === "settings") return renderSettings(user);
  return renderCleanDashboard(user);
}

// ===== BASE DE CONHECIMENTO =====
let knowledgeTutorials: KnowledgeTutorial[] = [
  {
    id: "create-ticket", title: "Como abrir um chamado", category: "Chamados", icon: "square-plus",
    summary: "Registre uma solicitação com categoria, prioridade, descrição e anexos.", roles: ["usuario", "gestor", "tic"],
    steps: [
      { title: "Acesse Novo chamado", text: "Use “Novo chamado” no menu lateral ou o botão + no topo. O formulário será aberto.", button: "Novo chamado", view: "new-ticket" },
      { title: "Classifique a solicitação", text: "Escolha Incidente quando algo parou ou apresenta erro. Use Requisição para acesso, instalação, orientação ou melhoria." },
      { title: "Informe os dados", text: "Selecione categoria, prioridade e departamento. Escreva um título objetivo e uma descrição com contexto, impacto e resultado esperado." },
      { title: "Anexe evidências", text: "Na área de anexos, escolha documentos ou imagens de até 2 MB. Não envie senhas ou informações sigilosas na descrição." },
      { title: "Envie e acompanhe", text: "Clique em Abrir chamado. Aguarde a confirmação e o número único; depois acompanhe pela Fila de Chamados.", button: "Abrir chamado" }
    ]
  },
  {
    id: "track-ticket", title: "Consultar e acompanhar chamados", category: "Chamados", icon: "list-filter",
    summary: "Localize um chamado, interprete o status e abra os detalhes.", roles: ["usuario", "gestor", "tic"],
    steps: [
      { title: "Abra a fila", text: "Entre em Fila de Chamados para visualizar os chamados permitidos ao seu perfil.", button: "Fila de Chamados", view: "tickets" },
      { title: "Use os filtros", text: "Pesquise por ID, título, descrição, requerente, departamento, status, prioridade ou conteúdo do histórico." },
      { title: "Abra os detalhes", text: "Clique na linha do chamado. O painel mostra requerente, responsável, departamento, descrição, anexos, ações e histórico." },
      { title: "Entenda os status", text: "Novo: aguardando triagem. Em atendimento: iniciado pela TIC. Agendado: possui data programada. Pendente: aguarda informação. Solucionado ou Fechado: atendimento encerrado." }
    ]
  },
  {
    id: "comment-ticket", title: "Complementar chamado e anexar arquivos", category: "Chamados", icon: "message-square-plus",
    summary: "Adicione informações ao histórico e notifique os participantes.", roles: ["usuario", "gestor", "tic"],
    steps: [
      { title: "Abra o chamado", text: "Localize o chamado na fila e abra o painel de detalhes.", view: "tickets" },
      { title: "Encontre Complementar chamado", text: "Digite a nova informação no campo. Seja objetivo e indique o que mudou desde a abertura." },
      { title: "Inclua anexos", text: "Use a área de arquivos do complemento. Cada anexo ficará associado àquela mensagem no histórico." },
      { title: "Clique em Adicionar", text: "A mensagem será registrada com autor e horário. Os participantes autorizados receberão uma notificação.", button: "Adicionar" }
    ]
  },
  {
    id: "notifications", title: "Usar a central de notificações", category: "Comunicação", icon: "bell",
    summary: "Leia avisos de respostas, mudanças de status e agendamentos.", roles: ["usuario", "gestor", "tic"],
    steps: [
      { title: "Abra Notificações", text: "Clique no sino superior ou em Notificações no menu lateral.", button: "Notificações", view: "notifications" },
      { title: "Leia uma atualização", text: "Cada aviso informa o chamado relacionado e o motivo. Ao abrir, você pode retornar ao atendimento correspondente." },
      { title: "Organize os avisos", text: "Use Marcar como lidas para retirar o destaque. Excluir notificações remove apenas os avisos, nunca o chamado ou seu histórico." }
    ]
  },
  {
    id: "profile-settings", title: "Alterar foto, nome e senha", category: "Conta", icon: "settings",
    summary: "Mantenha seus dados pessoais e sua senha atualizados.", roles: ["usuario", "gestor", "tic"],
    steps: [
      { title: "Abra Configurações", text: "Acesse Configurações no menu lateral.", button: "Configurações", view: "settings" },
      { title: "Atualize a foto", text: "Clique em Upload ou passe o mouse sobre a foto do menu lateral. São aceitos PNG, JPG e WebP de até 3 MB." },
      { title: "Altere seu nome", text: "Use a ação de edição do nome completo. A mudança é registrada diretamente no perfil do sistema." },
      { title: "Troque a senha", text: "Informe a senha atual e uma nova senha de pelo menos 8 caracteres. Nunca compartilhe sua senha com outra pessoa." }
    ]
  },
  {
    id: "manager-team", title: "Gerenciar usuários da equipe", category: "Gestão", icon: "contact-round",
    summary: "Crie ou remova usuários dentro dos departamentos gerenciados.", roles: ["gestor"],
    steps: [
      { title: "Abra Usuários & Acessos", text: "A tela exibirá somente perfis dos departamentos sob sua gestão.", view: "users" },
      { title: "Crie um usuário", text: "Informe nome, e-mail e um ou mais departamentos autorizados. O sistema gerará uma senha temporária." },
      { title: "Informe a senha temporária", text: "Entregue a senha diretamente ao usuário. No primeiro login, ele será obrigado a escolher uma senha pessoal." },
      { title: "Exclusão segura", text: "O Gestor pode remover apenas usuários comuns vinculados exclusivamente aos seus departamentos. Chamados e histórico permanecem preservados." }
    ]
  },
  {
    id: "tic-triage", title: "Triar e atender um chamado", category: "Operação TIC", icon: "activity",
    summary: "Atribua responsável, prioridade e conduza o ciclo do atendimento.", roles: ["tic"],
    steps: [
      { title: "Abra a fila TIC", text: "Use Fila de Chamados e filtre por status, prioridade, departamento ou requerente.", view: "tickets" },
      { title: "Faça a triagem", text: "Abra o chamado, valide descrição e anexos, defina o responsável e ajuste a prioridade quando necessário." },
      { title: "Inicie o atendimento", text: "Clique em Iniciar. O status muda para Em atendimento e o requerente é notificado.", button: "Iniciar" },
      { title: "Registre cada interação", text: "Use Complementar chamado para orientações, diagnósticos e evidências. Isso mantém uma trilha institucional." },
      { title: "Conclua corretamente", text: "Use Solucionar quando houver conclusão técnica. Use Fechar somente quando precisar encerrar sem solução, informando o motivo." }
    ]
  },
  {
    id: "tic-schedule", title: "Agendar ou pendenciar atendimento", category: "Operação TIC", icon: "calendar-clock",
    summary: "Registre data programada ou dependência de informação.", roles: ["tic"],
    steps: [
      { title: "Abra os detalhes", text: "Selecione o chamado na fila e localize as ações operacionais.", view: "tickets" },
      { title: "Agendar", text: "Clique em Agendar, informe uma data e horário futuros e confirme. O chamado exibirá Agendado e o requerente será avisado." },
      { title: "Pendenciar", text: "Use Pendenciar quando faltar informação ou ação do solicitante. Descreva exatamente o que precisa ser fornecido." },
      { title: "Retomar", text: "Quando a dependência for resolvida, inicie ou solucione o chamado. Todas as mudanças ficam registradas no histórico." }
    ]
  },
  {
    id: "tic-users", title: "Administrar contas e senhas temporárias", category: "Administração", icon: "users",
    summary: "Crie, edite, desative e recupere o acesso dos usuários.", roles: ["tic"],
    steps: [
      { title: "Abra Usuários & Acessos", text: "A TIC visualiza os perfis ativos e seus departamentos vinculados.", view: "users" },
      { title: "Criar conta", text: "Informe perfil, nome, departamentos e e-mail único. Guarde a senha temporária exibida para repassá-la com segurança." },
      { title: "Redefinir acesso", text: "No ícone de chave, gere uma nova senha temporária. No próximo login, o usuário deverá definir uma senha pessoal." },
      { title: "Editar ou excluir", text: "O lápis altera perfil e vínculos. A lixeira bloqueia o acesso, mas preserva chamados e trilha de auditoria." }
    ]
  },
  {
    id: "tic-trash", title: "Excluir, restaurar e esvaziar a lixeira", category: "Administração", icon: "trash-2",
    summary: "Controle chamados excluídos sem perder o status anterior.", roles: ["tic"],
    steps: [
      { title: "Mover para a lixeira", text: "No detalhe do chamado, use Excluir chamado. Ele deixa a fila normal, mas ainda pode ser restaurado." },
      { title: "Abra a Lixeira", text: "Acesse Lixeira no menu lateral para consultar os itens excluídos.", view: "trash" },
      { title: "Restaurar", text: "Clique em Restaurar. O chamado retorna ao status que possuía antes da exclusão." },
      { title: "Exclusão definitiva", text: "Excluir permanentemente ou Esvaziar lixeira remove chamado, notificações, histórico e anexos. Essa ação não pode ser desfeita." }
    ]
  },
  {
    id: "reports", title: "Gerar relatório Word", category: "Relatórios", icon: "file-text",
    summary: "Consolide indicadores e chamados de um período de até 31 dias.", roles: ["gestor", "tic"],
    steps: [
      { title: "Abra Relatórios", text: "Acesse Relatórios no menu lateral.", view: "reports" },
      { title: "Escolha o período", text: "Informe data inicial e final. O intervalo máximo permitido é de 31 dias." },
      { title: "Selecione o departamento", text: "TIC pode usar todos os setores. Gestores visualizam somente os departamentos sob sua gestão." },
      { title: "Gere o Word", text: "Clique em Gerar relatório Word. O arquivo inclui indicadores, percentuais, análise e tabela completa dos chamados.", button: "Gerar relatório Word" }
    ]
  }
];

function tutorialsForUser(user: User) {
  return knowledgeTutorials.filter((tutorial) => tutorial.roles.includes(user.role) && (user.role === "tic" || tutorial.published !== false));
}

function renderKnowledgeBase(user: User) {
  const tutorials = tutorialsForUser(user);
  const categories = [...new Set(tutorials.map((tutorial) => tutorial.category))];
  return `
    <section class="knowledge-hero panel">
      <div>
        <span class="section-kicker">Ajuda e treinamento</span>
        <h2>Base de conhecimento</h2>
        <p>Consulte procedimentos do sistema sempre que precisar. Os conteúdos abaixo correspondem às permissões do seu perfil.</p>
      </div>
      <div class="knowledge-hero-actions">
        ${user.role === "tic" ? `<button id="knowledge-create" class="primary-button" type="button"><i data-lucide="square-plus"></i>Novo tutorial</button>` : ""}
        <i data-lucide="book-open"></i>
      </div>
    </section>
    <div class="knowledge-search">
      <i data-lucide="list-filter"></i>
      <input id="knowledge-search-input" type="search" placeholder="Pesquisar: chamado, senha, lixeira, relatório..." aria-label="Pesquisar tutoriais" />
    </div>
    <div id="knowledge-content" class="knowledge-content">
      ${categories.map((category) => `
        <section class="knowledge-category" data-knowledge-category>
          <div class="knowledge-category-heading">
            <span>${escapeHtml(category)}</span>
            <small>${tutorials.filter((tutorial) => tutorial.category === category).length} tutorial(is)</small>
          </div>
          <div class="knowledge-grid">
            ${tutorials.filter((tutorial) => tutorial.category === category).map((tutorial) => `
              <article class="knowledge-card" data-knowledge-card data-search="${escapeHtml(`${tutorial.title} ${tutorial.summary} ${tutorial.category}`.toLowerCase())}">
                <span class="knowledge-card-icon"><i data-lucide="${tutorial.icon}"></i></span>
                <div><h3>${escapeHtml(tutorial.title)}</h3><p>${escapeHtml(tutorial.summary)}</p>${tutorial.published === false ? `<small class="knowledge-draft">Rascunho</small>` : ""}</div>
                <div class="knowledge-card-actions">
                  <button class="ghost-button knowledge-open" type="button" data-tutorial-id="${tutorial.id}">Ver tutorial</button>
                  ${user.role === "tic" ? `<button class="icon-button knowledge-edit" type="button" data-tutorial-id="${tutorial.id}" title="Editar tutorial"><i data-lucide="pencil"></i></button><button class="icon-button knowledge-delete" type="button" data-tutorial-id="${tutorial.id}" title="Excluir tutorial"><i data-lucide="trash-2"></i></button>` : ""}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      `).join("")}
      <p id="knowledge-empty" class="empty-state" hidden>Nenhum tutorial encontrado para essa pesquisa.</p>
    </div>
  `;
}

function openKnowledgeTutorial(tutorial: KnowledgeTutorial) {
  let currentStep = 0;
  const overlay = document.createElement("div");
  overlay.className = "knowledge-dialog-overlay";
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeTutorial(); };
  const closeTutorial = () => {
    overlay.remove();
    document.removeEventListener("keydown", closeOnEscape);
  };
  const draw = () => {
    const step = tutorial.steps[currentStep];
    overlay.innerHTML = `
      <section class="knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title">
        <div class="knowledge-dialog-top">
          <span>${escapeHtml(tutorial.category)} · Etapa ${currentStep + 1} de ${tutorial.steps.length}</span>
          <button class="icon-button" id="knowledge-dialog-close" type="button" aria-label="Fechar tutorial"><i data-lucide="x"></i></button>
        </div>
        <div class="knowledge-dialog-icon"><i data-lucide="${tutorial.icon}"></i></div>
        <h2 id="knowledge-dialog-title">${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.text)}</p>
        ${step.button ? `<div class="knowledge-button-example"><small>Botão mencionado</small><strong>${escapeHtml(step.button)}</strong></div>` : ""}
        <div class="knowledge-progress"><span style="width:${((currentStep + 1) / tutorial.steps.length) * 100}%"></span></div>
        <div class="knowledge-dialog-actions">
          <button class="ghost-button" id="knowledge-dialog-back" type="button" ${currentStep === 0 ? "disabled" : ""}>Voltar</button>
          ${step.view ? `<button class="ghost-button" id="knowledge-open-view" type="button" data-target-view="${step.view}">Abrir esta tela</button>` : ""}
          <button class="primary-button" id="knowledge-dialog-next" type="button">${currentStep === tutorial.steps.length - 1 ? "Concluir" : "Próximo"}</button>
        </div>
      </section>`;
    createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
    overlay.querySelector("#knowledge-dialog-close")?.addEventListener("click", closeTutorial);
    overlay.querySelector("#knowledge-dialog-back")?.addEventListener("click", () => { if (currentStep > 0) { currentStep -= 1; draw(); } });
    overlay.querySelector("#knowledge-dialog-next")?.addEventListener("click", () => {
      if (currentStep < tutorial.steps.length - 1) { currentStep += 1; draw(); } else closeTutorial();
    });
    overlay.querySelector<HTMLButtonElement>("#knowledge-open-view")?.addEventListener("click", (event) => {
      state.view = (event.currentTarget as HTMLButtonElement).dataset.targetView as View;
      closeTutorial();
      render();
    });
  };
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeTutorial(); });
  document.addEventListener("keydown", closeOnEscape);
  draw();
}

const knowledgeViewOptions: Array<[View, string]> = [
  ["dashboard", "Painel"], ["tickets", "Fila de Chamados"], ["new-ticket", "Novo chamado"],
  ["users", "Usuários & Acessos"], ["notifications", "Notificações"], ["trash", "Lixeira"],
  ["departments", "Departamentos"], ["reports", "Relatórios"], ["knowledge", "Base de conhecimento"],
  ["settings", "Configurações"]
];

function openKnowledgeEditor(existing?: KnowledgeTutorial) {
  const overlay = document.createElement("div");
  overlay.className = "knowledge-dialog-overlay knowledge-editor-overlay";
  const initialSteps = existing?.steps.length ? existing.steps : [{ title: "", text: "" }];
  const stepMarkup = (step: KnowledgeStep, index: number) => `
    <fieldset class="knowledge-step-editor" data-step-editor>
      <legend>Etapa <span data-step-number>${index + 1}</span></legend>
      <button class="icon-button knowledge-remove-step" type="button" title="Remover etapa"><i data-lucide="trash-2"></i></button>
      <label>Título da etapa<input data-step-title maxlength="100" required value="${escapeHtml(step.title)}" placeholder="Ex.: Abra a fila" /></label>
      <label>Orientação<textarea data-step-text maxlength="1200" required placeholder="Explique claramente o procedimento">${escapeHtml(step.text)}</textarea></label>
      <div class="knowledge-step-optional">
        <label>Botão mencionado (opcional)<input data-step-button maxlength="80" value="${escapeHtml(step.button || "")}" placeholder="Ex.: Novo chamado" /></label>
        <label>Levar para a tela (opcional)<select data-step-view><option value="">Não abrir uma tela</option>${knowledgeViewOptions.map(([value, label]) => `<option value="${value}" ${step.view === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      </div>
    </fieldset>`;
  overlay.innerHTML = `
    <form id="knowledge-editor-form" class="knowledge-editor" role="dialog" aria-modal="true">
      <div class="knowledge-dialog-top"><div><span>Administração TIC</span><h2>${existing ? "Editar tutorial" : "Novo tutorial"}</h2></div><button id="knowledge-editor-close" class="icon-button" type="button" aria-label="Fechar"><i data-lucide="x"></i></button></div>
      <div class="knowledge-editor-grid">
        <label>Título<input name="title" maxlength="120" required value="${escapeHtml(existing?.title || "")}" /></label>
        <label>Categoria<input name="category" maxlength="60" required value="${escapeHtml(existing?.category || "")}" placeholder="Ex.: Chamados" /></label>
        <label class="knowledge-span-2">Resumo<textarea name="summary" maxlength="300" required>${escapeHtml(existing?.summary || "")}</textarea></label>
        <label>Ícone<select name="icon"><option value="book-open">Livro</option><option value="square-plus">Adicionar</option><option value="list-filter">Lista</option><option value="bell">Notificação</option><option value="settings">Configuração</option><option value="users">Usuários</option><option value="activity">Atendimento</option><option value="file-text">Documento</option></select></label>
        <fieldset class="knowledge-audience"><legend>Público que verá e será notificado</legend><div class="knowledge-audience-options">${(["usuario", "gestor", "tic"] as Role[]).map((role) => `<label class="knowledge-check-option"><input type="checkbox" name="roles" value="${role}" ${existing?.roles.includes(role) || !existing ? "checked" : ""} /><span>${getRoleLabel(role)}</span></label>`).join("")}</div></fieldset>
      </div>
      <div class="knowledge-steps-heading"><div><strong>Etapas do tutorial</strong><small>Monte quantas etapas forem necessárias.</small></div><button id="knowledge-add-step" class="ghost-button" type="button"><i data-lucide="square-plus"></i>Adicionar etapa</button></div>
      <div id="knowledge-step-list" class="knowledge-step-list">${initialSteps.map(stepMarkup).join("")}</div>
      <label class="knowledge-publish"><input name="published" type="checkbox" ${existing?.published === false ? "" : "checked"} /><span><strong>Publicar tutorial</strong><small>Ao publicar um tutorial novo, todos os usuários ativos dos perfis selecionados receberão uma notificação.</small></span></label>
      <div class="knowledge-editor-actions"><button id="knowledge-editor-cancel" class="ghost-button" type="button">Cancelar</button><button class="primary-button" type="submit"><i data-lucide="save"></i>Salvar tutorial</button></div>
    </form>`;
  const iconSelect = overlay.querySelector<HTMLSelectElement>('select[name="icon"]');
  if (iconSelect) iconSelect.value = existing?.icon || "book-open";
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
  const close = () => { document.removeEventListener("keydown", closeOnEscape); overlay.remove(); };
  const renumber = () => overlay.querySelectorAll("[data-step-number]").forEach((node, index) => { node.textContent = String(index + 1); });
  const bindRemove = () => overlay.querySelectorAll<HTMLButtonElement>(".knowledge-remove-step").forEach((button) => {
    button.onclick = () => {
      if (overlay.querySelectorAll("[data-step-editor]").length === 1) return showSystemAlert("O tutorial precisa ter pelo menos uma etapa.");
      button.closest("[data-step-editor]")?.remove(); renumber();
    };
  });
  document.body.appendChild(overlay);
  document.addEventListener("keydown", closeOnEscape);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
  bindRemove();
  overlay.querySelector("#knowledge-editor-close")?.addEventListener("click", close);
  overlay.querySelector("#knowledge-editor-cancel")?.addEventListener("click", close);
  overlay.querySelector("#knowledge-add-step")?.addEventListener("click", () => {
    overlay.querySelector("#knowledge-step-list")?.insertAdjacentHTML("beforeend", stepMarkup({ title: "", text: "" }, overlay.querySelectorAll("[data-step-editor]").length));
    createIcons({ icons: usedIcons, nameAttr: "data-lucide" }); bindRemove();
  });
  overlay.querySelector<HTMLFormElement>("#knowledge-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const roles = formData.getAll("roles") as Role[];
    if (!roles.length) return showSystemAlert("Selecione pelo menos um perfil para o tutorial.");
    const steps: KnowledgeStep[] = [...form.querySelectorAll<HTMLElement>("[data-step-editor]")].map((row) => ({
      title: row.querySelector<HTMLInputElement>("[data-step-title]")!.value.trim(),
      text: row.querySelector<HTMLTextAreaElement>("[data-step-text]")!.value.trim(),
      button: row.querySelector<HTMLInputElement>("[data-step-button]")!.value.trim() || undefined,
      view: (row.querySelector<HTMLSelectElement>("[data-step-view]")!.value || undefined) as View | undefined
    }));
    const tutorial: KnowledgeTutorial = { id: existing?.id || createUuid(), title: String(formData.get("title")).trim(), summary: String(formData.get("summary")).trim(), category: String(formData.get("category")).trim(), icon: String(formData.get("icon")), roles, steps, published: formData.get("published") === "on" };
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true; submit.textContent = "Salvando...";
    try {
      await saveKnowledgeTutorial(tutorial);
      knowledgeTutorials = await loadKnowledgeTutorials();
      close(); render();
      showSystemAlert(existing ? "Tutorial atualizado com sucesso." : tutorial.published ? "Tutorial publicado e usuários notificados." : "Tutorial salvo como rascunho.");
    } catch (error) {
      submit.disabled = false; submit.textContent = "Salvar tutorial";
      showSystemAlert(error instanceof Error ? error.message : "Não foi possível salvar o tutorial.");
    }
  });
}

// ===== RELATÓRIOS =====
function reportDateValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function renderReports(user: User) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const allowedDepartmentIds = user.role === "tic"
    ? data.departments.map((department) => department.id)
    : visibleDepartmentIds(user);
  const allowedDepartments = data.departments.filter((department) => allowedDepartmentIds.includes(department.id));

  return `
    <section class="panel reports-panel">
      <div class="panel-header reports-header">
        <div>
          <span class="section-kicker">Documento gerencial</span>
          <h2>Relatório de chamados</h2>
          <p>Gere um arquivo Word com indicadores, análise do período e relação completa dos chamados registrados.</p>
        </div>
        <i data-lucide="file-text"></i>
      </div>

      <form id="report-form" class="report-form">
        <div class="report-fields">
          <label>
            Data inicial
            <input id="report-start-date" name="startDate" type="date" value="${reportDateValue(start)}" max="${reportDateValue(end)}" required />
          </label>
          <label>
            Data final
            <input id="report-end-date" name="endDate" type="date" value="${reportDateValue(end)}" max="${reportDateValue(end)}" required />
          </label>
          <label>
            Departamento
            <select id="report-department" name="departmentId" required>
              <option value="todos">Todos os departamentos autorizados</option>
              ${allowedDepartments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="report-scope-note">
          <i data-lucide="shield-check"></i>
          <span>${user.role === "tic"
            ? "O perfil TIC pode consolidar todos os departamentos ou selecionar um setor específico."
            : `O relatório está limitado aos ${allowedDepartments.length} departamento(s) sob sua gestão.`}</span>
        </div>
        <div id="report-error" class="form-error" role="alert"></div>
        <div class="report-actions">
          <button class="primary-button" type="submit">
            <i data-lucide="file-text"></i>
            Gerar relatório Word
          </button>
          <small>Período máximo permitido: 31 dias.</small>
        </div>
      </form>
    </section>

    <section class="report-preview-grid" aria-label="Conteúdo do relatório">
      <article class="report-preview-card"><strong>Indicadores</strong><span>Totais e percentuais por situação.</span></article>
      <article class="report-preview-card"><strong>Análise</strong><span>Leitura automática do cenário selecionado.</span></article>
      <article class="report-preview-card"><strong>Detalhamento</strong><span>Tabela com todos os chamados do período.</span></article>
    </section>
  `;
}

function reportCell(text: string, bold = false, fill?: string) {
  return new TableCell({
    shading: fill ? { fill } : undefined,
    margins: { top: 80, bottom: 80, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 17, color: fill ? "FFFFFF" : "263548" })] })]
  });
}

function reportPercent(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1).replace(".", ",")}%` : "0,0%";
}

async function generateWordReport(user: User, startValue: string, endValue: string, departmentId: string) {
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T23:59:59.999`);
  const allowedIds = user.role === "tic" ? data.departments.map((department) => department.id) : visibleDepartmentIds(user);
  const rangeError = reportRangeError(startValue, endValue);
  if (rangeError) throw new Error(rangeError);
  if (departmentId !== "todos" && !allowedIds.includes(departmentId)) throw new Error("Você não possui acesso ao departamento selecionado.");

  const tickets = data.tickets
    .filter((ticket) => ticket.status !== "excluido")
    .filter((ticket) => allowedIds.includes(ticket.departmentId))
    .filter((ticket) => departmentId === "todos" || ticket.departmentId === departmentId)
    .filter((ticket) => {
      const created = new Date(ticket.createdAt);
      return created >= start && created <= end;
    })
    .sort((first, second) => first.id - second.id);

  const total = tickets.length;
  const closed = tickets.filter((ticket) => ["solucionado", "fechado"].includes(ticket.status)).length;
  const open = total - closed;
  const attended = tickets.filter((ticket) => Boolean(ticket.responseStartedAt) || !["novo", "excluido"].includes(ticket.status)).length;
  const critical = tickets.filter((ticket) => ticket.priority === "critica").length;
  const highOrCritical = tickets.filter((ticket) => ["alta", "critica"].includes(ticket.priority)).length;
  const departmentLabel = departmentId === "todos"
    ? "Todos os departamentos autorizados"
    : departmentById(departmentId)?.name ?? "Departamento";
  const closedRate = total ? closed / total : 0;
  const criticalRate = total ? critical / total : 0;
  const analysis = total === 0
    ? "Não foram registrados chamados no recorte selecionado. Não há volume suficiente para análise operacional."
    : `No período foram registrados ${total} chamado(s). ${closed} foram solucionados ou fechados (${reportPercent(closed, total)}), enquanto ${open} permanecem abertos (${reportPercent(open, total)}). ${attended} chamado(s) receberam atendimento (${reportPercent(attended, total)}). `
      + (closedRate >= 0.75 ? "O índice de conclusão é elevado para o período analisado. " : closedRate >= 0.4 ? "O índice de conclusão é intermediário e recomenda acompanhamento dos itens ainda abertos. " : "O índice de conclusão é baixo; recomenda-se revisar capacidade, responsáveis e impedimentos da fila. ")
      + (criticalRate >= 0.2 ? `A concentração de chamados críticos é relevante (${reportPercent(critical, total)}), exigindo priorização gerencial. ` : `A participação de chamados críticos está controlada (${reportPercent(critical, total)}). `)
      + `${highOrCritical} chamado(s) possuem prioridade alta ou crítica.`;
  const distributionItems = [
    ...statusOrder.filter((status) => status !== "excluido").map((status) => ({ group: "Status", label: statusLabels[status], count: tickets.filter((ticket) => ticket.status === status).length })),
    ...Object.entries(priorityLabels).map(([priority, label]) => ({ group: "Prioridade", label, count: tickets.filter((ticket) => ticket.priority === priority).length })),
    ...categoryOptions.map((category) => ({ group: "Categoria", label: category, count: tickets.filter((ticket) => ticket.category === category).length })),
    ...data.departments.filter((department) => allowedIds.includes(department.id) && (departmentId === "todos" || department.id === departmentId)).map((department) => ({ group: "Departamento", label: department.name, count: tickets.filter((ticket) => ticket.departmentId === department.id).length }))
  ].filter((item) => item.count > 0);

  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 } });
  const tableBorders = { style: BorderStyle.SINGLE, size: 2, color: "B8C7D9" };
  const ticketRows = [
    new TableRow({ tableHeader: true, children: ["ID", "Abertura", "Departamento", "Requerente", "Título", "Categoria", "Criticidade", "Status"].map((label) => reportCell(label, true, "185A9D")) }),
    ...tickets.map((ticket) => new TableRow({ children: [
      `#${ticket.id}`,
      new Date(ticket.createdAt).toLocaleDateString("pt-BR"),
      departmentById(ticket.departmentId)?.name ?? "—",
      userById(ticket.requesterId)?.fullName ?? "Usuário removido",
      ticket.title,
      ticket.category,
      priorityLabels[ticket.priority],
      statusLabels[ticket.status]
    ].map((value) => reportCell(value)) }))
  ];

  const wordDocument = new Document({
    creator: user.fullName,
    title: `Relatório de chamados - ${departmentLabel}`,
    description: "Relatório gerencial produzido pelo Sistema de Chamados TIC do CRQ-12.",
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, right: 620, bottom: 720, left: 620 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONSELHO REGIONAL DE QUÍMICA – 12ª REGIÃO", bold: true, size: 28, color: "185A9D" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Relatório Gerencial de Chamados", bold: true, size: 34 })], spacing: { after: 120 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${departmentLabel} | ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}`, size: 20, color: "52657A" })] }),
        heading("Resumo executivo"),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: tableBorders, bottom: tableBorders, left: tableBorders, right: tableBorders, insideHorizontal: tableBorders, insideVertical: tableBorders }, rows: [
          new TableRow({ children: [reportCell("Chamados registrados", true, "185A9D"), reportCell("Atendidos", true, "185A9D"), reportCell("Fechados", true, "185A9D"), reportCell("Abertos", true, "185A9D"), reportCell("Críticos", true, "185A9D")] }),
          new TableRow({ children: [reportCell(String(total), true), reportCell(`${attended} (${reportPercent(attended, total)})`, true), reportCell(`${closed} (${reportPercent(closed, total)})`, true), reportCell(`${open} (${reportPercent(open, total)})`, true), reportCell(`${critical} (${reportPercent(critical, total)})`, true)] })
        ] }),
        heading("Análise do cenário"),
        new Paragraph({ text: analysis, alignment: AlignmentType.JUSTIFIED, spacing: { line: 300 } }),
        heading("Distribuição dos indicadores"),
        ...(distributionItems.length ? [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: tableBorders, bottom: tableBorders, left: tableBorders, right: tableBorders, insideHorizontal: tableBorders, insideVertical: tableBorders },
          rows: [
            new TableRow({ tableHeader: true, children: ["Dimensão", "Indicador", "Quantidade", "Percentual"].map((label) => reportCell(label, true, "185A9D")) }),
            ...distributionItems.map((item) => new TableRow({ children: [reportCell(item.group), reportCell(item.label), reportCell(String(item.count)), reportCell(reportPercent(item.count, total))] }))
          ]
        })] : [new Paragraph("Sem indicadores para distribuir no período.")]),
        heading("Chamados registrados no período"),
        ...(tickets.length ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: tableBorders, bottom: tableBorders, left: tableBorders, right: tableBorders, insideHorizontal: tableBorders, insideVertical: tableBorders }, rows: ticketRows })] : [new Paragraph("Nenhum chamado encontrado para os filtros selecionados.")]),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 260 }, children: [new TextRun({ text: `Gerado em ${new Date().toLocaleString("pt-BR")} por ${user.fullName}.`, italics: true, size: 17, color: "6C7A89" })] })
      ]
    }]
  });

  const blob = await Packer.toBlob(wordDocument);
  const link = document.createElement("a");
  const safeDepartment = departmentLabel.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-chamados-${safeDepartment}-${startValue}-a-${endValue}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return total;
}

// ===== DASHBOARD =====
/** Renderiza o gráfico de chamados por Categoria */
function renderCategoryChart(tickets: Ticket[]) {
  const total = tickets.length || 1;
  const categoriesCount = categoryOptions.map((cat) => {
    const count = tickets.filter((t) => t.category === cat && t.status !== "excluido").length;
    const pct = Math.round((count / total) * 100);
    return { name: cat, count, pct };
  }).filter((c) => c.count > 0 || tickets.length === 0);

  if (!tickets.length) {
    return `<p class="empty-state">Nenhum chamado registrado.</p>`;
  }

  return `
    <div class="tech-chart-container">
      ${categoriesCount.map((item) => `
        <div class="tech-chart-row">
          <div class="tech-chart-label">
            <span>${escapeHtml(item.name)}</span>
            <strong>${item.count} <small>(${item.pct}%)</small></strong>
          </div>
          <div class="tech-chart-bar-bg">
            <div class="tech-chart-bar-fill" style="width: ${item.pct}%;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/** Renderiza o gráfico de chamados por Departamento */
function renderDepartmentChart(tickets: Ticket[]) {
  const total = tickets.length || 1;
  const deptsCount = data.departments.map((dept) => {
    const count = tickets.filter((t) => t.departmentId === dept.id && t.status !== "excluido").length;
    const pct = Math.round((count / total) * 100);
    return { name: dept.name, count, pct };
  });

  if (!tickets.length) {
    return `<p class="empty-state">Nenhum chamado registrado.</p>`;
  }

  return `
    <div class="tech-chart-container">
      ${deptsCount.map((item) => `
        <div class="tech-chart-row">
          <div class="tech-chart-label">
            <span>${escapeHtml(item.name)}</span>
            <strong>${item.count} <small>(${item.pct}%)</small></strong>
          </div>
          <div class="tech-chart-bar-bg">
            <div class="tech-chart-bar-fill dept-fill" style="width: ${item.pct}%;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/** Renderiza a view do dashboard com métricas e painéis de gráficos */
function renderCleanDashboard(user: User) {
  let tickets = visibleTickets();

  // Aplica os filtros globais ativados no Dashboard
  if (state.filters.departmentId !== "todos") {
    tickets = tickets.filter((t) => t.departmentId === state.filters.departmentId);
  }
  if (state.filters.requesterId !== "todos") {
    tickets = tickets.filter((t) => t.requesterId === state.filters.requesterId);
  }

  const openTickets = tickets.filter((t) => !["solucionado", "fechado", "excluido"].includes(t.status));
  const inProgress = tickets.filter((t) => ["atribuido", "planejado"].includes(t.status));
  const closedTickets = tickets.filter((t) => ["solucionado", "fechado"].includes(t.status));
  const critical = tickets.filter(ticketIsCritical);

  if (user.role === "tic") {
    return `
      <section class="focus-panel">
        <div>
          <span class="section-kicker">Visão Geral TIC</span>
          <h2>Central de Operações de T.I.</h2>
          <p>Painel executivo com distribuição de chamados, prioridades, status e monitoramento de categorias.</p>
        </div>
        <div class="focus-actions">
          <button class="primary-button" data-view="tickets" type="button">
            <i data-lucide="list-filter"></i>
            Ver Fila Completa
          </button>
          <button class="ghost-button" data-view="new-ticket" type="button">
            <i data-lucide="square-plus"></i>
            Novo Chamado
          </button>
        </div>
      </section>

      ${renderTicDashboardFilters()}

      <div class="dashboard-grid calm">
        ${metricCard("Novos", tickets.filter((t) => t.status === "novo").length, "inbox")}
        ${metricCard("Em Atendimento", inProgress.length, "activity")}
        ${metricCard("Atenção Crítica", critical.length, "triangle-alert", "danger")}
        ${metricCard("Encerrados", closedTickets.length, "circle-check")}
      </div>

      <!-- PAINÉIS DE GRÁFICOS: CATEGORIA E DEPARTAMENTO -->
      <div class="dashboard-split">
        <section class="panel">
          <div class="panel-header compact-header">
            <div>
              <span class="section-kicker">Distribuição</span>
              <h2>Chamados por Categoria</h2>
            </div>
            <i data-lucide="pie-chart" style="color: var(--brand);"></i>
          </div>
          ${renderCategoryChart(tickets)}
        </section>

        <section class="panel">
          <div class="panel-header compact-header">
            <div>
              <span class="section-kicker">Origem</span>
              <h2>Volume por Departamento</h2>
            </div>
            <i data-lucide="bar-chart-3" style="color: var(--brand);"></i>
          </div>
          ${renderDepartmentChart(tickets)}
        </section>
      </div>

      <div style="margin-top: 12px;">
        <section class="panel">
          <div class="panel-header compact-header">
            <div>
              <span class="section-kicker">Status Operacional</span>
              <h2>Resumo Geral da Fila</h2>
            </div>
          </div>
          ${renderStatusOverview(tickets)}
        </section>
      </div>
    `;
  }

  return `
    <section class="focus-panel">
      <div>
        <span class="section-kicker">${user.role === "gestor" ? "Equipe" : "Meus chamados"}</span>
        <h2>${openTickets.length ? `${openTickets.length} chamado${openTickets.length > 1 ? "s" : ""} em aberto.` : "Tudo em dia por aqui."}</h2>
        <p>${user.role === "gestor" ? "Acompanhe o departamento sem perder a visão individual." : "Acompanhe suas solicitações sem excesso de informação."}</p>
      </div>
      <div class="focus-actions">
        <button class="primary-button" data-view="new-ticket" type="button">
          <i data-lucide="square-plus"></i>
          Novo chamado
        </button>
        <button class="ghost-button" data-view="tickets" type="button">
          <i data-lucide="list-filter"></i>
          Ver lista
        </button>
      </div>
    </section>

    ${user.role === "gestor" ? renderManagerFilters(user) : ""}

    <div class="dashboard-grid calm">
      ${metricCard("Abertos", openTickets.length, "folder-open")}
      ${metricCard("Pendentes", tickets.filter((t) => t.status === "pendente").length, "circle-help")}
      ${metricCard("Encerrados", closedTickets.length, "circle-check")}
    </div>

    <div class="dashboard-split">
      <section class="panel">
        <div class="panel-header compact-header">
          <div>
            <span class="section-kicker">Gráfico</span>
            <h2>Por Categoria</h2>
          </div>
        </div>
        ${renderCategoryChart(tickets)}
      </section>

      <section class="panel">
        <div class="panel-header compact-header">
          <div>
            <span class="section-kicker">Status</span>
            <h2>Resumo</h2>
          </div>
        </div>
        ${renderStatusOverview(tickets)}
      </section>

      <section class="panel">
        <div class="panel-header compact-header">
          <div>
            <span class="section-kicker">Atividade</span>
            <h2>Últimos movimentos</h2>
          </div>
        </div>
        ${renderRecentList(tickets.slice(0, 4))}
      </section>
    </div>
  `;
}

/** Gera um componente de resumo de status exibindo contagens por status */
function renderStatusOverview(tickets: Ticket[]) {
  const items = [
    { label: "Novos", value: tickets.filter((t) => t.status === "novo").length, status: "novo" },
    { label: "Em atendimento", value: tickets.filter((t) => ["atribuido", "planejado"].includes(t.status)).length },
    { label: "Pendentes", value: tickets.filter((t) => t.status === "pendente").length, status: "pendente" },
    { label: "Encerrados", value: tickets.filter((t) => ["solucionado", "fechado"].includes(t.status)).length }
  ];
  return `
    <div class="status-overview">
      ${items.map((item) => `
        <button class="status-overview-item" type="button" ${item.status ? `data-status="${item.status}"` : `data-view="tickets"`}>
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

/** Renderiza uma lista de movimentações recentes de chamados */
function renderRecentList(tickets: Ticket[]) {
  if (!tickets.length) return `<p class="empty-state">Nenhum movimento recente.</p>`;
  return `
    <div class="recent-list">
      ${tickets.map((t) => `
        <button class="recent-item" type="button" data-open-ticket="${t.id}">
          <span>
            <strong>#${t.id} · ${escapeHtml(t.title)}</strong>
            <small>${formatDate(t.updatedAt)}</small>
          </span>
          ${statusPill(t.status)}
        </button>
      `).join("")}
    </div>
  `;
}

// ===== TICKETS =====
/** Renderiza a view de lista de chamados com filtros e barra de ferramentas */
function renderTickets(user: User) {
  const tickets = filteredTickets().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const selected = visibleTickets().find((t) => t.id === state.selectedTicketId);
  const detailOpen = state.ticketDetailOpen && Boolean(selected);

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Filtros</span>
          <h2>Consultar chamados</h2>
        </div>
        <button class="ghost-button" id="clear-filters" type="button">
          <i data-lucide="rotate-ccw"></i>
          Limpar
        </button>
      </div>
      ${renderTicketFilters(user)}
    </section>

    <div class="tickets-toolbar">
      <div>
        <span class="section-kicker">Resultado</span>
        <h2>${tickets.length} chamado${tickets.length === 1 ? "" : "s"}</h2>
      </div>
      <div class="row-actions">
        ${selected && !detailOpen ? `
          <button class="ghost-button" id="toggle-ticket-detail" type="button">
            <i data-lucide="panel-right-open"></i>
            Abrir detalhes
          </button>
        ` : ""}
      </div>
    </div>

    <div class="tickets-layout ${detailOpen ? "detail-open" : "detail-closed"}" style="--ticket-detail-width: ${state.ticketDetailWidth}px">
      <section class="panel table-panel">
        <div class="table-hint">
          <span>Clique em uma linha para abrir o chamado na lateral.</span>
        </div>
        ${renderTicketTable(tickets)}
      </section>
      ${detailOpen && selected ? `
        <div
          id="ticket-detail-resizer"
          class="detail-resizer"
          role="separator"
          tabindex="0"
          aria-label="Redimensionar painel de detalhes"
          aria-orientation="vertical"
          title="Arraste para ajustar a largura"
        ></div>
        <aside class="panel detail-panel">
          <div class="detail-panel-controls">
            <button id="close-ticket-detail" class="detail-close-button" type="button" aria-label="Fechar painel lateral" title="Fechar painel">
              <i data-lucide="panel-right-close"></i>
              <span>Fechar</span>
            </button>
          </div>
          ${renderTicketDetail(selected, user)}
        </aside>
      ` : ""}
    </div>
  `;
}

/** Renderiza a UI de filtros para busca de chamados */
function renderTicketFilters(user: User) {
  const allowedDepts = visibleDepartmentIds(user);
  const requesters = data.users.filter((candidate) => {
    if (candidate.active === false) return false;
    if (user.role === "gestor" && !allowedDepts.includes(candidate.departmentId)) return false;
    return visibleTickets().some((t) => t.requesterId === candidate.id);
  });

  return `
    <div class="filter-grid">
      <label>
        ID, título, requerente
        <input id="filter-search" type="search" placeholder="Buscar..." value="${escapeHtml(state.filters.search)}" />
      </label>
      <label>
        Status
        <select id="filter-status">
          <option value="todos">Todos</option>
          ${statusOrder.map((s) => `<option value="${s}" ${state.filters.status === s ? "selected" : ""}>${statusLabels[s]}</option>`).join("")}
        </select>
      </label>
      <label>
        Prioridade
        <select id="filter-priority">
          <option value="todas">Todas</option>
          ${Object.entries(priorityLabels).map(([p, label]) => `<option value="${p}" ${state.filters.priority === p ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label>
        Requerente
        <select id="filter-requester">
          <option value="todos">${user.role === "gestor" ? "Todos do departamento" : "Todos"}</option>
          ${requesters.map((u) => `<option value="${u.id}" ${state.filters.requesterId === u.id ? "selected" : ""}>${escapeHtml(u.fullName)}</option>`).join("")}
        </select>
      </label>
      <label>
        Departamento
        <select id="filter-department">
          ${user.role === "tic" ? `
            <option value="todos">Todos os departamentos</option>
            ${data.departments.map((d) => `<option value="${d.id}" ${state.filters.departmentId === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
          ` : (allowedDepts.length > 1 ? `
            <option value="todos">Seus departamentos</option>
            ${allowedDepts.map((dId) => `<option value="${dId}" ${state.filters.departmentId === dId ? "selected" : ""}>${escapeHtml(departmentById(dId)?.name ?? "")}</option>`).join("")}
          ` : `
            <option value="${allowedDepts[0]}" selected>${escapeHtml(departmentById(allowedDepts[0])?.name ?? "")}</option>
          `)}
        </select>
      </label>
    </div>
  `;
}

/** Renderiza a tabela que exibe os chamados */
function renderTicketTable(tickets: Ticket[]) {
  if (!tickets.length) return `<p class="empty-state">Nenhum chamado combina com os filtros.</p>`;
  return `
    <div class="table-wrap">
      <table class="ticket-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Título</th>
            <th>Status</th>
            <th>Data de abertura</th>
            <th>Prioridade</th>
            <th>Requerente</th>
            <th>Atribuído</th>
            <th>Última atualização</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((ticket) => `
              <tr class="${state.selectedTicketId === ticket.id ? "selected" : ""}" data-open-ticket="${ticket.id}" tabindex="0">
                <td>#${ticket.id}</td>
                <td>
                  <strong>${escapeHtml(ticket.title)}</strong>
                  <small>${escapeHtml(ticket.category)}</small>
                </td>
                <td>${statusPill(ticket.status)}</td>
                <td>${formatDate(ticket.createdAt)}</td>
                <td>${priorityPill(ticket.priority)}</td>
                <td>${escapeHtml(userById(ticket.requesterId)?.fullName ?? "Usuário removido")}</td>
                <td>${escapeHtml(userById(ticket.assignedId)?.fullName ?? "Fila TIC")}</td>
                <td>${formatDate(ticket.updatedAt)}</td>
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/** Renderiza a view detalhada de um chamado selecionado */
function renderTicketDetail(ticket: Ticket, user: User) {
  const requester = userById(ticket.requesterId);
  const assigned = userById(ticket.assignedId);
  const interactionsLocked = ticketRequiresReopen(ticket);
  const lockedAttr = interactionsLocked ? "disabled aria-disabled=\"true\"" : "";
  return `
    <div class="detail-header">
      <div>
        <span class="section-kicker">Chamado #${ticket.id}</span>
        <h2>${escapeHtml(ticket.title)}</h2>
      </div>
      ${statusPill(ticket.status)}
    </div>

    ${ticket.plannedFor ? `
      <div class="planned-schedule-card">
        <i data-lucide="calendar-clock"></i>
        <div>
          <strong>Atendimento Agendado</strong>
          <span>Programado para ${formatDate(ticket.plannedFor)}</span>
        </div>
      </div>
    ` : ''}

    <div class="detail-meta">
      <span><strong>Tipo</strong>${ticket.type === "incidente" ? "Incidente" : "Requisição"}</span>
      <span><strong>Categoria</strong>${escapeHtml(ticket.category)}</span>
      <span><strong>Requerente</strong>${escapeHtml(requester?.fullName ?? "")}</span>
      <span><strong>Atribuído</strong>${escapeHtml(assigned?.fullName ?? "Fila TIC")}</span>
      <span><strong>Departamento</strong>${escapeHtml(departmentById(ticket.departmentId)?.name ?? "")}</span>
    </div>

    <div class="description-block">
      <strong>Descrição</strong>
      <p>${escapeHtml(ticket.description)}</p>
      <div class="attachment-list">
        ${renderAttachmentCards(ticket.attachments.filter((attachment) => !attachment.eventId))}
      </div>
    </div>

    ${user.role === "tic" ? renderTicActions(ticket) : renderUserActions(ticket, user)}

    <form id="comment-form" class="comment-form ${interactionsLocked ? "ticket-locked" : ""}">
      <label>
        Complementar chamado
        <textarea id="comment-text" rows="3" placeholder="Registrar atualização" ${lockedAttr}></textarea>
      </label>
      <div class="file-drop-area comment-file-drop">
        <input id="comment-attachments-input" type="file" accept="${ATTACHMENT_ACCEPT}" multiple aria-label="Anexar arquivos ao complemento" ${interactionsLocked ? "disabled" : ""} />
        <div class="file-drop-message">
          <i data-lucide="paperclip"></i>
          <span>Anexar arquivos ao complemento</span>
          <small>Vários arquivos, até 2 MB cada</small>
        </div>
      </div>
      <div id="comment-file-list" class="comment-file-list" aria-live="polite"></div>
      <button class="secondary-button" type="submit" ${lockedAttr}>
        <i data-lucide="message-square-plus"></i>
        Adicionar
      </button>
    </form>

    <div class="timeline">
      <span class="section-kicker">Histórico</span>
      ${ticket.events
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => {
        const eventAttachments = ticket.attachments.filter((attachment) => attachment.eventId === item.id);
        return `
          <div class="timeline-item">
            <strong>${escapeHtml(item.type)}</strong>
            <p>${escapeHtml(item.message)}</p>
            ${eventAttachments.length ? `<div class="attachment-list event-attachments">${renderAttachmentCards(eventAttachments)}</div>` : ""}
            <small>${escapeHtml(userById(item.actorId)?.fullName ?? "Sistema")} · ${formatDate(item.createdAt)}</small>
          </div>
        `;
      })
      .join("")}
    </div>
  `;
}

function renderTicActions(ticket: Ticket) {
  const ticUsers = data.users.filter((u) => u.role === "tic" && u.active);
  const reopenLocked = ticketRequiresReopen(ticket);
  const lockedAttr = reopenLocked ? "disabled aria-disabled=\"true\"" : "";
  const lockedLabel = ticket.status === "fechado" ? "Chamado fechado" : "Chamado solucionado";
  return `
    <div class="tic-actions ${reopenLocked ? "ticket-locked" : ""}">
      ${reopenLocked ? `
        <div class="ticket-locked-notice">
          <strong>${lockedLabel}</strong>
          <span>Somente a reabertura libera novamente as ações do chamado.</span>
        </div>
      ` : ""}
      <label>
        Responsável
        <select id="ticket-assignee" ${reopenLocked ? "disabled" : ""}>
          <option value="">Fila TIC</option>
          ${ticUsers.map((u) => `<option value="${u.id}" ${ticket.assignedId === u.id ? "selected" : ""}>${escapeHtml(u.fullName)}</option>`).join("")}
        </select>
      </label>
      <label>
        Prioridade
        <select id="ticket-priority" ${reopenLocked ? "disabled" : ""}>
          ${Object.entries(priorityLabels).map(([p, label]) => `<option value="${p}" ${ticket.priority === p ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <div class="action-row">
        <button class="secondary-button ticket-action" type="button" data-action="start" ${lockedAttr}>
          <i data-lucide="play"></i>
          Inicializar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="plan" ${lockedAttr}>
          <i data-lucide="calendar-clock"></i>
          Planejar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="pend" ${lockedAttr}>
          <i data-lucide="circle-help"></i>
          Pendenciar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="solve" ${lockedAttr}>
          <i data-lucide="circle-check"></i>
          Solucionar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="close" ${lockedAttr}>
          <i data-lucide="archive"></i>
          Fechar
        </button>
        <button class="danger-button ticket-action" type="button" data-action="delete" ${lockedAttr}>
          <i data-lucide="trash-2"></i>
          Excluir
        </button>
        ${reopenLocked ? `
          <button class="primary-button ticket-action reopen-ticket-action" type="button" data-action="reopen">
            <i data-lucide="rotate-ccw"></i>
            Reabrir chamado
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function renderUserActions(ticket: Ticket, user: User) {
  const isRequester = ticket.requesterId === user.id;
  const isManagerOfDept = user.role === "gestor" && visibleDepartmentIds(user).includes(ticket.departmentId);
  const canDelete = (isRequester || isManagerOfDept) && ticket.status !== "excluido" && !ticketRequiresReopen(ticket);

  if (!canDelete) return "";

  return `
    <div class="user-ticket-actions" style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
      <button class="danger-button ticket-action" type="button" data-action="delete" style="font-size: 0.82rem; padding: 6px 14px;">
        <i data-lucide="trash-2"></i>
        Excluir Chamado
      </button>
    </div>
  `;
}

function statusPill(status: TicketStatus) {
  return `<span class="pill status-${status}">${statusLabels[status]}</span>`;
}

function priorityPill(priority: Priority) {
  return `<span class="pill priority-${priority}">${priorityLabels[priority]}</span>`;
}

function metricCard(label: string, value: number, icon: string, tone = "") {
  return `
    <button class="metric-card ${tone}" type="button" data-view="tickets">
      <span>
        <small>${label}</small>
        <strong>${value}</strong>
      </span>
      <i data-lucide="${icon}"></i>
    </button>
  `;
}

function dashboardRequesterUsers(allowedDepartmentIds: string[]) {
  return activeUsersForDepartment(data.users, allowedDepartmentIds, state.filters.departmentId)
    .sort((first, second) => first.fullName.localeCompare(second.fullName, "pt-BR"));
}

function renderManagerFilters(user: User) {
  const depts = visibleDepartmentIds(user);
  const isDeptActive = state.filters.departmentId !== "todos";
  const isUserActive = state.filters.requesterId !== "todos";
  const hasActiveFilters = isDeptActive || isUserActive;

  return `
    <div class="dashboard-filter-bar">
      <div class="dash-filter-group">
        <div class="dash-filter-label">
          <i data-lucide="list-filter"></i>
          <span>Filtros do Painel:</span>
        </div>
        ${depts.length > 1 ? `
          <select id="dashboard-department-filter" class="custom-dash-select" aria-label="Departamento">
            <option value="todos">Seus departamentos</option>
            ${depts.map((dId) => `<option value="${dId}" ${state.filters.departmentId === dId ? "selected" : ""}>${escapeHtml(departmentById(dId)?.name ?? "")}</option>`).join("")}
          </select>
        ` : `
          <div class="dept-pill-badge">
            <span>${escapeHtml(departmentById(depts[0])?.name ?? "")}</span>
          </div>
        `}
        <select id="dashboard-requester-filter" class="custom-dash-select" aria-label="Usuário">
          <option value="todos">Todos os colaboradores</option>
          ${dashboardRequesterUsers(depts)
            .map((u) => `<option value="${u.id}" ${state.filters.requesterId === u.id ? "selected" : ""}>${escapeHtml(u.fullName)}</option>`)
            .join("")}
        </select>
      </div>
      ${hasActiveFilters ? `
        <button id="reset-dashboard-filters" class="ghost-button compact-button" type="button" style="font-size: 0.8rem;">
          <i data-lucide="rotate-ccw"></i> Limpar filtros
        </button>
      ` : ""}
    </div>
  `;
}

function renderTicDashboardFilters() {
  const isDeptActive = state.filters.departmentId !== "todos";
  const isUserActive = state.filters.requesterId !== "todos";
  const hasActiveFilters = isDeptActive || isUserActive;

  return `
    <div class="dashboard-filter-bar">
      <div class="dash-filter-group">
        <div class="dash-filter-label">
          <i data-lucide="list-filter"></i>
          <span>Filtrar Visão Geral:</span>
        </div>
        <select id="dashboard-department-filter" class="custom-dash-select" aria-label="Departamento">
          <option value="todos">Todos os departamentos</option>
          ${data.departments.map((d) => `<option value="${d.id}" ${state.filters.departmentId === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
        </select>
        <select id="dashboard-requester-filter" class="custom-dash-select" aria-label="Usuário">
          <option value="todos">Todos os requerentes</option>
          ${dashboardRequesterUsers(data.departments.map((department) => department.id))
            .map((u) => `<option value="${u.id}" ${state.filters.requesterId === u.id ? "selected" : ""}>${escapeHtml(u.fullName)}</option>`)
            .join("")}
        </select>
      </div>
      ${hasActiveFilters ? `
        <button id="reset-dashboard-filters" class="ghost-button compact-button" type="button" style="font-size: 0.8rem;">
          <i data-lucide="rotate-ccw"></i> Limpar filtros
        </button>
      ` : ""}
    </div>
  `;
}

// ===== NOVO TICKET =====
function renderNewTicket(user: User) {
  const userDepartments = linkedDepartments(user);
  return `
    <section class="panel form-panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Fila TIC</span>
          <h2>Novo chamado</h2>
        </div>
      </div>
      <form id="new-ticket-form" class="ticket-form">
        <div class="form-grid">
          <label>
            Tipo
            <select name="type" required>
              <option value="incidente">Incidente</option>
              <option value="requisicao">Requisição</option>
            </select>
          </label>
          <label>
            Categoria
            <select name="category" required>
              ${categoryOptions.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("")}
            </select>
          </label>
          <label>
            Prioridade
            <select name="priority" required>
              ${Object.entries(priorityLabels).map(([p, label]) => `<option value="${p}">${label}</option>`).join("")}
            </select>
          </label>
          <label>
            Departamento solicitante
            <select name="departmentId" required>
              ${userDepartments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>
          Título
          <input name="title" required maxlength="90" />
        </label>
        <label>
          Descrição
          <textarea name="description" rows="6" required></textarea>
        </label>
        <div class="file-input-wrapper">
          <label style="display: block; margin-bottom: 0.2rem; font-weight: 500; font-size: 0.9rem;">Arquivos em anexo</label>
          <div class="file-drop-area">
            <input name="attachments" id="file-attachments-input" type="file" accept="${ATTACHMENT_ACCEPT}" multiple />
            <div class="file-drop-message">
              <i data-lucide="upload-cloud"></i>
              <span>Clique ou arraste arquivos aqui para anexar</span>
              <small>Suporta imagens (PNG, JPG, WEBP), PDF, documentos e arquivos (até 2 MB por arquivo)</small>
            </div>
          </div>
          <div id="file-preview-grid" class="file-preview-grid"></div>
          <span id="file-feedback" class="file-feedback" style="display: block; margin-top: 4px; font-size: 0.8rem;"></span>
        </div>
        <button class="primary-button submit-ticket" type="submit">
          <i data-lucide="send"></i>
          Enviar
        </button>
      </form>
    </section>
  `;
}

// ============================================================
//  USUÁRIOS (com multisseleção simples)
// ============================================================

function renderMultiSelectDepartments(selectedIds: string[] = [], hidden = false, allowedDepartmentIds?: string[]): string {
  const availableDepts = allowedDepartmentIds
    ? data.departments.filter(d => allowedDepartmentIds.includes(d.id))
    : data.departments;

  return `
    <div id="dept-select-wrapper" class="multi-select-departments" style="margin-bottom: 0.8rem; display: ${hidden ? 'none' : 'block'};">
      <label style="display: block; margin-bottom: 0.3rem; font-weight: 500; font-size: 0.9rem;">Departamentos (selecione um ou mais)</label>
      <select name="departments" multiple style="min-height: 80px; width: 100%;">
        ${availableDepts.map(d => `
          <option value="${d.id}" ${selectedIds.includes(d.id) ? 'selected' : ''}>${escapeHtml(d.name)}</option>
        `).join('')}
      </select>
      <small style="display: block; margin-top: 0.2rem; color: #666; font-size: 0.75rem;">Segure Ctrl (Cmd no Mac) para selecionar vários. O primeiro será o principal.</small>
      <input type="hidden" name="departments" id="departments-hidden" value="${selectedIds.join(',')}">
    </div>
  `;
}

function renderUsers(user: User) {
  if (user.role === "usuario") {
    return `<section class="panel"><p class="empty-state">Perfil sem acesso à gestão de usuários.</p></section>`;
  }

  const allowedDepartments = visibleDepartmentIds(user);
  const visibleUsers = (user.role === "tic"
    ? data.users
    : data.users.filter((u) => [u.departmentId, ...u.managedDepartmentIds].some((id) => allowedDepartments.includes(id)))
  ).filter((u) => u.active !== false);

  // Gestor sempre cadastra um novo usuário; somente a TIC pode abrir edição.
  const editingUser = user.role === "tic" && state.editingUserId ? userById(state.editingUserId) : null;
  const isEditing = !!editingUser;

  // Selected departments array for edit mode
  let editDepts: string[] = [];
  if (isEditing) {
    editDepts = [editingUser.departmentId, ...editingUser.managedDepartmentIds];
  }
  const initialRole = isEditing ? editingUser.role : "usuario";
  const userAllowedDepts = user.role === "tic" ? undefined : allowedDepartments;
  const deptComponent = renderMultiSelectDepartments(editDepts, initialRole === "tic", userAllowedDepts);

  return `
    <div class="users-layout">
      <section class="panel form-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">${isEditing ? "Edição" : "Cadastro"}</span>
            <h2>${isEditing ? "Editar usuário" : "Criar novo usuário"}</h2>
            ${!isEditing ? `<p class="empty-state">${user.role === "tic" ? "A TIC pode criar contas para qualquer departamento." : "Você pode criar contas somente para os departamentos que gerencia."}</p>` : ''}
          </div>
        </div>
        <form id="user-form" class="user-form">
          <input type="hidden" id="user-edit-id" name="userId" value="${isEditing ? editingUser.id : ''}" />
          <label>
            Perfil
            <select id="user-role-select" name="role" ${user.role !== "tic" ? "disabled" : ""}>
              <option value="usuario" ${isEditing && editingUser.role === 'usuario' ? 'selected' : ''}>Usuário</option>
              <option value="gestor" ${isEditing && editingUser.role === 'gestor' ? 'selected' : ''}>Gestor</option>
              <option value="tic" ${isEditing && editingUser.role === 'tic' ? 'selected' : ''}>TIC</option>
            </select>
          </label>
          <label>
            Nome completo
            <input name="fullName" required value="${isEditing ? escapeHtml(editingUser.fullName) : ''}" />
          </label>
          ${deptComponent}
          <label>
            E-mail
            <input name="email" type="email" required value="${isEditing ? escapeHtml(editingUser.email) : ''}" />
          </label>
          ${!isEditing ? `
          <p class="manager-access-note">Uma senha temporária será gerada automaticamente e exibida após o cadastro.</p>
          ` : ''}
          <div class="row-actions" style="margin-top:0.8rem;">
            <button class="primary-button" type="submit">
              <i data-lucide="${isEditing ? 'save' : 'user-plus'}"></i>
              ${isEditing ? "Salvar" : "Criar usuário"}
            </button>
            ${isEditing ? `
              <button class="ghost-button" type="button" id="user-cancel-edit">
                <i data-lucide="rotate-ccw"></i>
                Cancelar
              </button>
            ` : ''}
          </div>
        </form>
      </section>

      <section class="panel table-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Acessos</span>
            <h2>Usuários cadastrados</h2>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Departamentos</th>
                <th>Perfil</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${visibleUsers.map((u) => {
    return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(u.fullName)}</strong>
                      <small>${escapeHtml(u.email)}</small>
                    </td>
                    <td>${renderDepartmentBadges(u)}</td>
                    <td>${roleLabels[u.role]}</td>
                    <td>
                      <div class="row-actions">
                        ${user.role === 'tic' ? `
                        <button class="icon-button edit-user" type="button" data-user-id="${u.id}" title="Editar usuário" aria-label="Editar usuário">
                          <i data-lucide="pencil"></i>
                        </button>
                        ` : ''}
                        ${user.role === 'tic' ? `
                        <button class="icon-button reset-password" type="button" data-user-id="${u.id}" title="Reenviar senha provisória" aria-label="Reenviar senha">
                          <i data-lucide="key-round"></i>
                        </button>
                        ` : ''}
                        ${(user.role === 'tic' || (user.role === 'gestor' && u.role === 'usuario' && [u.departmentId, ...u.managedDepartmentIds].filter(Boolean).every((id) => visibleDepartmentIds(user).includes(id)))) && u.id !== user.id ? `
                        <button class="icon-button delete-user" type="button" data-user-id="${u.id}" title="Excluir usuário" aria-label="Excluir usuário">
                          <i data-lucide="trash-2"></i>
                        </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
  }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

// ===== DEPARTAMENTOS =====
/** Renderiza a tela de gestão de departamentos (exclusiva para TIC) */
function renderDepartments(user: User) {
  if (user.role !== "tic") {
    return `<section class="panel"><p class="empty-state">Somente usuários TIC podem gerenciar departamentos.</p></section>`;
  }

  return `
    <div class="users-layout">

      <!-- Formulário de cadastro / edição -->
      <section class="panel form-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Gestão</span>
            <h2 id="dept-form-title">Novo departamento</h2>
          </div>
        </div>
        <form id="department-form" class="user-form">
          <!-- Campo oculto que armazena o id quando editando -->
          <input type="hidden" id="dept-edit-id" name="deptId" value="" />
          <label>
            Nome do departamento
            <input
              id="dept-name-input"
              name="deptName"
              required
              maxlength="80"
              placeholder="Ex.: Tecnologia da Informação"
            />
          </label>
          <div class="row-actions" style="margin-top:0.8rem;">
            <button class="primary-button" type="submit">
              <i data-lucide="save"></i>
              Salvar
            </button>
            <button class="ghost-button" type="button" id="dept-cancel-edit" style="display:none;">
              <i data-lucide="rotate-ccw"></i>
              Cancelar
            </button>
          </div>
        </form>
      </section>

      <!-- Tabela com departamentos cadastrados -->
      <section class="panel table-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Cadastrados</span>
            <h2>${data.departments.length} departamento${data.departments.length !== 1 ? "s" : ""}</h2>
          </div>
        </div>
        ${data.departments.length === 0
      ? `<p class="empty-state">Nenhum departamento cadastrado ainda.</p>`
      : `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Usuários vinculados</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.departments.map((dept) => {
        const linkedUsers = data.users.filter(
          (u) => u.departmentId === dept.id || u.managedDepartmentIds.includes(dept.id)
        ).length;
        return `
                      <tr>
                        <td><strong>${escapeHtml(dept.name)}</strong></td>
                        <td>${linkedUsers} usuário${linkedUsers !== 1 ? "s" : ""}</td>
                        <td>
                          <div class="row-actions">
                            <button
                              class="icon-button edit-department"
                              type="button"
                              data-dept-id="${dept.id}"
                              title="Editar departamento"
                              aria-label="Editar ${escapeHtml(dept.name)}"
                            >
                              <i data-lucide="monitor-up"></i>
                            </button>
                            <button
                              class="icon-button delete-department"
                              type="button"
                              data-dept-id="${dept.id}"
                              data-dept-name="${escapeHtml(dept.name)}"
                              data-linked="${linkedUsers}"
                              title="Excluir departamento"
                              aria-label="Excluir ${escapeHtml(dept.name)}"
                            >
                              <i data-lucide="trash-2"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
      }).join("")}
                </tbody>
              </table>
            </div>`
    }
      </section>
    </div>
  `;
}

function getUserNotifications(user: User): NotificationItem[] {
  let items = data.notifications.filter((n) => n.userId === user.id);

  if (user.role === "gestor") {
    items = items.filter((n) => {
      if (!n.ticketId) return true;
      const ticket = data.tickets.find((t) => t.id === n.ticketId);
      if (ticket && (ticket.requesterId === user.id || ticket.assignedId === user.id || ticket.observerIds.includes(user.id))) {
        return true;
      }
      const titleLower = n.title.toLowerCase();
      const bodyLower = n.body.toLowerCase();
      const isNew = titleLower.includes("criado") || titleLower.includes("criação") || bodyLower.includes("aberto por") || (ticket && ticket.status === "novo");
      const isResolvedOrClosed = titleLower.includes("solucionad") || titleLower.includes("solução") || titleLower.includes("fechad") || titleLower.includes("fechamento") || (ticket && (ticket.status === "solucionado" || ticket.status === "fechado"));
      
      return isNew || isResolvedOrClosed;
    });
  }

  return items;
}

// ===== NOTIFICAÇÕES =====
/** Renderiza a tela de notificações do usuário */
function renderNotifications(user: User) {
  const items = getUserNotifications(user);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Central</span>
          <h2>Notificações e e-mails</h2>
        </div>
        <div class="row-actions">
          ${user.role === "tic" && "Notification" in window ? `
            <button id="enable-browser-alerts" class="ghost-button" type="button">
              <i data-lucide="monitor-up"></i>
              Ativar navegador
            </button>
          ` : ""}
          <button id="clear-notifications" class="ghost-button" type="button" style="color: var(--red);">
            <i data-lucide="trash-2"></i>
            Limpar
          </button>
          <button id="mark-read" class="ghost-button" type="button">
            <i data-lucide="check-check"></i>
            Marcar lidas
          </button>
        </div>
      </div>
      <div class="notification-list">
        ${items.length
      ? items.map((item) => `
            <button class="notification-item ${item.read ? "" : "unread"}" type="button" ${item.ticketId ? `data-open-ticket="${item.ticketId}"` : item.title === "Novo tutorial disponível" ? `data-open-knowledge` : ""}>
              <span class="channel ${item.channel}">${item.channel}</span>
              <span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.body)}</small>
              </span>
              <time>${formatDate(item.createdAt)}</time>
            </button>
          `).join("")
      : `<p class="empty-state">Nenhuma notificação registrada.</p>`}
      </div>
    </section>
  `;
}

// ============================================================
//  LIXEIRA (Trash) – apenas para TIC
// ============================================================

function renderTrash(user: User) {
  if (user.role !== "tic") return `<p class="empty-state">Acesso negado.</p>`;

  const trashTickets = data.tickets.filter(t => t.status === "excluido");
  if (!trashTickets.length) {
    return `<section class="panel"><p class="empty-state">Lixeira vazia.</p></section>`;
  }

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Recuperação</span>
          <h2>Lixeira (${trashTickets.length} chamados)</h2>
        </div>
        <button class="danger-button" id="empty-trash" type="button">
          <i data-lucide="trash-2"></i>
          Esvaziar lixeira
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Requerente</th>
              <th>Departamento</th>
              <th>Excluído em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${trashTickets.map((t) => {
              const req = userById(t.requesterId);
              const dept = departmentById(t.departmentId);
              return `
                <tr>
                  <td>#${t.id}</td>
                  <td><strong>${escapeHtml(t.title)}</strong></td>
                  <td>${escapeHtml(req?.fullName ?? "Desconhecido")}</td>
                  <td>${escapeHtml(dept?.name ?? "N/A")}</td>
                  <td>${formatDate(t.updatedAt)}</td>
                  <td>
                    <button class="secondary-button restore-ticket" data-id="${t.id}" type="button" style="margin-right: 8px;">
                      <i data-lucide="rotate-ccw"></i> Restaurar
                    </button>
                    <button class="danger-button delete-permanently" data-id="${t.id}" type="button">
                      <i data-lucide="trash-2"></i> Excluir permanentemente
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// ===== CONFIGURAÇÕES =====
/** Renderiza a tela de configurações como uma lista única */
function renderSettings(user: User) {
  const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) ?? "light";
  const isDark = currentTheme === "dark";

  return `
    <section class="panel settings-panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Sistema</span>
          <h2>Configurações</h2>
        </div>
      </div>

      <ul class="settings-list">

        <!-- Foto de perfil -->
        <li class="settings-item">
          <div class="settings-item-info">
            ${renderAvatarHTML(user, '', 'width: 48px; height: 48px; font-size: 20px; flex-shrink: 0;')}
            <div>
              <strong>Foto de perfil</strong>
              <small>Altere sua imagem de exibição</small>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="settings-avatar-btn" class="secondary-button" type="button">
              <i data-lucide="upload"></i> Upload
            </button>
            <button id="settings-avatar-remove" class="ghost-button" type="button" style="color: var(--red);" ${!user.avatarUrl ? 'disabled' : ''}>
              <i data-lucide="trash-2"></i> Remover
            </button>
          </div>
          <input type="file" id="settings-avatar-input" accept="image/*" style="display: none;">
        </li>

        <!-- Nome do usuário -->
        <li class="settings-item">
          <div class="settings-item-info">
            <i data-lucide="user"></i>
            <div>
              <strong>Nome completo</strong>
              <small id="settings-name-display">${escapeHtml(user.fullName)}</small>
            </div>
          </div>
          <button id="open-name-modal" class="ghost-button" type="button">
            <i data-lucide="user"></i>
            Alterar nome
          </button>
        </li>

        <!-- Tema -->
        <li class="settings-item">
          <div class="settings-item-info">
            <i data-lucide="${isDark ? "moon" : "sun"}"></i>
            <div>
              <strong>Tema da interface</strong>
              <small>${isDark ? "Modo escuro ativo" : "Modo claro ativo"}</small>
            </div>
          </div>
          <div class="theme-toggle-group">
            <button id="theme-light" class="theme-btn ${!isDark ? "active" : ""}" type="button" aria-pressed="${!isDark}">
              <i data-lucide="sun"></i> Claro
            </button>
            <button id="theme-dark" class="theme-btn ${isDark ? "active" : ""}" type="button" aria-pressed="${isDark}">
              <i data-lucide="moon"></i> Escuro
            </button>
          </div>
        </li>

        <!-- Alterar senha -->
        <li class="settings-item">
          <div class="settings-item-info">
            <i data-lucide="lock"></i>
            <div>
              <strong>Senha</strong>
              <small>Alterar senha de acesso</small>
            </div>
          </div>
          <button id="open-pw-modal" class="ghost-button" type="button">
            <i data-lucide="key-round"></i>
            Alterar senha
          </button>
        </li>

        <!-- Versão -->
        <li class="settings-item">
          <div class="settings-item-info">
            <i data-lucide="shield-check"></i>
            <div>
              <strong>Versão da aplicação</strong>
              <small>Chamados CRQ-12</small>
            </div>
          </div>
          <span class="version-badge">v${APP_VERSION}</span>
        </li>

        <!-- Ajuda -->
        <li class="settings-item">
          <div class="settings-item-info">
            <i data-lucide="help-circle"></i>
            <div>
              <strong>Suporte / Ajuda</strong>
              <small>tic@crq12.org.br</small>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a
              href="mailto:tic@crq12.org.br?subject=Suporte%20-%20Chamados%20CRQ-12"
              class="ghost-button"
              style="text-decoration:none;"
            >
              <i data-lucide="mail"></i>
              E-mail
            </a>
            <a
              href="https://wa.me/556232404629"
              target="_blank"
              rel="noopener noreferrer"
              class="ghost-button"
              style="text-decoration:none; color: #25D366; border-color: #25D366;"
            >
              <i data-lucide="message-circle"></i>
              WhatsApp
            </a>
          </div>
        </li>


      </ul>
    </section>

    <!-- Modal de alteração de nome -->
    <div id="name-modal-overlay" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="name-modal-title">
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="name-modal-title">Alterar nome</h3>
          <button id="close-name-modal" class="modal-close" type="button" aria-label="Fechar">&times;</button>
        </div>
        <form id="settings-name-form" class="modal-form">
          <label>
            Novo nome completo
            <input
              id="settings-fullname"
              name="fullName"
              type="text"
              value="${escapeHtml(user.fullName)}"
              required
              maxlength="120"
              autocomplete="name"
            />
          </label>
          <p id="settings-name-msg" class="settings-msg" aria-live="polite"></p>
          <div class="modal-actions">
            <button class="primary-button" type="submit">
              <i data-lucide="save"></i>
              Salvar nome
            </button>
            <button id="close-name-modal-cancel" class="ghost-button" type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal de alteração de senha -->
    <div id="pw-modal-overlay" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="pw-modal-title">
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="pw-modal-title">Alterar senha</h3>
          <button id="close-pw-modal" class="modal-close" type="button" aria-label="Fechar">&times;</button>
        </div>
        <form id="settings-password-form" class="modal-form">
          <label>
            Senha atual
            <input id="settings-current-pw" name="currentPw" type="password" required autocomplete="current-password" />
          </label>
          <label>
            Nova senha
            <input id="settings-new-pw" name="newPw" type="password" required minlength="6" autocomplete="new-password" />
          </label>
          <label>
            Confirmar nova senha
            <input id="settings-confirm-pw" name="confirmPw" type="password" required minlength="6" autocomplete="new-password" />
          </label>
          <p id="settings-pw-msg" class="settings-msg" aria-live="polite"></p>
          <div class="modal-actions">
            <button class="primary-button" type="submit">
              <i data-lucide="save"></i>
              Salvar senha
            </button>
            <button id="close-pw-modal-cancel" class="ghost-button" type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// ===== UTILITÁRIOS =====
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function renderAvatarHTML(user: Pick<User, "fullName" | "avatarUrl">, sizeClass = "", extraStyle = "") {
  if (user.avatarUrl) {
    return `<span class="avatar ${sizeClass}" style="background-image: url('${escapeHtml(user.avatarUrl)}'); background-size: cover; background-position: center; color: transparent; ${extraStyle}">${initials(user.fullName)}</span>`;
  }
  return `<span class="avatar ${sizeClass}" style="${extraStyle}">${initials(user.fullName)}</span>`;
}

// ===== EVENT BINDING =====
function bindEvents() {
  document.querySelector<HTMLFormElement>("#login-form")?.addEventListener("submit", handleLogin);
  const loginPage = document.querySelector<HTMLElement>(".login-page");
  const loginCard = document.querySelector<HTMLElement>(".login-card");
  if (loginPage && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    loginPage.addEventListener("pointermove", (event) => {
      const bounds = loginPage.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      loginPage.style.setProperty("--mouse-x", `${x}px`);
      loginPage.style.setProperty("--mouse-y", `${y}px`);

      if (loginCard) {
        const cardBounds = loginCard.getBoundingClientRect();
        const cardX = (event.clientX - cardBounds.left) / cardBounds.width - 0.5;
        const cardY = (event.clientY - cardBounds.top) / cardBounds.height - 0.5;
        const withinCardArea = Math.abs(cardX) < 1.05 && Math.abs(cardY) < 1.05;
        loginCard.style.setProperty("--card-rx", `${withinCardArea ? -cardY * 4.5 : 0}deg`);
        loginCard.style.setProperty("--card-ry", `${withinCardArea ? cardX * 5.5 : 0}deg`);
        loginCard.style.setProperty("--card-light-x", `${Math.max(0, Math.min(100, (cardX + 0.5) * 100))}%`);
        loginCard.style.setProperty("--card-light-y", `${Math.max(0, Math.min(100, (cardY + 0.5) * 100))}%`);
      }
    });
    loginPage.addEventListener("pointerleave", () => {
      loginCard?.style.setProperty("--card-rx", "0deg");
      loginCard?.style.setProperty("--card-ry", "0deg");
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.togglePassword ?? "") as HTMLInputElement | null;
      if (!input) return;
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      button.setAttribute("aria-label", willShow ? "Ocultar senha" : "Mostrar senha");
      button.setAttribute("title", willShow ? "Ocultar senha" : "Mostrar senha");
      button.classList.toggle("is-visible", willShow);
    });
  });
  document.querySelector<HTMLButtonElement>("#login-theme-toggle")?.addEventListener("click", (event) => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    handleThemeTransition(isDark ? "light" : "dark", event);
  });
  document.querySelectorAll<HTMLButtonElement>(".auth-mode-button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.authMode as AuthMode | undefined;
      if (!mode) return;
      state.authMode = mode;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".login-role-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.loginRole as Role | undefined;
      if (!role) return;
      state.loginRole = role;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.authMode as AuthMode | undefined;
      if (!mode) return;
      state.authMode = mode;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#btn-signup-request")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.authMode = "signup";
    render();
  });
  const toggleSidebar = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    try {
      localStorage.setItem("crq-sidebar-collapsed", String(state.sidebarCollapsed));
    } catch (err) {}
    
    // Atualização direta no DOM para não quebrar a transição CSS
    const sidebar = document.querySelector(".sidebar");
    const shell = document.querySelector(".app-shell");
    const bodyLayout = document.querySelector(".app-body-layout");
    if (sidebar) {
      sidebar.classList.toggle("collapsed", Boolean(state.sidebarCollapsed));
      shell?.classList.toggle("sidebar-collapsed", Boolean(state.sidebarCollapsed));
      bodyLayout?.classList.toggle("collapsed", Boolean(state.sidebarCollapsed));
      
      const toggleBtn = document.querySelector("#toggle-sidebar");
      if (toggleBtn) {
        toggleBtn.setAttribute("title", state.sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
        toggleBtn.setAttribute("aria-label", state.sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
        toggleBtn.innerHTML = `<i data-lucide="${state.sidebarCollapsed ? "chevron-right" : "chevron-left"}"></i>`;
        createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });
      }
      const mobileToggle = document.querySelector<HTMLButtonElement>("#mobile-sidebar-toggle");
      if (mobileToggle) {
        mobileToggle.setAttribute("aria-label", state.sidebarCollapsed ? "Abrir menu" : "Fechar menu");
        mobileToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
        mobileToggle.innerHTML = `<i data-lucide="${state.sidebarCollapsed ? "menu" : "x"}"></i>`;
        createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });
      }
    }
  };
  document.querySelector<HTMLButtonElement>("#toggle-sidebar")?.addEventListener("click", toggleSidebar);
  document.querySelector<HTMLButtonElement>("#mobile-sidebar-toggle")?.addEventListener("click", toggleSidebar);
  document.querySelector<HTMLButtonElement>("#mobile-sidebar-backdrop")?.addEventListener("click", toggleSidebar);

  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view as View | undefined;
      if (!view) return;
      state.view = view;
      if (view === "tickets") {
        state.selectedTicketId = undefined;
        state.ticketDetailOpen = false;
      }
      if (window.matchMedia("(max-width: 760px)").matches) {
        state.sidebarCollapsed = true;
        try { localStorage.setItem("crq-sidebar-collapsed", "true"); } catch (err) {}
      }
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#toggle-users-btn")?.addEventListener("click", () => {
    const widget = document.getElementById("users-accordion");
    const icon = document.querySelector("#toggle-users-btn .accordion-icon");
    if (widget) {
      widget.classList.toggle("expanded");
      const isExpanded = widget.classList.contains("expanded");
      state.onlineUsersExpanded = isExpanded;
      document.querySelector("#toggle-users-btn")?.setAttribute("aria-expanded", String(isExpanded));
      if (icon) {
        icon.setAttribute("data-lucide", isExpanded ? "chevron-up" : "chevron-down");
        createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });
      }
    }
  });

  document.querySelector<HTMLFormElement>("#forced-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = currentUser();
    const newPassword = document.querySelector<HTMLInputElement>("#forced-new-password")?.value ?? "";
    const confirmation = document.querySelector<HTMLInputElement>("#forced-confirm-password")?.value ?? "";
    const errorElement = document.querySelector<HTMLParagraphElement>("#forced-password-error");
    const submit = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]');
    const fail = (message: string) => { if (errorElement) errorElement.textContent = message; };
    if (!user || !supabase) return fail("Não foi possível validar a sessão.");
    if (newPassword.length < 8) return fail("Use pelo menos 8 caracteres.");
    if (newPassword !== confirmation) return fail("As senhas não coincidem.");
    if (submit) submit.disabled = true;
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) { if (submit) submit.disabled = false; return fail(passwordError.message); }
    const { error: profileError } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
    if (profileError) { if (submit) submit.disabled = false; return fail("Senha alterada, mas não foi possível liberar o acesso. Procure a TIC."); }
    user.mustChangePassword = false;
    render();
    showSystemAlert("Senha pessoal definida com sucesso.");
  });

  document.querySelector<HTMLButtonElement>("#logout-button")?.addEventListener("click", async () => {
    await stopRealtime();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearSavedViewState();
    state = { ...defaultState, filters: { ...defaultState.filters } };
    render();
  });

  document.querySelector<HTMLButtonElement>("#toggle-theme-top")?.addEventListener("click", (e) => {
    const isDark = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
    handleThemeTransition(isDark ? "light" : "dark", e);
  });

  document.querySelector<HTMLButtonElement>("#quick-new-ticket")?.addEventListener("click", () => {
    state.view = "new-ticket";
    render();
  });

  document.querySelector<HTMLButtonElement>("#open-notifications")?.addEventListener("click", () => {
    state.view = "notifications";
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filters.status = btn.dataset.status as TicketStatus;
      state.view = "tickets";
      state.selectedTicketId = undefined;
      state.ticketDetailOpen = false;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#toggle-ticket-detail")?.addEventListener("click", () => {
    if (!state.selectedTicketId) {
      const firstTicket = filteredTickets()[0];
      if (firstTicket) state.selectedTicketId = firstTicket.id;
    }
    state.ticketDetailOpen = !state.ticketDetailOpen;
    render();
  });

  document.querySelector<HTMLButtonElement>("#close-ticket-detail")?.addEventListener("click", () => {
    state.ticketDetailOpen = false;
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-open-ticket]").forEach((el) => {
    el.addEventListener("click", () => openTicket(Number(el.dataset.openTicket)));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openTicket(Number(el.dataset.openTicket));
    });
  });
  document.querySelectorAll<HTMLElement>("[data-open-knowledge]").forEach((element) => {
    element.addEventListener("click", async () => {
      const remoteTutorials = await loadKnowledgeTutorials();
      if (remoteTutorials.length) knowledgeTutorials = remoteTutorials;
      state.view = "knowledge";
      render();
    });
  });

  bindFilters();
  bindTicketForms();
  bindTicketDetailResize();
  bindUserForms();
  bindNotifications();
  bindTrashEvents();
  bindDepartmentForms();
  bindReports();
  bindKnowledgeBase();
  bindSettingsForm();
}

function bindKnowledgeBase() {
  const user = currentUser();
  if (!user) return;
  document.querySelectorAll<HTMLButtonElement>(".knowledge-open[data-tutorial-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const tutorial = tutorialsForUser(user).find((item) => item.id === button.dataset.tutorialId);
      if (tutorial) openKnowledgeTutorial(tutorial);
    });
  });
  document.querySelector<HTMLButtonElement>("#knowledge-create")?.addEventListener("click", () => openKnowledgeEditor());
  document.querySelectorAll<HTMLButtonElement>(".knowledge-edit[data-tutorial-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const tutorial = knowledgeTutorials.find((item) => item.id === button.dataset.tutorialId);
      if (tutorial && user.role === "tic") openKnowledgeEditor(tutorial);
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".knowledge-delete[data-tutorial-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const tutorial = knowledgeTutorials.find((item) => item.id === button.dataset.tutorialId);
      if (!tutorial || user.role !== "tic") return;
      showSystemConfirm(`Excluir definitivamente o tutorial “${tutorial.title}”?`, async () => {
        try {
          await deleteKnowledgeTutorial(tutorial.id);
          knowledgeTutorials = await loadKnowledgeTutorials();
          render();
        } catch (error) {
          showSystemAlert(error instanceof Error ? error.message : "Não foi possível excluir o tutorial.");
        }
      });
    });
  });
  const input = document.querySelector<HTMLInputElement>("#knowledge-search-input");
  input?.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("pt-BR");
    let visibleCount = 0;
    document.querySelectorAll<HTMLElement>("[data-knowledge-category]").forEach((category) => {
      let categoryCount = 0;
      category.querySelectorAll<HTMLElement>("[data-knowledge-card]").forEach((card) => {
        const visible = !query || (card.dataset.search ?? "").includes(query);
        card.hidden = !visible;
        if (visible) { visibleCount += 1; categoryCount += 1; }
      });
      category.hidden = categoryCount === 0;
    });
    const empty = document.querySelector<HTMLElement>("#knowledge-empty");
    if (empty) empty.hidden = visibleCount > 0;
  });
}

function bindReports() {
  const form = document.querySelector<HTMLFormElement>("#report-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = currentUser();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const errorElement = document.querySelector<HTMLElement>("#report-error");
    const startValue = document.querySelector<HTMLInputElement>("#report-start-date")?.value ?? "";
    const endValue = document.querySelector<HTMLInputElement>("#report-end-date")?.value ?? "";
    const departmentId = document.querySelector<HTMLSelectElement>("#report-department")?.value ?? "todos";
    if (!user || user.role === "usuario") return;
    if (errorElement) errorElement.textContent = "";
    if (submit) {
      submit.disabled = true;
      submit.innerHTML = '<i data-lucide="clock"></i> Preparando Word...';
      createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
    }
    try {
      // O navegador não informa se a janela nativa de download foi confirmada
      // ou cancelada. O arquivo baixado é a própria confirmação de sucesso.
      await generateWordReport(user, startValue, endValue, departmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gerar o relatório.";
      if (errorElement) errorElement.textContent = message;
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.innerHTML = '<i data-lucide="file-text"></i> Gerar relatório Word';
        createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
      }
    }
  });
}

// ===== EVENTOS DA LIXEIRA =====
function bindTrashEvents() {
  document.querySelectorAll<HTMLButtonElement>(".restore-ticket").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticketId = Number(btn.dataset.id);
      const ticket = data.tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const previousStatus = ticket.statusBeforeDelete || "novo";
      if (confirm(`Restaurar chamado #${ticket.id} para "${statusLabels[previousStatus]}"?`)) {
        const snapshot = JSON.parse(JSON.stringify(ticket)) as Ticket;
        ticket.status = previousStatus;
        ticket.statusBeforeDelete = undefined;
        ticket.updatedAt = nowIso();
        ticket.events.push({ id: makeId("evt"), actorId: state.currentUserId!, type: "Restauração", message: "Chamado restaurado da lixeira.", createdAt: nowIso() });
        const updated = await updateTicketInSupabase(ticket);
        if (!updated) {
          Object.assign(ticket, snapshot);
          showSystemAlert("Não foi possível restaurar o chamado no servidor.");
          render();
          return;
        }
        await saveData();
        render();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".delete-permanently").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticketId = Number(btn.dataset.id);
      const ticket = data.tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      if (confirm(`⚠️ Excluir permanentemente o chamado #${ticket.id}? Esta ação não pode ser desfeita.`)) {
        try {
          if (isSupabaseConfigured()) await deleteTicketFromSupabase(ticketId);
          data.tickets = data.tickets.filter((item) => item.id !== ticketId);
          await saveData();
          render();
        } catch (error) {
          showSystemAlert(error instanceof Error ? error.message : "Não foi possível excluir o chamado.");
        }
      }
    });
  });

  document.querySelector<HTMLButtonElement>("#empty-trash")?.addEventListener("click", () => {
    const trashCount = data.tickets.filter(t => t.status === "excluido").length;
    if (trashCount === 0) return showSystemAlert("Lixeira já está vazia.");
    showSystemConfirm(`Excluir permanentemente todos os ${trashCount} chamados da lixeira? Esta ação não pode ser desfeita.`, async () => {
      try {
        if (isSupabaseConfigured()) await emptyTrashInSupabase();
        data.tickets = data.tickets.filter(t => t.status !== "excluido");
        await saveData();
        render();
      } catch (error) {
        showSystemAlert(error instanceof Error ? error.message : "Não foi possível esvaziar a lixeira.");
      }
    });
  });
}

function clampTicketDetailWidth(value: number, layoutWidth: number) {
  const maxWidth = Math.max(360, Math.min(760, Math.round(layoutWidth * 0.58)));
  return Math.min(maxWidth, Math.max(320, Math.round(value)));
}

function bindTicketDetailResize() {
  const resizer = document.querySelector<HTMLDivElement>("#ticket-detail-resizer");
  const layout = document.querySelector<HTMLElement>(".tickets-layout.detail-open");
  if (!resizer || !layout) return;

  const applyWidth = (clientX: number) => {
    const rect = layout.getBoundingClientRect();
    const nextWidth = clampTicketDetailWidth(rect.right - clientX, rect.width);
    state.ticketDetailWidth = nextWidth;
    layout.style.setProperty("--ticket-detail-width", `${nextWidth}px`);
    resizer.setAttribute("aria-valuenow", String(nextWidth));
  };

  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-ticket-detail");

    const handleMove = (moveEvent: PointerEvent) => {
      applyWidth(moveEvent.clientX);
    };

    const handleUp = () => {
      document.body.classList.remove("resizing-ticket-detail");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  });

  resizer.addEventListener("keydown", (event) => {
    const rect = layout.getBoundingClientRect();
    const step = event.shiftKey ? 60 : 24;
    let nextWidth = state.ticketDetailWidth;

    if (event.key === "ArrowLeft") nextWidth += step;
    if (event.key === "ArrowRight") nextWidth -= step;
    if (event.key === "Home") nextWidth = 320;
    if (event.key === "End") nextWidth = 760;
    if (nextWidth === state.ticketDetailWidth && !["Home", "End"].includes(event.key)) return;

    event.preventDefault();
    state.ticketDetailWidth = clampTicketDetailWidth(nextWidth, rect.width);
    layout.style.setProperty("--ticket-detail-width", `${state.ticketDetailWidth}px`);
    resizer.setAttribute("aria-valuenow", String(state.ticketDetailWidth));
  });
}

async function handleLogin(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const submitBtn = form.querySelector<HTMLButtonElement>("button[type='submit']");
  const origBtnText = submitBtn ? submitBtn.innerHTML : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Entrando...";
  }
  const resetBtnState = () => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnText;
    }
  };

  const email = document.querySelector<HTMLInputElement>("#login-email")?.value.trim().toLowerCase() ?? "";
  const rawPassword = document.querySelector<HTMLInputElement>("#login-password")?.value ?? "";
  // Senhas pessoais preservam espaços intencionais. A senha temporária possui
  // formato fixo e pode ser aparada com segurança quando for colada.
  const password = /^Crq12@\d{6}$/.test(rawPassword.trim()) ? rawPassword.trim() : rawPassword;
  const fullName = document.querySelector<HTMLInputElement>("#login-full-name")?.value.trim() ?? "";
  const errorEl = document.querySelector<HTMLParagraphElement>("#login-error");

  ensureSeedData();

  // ── Modo de definição de nova senha (via link de recuperação) ──
  if (state.authMode === "update-password") {
    const newPw = document.querySelector<HTMLInputElement>("#new-password")?.value ?? "";
    const confirmPw = document.querySelector<HTMLInputElement>("#confirm-password")?.value ?? "";

    if (newPw.length < 8) {
      if (errorEl) { errorEl.textContent = "A nova senha deve ter ao menos 8 caracteres."; errorEl.style.color = "#dc3545"; }
      return;
    }
    if (newPw !== confirmPw) {
      if (errorEl) { errorEl.textContent = "As senhas não coincidem."; errorEl.style.color = "#dc3545"; }
      return;
    }
    if (!supabase) {
      if (errorEl) { errorEl.textContent = "Supabase não configurado."; errorEl.style.color = "#dc3545"; }
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      if (errorEl) { errorEl.textContent = error.message || "Erro ao definir nova senha."; errorEl.style.color = "#dc3545"; }
      resetBtnState();
      return;
    }
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", (await supabase.auth.getUser()).data.user?.id);

    // Senha atualizada — agora carrega/cria o perfil e loga normalmente
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const userId = session.user.id;
      const userEmail = session.user.email || email;

      let profile = null;
      const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();

      if (existingProfile) {
        profile = existingProfile;
      } else {
        const localUser = data.users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
        const userRole = localUser?.role || 'usuario';
        const deptId = localUser?.departmentId || data.departments[0]?.id || 'dept-tic';
        const userFullName = localUser?.fullName || session.user.user_metadata?.full_name || userEmail.split('@')[0];

        const newProfileData = {
          id: userId,
          full_name: userFullName,
          email: userEmail,
          role: userRole,
          department_id: deptId,
          managed_department_ids: localUser?.managedDepartmentIds || [],
          active: true,
          pending_approval: false
        };

        await supabase.from('profiles').upsert(newProfileData);
        profile = newProfileData;
      }

      let existing = data.users.find(u => u.id === userId || u.email.toLowerCase() === userEmail.toLowerCase());
      if (!existing) {
        existing = {
          id: userId,
          fullName: profile.full_name,
          email: profile.email,
          role: profile.role as Role,
          departmentId: profile.department_id,
          managedDepartmentIds: profile.managed_department_ids || [],
          active: true,
          mustChangePassword: profile.must_change_password === true
        };
        data.users.push(existing);
      } else {
        Object.assign(existing, {
          id: userId,
          fullName: profile.full_name,
          email: profile.email,
          role: profile.role as Role,
          departmentId: profile.department_id,
          managedDepartmentIds: profile.managed_department_ids || [],
          active: true,
          mustChangePassword: profile.must_change_password === true
        });
      }
      setCurrentUserId(userId);
      state.authMode = "login";
      showSystemAlert("Senha alterada com sucesso! Seu novo acesso foi ativado.");
      render();
      showWelcomeScreen(existing);
      return;
    }

    if (errorEl) { errorEl.textContent = "Senha atualizada! Tente entrar com sua nova senha."; errorEl.style.color = "#198754"; }
    resetBtnState();
    state.authMode = "login";
    render();
    return;
  }

  if (!email) {
    if (errorEl) {
      errorEl.textContent = "Informe um e-mail válido.";
      errorEl.style.color = "#dc3545";
    }
    resetBtnState();
    return;
  }

  if (state.authMode === "signup") {
    if (!supabase || !isSupabaseConfigured()) {
      if (errorEl) errorEl.textContent = "Cadastro indisponível: conexão com o servidor não configurada.";
      resetBtnState();
      return;
    }
    const confirmPassword = document.querySelector<HTMLInputElement>("#signup-confirm-password")?.value ?? "";
    const departmentId = document.querySelector<HTMLSelectElement>("#login-department")?.value ?? "";
    if (fullName.length < 3) {
      if (errorEl) errorEl.textContent = "Informe seu nome completo.";
      resetBtnState();
      return;
    }
    if (password.length < 8) {
      if (errorEl) errorEl.textContent = "A senha deve ter pelo menos 8 caracteres.";
      resetBtnState();
      return;
    }
    if (password !== confirmPassword) {
      if (errorEl) errorEl.textContent = "As senhas não coincidem.";
      resetBtnState();
      return;
    }
    if (!departmentId) {
      if (errorEl) errorEl.textContent = "Selecione seu departamento.";
      resetBtnState();
      return;
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (signupError || !signupData.user) {
      const message = signupError?.message?.toLowerCase() ?? "";
      if (errorEl) {
        errorEl.textContent = message.includes("already") || message.includes("registered")
          ? "Já existe uma conta cadastrada com este e-mail. Use “Esqueci a senha” para recuperar o acesso."
          : "Não foi possível criar a conta. Verifique os dados e tente novamente.";
      }
      resetBtnState();
      return;
    }
    if (!signupData.session) {
      if (errorEl) {
        errorEl.textContent = "A conta foi criada, mas o Supabase ainda exige confirmação por e-mail. Desative “Confirm email” no painel para permitir acesso imediato.";
        errorEl.style.color = "#d97706";
      }
      resetBtnState();
      return;
    }

    const userId = signupData.user.id;
    try {
      await completeOwnProfileInSupabase({ fullName, departmentId });
    } catch (profileError) {
      await supabase.auth.signOut();
      if (errorEl) errorEl.textContent = "A conta foi criada, mas o perfil não pôde ser concluído. Procure a equipe TIC.";
      resetBtnState();
      return;
    }

    const remote = await loadDataFromSupabase();
    if (remote) data = remote;
    const createdUser = data.users.find((item) => item.id === userId);
    if (!createdUser) {
      if (errorEl) errorEl.textContent = "Perfil criado, mas ainda não disponível. Atualize a página em instantes.";
      resetBtnState();
      return;
    }
    setCurrentUserId(userId);
    state.authMode = "login";
    state.loginRole = "usuario";
    render();
    void startRealtime(createdUser);
    showWelcomeScreen(createdUser);
    return;
  }

  const requestedRole = state.loginRole;
  if (state.authMode === "login" && !requestedRole) {
    if (errorEl) {
      errorEl.textContent = "Selecione um perfil de acesso.";
      errorEl.style.color = "#dc3545";
    }
    resetBtnState();
    return;
  }

  if (state.authMode === "reset") {
    if (!isSupabaseConfigured()) {
      if (errorEl) {
        errorEl.textContent = "Recuperação de senha não está disponível no modo local.";
        errorEl.style.color = "#dc3545";
      }
      resetBtnState();
      return;
    }

    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: getPublicAppUrl()
    });

    if (error) {
      if (errorEl) {
        const msg = error.message?.toLowerCase() ?? '';
        let friendlyMsg = 'Não foi possível enviar o link. Tente novamente.';
        if (msg.includes('rate limit') || msg.includes('email rate')) {
          friendlyMsg = 'Limite de e-mails atingido. Aguarde alguns minutos antes de tentar novamente.';
        } else if (msg.includes('user not found') || msg.includes('invalid email')) {
          friendlyMsg = 'E-mail não encontrado na plataforma.';
        } else if (msg.includes('network') || msg.includes('fetch')) {
          friendlyMsg = 'Erro de conexão. Verifique sua internet e tente novamente.';
        }
        errorEl.textContent = friendlyMsg;
        errorEl.style.color = '#dc3545';
      }
      resetBtnState();
      return;
    }

    if (errorEl) {
      errorEl.textContent = "Link de recuperação enviado. Verifique seu e-mail.";
      errorEl.style.color = "#198754";
    }
    resetBtnState();
    return;
  }

  if (!password) {
    if (errorEl) {
      errorEl.textContent = "Informe sua senha.";
      errorEl.style.color = "#dc3545";
    }
    resetBtnState();
    return;
  }

  // ----------------------------------------------------
  // FLUXO DE AUTENTICAÇÃO (LOGIN) — VALIDAÇÃO EM ORDEM
  // ----------------------------------------------------
  let authenticatedUser: User | undefined = data.users.find((u) => u.email.toLowerCase() === email);

  if (isSupabaseConfigured()) {
    const { data: authData, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (!error && authData.user) {
      const authUserId = authData.user.id;
      const { data: profile } = await supabase!.from('profiles').select('*').eq('id', authUserId).single();

      if (profile) {
        if (!authenticatedUser) {
          authenticatedUser = {
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            role: profile.role as Role,
            departmentId: profile.department_id,
            managedDepartmentIds: profile.managed_department_ids || [],
            active: profile.active !== false,
            mustChangePassword: profile.must_change_password === true,
            onboardingCompletedAt: profile.onboarding_completed_at || undefined
          };
          data.users.push(authenticatedUser);
        } else {
          authenticatedUser.id = profile.id;
          authenticatedUser.fullName = profile.full_name;
          authenticatedUser.role = profile.role as Role;
          authenticatedUser.departmentId = profile.department_id;
          authenticatedUser.managedDepartmentIds = profile.managed_department_ids || [];
          authenticatedUser.active = profile.active !== false;
          authenticatedUser.mustChangePassword = profile.must_change_password === true;
        }
      }
    } else {
      devWarn("Erro na autenticação Supabase:", error?.message);
      if (error) {
        if (errorEl) {
          const msg = error.message?.toLowerCase() ?? '';
          const code = String((error as { code?: string }).code ?? "");
          if (msg.includes('email not confirmed') || code === "email_not_confirmed") {
            errorEl.textContent = "Seu e-mail ainda não foi confirmado. Acesse o link enviado no seu e-mail.";
          } else if (msg.includes("banned") || code === "user_banned") {
            errorEl.textContent = "Esta conta está bloqueada no Supabase. Exclua e recrie o usuário pela TIC.";
          } else if (msg.includes("rate") || code.includes("rate_limit")) {
            errorEl.textContent = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
          } else if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
            errorEl.textContent = invalidCredentialsMessage(email);
          } else {
            errorEl.textContent = "Não foi possível entrar. Verifique os dados e tente novamente.";
          }
          errorEl.style.color = "#dc3545";
        }
        resetBtnState();
        return;
      }
    }
  }

  const user = authenticatedUser;
  if (!user) {
    if (errorEl) {
      errorEl.textContent = "Este usuário não existe, necessário Cadastro.";
      errorEl.style.color = "#dc3545";
    }
    resetBtnState();
    return;
  }

  // 3. Valida se a conta está ativa e aprovada
  if (user.active === false || user.pendingApproval) {
    if (errorEl) {
      errorEl.textContent = "⚠️ Sua conta está pendente de aprovação pela equipe TIC. Aguarde a liberação do seu perfil para acessar o sistema.";
      errorEl.style.color = "#d97706";
    }
    resetBtnState();
    return;
  }

  // 4. Valida se a aba de perfil selecionada (Usuário | Gestor | TIC) corresponde ao perfil do usuário
  if (state.authMode === "login" && user.role !== requestedRole) {
    if (errorEl) {
      errorEl.textContent = `Este usuário possui perfil de ${getRoleLabel(user.role)}. Selecione a aba "${getRoleLabel(user.role)}" para entrar.`;
      errorEl.style.color = "#dc3545";
    }
    resetBtnState();
    return;
  }

  let existing = data.users.find(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
  if (!existing) {
    data.users.push(user);
  } else {
    Object.assign(existing, user);
  }

  setCurrentUserId(user.id);
  void startRealtime(user);

  const userObj = currentUser();
  if (userObj) {
    if (state.view === "users" && userObj.role === "usuario") state.view = "dashboard";
  }

  render();
  showWelcomeScreen(user);
}

// ===== OPEN TICKET =====
function openTicket(ticketId: number) {
  const ticket = data.tickets.find((t) => t.id === ticketId);
  const user = currentUser();
  if (!ticket || !user || !canSeeTicket(user, ticket)) return;
  state.selectedTicketId = ticketId;
  state.view = "tickets";
  state.ticketDetailOpen = true;
  render();
}

// ===== LIXEIRA =====
function bindFilters() {
  const handleSearchInput = (val: string) => {
    state.filters.search = val;
    if (state.view !== "tickets") state.view = "tickets";
    const remaining = filteredTickets();
    if (state.selectedTicketId && !remaining.some((t) => t.id === state.selectedTicketId)) {
      state.selectedTicketId = undefined;
      state.ticketDetailOpen = false;
    }
    render();
    requestAnimationFrame(() => {
      const refreshedSearch = document.querySelector<HTMLInputElement>("#global-top-search")
        ?? document.querySelector<HTMLInputElement>("#filter-search");
      refreshedSearch?.focus();
      refreshedSearch?.setSelectionRange(refreshedSearch.value.length, refreshedSearch.value.length);
    });
  };

  const filterSearch = document.querySelector<HTMLInputElement>("#filter-search");
  filterSearch?.addEventListener("input", () => handleSearchInput(filterSearch.value));

  const globalTopSearch = document.querySelector<HTMLInputElement>("#global-top-search");
  globalTopSearch?.addEventListener("input", () => handleSearchInput(globalTopSearch.value));

  const bindSelect = <T extends string>(selector: string, update: (value: T) => void) => {
    const select = document.querySelector<HTMLSelectElement>(selector);
    select?.addEventListener("change", () => {
      update(select.value as T);
      state.selectedTicketId = undefined;
      state.ticketDetailOpen = false;
      render();
    });
  };

  bindSelect<"todos" | TicketStatus>("#filter-status", (value) => { state.filters.status = value; });
  bindSelect<"todas" | Priority>("#filter-priority", (value) => { state.filters.priority = value; });
  bindSelect<"todos" | string>("#filter-requester", (value) => { state.filters.requesterId = value; });
  bindSelect<"todos" | string>("#filter-department", (value) => { state.filters.departmentId = value; });
  bindSelect<"todos" | string>("#dashboard-department-filter", (value) => {
    state.filters.departmentId = value;
    if (state.filters.requesterId !== "todos") {
      const selectedUser = userById(state.filters.requesterId);
      const memberships = selectedUser
        ? [...new Set([selectedUser.departmentId, ...selectedUser.managedDepartmentIds].filter(Boolean))]
        : [];
      if (!selectedUser || selectedUser.active === false || (value !== "todos" && !memberships.includes(value))) {
        state.filters.requesterId = "todos";
      }
    }
  });
  bindSelect<"todos" | string>("#dashboard-requester-filter", (value) => { state.filters.requesterId = value; });

  document.querySelector<HTMLButtonElement>("#clear-filters")?.addEventListener("click", () => {
    state.filters = {
      status: "todos",
      search: "",
      priority: "todas",
      requesterId: "todos",
      departmentId: "todos"
    };
    state.selectedTicketId = undefined;
    state.ticketDetailOpen = false;
    render();
  });

  document.querySelector<HTMLButtonElement>("#reset-dashboard-filters")?.addEventListener("click", () => {
    state.filters.departmentId = "todos";
    state.filters.requesterId = "todos";
    render();
  });
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["pdf"].includes(ext)) return "file-text";
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return "file-text";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "file-archive";
  if (["xls", "xlsx", "csv"].includes(ext)) return "file-spreadsheet";
  return "paperclip";
}

function renderAttachmentCards(attachments: Attachment[]) {
  if (!attachments.length) return `<span class="empty-state">Sem anexos</span>`;

  return `
    <div class="detail-attachments-grid">
      ${attachments.map((att) => {
        const isImage = att.url && (att.type?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].some(ext => att.name.toLowerCase().endsWith(ext)));
        return `
          <a class="attachment-card" href="${att.url || '#'}" target="_blank" title="${escapeHtml(att.name)}">
            ${isImage ? `
              <div class="attachment-card-thumb">
                <img src="${att.url}" alt="${escapeHtml(att.name)}" />
              </div>
            ` : `
              <div class="attachment-card-icon">
                <i data-lucide="${getFileIcon(att.name)}"></i>
              </div>
            `}
            <div class="attachment-card-info">
              <span class="attachment-card-name">${escapeHtml(att.name)}</span>
              <span class="attachment-card-size">${formatFileSize(att.size)}</span>
            </div>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

let selectedFormFiles: File[] = [];

// ===== TICKET FORMS =====
function bindTicketForms() {
  selectedFormFiles = [];
  const fileInput = document.querySelector<HTMLInputElement>('input[name="attachments"]');

  function updateFilePreviews() {
    const previewGrid = document.querySelector<HTMLDivElement>("#file-preview-grid");
    const feedback = document.querySelector<HTMLSpanElement>("#file-feedback");
    if (!previewGrid) return;

    previewGrid.innerHTML = "";
    const oversized = selectedFormFiles.filter((f) => f.size > MB_2);

    if (feedback) {
      if (oversized.length) {
        feedback.textContent = `⚠️ Os seguintes arquivos ultrapassam 2 MB: ${oversized.map((f) => f.name).join(", ")}`;
        feedback.style.color = "var(--red)";
      } else {
        feedback.textContent = selectedFormFiles.length ? `${selectedFormFiles.length} arquivo(s) anexado(s)` : "";
        feedback.style.color = "var(--brand)";
      }
    }

    selectedFormFiles.forEach((file, index) => {
      const card = document.createElement("div");
      const isOversized = file.size > MB_2;
      const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].some((ext) => file.name.toLowerCase().endsWith(ext));

      card.className = `file-preview-card ${isImage ? "image-card" : "doc-card"} ${isOversized ? "error" : ""}`;

      if (isImage) {
        const src = URL.createObjectURL(file);
        card.innerHTML = `
          <div class="preview-thumb">
            <img src="${src}" alt="${escapeHtml(file.name)}" />
          </div>
          <div class="preview-info">
            <span class="preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="preview-size">${formatFileSize(file.size)}</span>
          </div>
          <button type="button" class="preview-remove" data-index="${index}" title="Remover">&times;</button>
        `;
      } else {
        card.innerHTML = `
          <div class="preview-icon">
            <i data-lucide="${getFileIcon(file.name)}"></i>
          </div>
          <div class="preview-info">
            <span class="preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="preview-size">${formatFileSize(file.size)}</span>
          </div>
          <button type="button" class="preview-remove" data-index="${index}" title="Remover">&times;</button>
        `;
      }

      card.querySelector(".preview-remove")?.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedFormFiles.splice(index, 1);
        updateFilePreviews();
      });

      previewGrid.appendChild(card);
    });

    createIcons({ icons: usedIcons });
  }

  fileInput?.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    const invalid = files.map(validateAttachment).filter(Boolean) as string[];
    if (invalid.length) showSystemAlert(invalid.join("\n"));
    selectedFormFiles = [...selectedFormFiles, ...files.filter((file) => !validateAttachment(file))];
    fileInput.value = "";
    updateFilePreviews();
  });

  document.querySelector<HTMLFormElement>("#new-ticket-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submitBtn = form.querySelector<HTMLButtonElement>("button[type='submit']");
    const originalSubmitContent = submitBtn?.innerHTML ?? "Abrir chamado";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "Enviando...";
    }
    let registeredTicketId: number | undefined;
    try {
    const user = currentUser();
    if (!user) {
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const formData = new FormData(form);
    // Realtime pode redesenhar a tela assim que o chamado entra no banco.
    // Mantemos uma cópia imutável dos arquivos pertencentes a este envio.
    const submissionFiles = [...selectedFormFiles];

    const invalidAttachment = submissionFiles.map(validateAttachment).find(Boolean);
    if (invalidAttachment) {
      showSystemAlert(invalidAttachment);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const priority = formData.get("priority") as Priority;
    const createdAt = nowIso();
    const observerIds: string[] = [];
    let attachments: Attachment[] = [];

    const ticket: Ticket = {
      id: nextTicketId(),
      type: formData.get("type") as TicketType,
      category: String(formData.get("category") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      status: "novo",
      priority,
      requesterId: user.id,
      departmentId: String(formData.get("departmentId") || user.departmentId),
      observerIds,
      createdAt,
      updatedAt: createdAt,
      attachments,
      events: [{ id: makeId("evt"), actorId: user.id, type: "Criação", message: "Chamado criado e enviado para a fila TIC.", createdAt }],
      statusBeforeDelete: undefined
    };

    if (isSupabaseConfigured()) {
      const remoteId = await createTicketInSupabase(ticket);
      if (remoteId === null) {
        showSystemAlert("Não foi possível registrar o chamado no servidor. Nenhum dado foi perdido; tente novamente em instantes.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "Abrir chamado";
        }
        return;
      }
      ticket.id = remoteId;
      registeredTicketId = remoteId;
      attachments = await uploadTicketAttachments(remoteId, submissionFiles);
      ticket.attachments = attachments;
    }

    data.tickets.unshift(ticket);
    const requesterName = userById(ticket.requesterId)?.fullName ?? "Usuário";
    const createdNotifications = notifyTicket(ticket, `Chamado #${ticket.id} criado`, `Aberto por ${requesterName}: ${ticket.title}`);
    maybeBrowserNotify(ticket);
    const secondaryWarnings: string[] = [];
    const failedAttachmentCount = Math.max(0, submissionFiles.length - attachments.length);
    if (failedAttachmentCount > 0) {
      secondaryWarnings.push(`${failedAttachmentCount} anexo(s) não foram enviados`);
    }
    try {
      await createTicketEventInSupabase(ticket.id, ticket.events[0]);
    } catch (error) {
      devError("Chamado criado sem histórico inicial:", error);
      secondaryWarnings.push("o histórico inicial não pôde ser registrado");
    }
    try {
      await createNotificationsInSupabase(createdNotifications);
    } catch (error) {
      devError("Chamado criado sem todas as notificações:", error);
      secondaryWarnings.push("algumas notificações não puderam ser enviadas");
    }
    selectedFormFiles = [];
    state.view = "tickets";
    state.filters = {
      status: "todos",
      search: "",
      priority: "todas",
      requesterId: "todos",
      departmentId: "todos"
    };
    state.selectedTicketId = ticket.id;
    state.ticketDetailOpen = true;
    render();
    if (secondaryWarnings.length) {
      showSystemAlert(`Chamado #${ticket.id} criado com sucesso, porém ${secondaryWarnings.join(" e ")}. O chamado permanece disponível na fila.`);
    }
    } catch (error) {
      devError("Falha inesperada ao criar chamado:", error);
      if (registeredTicketId) {
        await refreshFromServer();
        state.view = "tickets";
        state.selectedTicketId = registeredTicketId;
        state.ticketDetailOpen = true;
        render();
        showSystemAlert(`O chamado #${registeredTicketId} foi registrado no servidor, mas uma etapa complementar falhou. Ele permanece disponível na fila.`);
      } else {
        showSystemAlert("Não foi possível registrar o chamado no servidor. Tente novamente.");
      }
    } finally {
      if (submitBtn?.isConnected) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalSubmitContent;
        createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });
      }
    }
  });

  document.querySelector<HTMLFormElement>("#comment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const user = currentUser();
    const ticket = data.tickets.find((t) => t.id === state.selectedTicketId);
    const text = document.querySelector<HTMLTextAreaElement>("#comment-text")?.value.trim() ?? "";
    const fileInput = document.querySelector<HTMLInputElement>("#comment-attachments-input");
    const files = Array.from(fileInput?.files ?? []);
    if (!user || !ticket || (!text && files.length === 0)) return;
    if (ticketRequiresReopen(ticket)) {
      showSystemAlert("Reabra o chamado antes de adicionar complementos.");
      return;
    }
    const invalidAttachment = files.map(validateAttachment).find(Boolean);
    if (invalidAttachment) {
      showSystemAlert(invalidAttachment);
      return;
    }
    if (submitButton) submitButton.disabled = true;

    const message = text || `${files.length} arquivo(s) anexado(s) ao chamado.`;
    const commentEvent: TicketEvent = { id: makeId("evt"), actorId: user.id, type: "Complemento", message, createdAt: nowIso() };
    const previousUpdatedAt = ticket.updatedAt;
    ticket.events.push(commentEvent);
    ticket.updatedAt = commentEvent.createdAt;
    const createdNotifications = notifyCommentAdded(ticket, message);
    let uploadedAttachments: Attachment[] = [];

    try {
      if (isSupabaseConfigured()) {
        await createTicketEventInSupabase(ticket.id, commentEvent);
        uploadedAttachments = await uploadTicketAttachments(ticket.id, files, commentEvent.id);
        if (files.length > 0 && uploadedAttachments.length === 0) {
          throw new Error("Não foi possível enviar os arquivos do complemento.");
        }
        ticket.attachments.push(...uploadedAttachments);
        await createNotificationsInSupabase(createdNotifications);
        const updated = await updateTicketInSupabase(ticket);
        if (!updated) throw new Error("Não foi possível atualizar o chamado.");
      } else {
        uploadedAttachments = files.map((file) => ({
          id: makeId("att"), name: file.name, size: file.size, type: file.type, eventId: commentEvent.id
        }));
        ticket.attachments.push(...uploadedAttachments);
      }
      render();
    } catch (error) {
      ticket.events = ticket.events.filter((item) => item.id !== commentEvent.id);
      const uploadedIds = new Set(uploadedAttachments.map((attachment) => attachment.id));
      ticket.attachments = ticket.attachments.filter((attachment) => !uploadedIds.has(attachment.id));
      ticket.updatedAt = previousUpdatedAt;
      const notificationIds = new Set(createdNotifications.map((item) => item.id));
      data.notifications = data.notifications.filter((item) => !notificationIds.has(item.id));
      if (submitButton) submitButton.disabled = false;
      showSystemAlert(error instanceof Error ? error.message : "Não foi possível adicionar o comentário.");
    }
  });

  document.querySelector<HTMLInputElement>("#comment-attachments-input")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const invalid = files.map(validateAttachment).filter(Boolean) as string[];
    if (invalid.length) {
      showSystemAlert(invalid.join("\n"));
      input.value = "";
    }
    const displayFiles = invalid.length ? [] : files;
    const list = document.querySelector<HTMLElement>("#comment-file-list");
    if (!list) return;
    list.innerHTML = displayFiles.map((file) => `
      <span class="comment-file-chip ${validateAttachment(file) ? "is-invalid" : ""}">
        <i data-lucide="paperclip"></i>${escapeHtml(file.name)} <small>${formatFileSize(file.size)}</small>
      </span>
    `).join("");
    createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
  });

  document.querySelector<HTMLSelectElement>("#ticket-assignee")?.addEventListener("change", (event) => {
    updateSelectedTicket((ticket, user) => {
      if (ticketRequiresReopen(ticket)) return;
      const select = event.currentTarget as HTMLSelectElement;
      ticket.assignedId = select.value || undefined;
      ticket.updatedAt = nowIso();
      ticket.events.push({ id: makeId("evt"), actorId: user.id, type: "Realocação", message: `Responsável alterado para ${userById(ticket.assignedId)?.fullName ?? "Fila TIC"}.`, createdAt: nowIso() });
      notifyTicket(ticket, `Chamado #${ticket.id} realocado`, `Responsável alterado para ${userById(ticket.assignedId)?.fullName ?? "Fila TIC"}.`);
    });
  });

  document.querySelector<HTMLSelectElement>("#ticket-priority")?.addEventListener("change", (event) => {
    updateSelectedTicket((ticket, user) => {
      if (ticketRequiresReopen(ticket)) return;
      const select = event.currentTarget as HTMLSelectElement;
      ticket.priority = select.value as Priority;
      ticket.updatedAt = nowIso();
      ticket.events.push({ id: makeId("evt"), actorId: user.id, type: "Prioridade", message: `Prioridade alterada para ${priorityLabels[ticket.priority]}.`, createdAt: nowIso() });
      notifyTicket(ticket, `Prioridade do chamado #${ticket.id} atualizada`, `Prioridade alterada para ${priorityLabels[ticket.priority]}.`);
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".ticket-action").forEach((btn) => {
    btn.addEventListener("click", () => handleTicketAction(btn.dataset.action ?? ""));
  });
}

async function updateSelectedTicket(mutator: (ticket: Ticket, user: User) => void, options: { successMessage?: string } = {}) {
  const user = currentUser();
  const ticket = data.tickets.find((t) => t.id === state.selectedTicketId);
  if (!user || !ticket) return;

  const isRequester = ticket.requesterId === user.id;
  const isManagerOfDept = user.role === "gestor" && visibleDepartmentIds(user).includes(ticket.departmentId);
  const isTic = user.role === "tic";

  if (!isTic && !isRequester && !isManagerOfDept) return;

  const ticketSnapshot = JSON.parse(JSON.stringify(ticket)) as Ticket;
  const eventIdsBefore = new Set(ticket.events.map((event) => event.id));
  const notificationIdsBefore = new Set(data.notifications.map((notification) => notification.id));
  mutator(ticket, user);
  try {
    if (isSupabaseConfigured()) {
      const updated = await updateTicketInSupabase(ticket);
      if (!updated) throw new Error("O servidor recusou a atualização do chamado.");

      // Chamado, histórico e notificações são tabelas diferentes. Depois que a
      // alteração principal foi aceita, uma falha secundária não pode fazer a
      // interface fingir que o chamado voltou ao estado anterior.
      const newEvents = ticket.events.filter((event) => !eventIdsBefore.has(event.id));
      for (const event of newEvents) {
        try {
          await createTicketEventInSupabase(ticket.id, event);
        } catch (eventError) {
          devWarn("Chamado atualizado, mas o histórico não foi sincronizado:", eventError);
        }
      }

      const newNotifications = data.notifications.filter(
        (notification) => !notificationIdsBefore.has(notification.id)
      );
      try {
        await createNotificationsInSupabase(newNotifications);
      } catch (notificationError) {
        devWarn("Chamado atualizado, mas as notificações não foram entregues:", notificationError);
        data.notifications = data.notifications.filter((notification) => notificationIdsBefore.has(notification.id));
      }
    }
    render();
    if (options.successMessage) showSystemAlert(options.successMessage);
  } catch (error) {
    Object.assign(ticket, ticketSnapshot);
    data.notifications = data.notifications.filter((notification) => notificationIdsBefore.has(notification.id));
    showSystemAlert(error instanceof Error ? error.message : "Não foi possível atualizar o chamado.");
    render();
  }
}

function keepTicketInFocus(ticket: Ticket) {
  state.view = "tickets";
  state.selectedTicketId = ticket.id;
  state.ticketDetailOpen = ticket.status !== "excluido";
}

function handleTicketAction(action: string) {
  const ticket = data.tickets.find((t) => t.id === state.selectedTicketId);
  if (!ticket) return;

  if (action === "reopen") {
    if (!ticketRequiresReopen(ticket)) return;
    showSystemConfirm(`Reabrir chamado #${ticket.id}? Ele voltará para a fila da TIC.`, () => {
      updateSelectedTicket((t, user) => {
        if (!ticketRequiresReopen(t)) return;
        const timestamp = nowIso();
        t.status = "novo";
        t.assignedId = undefined;
        t.solvedAt = undefined;
        t.closedAt = undefined;
        t.plannedFor = undefined;
        t.plannedNotificationSent = false;
        t.pendingStartedAt = undefined;
        t.updatedAt = timestamp;
        t.events.push({ id: makeId("evt"), actorId: user.id, type: "Reabertura", message: "Chamado reaberto e devolvido para a fila TIC.", createdAt: timestamp });
        notifyTicket(t, `Chamado #${t.id} reaberto`, "O chamado voltou para a fila de atendimento da TIC.");
        keepTicketInFocus(t);
      });
    });
    return;
  }

  if (ticketRequiresReopen(ticket)) return;

  if (action === "delete") {
    showSystemConfirm(`Tem certeza que deseja excluir o chamado #${ticket.id}? Ele será movido para a lixeira.`, () => {
      updateSelectedTicket((t, user) => {
        t.statusBeforeDelete = t.status;
        t.status = "excluido";
        t.updatedAt = nowIso();
        t.events.push({ id: makeId("evt"), actorId: user.id, type: "Exclusão", message: "Chamado movido para a lixeira.", createdAt: nowIso() });
        notifyTicket(t, `Chamado #${t.id} excluído`, "O chamado foi movido para a lixeira.");
      });
    });
    return;
  }

  if (action === "pend") {
    showSystemPrompt(
      `Pendenciar Chamado #${ticket.id}`,
      "Informe o motivo da pendência (o que o usuário precisa enviar/fornecer):",
      "textarea",
      (reason) => {
        updateSelectedTicket((t, user) => {
          const timestamp = nowIso();
          t.status = "pendente";
          t.updatedAt = timestamp;
          t.assignedId = t.assignedId ?? user.id;
          t.responseStartedAt = t.responseStartedAt ?? timestamp;
          t.pendingStartedAt = timestamp;

          const msg = `[Pendência]: ${reason}`;
          t.events.push({ id: makeId("evt"), actorId: user.id, type: "Pendência", message: msg, createdAt: timestamp });
          notifyTicket(t, `Pendência no chamado #${t.id}`, `Motivo da pendência: ${reason}`);
          keepTicketInFocus(t);
        });
      }
    );
    return;
  }

  if (action === "plan") {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    const minTime = localNow.toISOString().slice(0, 16);
    showSystemPrompt(
      `Agendar Chamado #${ticket.id}`,
      "Selecione a data e o horário programados para iniciar:",
      "datetime-local",
      (datetimeVal) => {
        updateSelectedTicket((t, user) => {
          const timestamp = nowIso();
          const plannedIso = new Date(datetimeVal).toISOString();
          t.status = "planejado";
          t.updatedAt = timestamp;
          t.assignedId = t.assignedId ?? user.id;
          t.responseStartedAt = t.responseStartedAt ?? timestamp;
          t.plannedFor = plannedIso;
          t.plannedNotificationSent = false;

          const formattedPlanned = formatDate(plannedIso);
          const msg = `Atendimento agendado para ${formattedPlanned}.`;
          t.events.push({ id: makeId("evt"), actorId: user.id, type: "Planejamento", message: msg, createdAt: timestamp });
          notifyTicket(t, `Chamado #${t.id} agendado`, `Seu chamado foi agendado pela equipe TIC para ${formattedPlanned}.`);
          keepTicketInFocus(t);
        });
      },
      minTime
    );
    return;
  }

  if (action === "close") {
    showSystemPrompt(
      `Fechar Chamado #${ticket.id}`,
      "Especifique o motivo do fechamento sem solução:",
      "textarea",
      (reason) => {
        updateSelectedTicket((t, user) => {
          const timestamp = nowIso();
          t.status = "fechado";
          t.updatedAt = timestamp;
          t.closedAt = timestamp;

          const msg = `[Fechamento sem solução]: ${reason}`;
          t.events.push({ id: makeId("evt"), actorId: user.id, type: "Fechamento", message: msg, createdAt: timestamp });
          notifyTicket(t, `Chamado #${ticket.id} fechado`, `Chamado fechado sem solução. Motivo: ${reason}`);
          keepTicketInFocus(t);
        });
      }
    );
    return;
  }

  updateSelectedTicket((t, user) => {
    const timestamp = nowIso();

    // Se estiver saindo do status pendente, acumula a duração em totalPendingMs
    if (t.status === "pendente" && t.pendingStartedAt) {
      const pendingMs = new Date(timestamp).getTime() - new Date(t.pendingStartedAt).getTime();
      t.totalPendingMs = (t.totalPendingMs || 0) + Math.max(0, pendingMs);
      t.pendingStartedAt = undefined;
    }

    const updates: Record<string, { status: TicketStatus; type: string; message: string }> = {
      start: { status: "atribuido", type: "Inicialização", message: "TIC inicializou o atendimento do chamado." },
      solve: { status: "solucionado", type: "Solução", message: "TIC registrou a conclusão técnica do chamado." }
    };
    const update = updates[action];
    if (!update) return;

    t.status = update.status;
    t.updatedAt = timestamp;
    t.assignedId = t.assignedId ?? user.id;
    if (action === "start") t.responseStartedAt = t.responseStartedAt ?? timestamp;
    if (action === "solve") t.solvedAt = timestamp;

    t.events.push({ id: makeId("evt"), actorId: user.id, type: update.type, message: update.message, createdAt: timestamp });
    notifyTicket(t, `Chamado #${t.id}: ${update.type}`, update.message);
    keepTicketInFocus(t);
  }, { successMessage: action === "start" ? "Tarefa inicializada com sucesso." : undefined });
}

// ===== USER FORMS =====
function bindUserForms() {
  const roleSelect = document.querySelector<HTMLSelectElement>("#user-role-select");
  const deptWrapper = document.querySelector<HTMLDivElement>("#dept-select-wrapper");

  function updateDeptVisibility() {
    if (!deptWrapper || !roleSelect) return;
    deptWrapper.style.display = roleSelect.value === "tic" ? "none" : "block";
  }

  roleSelect?.addEventListener("change", updateDeptVisibility);

  document.querySelector<HTMLFormElement>("#user-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = currentUser();
    if (!current || current.role === "usuario") return;
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    // Defesa adicional: um campo oculto antigo nunca transforma o cadastro do
    // Gestor em uma atualização de perfil existente.
    const editId = current.role === "tic" ? String(formData.get("userId") ?? "") : "";
    const role = (formData.get("role") as Role) || "usuario";

    const activeDuplicate = data.users.some(
      (u) => u.active !== false && u.email.toLowerCase() === email && u.id !== editId
    );

    if (activeDuplicate) {
      showSystemAlert("Já existe um usuário ativo cadastrado com este e-mail.");
      return;
    }

    const deptSelect = form.querySelector<HTMLSelectElement>('select[name="departments"]');
    const selectedDepts = deptSelect ? Array.from(deptSelect.selectedOptions, (opt) => opt.value) : [];

    if (role !== "tic" && selectedDepts.length === 0) {
      showSystemAlert("Selecione pelo menos um departamento.");
      return;
    }

    if (current.role === "gestor") {
      const allowedDepts = visibleDepartmentIds(current);
      const invalidDepts = selectedDepts.filter(id => !allowedDepts.includes(id));
      if (invalidDepts.length > 0) {
        showSystemAlert("Você só pode cadastrar ou editar usuários para o(s) departamento(s) que você gerencia.");
        return;
      }
    }

    ensureSeedData();
    const defaultDept = data.departments[0]?.id || "dept-tic";
    const first = role === "tic" ? (selectedDepts[0] || defaultDept) : (selectedDepts[0] || defaultDept);
    const rest = role === "tic" ? [] : selectedDepts.slice(1);

    if (editId) {
      const userToEdit = userById(editId);
      if (userToEdit) {
        const newName = String(formData.get("fullName") ?? "");

        userToEdit.fullName = newName;
        userToEdit.departmentId = first;
        userToEdit.email = email;
        if (current.role === 'tic') userToEdit.role = role;
        userToEdit.managedDepartmentIds = rest;
        userToEdit.active = true;
        userToEdit.pendingApproval = false;

        if (isSupabaseConfigured()) {
          try {
            await updateManagedUserInSupabase({
              userId: userToEdit.id,
              fullName: newName,
              email,
              role: userToEdit.role,
              departmentIds: [first, ...rest],
              active: true
            });
          } catch (error) {
            await refreshFromServer();
            showSystemAlert(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
            return;
          }
        }

        state.editingUserId = undefined;
        await saveData();
        showSystemAlert("Usuário atualizado e ativado com sucesso!");
        render();
      }
    } else {
      if (!isSupabaseConfigured()) {
        showSystemAlert("Não foi possível criar a conta porque o Supabase não está configurado.");
        return;
      }

      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        const created = await createUserInSupabase({
          fullName: String(formData.get("fullName") ?? "").trim(),
          email,
          role: current.role === "tic" ? role : "usuario",
          departmentIds: selectedDepts
        });
        await refreshFromServer();
        showTemporaryPasswordModal(String(created?.temporaryPassword ?? ""), "Usuário criado com sucesso");
        render();
      } catch (error) {
        showSystemAlert(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".approve-user-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.userId;
      const targetUser = targetId ? userById(targetId) : null;
      if (!targetUser) return;

      try {
        if (isSupabaseConfigured()) {
          await updateManagedUserInSupabase({
            userId: targetUser.id,
            fullName: targetUser.fullName,
            email: targetUser.email,
            role: targetUser.role,
            departmentIds: [targetUser.departmentId, ...targetUser.managedDepartmentIds].filter(Boolean),
            active: true
          });
        }
      } catch (error) {
        showSystemAlert(error instanceof Error ? error.message : "Não foi possível aprovar o cadastro.");
        return;
      }

      targetUser.active = true;
      targetUser.pendingApproval = false;
      targetUser.approvedByTic = true;

      addNotification(targetUser.id, {
        channel: "plataforma",
        title: "Cadastro Aprovado!",
        body: "Sua conta foi aprovada pela equipe TIC. Você já pode acessar o sistema."
      });

      await saveData();
      showSystemAlert(`Cadastro de ${targetUser.fullName} aprovado com sucesso!`);
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".edit-pending-user-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.userId;
      if (!targetId) return;
      state.editingUserId = targetId;
      render();
      const formEl = document.querySelector("#user-form");
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".reject-user-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.userId;
      const targetUser = targetId ? userById(targetId) : null;
      if (!targetUser) return;

      showSystemConfirm(`Deseja realmente rejeitar e remover a solicitação de cadastro de "${targetUser.fullName}"?`, async () => {
        try {
          if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.");
          await deleteUserFromSupabase(targetUser.id);
          data.users = data.users.filter(u => u.id !== targetId);
          showSystemAlert("Solicitação rejeitada. A conta e o perfil foram removidos do servidor.");
          render();
        } catch (error) {
          await refreshFromServer();
          showSystemAlert(error instanceof Error ? error.message : "Não foi possível remover integralmente a conta.");
        }
      });
    });
  });

  document.querySelector<HTMLButtonElement>("#user-cancel-edit")?.addEventListener("click", () => {
    state.editingUserId = undefined;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>(".edit-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.userId;
      if (!targetId) return;
      state.editingUserId = targetId;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".reset-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = userById(btn.dataset.userId);
      if (!target) return;

      const current = currentUser();
      if (current && current.role === "gestor") {
        if (target.role === "tic") {
          showSystemAlert("Você não tem permissão para gerenciar ou redefinir senhas de usuários do perfil TIC.");
          return;
        }
        const allowedDepts = visibleDepartmentIds(current);
        const targetDepts = [target.departmentId, ...target.managedDepartmentIds];
        const isAllowed = targetDepts.some((d) => allowedDepts.includes(d));
        if (!isAllowed) {
          showSystemAlert("Você só tem permissão para redefinir a senha de usuários do(s) seu(s) próprio(s) departamento(s).");
          return;
        }
      }

      showSystemConfirm(`Gerar uma nova senha temporária para "${target.fullName}"?`, async () => {
        try {
          const temporaryPassword = await createTemporaryPasswordInSupabase(target.id);
          target.mustChangePassword = true;
          showTemporaryPasswordModal(temporaryPassword, "Nova senha temporária gerada");
          render();
        } catch (error) {
          showSystemAlert(error instanceof Error ? error.message : "Não foi possível gerar a senha temporária.");
        }
      });
    });
  });


  document.querySelectorAll<HTMLButtonElement>(".delete-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = userById(btn.dataset.userId);
      if (!target) return;

      const current = currentUser();
      if (!current || current.role === "usuario") return;
      if (target.id === current.id) {
        showSystemAlert("Você não pode excluir a sua própria conta de usuário.");
        return;
      }

      if (current.role === "gestor") {
        const allowedDepartments = visibleDepartmentIds(current);
        const targetDepartments = [target.departmentId, ...target.managedDepartmentIds].filter(Boolean);
        if (target.role !== "usuario" || targetDepartments.length === 0 || !targetDepartments.every((id) => allowedDepartments.includes(id))) {
          showSystemAlert("Gestores só podem excluir usuários comuns vinculados exclusivamente aos departamentos que gerenciam.");
          return;
        }
      }

      showSystemConfirm(`Excluir definitivamente a conta de "${target.fullName}"? O perfil e o acesso serão removidos, mas os chamados permanecerão no histórico.`, async () => {
        if (isSupabaseConfigured()) {
          try {
            await deleteUserFromSupabase(target.id);
          } catch (err) {
            showSystemAlert(err instanceof Error ? err.message : "Não foi possível excluir o usuário.");
            return;
          }
        }

        data.users = data.users.filter((u) => u.id !== target.id);
        showSystemAlert(`Usuário "${target.fullName}" excluído com sucesso!`);
        render();
      });
    });
  });
}

// ===== FORMULÁRIO DE DEPARTAMENTOS =====
/** Gerencia os eventos de CRUD da tela de departamentos */
function bindDepartmentForms() {
  const form = document.querySelector<HTMLFormElement>("#department-form");
  if (!form) return;

  const nameInput = form.querySelector<HTMLInputElement>("#dept-name-input");
  const editIdInput = form.querySelector<HTMLInputElement>("#dept-edit-id");
  const formTitle = document.querySelector<HTMLHeadingElement>("#dept-form-title");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#dept-cancel-edit");

  // Função auxiliar para redefinir o formulário para o modo de criação
  function resetToCreate() {
    form!.reset();
    if (editIdInput) editIdInput.value = "";
    if (formTitle) formTitle.textContent = "Novo departamento";
    if (cancelBtn) cancelBtn.style.display = "none";
  }

  // Botão cancelar edição — volta ao modo de criação
  cancelBtn?.addEventListener("click", resetToCreate);

  // Botões de edição — preenchem o formulário com os dados do departamento
  document.querySelectorAll<HTMLButtonElement>(".edit-department").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deptId = btn.dataset.deptId;
      const dept = data.departments.find((d) => d.id === deptId);
      if (!dept || !nameInput || !editIdInput) return;

      editIdInput.value = dept.id;
      nameInput.value = dept.name;
      if (formTitle) formTitle.textContent = "Editar departamento";
      if (cancelBtn) cancelBtn.style.display = "";
      nameInput.focus();
    });
  });

  // Botões de exclusão — confirmam antes de remover
  document.querySelectorAll<HTMLButtonElement>(".delete-department").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const user = currentUser();
      if (!user || user.role !== "tic") return;

      const deptId = btn.dataset.deptId;
      const deptName = btn.dataset.deptName ?? "";
      const linkedUsers = Number(btn.dataset.linked ?? "0");
      const linkedTickets = data.tickets.filter((t) => t.departmentId === deptId).length;

      if (linkedUsers > 0 || linkedTickets > 0) {
        let msg = `Não é possível excluir o departamento "${deptName}" pois há:`;
        if (linkedUsers > 0) msg += `\n• ${linkedUsers} usuário(s) vinculado(s)`;
        if (linkedTickets > 0) msg += `\n• ${linkedTickets} chamado(s) vinculado(s)`;
        msg += `\n\nDesvincule-os ou reatribua os chamados antes de excluir.`;
        alert(msg);
        return;
      }

      if (!confirm(`Excluir o departamento "${deptName}"? Esta ação não pode ser desfeita.`)) return;

      try {
        if (isSupabaseConfigured() && deptId) await deleteDepartmentFromSupabase(deptId);
        data.departments = data.departments.filter((d) => d.id !== deptId);
        await saveData();
        render();
      } catch (error) {
        showSystemAlert(error instanceof Error ? error.message : "Não foi possível excluir o departamento.");
      }
    });
  });

  // Submissão do formulário — cria ou atualiza um departamento
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user || user.role !== "tic") return;

    const formData = new FormData(form);
    const deptId = String(formData.get("deptId") ?? "").trim();
    const deptName = String(formData.get("deptName") ?? "").trim();

    if (!deptName) return;

    // Verifica se já existe outro departamento com mesmo nome (case-insensitive)
    const nameDuplicate = data.departments.some(
      (d) => d.name.toLowerCase() === deptName.toLowerCase() && d.id !== deptId
    );
    if (nameDuplicate) {
      showSystemAlert(`Já existe um departamento com o nome "${deptName}".`);
      return;
    }

    if (deptId) {
      // Modo edição: atualiza o departamento existente
      const existing = data.departments.find((d) => d.id === deptId);
      if (existing) {
        const { error } = await supabase!.from("departments").update({ name: deptName }).eq("id", deptId);
        if (error) return showSystemAlert(`Não foi possível atualizar o departamento: ${error.message}`);
        existing.name = deptName;
      }
    } else {
      const { data: created, error } = await supabase!.from("departments").insert({ name: deptName }).select("id, name").single();
      if (error || !created) return showSystemAlert(`Não foi possível criar o departamento: ${error?.message ?? "resposta inválida do servidor"}`);
      data.departments.push({ id: created.id, name: created.name });
    }

    saveData();
    render();
  });
}

// ===== NOTIFICATIONS =====
function bindNotifications() {
  document.querySelector<HTMLButtonElement>("#clear-notifications")?.addEventListener("click", () => {
    const user = currentUser();
    if (!user) return;
    showSystemConfirm("Você tem certeza que deseja excluir todas as notificações?", async () => {
      const visible = getUserNotifications(user);
      const visibleIds = new Set(visible.map((n) => n.id));
      try {
        if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.");
        await deleteUserNotificationsFromSupabase(user.id);
        data.notifications = data.notifications.filter((n) => !visibleIds.has(n.id));
        render();
      } catch (error) {
        showSystemAlert(error instanceof Error ? error.message : "Não foi possível limpar as notificações.");
      }
    });
  });

  document.querySelector<HTMLButtonElement>("#mark-read")?.addEventListener("click", async () => {
    const user = currentUser();
    if (!user) return;
    const visible = getUserNotifications(user);
    visible.forEach((n) => {
      n.read = true;
    });
    try {
      await markNotificationsReadInSupabase(visible.map((notification) => notification.id));
    } catch (error) {
      visible.forEach((notification) => { notification.read = false; });
      showSystemAlert(error instanceof Error ? error.message : "Não foi possível marcar as notificações.");
      return;
    }
    render();
  });

  document.querySelector<HTMLButtonElement>("#enable-browser-alerts")?.addEventListener("click", async () => {
    if ("Notification" in window) await Notification.requestPermission();
    render();
  });
}

const CURRENT_VIEW_STORAGE_KEY = "crq-current-view";
const SELECTED_TICKET_STORAGE_KEY = "crq-selected-ticket-id";
const TICKET_DETAIL_OPEN_STORAGE_KEY = "crq-ticket-detail-open";

const VALID_VIEWS: View[] = [
  "dashboard",
  "tickets",
  "new-ticket",
  "users",
  "notifications",
  "trash",
  "departments",
  "reports",
  "knowledge",
  "settings"
];

function saveViewState() {
  try {
    if (state.currentUserId) {
      if (state.view) {
        localStorage.setItem(CURRENT_VIEW_STORAGE_KEY, state.view);
        if (window.location.hash !== `#${state.view}`) {
          history.replaceState(null, "", `#${state.view}`);
        }
      }
      if (state.selectedTicketId !== undefined) {
        localStorage.setItem(SELECTED_TICKET_STORAGE_KEY, String(state.selectedTicketId));
      } else {
        localStorage.removeItem(SELECTED_TICKET_STORAGE_KEY);
      }
      if (state.ticketDetailOpen) {
        localStorage.setItem(TICKET_DETAIL_OPEN_STORAGE_KEY, "true");
      } else {
        localStorage.removeItem(TICKET_DETAIL_OPEN_STORAGE_KEY);
      }
    } else {
      clearSavedViewState();
    }
  } catch (e) {}
}

function clearSavedViewState() {
  try {
    localStorage.removeItem(CURRENT_VIEW_STORAGE_KEY);
    localStorage.removeItem(SELECTED_TICKET_STORAGE_KEY);
    localStorage.removeItem(TICKET_DETAIL_OPEN_STORAGE_KEY);
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  } catch (e) {}
}

function restoreViewState() {
  try {
    const hash = window.location.hash.replace("#", "").trim() as View;
    let targetView: View | null = null;
    if (hash && VALID_VIEWS.includes(hash)) {
      targetView = hash;
    } else {
      const storedView = localStorage.getItem(CURRENT_VIEW_STORAGE_KEY) as View | null;
      if (storedView && VALID_VIEWS.includes(storedView)) {
        targetView = storedView;
      }
    }

    if (targetView) {
      state.view = targetView;
      history.replaceState(null, "", `#${targetView}`);
    }

    const savedTicketId = localStorage.getItem(SELECTED_TICKET_STORAGE_KEY);
    if (savedTicketId) {
      const numId = Number(savedTicketId);
      if (!isNaN(numId)) {
        state.selectedTicketId = numId;
      }
    }

    const savedDetailOpen = localStorage.getItem(TICKET_DETAIL_OPEN_STORAGE_KEY);
    if (savedDetailOpen === "true") {
      state.ticketDetailOpen = true;
    }

    const user = currentUser();
    if (user) {
      if (state.view === "users" && user.role === "usuario") state.view = "dashboard";
      if (state.view === "departments" && user.role !== "tic") state.view = "dashboard";
      if (state.view === "trash" && user.role !== "tic") state.view = "dashboard";
      if (state.view === "reports" && user.role === "usuario") state.view = "dashboard";
    }
  } catch (e) {}
}

window.addEventListener("popstate", () => {
  const hash = window.location.hash.replace("#", "").trim() as View;
  if (hash && VALID_VIEWS.includes(hash) && state.currentUserId) {
    const user = currentUser();
    if (user) {
      if (hash === "users" && user.role === "usuario") return;
      if (hash === "departments" && user.role !== "tic") return;
      if (hash === "trash" && user.role !== "tic") return;
      if (hash === "reports" && user.role === "usuario") return;
      state.view = hash;
      render();
    }
  }
});

function setCurrentUserId(userId: string | undefined) {
  if (state.currentUserId !== userId) state.editingUserId = undefined;
  state.currentUserId = userId;
}

function clearInvalidSession(): boolean {
  state = { ...defaultState, filters: { ...defaultState.filters } };
  return false;
}

// ===== RESTORE SESSION =====
// Usa onAuthStateChange para capturar o evento PASSWORD_RECOVERY corretamente.
// Com detectSessionInUrl: true, o Supabase processa o token da URL antes do
// nosso código executar e limpa o hash — por isso checar o hash diretamente
// não funciona. O onAuthStateChange é a única forma confiável de interceptar.
async function restoreSession(): Promise<void> {
  if (!supabase || !isSupabaseConfigured()) {
    clearInvalidSession();
    return;
  }

  return new Promise<void>((resolve) => {
    let resolved = false;

    function done() {
      if (resolved) return;
      resolved = true;
      subscription.unsubscribe();
      resolve();
    }

    // Timeout de segurança: caso o evento não dispare em 5 s, tenta restaurar a sessão do localStorage
    const timer = setTimeout(() => {
      clearInvalidSession();
      done();
    }, 5000);

    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, session) => {
      const isRecoveryUrl =
        isRecoveryLinkDetected ||
        event === 'PASSWORD_RECOVERY' ||
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery') ||
        window.location.hash.includes('type=invite') ||
        window.location.search.includes('type=invite') ||
        window.location.hash.includes('type=signup') ||
        window.location.search.includes('type=signup') ||
        window.location.href.includes('type=recovery') ||
        window.location.href.includes('type=invite') ||
        window.location.href.includes('type=signup');

      // PASSWORD_RECOVERY ou clique em link de e-mail (recovery/invite/signup): força exibição da tela de nova senha
      if (isRecoveryUrl || state.authMode === 'update-password') {
        clearTimeout(timer);
        setCurrentUserId(undefined);
        state.authMode = 'update-password';
        isRecoveryLinkDetected = false;
        if (window.location.hash || window.location.search.includes('type=')) {
          try {
            history.replaceState(null, '', window.location.pathname);
          } catch (e) {}
        }
        done();
        return;
      }

      // INITIAL_SESSION sem sessão ativa = tenta restaurar sessão salva localmente
      if (event === 'INITIAL_SESSION' && !session) {
        clearTimeout(timer);
        clearInvalidSession();
        done();
        return;
      }

      // Sessão válida (login normal ou sessão persistida no Supabase)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        clearTimeout(timer);
        const userId = session.user.id;
        const { data: profile } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profile) {
          let existing = data.users.find(u => u.id === profile.id);
          if (!existing) {
            data.users.push({
              id: profile.id,
              fullName: profile.full_name,
              email: profile.email,
              role: profile.role as Role,
              departmentId: profile.department_id,
              managedDepartmentIds: profile.managed_department_ids || [],
              active: profile.active !== false,
              onboardingCompletedAt: profile.onboarding_completed_at || undefined
            });
          }
          setCurrentUserId(userId);
          done();
          return;
        }

        // Sessão existe mas perfil não foi retornado do Supabase -> tenta restaurar sessão local
        clearTimeout(timer);
        clearInvalidSession();
        done();
      }
    });
  });
}

// ===== CONFIGURAÇÕES — EVENT BINDING =====
/** Aplica o tema (claro/escuro) ao elemento <html> e persiste a escolha */
function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function handleThemeTransition(nextTheme: "light" | "dark", event: MouseEvent) {
  const isDark = nextTheme === "dark";
  const doc = document as any;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    applyTheme(nextTheme);
    render();
    return;
  }

  const x = event.clientX || window.innerWidth / 2;
  const y = event.clientY || window.innerHeight / 2;

  // Halo e partículas acompanham a origem do clique sem manter animações no DOM.
  const flare = document.createElement("div");
  flare.className = `theme-transition-flare ${isDark ? "to-dark" : "to-light"}`;
  flare.style.setProperty("--theme-x", `${x}px`);
  flare.style.setProperty("--theme-y", `${y}px`);
  flare.setAttribute("aria-hidden", "true");
  flare.innerHTML = `
    <span class="theme-transition-aurora"></span>
    <span class="theme-transition-core"></span>
    <span class="theme-transition-ring"></span>
    <span class="theme-transition-ring secondary"></span>
    <span class="theme-transition-lens"></span>
    ${Array.from({ length: 18 }, (_, index) =>
      `<i style="--particle-angle:${index * 20}deg;--particle-delay:${index * 13}ms;--particle-distance:${54 + (index % 4) * 20}px;--particle-size:${3 + (index % 3) * 2}px"></i>`
    ).join("")}
  `;
  document.body.appendChild(flare);
  window.setTimeout(() => flare.remove(), 1450);

  if (!doc.startViewTransition) {
    flare.classList.add("fallback");
    window.setTimeout(() => {
      applyTheme(nextTheme);
      render();
    }, 180);
    return;
  }

  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );

  const transition = doc.startViewTransition(() => {
    applyTheme(nextTheme);
    render();
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      [
        {
          clipPath: `circle(0px at ${x}px ${y}px)`,
          filter: isDark ? "brightness(1.35) saturate(1.35)" : "brightness(1.8) saturate(0.8)",
          transform: "scale(1.012)"
        },
        {
          clipPath: `circle(${endRadius * 0.42}px at ${x}px ${y}px)`,
          filter: "brightness(1.08) saturate(1.15)",
          offset: 0.46
        },
        {
          clipPath: `circle(${endRadius * 0.7}px at ${x}px ${y}px)`,
          filter: isDark
            ? "brightness(.92) saturate(1.28) hue-rotate(5deg)"
            : "brightness(1.18) saturate(1.08) hue-rotate(-4deg)",
          transform: "scale(1.004)",
          offset: 0.72
        },
        {
          clipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
          filter: "brightness(1) saturate(1)",
          transform: "scale(1)"
        }
      ],
      {
        duration: 1180,
        easing: "cubic-bezier(.16,.76,.18,1)",
        pseudoElement: "::view-transition-new(root)"
      }
    );

    document.documentElement.animate(
      [
        { opacity: 1, filter: "blur(0) saturate(1)", transform: "scale(1)" },
        { opacity: 0.86, filter: "blur(1px) saturate(1.22)", transform: "scale(.995)", offset: .35 },
        { opacity: 0.58, filter: "blur(3px) saturate(.82)", transform: "scale(.978)" }
      ],
      {
        duration: 960,
        easing: "cubic-bezier(.4,0,.2,1)",
        pseudoElement: "::view-transition-old(root)"
      }
    );
  }).catch(() => {
    flare.remove();
  });
}

/** Gerencia os eventos da tela de configurações */
function bindSettingsForm() {
  // ----- Upload de Avatar -----
  const avatarBtn = document.querySelector<HTMLButtonElement>("#settings-avatar-btn");
  const avatarInput = document.querySelector<HTMLInputElement>("#settings-avatar-input");
  const sidebarAvatarBtn = document.querySelector<HTMLButtonElement>("#sidebar-avatar-btn");
  const sidebarAvatarInput = document.querySelector<HTMLInputElement>("#sidebar-avatar-input");
  const avatarRemove = document.querySelector<HTMLButtonElement>("#settings-avatar-remove");

  avatarBtn?.addEventListener("click", () => avatarInput?.click());
  sidebarAvatarBtn?.addEventListener("click", () => sidebarAvatarInput?.click());

  const saveAvatarFile = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showSystemAlert("Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showSystemAlert("A foto deve ter no máximo 3 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const user = currentUser();
      if (user) {
        const { error } = await supabase!.from("profiles").update({ avatar_url: base64 }).eq("id", user.id);
        if (error) return showSystemAlert("Não foi possível salvar a foto no banco.");
        user.avatarUrl = base64;
        render();
        setTimeout(() => {
          showSystemAlert("Foto de perfil enviada com sucesso!");
        }, 50);
      }
    };
    reader.readAsDataURL(file);
  };

  avatarInput?.addEventListener("change", () => saveAvatarFile(avatarInput.files?.[0]));
  sidebarAvatarInput?.addEventListener("change", () => saveAvatarFile(sidebarAvatarInput.files?.[0]));

  avatarRemove?.addEventListener("click", async () => {
    const user = currentUser();
    if (user && user.avatarUrl) {
      const { error } = await supabase!.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) return showSystemAlert("Não foi possível remover a foto no banco.");
      delete user.avatarUrl;
      render();
      setTimeout(() => {
        showSystemAlert("Foto de perfil removida com sucesso!");
      }, 50);
    }
  });

  // ----- Toggle de tema -----
  document.querySelector<HTMLButtonElement>("#theme-light")?.addEventListener("click", (e) => {
    handleThemeTransition("light", e);
  });
  document.querySelector<HTMLButtonElement>("#theme-dark")?.addEventListener("click", (e) => {
    handleThemeTransition("dark", e);
  });

  // ----- Modal de alteração de nome -----
  const nameOverlay = document.querySelector<HTMLDivElement>("#name-modal-overlay");

  function openNameModal() {
    if (!nameOverlay) return;
    // Pré-preenche o campo com o nome atual do usuário
    const user = currentUser();
    const input = document.querySelector<HTMLInputElement>("#settings-fullname");
    if (input && user) { input.value = user.fullName; }
    const msg = document.querySelector<HTMLParagraphElement>("#settings-name-msg");
    if (msg) { msg.textContent = ""; msg.className = "settings-msg"; }
    nameOverlay.style.display = "flex";
    input?.focus();
    input?.select();
  }

  function closeNameModal() {
    if (nameOverlay) nameOverlay.style.display = "none";
  }

  document.querySelector<HTMLButtonElement>("#open-name-modal")?.addEventListener("click", openNameModal);
  document.querySelector<HTMLButtonElement>("#close-name-modal")?.addEventListener("click", closeNameModal);
  document.querySelector<HTMLButtonElement>("#close-name-modal-cancel")?.addEventListener("click", closeNameModal);

  nameOverlay?.addEventListener("click", (e) => {
    if (e.target === nameOverlay) closeNameModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nameOverlay?.style.display === "flex") closeNameModal();
  });

  // Submissão do formulário de nome
  document.querySelector<HTMLFormElement>("#settings-name-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;

    const newName = (document.querySelector<HTMLInputElement>("#settings-fullname")?.value ?? "").trim();
    const msg = document.querySelector<HTMLParagraphElement>("#settings-name-msg");

    if (!newName) {
      if (msg) { msg.textContent = "Nome não pode ser vazio."; msg.className = "settings-msg error"; }
      return;
    }

    const { error } = await supabase!.from("profiles").update({ full_name: newName }).eq("id", user.id);
    if (error) {
      if (msg) { msg.textContent = "Não foi possível atualizar o nome no banco."; msg.className = "settings-msg error"; }
      return;
    }
    user.fullName = newName;

    if (msg) { msg.textContent = "Nome atualizado com sucesso!"; msg.className = "settings-msg success"; }

    // Atualiza a prévia e a sidebar sem re-renderizar
    const display = document.querySelector<HTMLElement>("#settings-name-display");
    const avatarEl = document.querySelector<HTMLElement>(".avatar");
    const nameEl = document.querySelector<HTMLElement>(".profile-block strong");
    if (display) display.textContent = newName;
    if (avatarEl) avatarEl.textContent = initials(newName);
    if (nameEl) nameEl.textContent = newName;

    // Fecha o modal após 1.2 s
    setTimeout(closeNameModal, 1200);
  });

  // ----- Modal de alteração de senha -----
  const overlay = document.querySelector<HTMLDivElement>("#pw-modal-overlay");

  function openPwModal() {
    if (!overlay) return;
    overlay.style.display = "flex";
    // Limpa campos e mensagem ao abrir
    const fields = ["#settings-current-pw", "#settings-new-pw", "#settings-confirm-pw"];
    fields.forEach(sel => { const el = document.querySelector<HTMLInputElement>(sel); if (el) el.value = ""; });
    const msg = document.querySelector<HTMLParagraphElement>("#settings-pw-msg");
    if (msg) { msg.textContent = ""; msg.className = "settings-msg"; }
    document.querySelector<HTMLInputElement>("#settings-current-pw")?.focus();
  }

  function closePwModal() {
    if (overlay) overlay.style.display = "none";
  }

  document.querySelector<HTMLButtonElement>("#open-pw-modal")?.addEventListener("click", openPwModal);
  document.querySelector<HTMLButtonElement>("#close-pw-modal")?.addEventListener("click", closePwModal);
  document.querySelector<HTMLButtonElement>("#close-pw-modal-cancel")?.addEventListener("click", closePwModal);

  // Fecha o modal clicando no backdrop (fora da caixa)
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closePwModal();
  });

  // Fecha com Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") closePwModal();
  });

  // ----- Submissão do formulário de senha -----
  document.querySelector<HTMLFormElement>("#settings-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;

    const submitBtn = document.querySelector<HTMLButtonElement>("#settings-password-form button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    const currentPw = document.querySelector<HTMLInputElement>("#settings-current-pw")?.value ?? "";
    const newPw = document.querySelector<HTMLInputElement>("#settings-new-pw")?.value ?? "";
    const confirmPw = document.querySelector<HTMLInputElement>("#settings-confirm-pw")?.value ?? "";
    const msg = document.querySelector<HTMLParagraphElement>("#settings-pw-msg");

    function setMsg(text: string, type: "success" | "error") {
      if (msg) { msg.textContent = text; msg.className = `settings-msg ${type}`; }
      if (submitBtn && type === "error") submitBtn.disabled = false;
    }

    if (newPw !== confirmPw) { setMsg("As senhas não coincidem.", "error"); return; }
    if (newPw.length < 8) { setMsg("A nova senha deve ter ao menos 8 caracteres.", "error"); return; }

    if (isSupabaseConfigured() && supabase) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (reauthError) { setMsg("A senha atual está incorreta.", "error"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) { setMsg(error.message || "Erro ao alterar senha.", "error"); return; }
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      user.mustChangePassword = false;
    }

    setMsg("Senha alterada com sucesso!", "success");
    setTimeout(() => {
      if (submitBtn) submitBtn.disabled = false;
      closePwModal();
    }, 1200);
  });



}

/** Exibe um pop-up de prompt/input de sistema estilo SaaS */
function showSystemPrompt(
  title: string,
  label: string,
  inputType: "text" | "textarea" | "datetime-local",
  onSubmit: (value: string) => void,
  defaultValue = ""
) {
  const overlay = document.createElement("div");
  overlay.className = "system-modal-overlay";

  const inputHtml = inputType === "textarea"
    ? `<textarea id="sys-prompt-input" rows="4" placeholder="Digite o motivo..." required>${escapeHtml(defaultValue)}</textarea>`
    : `<input id="sys-prompt-input" type="${inputType}" value="${escapeHtml(defaultValue)}" required />`;

  overlay.innerHTML = `
    <div class="system-modal" style="max-width: 440px;">
      <div style="color: var(--brand); margin-bottom: -8px;">
        <i data-lucide="${inputType === 'datetime-local' ? 'calendar-clock' : 'message-square-plus'}" style="width: 44px; height: 44px;"></i>
      </div>
      <div class="system-modal-text" style="font-weight: 700; font-size: 1.1rem; margin-bottom: 2px;">${escapeHtml(title)}</div>
      <div class="system-modal-prompt">
        <label for="sys-prompt-input">${escapeHtml(label)}</label>
        ${inputHtml}
      </div>
      <div class="system-modal-actions">
        <button id="sys-prompt-cancel" class="ghost-button" type="button">Cancelar</button>
        <button id="sys-prompt-submit" class="primary-button" type="button">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  createIcons({ icons: usedIcons, nameAttr: "data-lucide" });

  const inputEl = overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>("#sys-prompt-input");
  inputEl?.focus();

  overlay.querySelector("#sys-prompt-cancel")?.addEventListener("click", () => {
    overlay.style.animation = "fade-out 0.2s ease forwards";
    setTimeout(() => overlay.remove(), 200);
  });

  overlay.querySelector("#sys-prompt-submit")?.addEventListener("click", () => {
    const val = inputEl?.value.trim() ?? "";
    if (!val) {
      inputEl?.focus();
      return;
    }
    overlay.remove();
    onSubmit(val);
  });
}

function checkScheduledTickets() {
  if (currentUser()?.role !== "tic") return;
  const now = Date.now();
  data.tickets.forEach((t) => {
    if (t.plannedFor && !t.plannedNotificationSent && t.status === "planejado") {
      const plannedTime = new Date(t.plannedFor).getTime();
      if (!isNaN(plannedTime) && now >= plannedTime) {
        t.plannedNotificationSent = true;
        const msg = `⏰ Lembrete: O chamado #${t.id} ("${t.title}") está agendado para iniciar agora!`;
        if (t.assignedId) {
          addNotification(t.assignedId, { ticketId: t.id, channel: "plataforma", title: `Agendamento Chamado #${t.id}`, body: msg });
        } else {
          data.users.filter((u) => u.role === "tic" && u.active !== false).forEach((u) => {
            addNotification(u.id, { ticketId: t.id, channel: "plataforma", title: `Agendamento Chamado #${t.id}`, body: msg });
          });
        }
        void updateTicketInSupabase(t);
        saveData();
        render();
      }
    }
  });
}

/** Exibe um pop-up de confirmação de sistema estilo SaaS */
function showSystemConfirm(message: string, onConfirm: () => void) {
  const overlay = document.createElement("div");
  overlay.className = "system-modal-overlay";
  overlay.innerHTML = `
    <div class="system-modal">
      <div style="color: var(--red); margin-bottom: -8px;">
        <i data-lucide="triangle-alert" style="width: 48px; height: 48px;"></i>
      </div>
      <div class="system-modal-text">${escapeHtml(message)}</div>
      <div class="system-modal-actions">
        <button id="sys-confirm-no" class="ghost-button" type="button">Não</button>
        <button id="sys-confirm-yes" class="primary-button" style="background: var(--red); border-color: var(--red);" type="button">Sim</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });

  overlay.querySelector("#sys-confirm-no")?.addEventListener("click", () => {
    overlay.style.animation = "fade-out 0.2s ease forwards";
    setTimeout(() => overlay.remove(), 200);
  });

  overlay.querySelector("#sys-confirm-yes")?.addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
}

/** Exibe um pop-up de alerta de sucesso/informação estilo SaaS */
function showSystemAlert(message: string) {
  const normalizedMessage = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalizedMessage.includes("o chamado foi atualizado") && normalizedMessage.includes("sincronizad")) {
    devWarn("Alerta auxiliar suprimido:", message);
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "system-modal-overlay";
  overlay.innerHTML = `
    <div class="system-modal">
      <div style="color: var(--teal); margin-bottom: -8px;">
        <i data-lucide="circle-check" style="width: 48px; height: 48px;"></i>
      </div>
      <div class="system-modal-text">${escapeHtml(message)}</div>
      <div class="system-modal-actions" style="justify-content: center;">
        <button id="sys-alert-ok" class="primary-button" type="button" style="width: 100%; max-width: 120px;">Ok</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  createIcons({ icons: usedIcons, nameAttr: 'data-lucide' });

  overlay.querySelector("#sys-alert-ok")?.addEventListener("click", () => {
    overlay.style.animation = "fade-out 0.2s ease forwards";
    setTimeout(() => overlay.remove(), 200);
  });
}

/** Mostra a credencial uma única vez e permite copiá-la sem espaços ou pontuação acidental. */
function showTemporaryPasswordModal(password: string, title: string) {
  if (!password) return showSystemAlert("A conta foi processada, mas o servidor não retornou a senha temporária.");
  const overlay = document.createElement("div");
  overlay.className = "system-modal-overlay";
  overlay.innerHTML = `
    <div class="system-modal temporary-password-modal">
      <i data-lucide="key-round"></i>
      <h3>${escapeHtml(title)}</h3>
      <p>Copie exatamente esta senha e entregue ao usuário por um canal seguro.</p>
      <code id="temporary-password-value">${escapeHtml(password)}</code>
      <div class="system-modal-actions">
        <button id="copy-temporary-password" class="ghost-button" type="button"><i data-lucide="copy"></i>Copiar senha</button>
        <button id="close-temporary-password" class="primary-button" type="button">Concluir</button>
      </div>
      <small>Ela será substituída quando o usuário definir a senha pessoal no primeiro acesso.</small>
    </div>`;
  document.body.appendChild(overlay);
  createIcons({ icons: usedIcons, nameAttr: "data-lucide" });
  overlay.querySelector<HTMLButtonElement>("#copy-temporary-password")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(password);
      button.textContent = "Senha copiada";
    } catch {
      const range = document.createRange();
      const value = overlay.querySelector("#temporary-password-value");
      if (value) { range.selectNodeContents(value); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
    }
  });
  overlay.querySelector("#close-temporary-password")?.addEventListener("click", () => overlay.remove());
}

// ===== INICIALIZAÇÃO =====
async function init() {
  // Dados operacionais são carregados exclusivamente do Supabase.
  const [supabaseData, remoteTutorials] = await Promise.all([
    loadDataFromSupabase(),
    loadKnowledgeTutorials()
  ]);

  if (supabaseData) {
    data = supabaseData;
  } else {
    devWarn('Não foi possível carregar os dados do Supabase. O modo local está desativado.');
  }

  if (remoteTutorials.length) knowledgeTutorials = remoteTutorials;

  ensureSeedData();
  await restoreSession();
  const restoredUser = currentUser();
  if (restoredUser) void startRealtime(restoredUser);
  restoreViewState();

  // Preferências visuais ficam no navegador; os dados operacionais vêm do Supabase.
  const savedTheme = (localStorage.getItem(THEME_STORAGE_KEY) ?? "light") as "light" | "dark";
  applyTheme(savedTheme);

  try {
    const savedCollapsed = localStorage.getItem("crq-sidebar-collapsed");
    if (savedCollapsed !== null) {
      state.sidebarCollapsed = savedCollapsed === "true";
    }
  } catch (err) {}

  render();
  checkScheduledTickets();
  window.setInterval(checkScheduledTickets, 10000);
}

init();
