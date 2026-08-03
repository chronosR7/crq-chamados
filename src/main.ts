import "./styles.css";

type Role = "usuario" | "gestor" | "tic";
type View = "dashboard" | "tickets" | "new-ticket" | "users" | "sla" | "notifications";
type TicketStatus = "novo" | "atribuido" | "planejado" | "pendente" | "solucionado" | "fechado" | "excluido";
type TicketType = "incidente" | "requisicao";
type Priority = "baixa" | "media" | "alta" | "critica";
type Channel = "email" | "plataforma" | "navegador";

interface Department {
  id: string;
  name: string;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  departmentId: string;
  managedDepartmentIds: string[];
  active: boolean;
}

interface SlaRule {
  priority: Priority;
  responseHours: number;
  solutionHours: number;
}

interface TicketEvent {
  id: string;
  actorId: string;
  type: string;
  message: string;
  createdAt: string;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
}

interface Ticket {
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
  responseDueAt: string;
  solutionDueAt: string;
  responseStartedAt?: string;
  solvedAt?: string;
  closedAt?: string;
  attachments: Attachment[];
  events: TicketEvent[];
}

interface NotificationItem {
  id: string;
  userId: string;
  ticketId?: number;
  channel: Channel;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface AppData {
  version: number;
  departments: Department[];
  users: User[];
  tickets: Ticket[];
  slaRules: SlaRule[];
  notifications: NotificationItem[];
}

interface Filters {
  status: "todos" | TicketStatus;
  search: string;
  priority: "todas" | Priority;
  requesterId: "todos" | string;
  departmentId: "todos" | string;
}

interface RuntimeState {
  currentUserId?: string;
  view: View;
  selectedTicketId?: number;
  ticketDetailOpen: boolean;
  ticketDetailWidth: number;
  filters: Filters;
}

const STORAGE_KEY = "crq12-helpdesk-state-v1";
const MB_2 = 2 * 1024 * 1024;
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

if (new URLSearchParams(window.location.search).get("resetDemo") === "1") {
  localStorage.removeItem(STORAGE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
}

const app = document.querySelector<HTMLDivElement>("#app");

const statusLabels: Record<TicketStatus, string> = {
  novo: "Novo",
  atribuido: "Em atendimento (Atribuído)",
  planejado: "Em atendimento (Planejado)",
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
  "Solicitação administrativa"
];

const data: AppData = loadData();

const state: RuntimeState = {
  view: "dashboard",
  ticketDetailOpen: false,
  ticketDetailWidth: 430,
  filters: {
    status: "todos",
    search: "",
    priority: "todas",
    requesterId: "todos",
    departmentId: "todos"
  }
};

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
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

function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.version === 1) return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const seeded = seedData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

let saveTimer: number | undefined;

function saveData() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    saveTimer = undefined;
  }, 0);
}

function seedData(): AppData {
  const base = new Date();
  const departments: Department[] = [
    { id: "dep-ti", name: "Tecnologia da Informação" },
    { id: "dep-atendimento", name: "Atendimento" },
    { id: "dep-fiscalizacao", name: "Fiscalização" },
    { id: "dep-financeiro", name: "Financeiro" },
    { id: "dep-compras", name: "Compras" }
  ];

  const users: User[] = [
    {
      id: "usr-ana",
      fullName: "Ana Paula Martins",
      email: "usuario@crq12.org.br",
      password: "crq123",
      phone: "(92) 99911-2040",
      role: "usuario",
      departmentId: "dep-atendimento",
      managedDepartmentIds: [],
      active: true
    },
    {
      id: "usr-carla",
      fullName: "Carla Menezes Rocha",
      email: "gestor@crq12.org.br",
      password: "crq123",
      phone: "(92) 98802-4410",
      role: "gestor",
      departmentId: "dep-atendimento",
      managedDepartmentIds: ["dep-atendimento", "dep-fiscalizacao"],
      active: true
    },
    {
      id: "usr-bruno",
      fullName: "Bruno Nascimento TIC",
      email: "tic@crq12.org.br",
      password: "crq123",
      phone: "(92) 98440-1177",
      role: "tic",
      departmentId: "dep-ti",
      managedDepartmentIds: departments.map((department) => department.id),
      active: true
    },
    {
      id: "usr-joao",
      fullName: "João Silva Freitas",
      email: "joao.freitas@crq12.org.br",
      password: "crq123",
      phone: "(92) 99110-5560",
      role: "usuario",
      departmentId: "dep-fiscalizacao",
      managedDepartmentIds: [],
      active: true
    },
    {
      id: "usr-lia",
      fullName: "Lia Costa Ramos",
      email: "lia.ramos@crq12.org.br",
      password: "crq123",
      phone: "(92) 99620-0041",
      role: "usuario",
      departmentId: "dep-financeiro",
      managedDepartmentIds: [],
      active: true
    }
  ];

  const slaRules: SlaRule[] = [
    { priority: "baixa", responseHours: 8, solutionHours: 72 },
    { priority: "media", responseHours: 4, solutionHours: 48 },
    { priority: "alta", responseHours: 2, solutionHours: 24 },
    { priority: "critica", responseHours: 0.5, solutionHours: 8 }
  ];

  const ticketOneCreated = addHours(base, -10);
  const ticketTwoCreated = addHours(base, -3);
  const ticketThreeCreated = addHours(base, -28);
  const ticketFourCreated = addHours(base, -2);

  const tickets: Ticket[] = [
    {
      id: 1201,
      type: "incidente",
      category: "Rede e internet",
      title: "Instabilidade no acesso à rede do atendimento",
      description: "Estações do balcão apresentam perda de conexão durante consultas de protocolo.",
      status: "atribuido",
      priority: "alta",
      requesterId: "usr-ana",
      departmentId: "dep-atendimento",
      assignedId: "usr-bruno",
      observerIds: ["usr-carla"],
      createdAt: ticketOneCreated,
      updatedAt: addHours(base, -1),
      responseDueAt: addHours(new Date(ticketOneCreated), 2),
      solutionDueAt: addHours(new Date(ticketOneCreated), 24),
      responseStartedAt: addHours(base, -8),
      attachments: [],
      events: [
        createEvent("usr-ana", "Criação", "Chamado aberto pelo usuário.", ticketOneCreated),
        createEvent("usr-bruno", "Inicialização", "TIC iniciou o atendimento e assumiu o chamado.", addHours(base, -8))
      ]
    },
    {
      id: 1202,
      type: "requisicao",
      category: "Acesso e senha",
      title: "Criação de acesso para novo servidor da fiscalização",
      description: "Solicito acesso institucional para servidor recém-alocado no setor.",
      status: "novo",
      priority: "media",
      requesterId: "usr-joao",
      departmentId: "dep-fiscalizacao",
      observerIds: ["usr-carla"],
      createdAt: ticketTwoCreated,
      updatedAt: ticketTwoCreated,
      responseDueAt: addHours(new Date(ticketTwoCreated), 4),
      solutionDueAt: addHours(new Date(ticketTwoCreated), 48),
      attachments: [{ id: makeId("att"), name: "formulario-acesso.pdf", size: 380000 }],
      events: [createEvent("usr-joao", "Criação", "Requisição incluída na fila de chamados.", ticketTwoCreated)]
    },
    {
      id: 1203,
      type: "incidente",
      category: "Sistemas internos",
      title: "Erro ao emitir relatório financeiro mensal",
      description: "O relatório fecha a sessão antes de concluir o processamento.",
      status: "pendente",
      priority: "critica",
      requesterId: "usr-lia",
      departmentId: "dep-financeiro",
      assignedId: "usr-bruno",
      observerIds: [],
      createdAt: ticketThreeCreated,
      updatedAt: addHours(base, -4),
      responseDueAt: addHours(new Date(ticketThreeCreated), 0.5),
      solutionDueAt: addHours(new Date(ticketThreeCreated), 8),
      responseStartedAt: addHours(base, -27),
      attachments: [{ id: makeId("att"), name: "print-erro.png", size: 812000 }],
      events: [
        createEvent("usr-lia", "Criação", "Chamado crítico aberto pelo Financeiro.", ticketThreeCreated),
        createEvent("usr-bruno", "Pendência", "TIC solicitou exemplo de relatório com competência afetada.", addHours(base, -4))
      ]
    },
    {
      id: 1204,
      type: "requisicao",
      category: "Equipamentos",
      title: "Separar notebook para reunião externa",
      description: "Será necessário um notebook com acesso à rede para apresentação institucional.",
      status: "planejado",
      priority: "baixa",
      requesterId: "usr-carla",
      departmentId: "dep-atendimento",
      assignedId: "usr-bruno",
      observerIds: ["usr-ana"],
      createdAt: ticketFourCreated,
      updatedAt: addHours(base, -1),
      responseDueAt: addHours(new Date(ticketFourCreated), 8),
      solutionDueAt: addHours(new Date(ticketFourCreated), 72),
      responseStartedAt: addHours(base, -1.5),
      attachments: [],
      events: [
        createEvent("usr-carla", "Criação", "Gestor abriu requisição para agenda externa.", ticketFourCreated),
        createEvent("usr-bruno", "Planejamento", "Atendimento planejado para amanhã cedo.", addHours(base, -1))
      ]
    }
  ];

  const notifications: NotificationItem[] = [
    {
      id: makeId("not"),
      userId: "usr-bruno",
      ticketId: 1203,
      channel: "plataforma",
      title: "Chamado crítico pendente",
      body: "O chamado #1203 está aguardando informação complementar.",
      read: false,
      createdAt: addHours(base, -4)
    },
    {
      id: makeId("not"),
      userId: "usr-ana",
      ticketId: 1201,
      channel: "email",
      title: "Chamado em atendimento",
      body: "O chamado #1201 foi inicializado pela equipe TIC.",
      read: false,
      createdAt: addHours(base, -8)
    }
  ];

  return { version: 1, departments, users, tickets, slaRules, notifications };
}

function createEvent(actorId: string, type: string, message: string, createdAt = nowIso()): TicketEvent {
  return {
    id: makeId("evt"),
    actorId,
    type,
    message,
    createdAt
  };
}

function currentUser() {
  return data.users.find((user) => user.id === state.currentUserId);
}

function userById(id?: string) {
  return data.users.find((user) => user.id === id);
}

function departmentById(id?: string) {
  return data.departments.find((department) => department.id === id);
}

function slaFor(priority: Priority) {
  return data.slaRules.find((rule) => rule.priority === priority) ?? data.slaRules[1];
}

function visibleDepartmentIds(user: User) {
  if (user.role === "tic") return data.departments.map((department) => department.id);
  if (user.role === "gestor") return [...new Set([user.departmentId, ...user.managedDepartmentIds])];
  return [user.departmentId];
}

function canSeeTicket(user: User, ticket: Ticket) {
  if (user.role === "tic") return true;
  if (ticket.requesterId === user.id || ticket.observerIds.includes(user.id)) return true;
  if (user.role === "gestor") return visibleDepartmentIds(user).includes(ticket.departmentId);
  return false;
}

function visibleTickets() {
  const user = currentUser();
  if (!user) return [];

  return data.tickets
    .filter((ticket) => canSeeTicket(user, ticket))
    .filter((ticket) => ticket.status !== "excluido" || user.role === "tic");
}

function filteredTickets() {
  const search = state.filters.search.trim().toLowerCase();
  return visibleTickets().filter((ticket) => {
    const requester = userById(ticket.requesterId);
    const assigned = userById(ticket.assignedId);
    const haystack = [
      ticket.id.toString(),
      ticket.title,
      ticket.category,
      statusLabels[ticket.status],
      requester?.fullName ?? "",
      assigned?.fullName ?? ""
    ].join(" ").toLowerCase();

    if (state.filters.status !== "todos" && ticket.status !== state.filters.status) return false;
    if (state.filters.priority !== "todas" && ticket.priority !== state.filters.priority) return false;
    if (state.filters.requesterId !== "todos" && ticket.requesterId !== state.filters.requesterId) return false;
    if (state.filters.departmentId !== "todos" && ticket.departmentId !== state.filters.departmentId) return false;
    if (search && !haystack.includes(search)) return false;
    return true;
  });
}

function progressBetween(startValue: string, endValue: string, done = false) {
  if (done) return 100;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

function ticketProgress(ticket: Ticket) {
  const responseDone = Boolean(ticket.responseStartedAt);
  const finished = ["solucionado", "fechado"].includes(ticket.status);
  const responseProgress = progressBetween(ticket.createdAt, ticket.responseDueAt, responseDone);
  const solutionStart = ticket.responseStartedAt ?? ticket.createdAt;
  const solutionProgress = progressBetween(solutionStart, ticket.solutionDueAt, finished);

  return { responseProgress, solutionProgress };
}

function ticketIsCritical(ticket: Ticket) {
  const progress = ticketProgress(ticket);
  const active = !["solucionado", "fechado", "excluido"].includes(ticket.status);
  return active && (ticket.priority === "critica" || progress.responseProgress >= 85 || progress.solutionProgress >= 85);
}

function nextTicketId() {
  return Math.max(1200, ...data.tickets.map((ticket) => ticket.id)) + 1;
}

function addNotification(userId: string, notification: Omit<NotificationItem, "id" | "userId" | "read" | "createdAt">) {
  data.notifications.unshift({
    id: makeId("not"),
    userId,
    read: false,
    createdAt: nowIso(),
    ...notification
  });
}

function notifyTicket(ticket: Ticket, title: string, body: string, includeTic = true) {
  const recipients = new Set<string>([ticket.requesterId, ...ticket.observerIds]);
  if (ticket.assignedId) recipients.add(ticket.assignedId);
  if (includeTic) data.users.filter((user) => user.role === "tic").forEach((user) => recipients.add(user.id));

  recipients.forEach((userId) => {
    addNotification(userId, { ticketId: ticket.id, channel: "email", title, body });
    addNotification(userId, { ticketId: ticket.id, channel: "plataforma", title, body });
  });
}

function maybeBrowserNotify(ticket: Ticket) {
  const user = currentUser();
  if (!user || user.role !== "tic" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(`Novo chamado #${ticket.id}`, {
      body: ticket.title
    });
  }
}

let renderQueued = false;

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  if (!app) return;
  const user = currentUser();
  app.innerHTML = user ? renderShell(user) : renderLogin();
  bindEvents();
}

function renderLogin() {
  return `
    <main class="login-page">
      <section class="login-brand" aria-label="CRQ-12">
        <img class="login-logo" src="/crq12-logo.jpg" alt="CRQ-12" />
        <div>
          <p class="eyebrow">Sistema de Chamados</p>
          <h1>Atendimento TIC</h1>
          <p class="login-copy">CRQ-12</p>
        </div>
        <div class="login-status-grid">
          <span><strong>7</strong> status operacionais</span>
          <span><strong>2 MB</strong> por anexo</span>
          <span><strong>3</strong> perfis de acesso</span>
        </div>
      </section>

      <section class="login-panel">
        <form id="login-form" class="login-form">
          <div class="form-title">
            <span class="section-kicker">Entrada</span>
            <h2>Acessar plataforma</h2>
          </div>
          <label>
            E-mail
            <input id="login-email" type="email" autocomplete="email" value="tic@crq12.org.br" required />
          </label>
          <label>
            Senha
            <input id="login-password" type="password" autocomplete="current-password" value="crq123" required />
          </label>
          <p id="login-error" class="form-error" role="alert"></p>
          <button class="primary-button" type="submit">
            <i data-lucide="log-in"></i>
            Entrar
          </button>
          <div class="demo-access" aria-label="Acessos de teste">
            ${data.users
              .filter((user) => ["usuario@crq12.org.br", "gestor@crq12.org.br", "tic@crq12.org.br"].includes(user.email))
              .map(
                (user) => `
                  <button class="ghost-button demo-login" type="button" data-email="${user.email}">
                    <i data-lucide="${user.role === "tic" ? "shield-check" : user.role === "gestor" ? "users" : "user"}"></i>
                    ${roleLabels[user.role]}
                  </button>
                `
              )
              .join("")}
          </div>
        </form>
      </section>
    </main>
  `;
}

function renderShell(user: User) {
  const unread = data.notifications.filter((notification) => notification.userId === user.id && !notification.read).length;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="/crq12-logo.jpg" alt="CRQ-12" />
          <span>
            <strong>Chamados</strong>
            <small>CRQ-12</small>
          </span>
        </div>

        <div class="profile-block">
          <span class="avatar">${initials(user.fullName)}</span>
          <span>
            <strong>${escapeHtml(user.fullName)}</strong>
            <small>${roleLabels[user.role]} · ${escapeHtml(departmentById(user.departmentId)?.name ?? "")}</small>
          </span>
        </div>

        <nav class="main-nav" aria-label="Navegação principal">
          ${navButton("dashboard", "layout-dashboard", user.role === "tic" ? "Dashboard" : "Resumo")}
          ${navButton("tickets", "list-filter", "Chamados")}
          ${navButton("new-ticket", "square-plus", "Novo chamado")}
          ${user.role !== "usuario" ? navButton("users", "contact-round", "Usuários") : ""}
          ${user.role === "tic" ? navButton("sla", "timer-reset", "SLA") : ""}
          ${navButton("notifications", "bell", `Notificações${unread ? ` (${unread})` : ""}`)}
        </nav>

        <button id="logout-button" class="sidebar-action" type="button">
          <i data-lucide="log-out"></i>
          Sair
        </button>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <span class="section-kicker">${roleLabels[user.role]}</span>
            <h1>${viewTitle(user)}</h1>
          </div>
          <div class="topbar-actions">
            <button id="open-notifications" class="icon-button" type="button" aria-label="Abrir notificações" title="Notificações">
              <i data-lucide="bell"></i>
              ${unread ? `<span class="badge-dot">${unread}</span>` : ""}
            </button>
            <button id="quick-new-ticket" class="primary-button compact" type="button">
              <i data-lucide="square-plus"></i>
              Novo
            </button>
          </div>
        </header>

        <section class="content">
          ${renderView(user)}
        </section>
      </main>
    </div>
  `;
}

function navButton(view: View, icon: string, label: string) {
  return `
    <button class="nav-button ${state.view === view ? "active" : ""}" type="button" data-view="${view}">
      <i data-lucide="${icon}"></i>
      ${label}
    </button>
  `;
}

function viewTitle(user: User) {
  const map: Record<View, string> = {
    dashboard: user.role === "tic" ? "Painel TIC" : "Meus chamados",
    tickets: "Lista de chamados",
    "new-ticket": "Criar chamado",
    users: "Gestão de usuários",
    sla: "Regras de SLA",
    notifications: "Notificações"
  };
  return map[state.view];
}

function renderView(user: User) {
  if (state.view === "dashboard") return renderCleanDashboard(user);
  if (state.view === "tickets") return renderTickets(user);
  if (state.view === "new-ticket") return renderNewTicket(user);
  if (state.view === "users") return renderUsers(user);
  if (state.view === "sla") return renderSla(user);
  return renderNotifications(user);
}

function renderCleanDashboard(user: User) {
  const tickets = visibleTickets();
  const openTickets = tickets.filter((ticket) => !["solucionado", "fechado", "excluido"].includes(ticket.status));
  const inProgress = tickets.filter((ticket) => ["atribuido", "planejado"].includes(ticket.status));
  const closedTickets = tickets.filter((ticket) => ["solucionado", "fechado"].includes(ticket.status));
  const critical = tickets.filter(ticketIsCritical).sort((a, b) => {
    const aProgress = ticketProgress(a).solutionProgress;
    const bProgress = ticketProgress(b).solutionProgress;
    return bProgress - aProgress;
  });

  if (user.role === "tic") {
    return `
      <section class="focus-panel">
        <div>
          <span class="section-kicker">Hoje</span>
          <h2>Fila limpa, foco no que importa.</h2>
          <p>Os detalhes ficam na lista de chamados. Aqui aparecem só os sinais que pedem ação.</p>
        </div>
        <div class="focus-actions">
          <button class="primary-button" data-view="tickets" type="button">
            <i data-lucide="list-filter"></i>
            Ver fila
          </button>
          <button class="ghost-button" data-view="new-ticket" type="button">
            <i data-lucide="square-plus"></i>
            Novo
          </button>
        </div>
      </section>

      <div class="dashboard-grid calm">
        ${metricCard("Novos", tickets.filter((ticket) => ticket.status === "novo").length, "inbox")}
        ${metricCard("Em atendimento", inProgress.length, "activity")}
        ${metricCard("Atenção", critical.length, "triangle-alert", "danger")}
      </div>

      <div class="dashboard-split">
        <section class="panel">
          <div class="panel-header compact-header">
            <div>
              <span class="section-kicker">Prioridade</span>
              <h2>Próximos chamados</h2>
            </div>
          </div>
          <div class="critical-list minimal-list">
            ${critical.length ? critical.slice(0, 3).map(renderCriticalItem).join("") : `<p class="empty-state">Nada crítico agora.</p>`}
          </div>
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

    <div class="dashboard-grid calm">
      ${metricCard("Abertos", openTickets.length, "folder-open")}
      ${metricCard("Pendentes", tickets.filter((ticket) => ticket.status === "pendente").length, "circle-help")}
      ${metricCard("Encerrados", closedTickets.length, "circle-check")}
    </div>

    <div class="dashboard-split">
      <section class="panel">
        <div class="panel-header responsive-header compact-header">
          <div>
            <span class="section-kicker">Status</span>
            <h2>Resumo</h2>
          </div>
          ${user.role === "gestor" ? renderManagerFilters(user) : ""}
        </div>
        ${renderStatusOverview(tickets)}
      </section>

      <section class="panel">
        <div class="panel-header compact-header">
          <div>
            <span class="section-kicker">Recentes</span>
            <h2>Últimos movimentos</h2>
          </div>
        </div>
        ${renderRecentList(tickets.slice(0, 4))}
      </section>
    </div>
  `;
}

function renderStatusOverview(tickets: Ticket[]) {
  const items = [
    { label: "Novos", value: tickets.filter((ticket) => ticket.status === "novo").length, status: "novo" },
    { label: "Em atendimento", value: tickets.filter((ticket) => ["atribuido", "planejado"].includes(ticket.status)).length },
    { label: "Pendentes", value: tickets.filter((ticket) => ticket.status === "pendente").length, status: "pendente" },
    { label: "Encerrados", value: tickets.filter((ticket) => ["solucionado", "fechado"].includes(ticket.status)).length }
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

function renderRecentList(tickets: Ticket[]) {
  if (!tickets.length) return `<p class="empty-state">Nenhum movimento recente.</p>`;

  return `
    <div class="recent-list">
      ${tickets.map((ticket) => `
        <button class="recent-item" type="button" data-open-ticket="${ticket.id}">
          <span>
            <strong>#${ticket.id} · ${escapeHtml(ticket.title)}</strong>
            <small>${formatDate(ticket.updatedAt)}</small>
          </span>
          ${statusPill(ticket.status)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderDashboard(user: User) {
  const tickets = visibleTickets();
  const openTickets = tickets.filter((ticket) => !["solucionado", "fechado", "excluido"].includes(ticket.status));
  const critical = tickets.filter(ticketIsCritical).sort((a, b) => {
    const aProgress = ticketProgress(a).solutionProgress;
    const bProgress = ticketProgress(b).solutionProgress;
    return bProgress - aProgress;
  });

  if (user.role === "tic") {
    return `
      <div class="dashboard-grid">
        ${metricCard("Novo", tickets.filter((ticket) => ticket.status === "novo").length, "inbox")}
        ${metricCard("Em andamento", tickets.filter((ticket) => ["atribuido", "planejado"].includes(ticket.status)).length, "activity")}
        ${metricCard("Críticos", critical.length, "triangle-alert", "danger")}
        ${metricCard("Finalizados", tickets.filter((ticket) => ["solucionado", "fechado"].includes(ticket.status)).length, "circle-check")}
      </div>

      <div class="dashboard-layout">
        <section class="panel wide">
          <div class="panel-header">
            <div>
              <span class="section-kicker">Status</span>
              <h2>Fila operacional</h2>
            </div>
          </div>
          ${renderStatusTiles(tickets)}
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <span class="section-kicker">SLA</span>
              <h2>Quase vencidos</h2>
            </div>
          </div>
          <div class="critical-list">
            ${critical.length ? critical.slice(0, 6).map(renderCriticalItem).join("") : `<p class="empty-state">Nenhum chamado em criticidade.</p>`}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Atendimento</span>
            <h2>Últimos chamados</h2>
          </div>
          <button class="ghost-button" data-view="tickets" type="button">
            <i data-lucide="list-filter"></i>
            Ver lista
          </button>
        </div>
        ${renderCompactTable(tickets.slice(0, 5))}
      </section>
    `;
  }

  return `
    <div class="dashboard-grid">
      ${metricCard("Abertos", openTickets.length, "folder-open")}
      ${metricCard("Pendentes", tickets.filter((ticket) => ticket.status === "pendente").length, "circle-help")}
      ${metricCard("Solucionados", tickets.filter((ticket) => ticket.status === "solucionado").length, "circle-check")}
      ${metricCard("Fechados", tickets.filter((ticket) => ticket.status === "fechado").length, "archive")}
    </div>

    <section class="panel">
      <div class="panel-header responsive-header">
        <div>
          <span class="section-kicker">Chamados</span>
          <h2>${user.role === "gestor" ? "Resumo da equipe" : "Resumo individual"}</h2>
        </div>
        ${user.role === "gestor" ? renderManagerFilters(user) : ""}
      </div>
      ${renderStatusTiles(tickets)}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Atualizações</span>
          <h2>Últimos movimentos</h2>
        </div>
        <button class="ghost-button" data-view="tickets" type="button">
          <i data-lucide="list-filter"></i>
          Ver lista
        </button>
      </div>
      ${renderCompactTable(tickets.slice(0, 6))}
    </section>
  `;
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

function renderManagerFilters(user: User) {
  return `
    <div class="inline-filters">
      <select id="dashboard-department-filter" aria-label="Departamento">
        <option value="todos">Todos os departamentos</option>
        ${visibleDepartmentIds(user)
          .map((departmentId) => `<option value="${departmentId}" ${state.filters.departmentId === departmentId ? "selected" : ""}>${escapeHtml(departmentById(departmentId)?.name ?? "")}</option>`)
          .join("")}
      </select>
      <select id="dashboard-requester-filter" aria-label="Usuário">
        <option value="todos">Todos os usuários</option>
        ${data.users
          .filter((candidate) => visibleDepartmentIds(user).includes(candidate.departmentId))
          .map((candidate) => `<option value="${candidate.id}" ${state.filters.requesterId === candidate.id ? "selected" : ""}>${escapeHtml(candidate.fullName)}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function renderStatusTiles(tickets: Ticket[]) {
  return `
    <div class="status-grid">
      ${statusOrder
        .map((status) => {
          const count = tickets.filter((ticket) => ticket.status === status).length;
          return `
            <button class="status-tile status-${status}" type="button" data-status="${status}">
              <span>${statusLabels[status]}</span>
              <strong>${count}</strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCriticalItem(ticket: Ticket) {
  const progress = ticketProgress(ticket);
  return `
    <button class="critical-item" type="button" data-open-ticket="${ticket.id}">
      <span>
        <strong>#${ticket.id} · ${escapeHtml(ticket.title)}</strong>
        <small>${escapeHtml(departmentById(ticket.departmentId)?.name ?? "")} · ${priorityLabels[ticket.priority]}</small>
      </span>
      ${progressBar(progress.solutionProgress, "Solução")}
    </button>
  `;
}

function renderCompactTable(tickets: Ticket[]) {
  if (!tickets.length) return `<p class="empty-state">Nenhum chamado encontrado.</p>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Título</th>
            <th>Status</th>
            <th>Prioridade</th>
            <th>Atualização</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((ticket) => `
            <tr data-open-ticket="${ticket.id}" tabindex="0">
              <td>#${ticket.id}</td>
              <td>${escapeHtml(ticket.title)}</td>
              <td>${statusPill(ticket.status)}</td>
              <td>${priorityPill(ticket.priority)}</td>
              <td>${formatDate(ticket.updatedAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTickets(user: User) {
  const tickets = filteredTickets().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const selected = tickets.find((ticket) => ticket.id === state.selectedTicketId);
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
        ${selected ? `
          <button class="ghost-button" id="toggle-ticket-detail" type="button">
            <i data-lucide="${detailOpen ? "panel-right-close" : "panel-right-open"}"></i>
            ${detailOpen ? "Fechar painel" : "Abrir detalhes"}
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
          <button id="close-ticket-detail" class="detail-close-button" type="button" aria-label="Fechar painel lateral" title="Fechar painel">
            <i data-lucide="panel-right-close"></i>
          </button>
          ${renderTicketDetail(selected, user)}
        </aside>
      ` : ""}
    </div>
  `;
}

function renderTicketFilters(user: User) {
  const requesters = data.users.filter((candidate) => visibleTickets().some((ticket) => ticket.requesterId === candidate.id));
  return `
    <div class="filter-grid">
      <label>
        ID, título, requerente
        <input id="filter-search" type="search" value="${escapeHtml(state.filters.search)}" />
      </label>
      <label>
        Status
        <select id="filter-status">
          <option value="todos">Todos</option>
          ${statusOrder.map((status) => `<option value="${status}" ${state.filters.status === status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}
        </select>
      </label>
      <label>
        Prioridade
        <select id="filter-priority">
          <option value="todas">Todas</option>
          ${Object.entries(priorityLabels).map(([priority, label]) => `<option value="${priority}" ${state.filters.priority === priority ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label>
        Requerente
        <select id="filter-requester">
          <option value="todos">Todos</option>
          ${requesters.map((candidate) => `<option value="${candidate.id}" ${state.filters.requesterId === candidate.id ? "selected" : ""}>${escapeHtml(candidate.fullName)}</option>`).join("")}
        </select>
      </label>
      <label>
        Departamento
        <select id="filter-department">
          <option value="todos">Todos</option>
          ${visibleDepartmentIds(user).map((departmentId) => `<option value="${departmentId}" ${state.filters.departmentId === departmentId ? "selected" : ""}>${escapeHtml(departmentById(departmentId)?.name ?? "")}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

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
            <th>Tempo para atendimento</th>
            <th>Tempo para solução</th>
            <th>Última atualização</th>
          </tr>
        </thead>
        <tbody>
          ${tickets
            .map((ticket) => {
              const progress = ticketProgress(ticket);
              return `
                <tr class="${state.selectedTicketId === ticket.id ? "selected" : ""}" data-open-ticket="${ticket.id}" tabindex="0">
                  <td>#${ticket.id}</td>
                  <td>
                    <strong>${escapeHtml(ticket.title)}</strong>
                    <small>${escapeHtml(ticket.category)}</small>
                  </td>
                  <td>${statusPill(ticket.status)}</td>
                  <td>${formatDate(ticket.createdAt)}</td>
                  <td>${priorityPill(ticket.priority)}</td>
                  <td>${escapeHtml(userById(ticket.requesterId)?.fullName ?? "")}</td>
                  <td>${escapeHtml(userById(ticket.assignedId)?.fullName ?? "Fila TIC")}</td>
                  <td>${progressBar(progress.responseProgress, "Atendimento")}</td>
                  <td>${progressBar(progress.solutionProgress, "Solução")}</td>
                  <td>${formatDate(ticket.updatedAt)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTicketDetail(ticket: Ticket, user: User) {
  const requester = userById(ticket.requesterId);
  const assigned = userById(ticket.assignedId);
  const observers = ticket.observerIds.map((id) => userById(id)?.fullName).filter(Boolean).join(", ") || "Sem observadores";

  return `
    <div class="detail-header">
      <div>
        <span class="section-kicker">Chamado #${ticket.id}</span>
        <h2>${escapeHtml(ticket.title)}</h2>
      </div>
      ${statusPill(ticket.status)}
    </div>

    <div class="detail-meta">
      <span><strong>Tipo</strong>${ticket.type === "incidente" ? "Incidente" : "Requisição"}</span>
      <span><strong>Categoria</strong>${escapeHtml(ticket.category)}</span>
      <span><strong>Requerente</strong>${escapeHtml(requester?.fullName ?? "")}</span>
      <span><strong>Atribuído</strong>${escapeHtml(assigned?.fullName ?? "Fila TIC")}</span>
      <span><strong>Observadores</strong>${escapeHtml(observers)}</span>
      <span><strong>Departamento</strong>${escapeHtml(departmentById(ticket.departmentId)?.name ?? "")}</span>
    </div>

    <div class="sla-pair">
      ${progressBlock("Atendimento", ticketProgress(ticket).responseProgress, ticket.responseStartedAt ? "Iniciado" : `Prazo ${formatDate(ticket.responseDueAt)}`)}
      ${progressBlock("Solução", ticketProgress(ticket).solutionProgress, ticket.solvedAt ? "Solucionado" : `Prazo ${formatDate(ticket.solutionDueAt)}`)}
    </div>

    <div class="description-block">
      <strong>Descrição</strong>
      <p>${escapeHtml(ticket.description)}</p>
      <div class="attachment-list">
        ${ticket.attachments.length ? ticket.attachments.map((file) => `<span><i data-lucide="paperclip"></i>${escapeHtml(file.name)} · ${formatFileSize(file.size)}</span>`).join("") : `<span>Sem anexos</span>`}
      </div>
    </div>

    ${user.role === "tic" ? renderTicActions(ticket) : ""}

    <form id="comment-form" class="comment-form">
      <label>
        Complementar chamado
        <textarea id="comment-text" rows="3" placeholder="Registrar atualização"></textarea>
      </label>
      <button class="secondary-button" type="submit">
        <i data-lucide="message-square-plus"></i>
        Adicionar
      </button>
    </form>

    <div class="timeline">
      <span class="section-kicker">Histórico</span>
      ${ticket.events
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((item) => `
          <div class="timeline-item">
            <strong>${escapeHtml(item.type)}</strong>
            <p>${escapeHtml(item.message)}</p>
            <small>${escapeHtml(userById(item.actorId)?.fullName ?? "Sistema")} · ${formatDate(item.createdAt)}</small>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderTicActions(ticket: Ticket) {
  const ticUsers = data.users.filter((user) => user.role === "tic" && user.active);
  return `
    <div class="tic-actions">
      <label>
        Responsável
        <select id="ticket-assignee">
          <option value="">Fila TIC</option>
          ${ticUsers.map((user) => `<option value="${user.id}" ${ticket.assignedId === user.id ? "selected" : ""}>${escapeHtml(user.fullName)}</option>`).join("")}
        </select>
      </label>
      <label>
        Prioridade
        <select id="ticket-priority">
          ${Object.entries(priorityLabels).map(([priority, label]) => `<option value="${priority}" ${ticket.priority === priority ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <div class="action-row">
        <button class="secondary-button ticket-action" type="button" data-action="start">
          <i data-lucide="play"></i>
          Inicializar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="plan">
          <i data-lucide="calendar-clock"></i>
          Planejar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="pend">
          <i data-lucide="circle-help"></i>
          Pendenciar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="solve">
          <i data-lucide="circle-check"></i>
          Solucionar
        </button>
        <button class="secondary-button ticket-action" type="button" data-action="close">
          <i data-lucide="archive"></i>
          Fechar
        </button>
        <button class="danger-button ticket-action" type="button" data-action="delete">
          <i data-lucide="trash-2"></i>
          Excluir
        </button>
      </div>
    </div>
  `;
}

function progressBlock(label: string, value: number, detail: string) {
  return `
    <div class="progress-block">
      <span>
        <strong>${label}</strong>
        <small>${detail}</small>
      </span>
      ${progressBar(value, label)}
    </div>
  `;
}

function progressBar(value: number, label: string) {
  const tone = value >= 90 ? "danger" : value >= 70 ? "warn" : "ok";
  return `
    <span class="progress ${tone}" aria-label="${label}: ${value}%">
      <span style="width: ${value}%"></span>
      <em>${value}%</em>
    </span>
  `;
}

function statusPill(status: TicketStatus) {
  return `<span class="pill status-${status}">${statusLabels[status]}</span>`;
}

function priorityPill(priority: Priority) {
  return `<span class="pill priority-${priority}">${priorityLabels[priority]}</span>`;
}

function renderNewTicket(user: User) {
  const observerCandidates = data.users.filter((candidate) => candidate.active && candidate.id !== user.id);
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
              ${categoryOptions.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <label>
            Prioridade
            <select name="priority" required>
              ${Object.entries(priorityLabels).map(([priority, label]) => `<option value="${priority}">${label}</option>`).join("")}
            </select>
          </label>
          <label>
            Observadores
            <select name="observers" multiple>
              ${observerCandidates.map((candidate) => `<option value="${candidate.id}">${escapeHtml(candidate.fullName)}</option>`).join("")}
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
        <label class="file-input">
          Arquivos
          <input name="attachments" type="file" multiple />
          <span id="file-feedback">Máximo de 2 MB por arquivo</span>
        </label>
        <button class="primary-button submit-ticket" type="submit">
          <i data-lucide="send"></i>
          Enviar
        </button>
      </form>
    </section>
  `;
}

function renderUsers(user: User) {
  if (user.role === "usuario") {
    return `<section class="panel"><p class="empty-state">Perfil sem acesso à gestão de usuários.</p></section>`;
  }

  const allowedDepartments = visibleDepartmentIds(user);
  const visibleUsers = user.role === "tic"
    ? data.users
    : data.users.filter((candidate) => allowedDepartments.includes(candidate.departmentId));

  return `
    <div class="users-layout">
      <section class="panel form-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Cadastro</span>
            <h2>Novo usuário</h2>
          </div>
        </div>
        <form id="user-form" class="user-form">
          <label>
            Nome completo
            <input name="fullName" required />
          </label>
          <label>
            Departamento
            <select name="departmentId" required>
              ${allowedDepartments.map((departmentId) => `<option value="${departmentId}">${escapeHtml(departmentById(departmentId)?.name ?? "")}</option>`).join("")}
            </select>
          </label>
          <label>
            Telefone
            <input name="phone" required />
          </label>
          <label>
            E-mail
            <input name="email" type="email" required />
          </label>
          <label>
            Perfil
            <select name="role" ${user.role !== "tic" ? "disabled" : ""}>
              <option value="usuario">Usuário</option>
              <option value="gestor">Gestor</option>
              <option value="tic">TIC</option>
            </select>
          </label>
          <button class="primary-button" type="submit">
            <i data-lucide="user-plus"></i>
            Cadastrar
          </button>
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
                <th>Departamento</th>
                <th>Perfil</th>
                <th>Contato</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${visibleUsers.map((candidate) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(candidate.fullName)}</strong>
                    <small>${escapeHtml(candidate.email)}</small>
                  </td>
                  <td>${escapeHtml(departmentById(candidate.departmentId)?.name ?? "")}</td>
                  <td>${roleLabels[candidate.role]}</td>
                  <td>${escapeHtml(candidate.phone)}</td>
                  <td>
                    <div class="row-actions">
                      <button class="icon-button reset-password" type="button" data-user-id="${candidate.id}" title="Reenviar senha" aria-label="Reenviar senha">
                        <i data-lucide="key-round"></i>
                      </button>
                      <button class="icon-button delete-user" type="button" data-user-id="${candidate.id}" title="Excluir usuário" aria-label="Excluir usuário">
                        <i data-lucide="trash-2"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderSla(user: User) {
  if (user.role !== "tic") {
    return `<section class="panel"><p class="empty-state">Somente TIC pode alterar regras de SLA.</p></section>`;
  }

  return `
    <section class="panel form-panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">SLA</span>
          <h2>Tempo para inicialização e conclusão</h2>
        </div>
      </div>
      <form id="sla-form" class="sla-form">
        <div class="sla-grid">
          ${data.slaRules.map((rule) => `
            <div class="sla-row">
              <strong>${priorityLabels[rule.priority]}</strong>
              <label>
                Iniciar em
                <input name="${rule.priority}-response" type="number" min="0.25" step="0.25" value="${rule.responseHours}" />
              </label>
              <label>
                Concluir em
                <input name="${rule.priority}-solution" type="number" min="0.5" step="0.5" value="${rule.solutionHours}" />
              </label>
            </div>
          `).join("")}
        </div>
        <button class="primary-button" type="submit">
          <i data-lucide="save"></i>
          Salvar SLA
        </button>
      </form>
    </section>
  `;
}

function renderNotifications(user: User) {
  const items = data.notifications.filter((notification) => notification.userId === user.id);
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
          <button id="mark-read" class="ghost-button" type="button">
            <i data-lucide="check-check"></i>
            Marcar lidas
          </button>
        </div>
      </div>
      <div class="notification-list">
        ${items.length
          ? items.map((item) => `
            <button class="notification-item ${item.read ? "" : "unread"}" type="button" ${item.ticketId ? `data-open-ticket="${item.ticketId}"` : ""}>
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function bindEvents() {
  document.querySelector<HTMLFormElement>("#login-form")?.addEventListener("submit", handleLogin);
  document.querySelectorAll<HTMLButtonElement>(".demo-login").forEach((button) => {
    button.addEventListener("click", () => {
      const email = button.dataset.email ?? "";
      const emailInput = document.querySelector<HTMLInputElement>("#login-email");
      const passwordInput = document.querySelector<HTMLInputElement>("#login-password");
      if (emailInput) emailInput.value = email;
      if (passwordInput) passwordInput.value = "crq123";
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view as View | undefined;
      if (!view) return;
      state.view = view;
      if (view === "tickets") {
        state.selectedTicketId = undefined;
        state.ticketDetailOpen = false;
      }
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#logout-button")?.addEventListener("click", () => {
    state.currentUserId = undefined;
    state.view = "dashboard";
    state.ticketDetailOpen = false;
    render();
  });

  document.querySelector<HTMLButtonElement>("#quick-new-ticket")?.addEventListener("click", () => {
    state.view = "new-ticket";
    render();
  });

  document.querySelector<HTMLButtonElement>("#open-notifications")?.addEventListener("click", () => {
    state.view = "notifications";
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.status = button.dataset.status as TicketStatus;
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

  document.querySelectorAll<HTMLElement>("[data-open-ticket]").forEach((item) => {
    item.addEventListener("click", () => openTicket(Number(item.dataset.openTicket)));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") openTicket(Number(item.dataset.openTicket));
    });
  });

  bindFilters();
  bindTicketForms();
  bindTicketDetailResize();
  bindUserForms();
  bindSlaForm();
  bindNotifications();
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

function handleLogin(event: SubmitEvent) {
  event.preventDefault();
  const email = document.querySelector<HTMLInputElement>("#login-email")?.value.trim().toLowerCase() ?? "";
  const password = document.querySelector<HTMLInputElement>("#login-password")?.value ?? "";
  const error = document.querySelector<HTMLParagraphElement>("#login-error");
  const user = data.users.find((candidate) => candidate.email.toLowerCase() === email && candidate.password === password && candidate.active);

  if (!user) {
    if (error) error.textContent = "E-mail ou senha inválidos.";
    return;
  }

  state.currentUserId = user.id;
  state.view = "dashboard";
  state.ticketDetailOpen = false;
  state.filters = {
    status: "todos",
    search: "",
    priority: "todas",
    requesterId: "todos",
    departmentId: "todos"
  };
  render();
}

function openTicket(ticketId: number) {
  const ticket = data.tickets.find((candidate) => candidate.id === ticketId);
  const user = currentUser();
  if (!ticket || !user || !canSeeTicket(user, ticket)) return;
  state.selectedTicketId = ticketId;
  state.view = "tickets";
  state.ticketDetailOpen = true;
  render();
}

function bindFilters() {
  const filterSearch = document.querySelector<HTMLInputElement>("#filter-search");
  let filterInputTimer: number | undefined;
  filterSearch?.addEventListener("input", () => {
    if (filterInputTimer) window.clearTimeout(filterInputTimer);
    filterInputTimer = window.setTimeout(() => {
      state.filters.search = filterSearch.value;
      state.selectedTicketId = undefined;
      state.ticketDetailOpen = false;
      render();
    }, 120);
  });

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
  bindSelect<"todos" | string>("#dashboard-department-filter", (value) => { state.filters.departmentId = value; });
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
}

function bindTicketForms() {
  const fileInput = document.querySelector<HTMLInputElement>('input[name="attachments"]');
  fileInput?.addEventListener("change", () => {
    const feedback = document.querySelector<HTMLSpanElement>("#file-feedback");
    const files = Array.from(fileInput.files ?? []);
    const oversized = files.filter((file) => file.size > MB_2);
    if (!feedback) return;
    if (oversized.length) {
      feedback.textContent = `Arquivo acima de 2 MB: ${oversized.map((file) => file.name).join(", ")}`;
      feedback.classList.add("error");
    } else if (files.length) {
      feedback.textContent = files.map((file) => `${file.name} (${formatFileSize(file.size)})`).join(", ");
      feedback.classList.remove("error");
    } else {
      feedback.textContent = "Máximo de 2 MB por arquivo";
      feedback.classList.remove("error");
    }
  });

  document.querySelector<HTMLFormElement>("#new-ticket-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const fileList = form.querySelector<HTMLInputElement>('input[name="attachments"]')?.files;
    const files = fileList ? Array.from(fileList) : [];
    const oversized = files.find((file) => file.size > MB_2);

    if (oversized) {
      alert(`O arquivo "${oversized.name}" ultrapassa 2 MB.`);
      return;
    }

    const priority = formData.get("priority") as Priority;
    const sla = slaFor(priority);
    const createdAt = nowIso();
    const observerSelect = form.querySelector<HTMLSelectElement>('select[name="observers"]');
    const observerIds = observerSelect ? Array.from(observerSelect.selectedOptions, (option) => option.value) : [];
    const ticket: Ticket = {
      id: nextTicketId(),
      type: formData.get("type") as TicketType,
      category: String(formData.get("category") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      status: "novo",
      priority,
      requesterId: user.id,
      departmentId: user.departmentId,
      observerIds,
      createdAt,
      updatedAt: createdAt,
      responseDueAt: addHours(new Date(createdAt), sla.responseHours),
      solutionDueAt: addHours(new Date(createdAt), sla.solutionHours),
      attachments: files.map((file) => ({ id: makeId("att"), name: file.name, size: file.size })),
      events: [createEvent(user.id, "Criação", "Chamado criado e enviado para a fila TIC.", createdAt)]
    };

    data.tickets.unshift(ticket);
    notifyTicket(ticket, `Chamado #${ticket.id} criado`, `${ticket.title} foi incluído na fila de atendimento.`);
    maybeBrowserNotify(ticket);
    saveData();
    state.view = "tickets";
    state.filters.status = "novo";
    state.selectedTicketId = ticket.id;
    state.ticketDetailOpen = true;
    render();
  });

  document.querySelector<HTMLFormElement>("#comment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = currentUser();
    const ticket = data.tickets.find((candidate) => candidate.id === state.selectedTicketId);
    const text = document.querySelector<HTMLTextAreaElement>("#comment-text")?.value.trim();
    if (!user || !ticket || !text) return;

    ticket.events.push(createEvent(user.id, "Complemento", text));
    ticket.updatedAt = nowIso();
    notifyTicket(ticket, `Chamado #${ticket.id} atualizado`, text);
    saveData();
    render();
  });

  document.querySelector<HTMLSelectElement>("#ticket-assignee")?.addEventListener("change", (event) => {
    updateSelectedTicket((ticket, user) => {
      const select = event.currentTarget as HTMLSelectElement;
      ticket.assignedId = select.value || undefined;
      ticket.updatedAt = nowIso();
      ticket.events.push(eventLog(user.id, "Realocação", `Responsável alterado para ${userById(ticket.assignedId)?.fullName ?? "Fila TIC"}.`));
      notifyTicket(ticket, `Chamado #${ticket.id} realocado`, `Responsável alterado para ${userById(ticket.assignedId)?.fullName ?? "Fila TIC"}.`);
    });
  });

  document.querySelector<HTMLSelectElement>("#ticket-priority")?.addEventListener("change", (event) => {
    updateSelectedTicket((ticket, user) => {
      const select = event.currentTarget as HTMLSelectElement;
      ticket.priority = select.value as Priority;
      const sla = slaFor(ticket.priority);
      ticket.responseDueAt = addHours(new Date(ticket.createdAt), sla.responseHours);
      ticket.solutionDueAt = addHours(new Date(ticket.createdAt), sla.solutionHours);
      ticket.updatedAt = nowIso();
      ticket.events.push(eventLog(user.id, "SLA", `Prioridade alterada para ${priorityLabels[ticket.priority]}.`));
      notifyTicket(ticket, `SLA do chamado #${ticket.id} atualizado`, `Prioridade alterada para ${priorityLabels[ticket.priority]}.`);
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".ticket-action").forEach((button) => {
    button.addEventListener("click", () => handleTicketAction(button.dataset.action ?? ""));
  });
}

function eventLog(actorId: string, type: string, message: string) {
  return createEvent(actorId, type, message, nowIso());
}

function updateSelectedTicket(mutator: (ticket: Ticket, user: User) => void) {
  const user = currentUser();
  const ticket = data.tickets.find((candidate) => candidate.id === state.selectedTicketId);
  if (!user || !ticket || user.role !== "tic") return;
  mutator(ticket, user);
  saveData();
  render();
}

function handleTicketAction(action: string) {
  updateSelectedTicket((ticket, user) => {
    const timestamp = nowIso();
    const updates: Record<string, { status: TicketStatus; type: string; message: string }> = {
      start: { status: "atribuido", type: "Inicialização", message: "TIC inicializou o atendimento do chamado." },
      plan: { status: "planejado", type: "Planejamento", message: "TIC colocou o chamado em atendimento planejado." },
      pend: { status: "pendente", type: "Pendência", message: "TIC solicitou informações adicionais ao requerente." },
      solve: { status: "solucionado", type: "Solução", message: "TIC registrou a conclusão técnica do chamado." },
      close: { status: "fechado", type: "Fechamento", message: "Chamado fechado pela equipe TIC." },
      delete: { status: "excluido", type: "Exclusão", message: "Chamado excluído pela equipe TIC." }
    };
    const update = updates[action];
    if (!update) return;

    ticket.status = update.status;
    ticket.updatedAt = timestamp;
    ticket.assignedId = ticket.assignedId ?? user.id;
    if (action === "start") ticket.responseStartedAt = ticket.responseStartedAt ?? timestamp;
    if (action === "solve") ticket.solvedAt = timestamp;
    if (action === "close") ticket.closedAt = timestamp;
    ticket.events.push(createEvent(user.id, update.type, update.message, timestamp));
    notifyTicket(ticket, `Chamado #${ticket.id}: ${update.type}`, update.message);
  });
}

function bindUserForms() {
  document.querySelector<HTMLFormElement>("#user-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const current = currentUser();
    if (!current || current.role === "usuario") return;
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    if (data.users.some((user) => user.email.toLowerCase() === email)) {
      alert("Já existe um usuário cadastrado com este e-mail.");
      return;
    }

    const role = current.role === "tic" ? (formData.get("role") as Role) : "usuario";
    const user: User = {
      id: makeId("usr"),
      fullName: String(formData.get("fullName") ?? ""),
      departmentId: String(formData.get("departmentId") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email,
      password: "crq-temp",
      role,
      managedDepartmentIds: role === "gestor" ? [String(formData.get("departmentId") ?? "")] : [],
      active: true
    };

    data.users.push(user);
    addNotification(user.id, {
      channel: "email",
      title: "Acesso criado no Sistema de Chamados CRQ-12",
      body: "Senha provisória: crq-temp. Será necessário alterar a senha no primeiro acesso."
    });
    saveData();
    render();
  });

  document.querySelectorAll<HTMLButtonElement>(".reset-password").forEach((button) => {
    button.addEventListener("click", () => {
      const target = userById(button.dataset.userId);
      if (!target) return;
      target.password = "crq-temp";
      addNotification(target.id, {
        channel: "email",
        title: "Nova senha provisória",
        body: "Senha provisória reenviada: crq-temp."
      });
      saveData();
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".delete-user").forEach((button) => {
    button.addEventListener("click", () => {
      const target = userById(button.dataset.userId);
      if (!target) return;
      const typed = prompt(`Digite exatamente o nome para confirmar: ${target.fullName}`);
      if (typed !== target.fullName) return;
      target.active = false;
      saveData();
      render();
    });
  });
}

function bindSlaForm() {
  document.querySelector<HTMLFormElement>("#sla-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    data.slaRules = data.slaRules.map((rule) => ({
      priority: rule.priority,
      responseHours: Number(formData.get(`${rule.priority}-response`) ?? rule.responseHours),
      solutionHours: Number(formData.get(`${rule.priority}-solution`) ?? rule.solutionHours)
    }));

    saveData();
    render();
  });
}

function bindNotifications() {
  document.querySelector<HTMLButtonElement>("#mark-read")?.addEventListener("click", () => {
    const user = currentUser();
    if (!user) return;
    data.notifications.forEach((notification) => {
      if (notification.userId === user.id) notification.read = true;
    });
    saveData();
    render();
  });

  document.querySelector<HTMLButtonElement>("#enable-browser-alerts")?.addEventListener("click", async () => {
    if ("Notification" in window) await Notification.requestPermission();
    render();
  });
}

render();
