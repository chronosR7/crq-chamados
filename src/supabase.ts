import { createClient } from '@supabase/supabase-js';
import { createUuid } from './id';
import { validateAttachment } from './files';
import type { AppData, Attachment, Channel, Department, KnowledgeTutorial, NotificationItem, Priority, Role, Ticket, TicketEvent, TicketStatus, TicketType, User } from './types';

// Carrega as chaves de conexão com o Supabase a partir do arquivo de ambiente (.env)
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Registra mensagens apenas em ambiente de desenvolvimento para evitar poluir o console em produção
function devWarn(...args: any[]) {
  if (import.meta.env.DEV) console.warn(...args);
}

function devError(...args: any[]) {
  if (import.meta.env.DEV) console.error(...args);
}

// Configurações de autenticação e manutenção de sessão ativa
export function getSupabaseAuthOptions() {
  return {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  };
}

// Inicializa a conexão com o cliente do Supabase
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: getSupabaseAuthOptions()
    })
  : null;

// Verifica se o serviço do Supabase está ativo e configurado
export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function loadKnowledgeTutorials(): Promise<KnowledgeTutorial[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('knowledge_tutorials').select('*').order('category').order('title');
  if (error) {
    // A aplicação continua utilizável antes da execução da migração específica.
    devWarn('Base de Conhecimento ainda não disponível no Supabase.', error.message);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    icon: row.icon || 'book-open',
    roles: Array.isArray(row.audience_roles) ? row.audience_roles as Role[] : [],
    steps: Array.isArray(row.steps) ? row.steps : [],
    published: row.published === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function saveKnowledgeTutorial(tutorial: KnowledgeTutorial) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const payload = {
    id: tutorial.id,
    title: tutorial.title,
    summary: tutorial.summary,
    category: tutorial.category,
    icon: tutorial.icon,
    audience_roles: tutorial.roles,
    steps: tutorial.steps,
    published: tutorial.published
  };
  const { data, error } = await supabase.from('knowledge_tutorials').upsert(payload).select('*').single();
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01' || error.message.includes('knowledge_tutorials')) {
      throw new Error('A Base de Conhecimento ainda não foi instalada no banco. Execute o arquivo supabase-knowledge-base.sql no SQL Editor do Supabase.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteKnowledgeTutorial(id: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('knowledge_tutorials').delete().eq('id', id);
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01' || error.message.includes('knowledge_tutorials')) {
      throw new Error('A Base de Conhecimento ainda não foi instalada no banco. Execute o arquivo supabase-knowledge-base.sql no SQL Editor do Supabase.');
    }
    throw new Error(error.message);
  }
}

// Converte variações de nomes dos canais de notificação para o padrão do sistema
export function normalizeChannel(value: string): Channel {
  if (value === 'platforma' || value === 'plataforma') return 'plataforma';
  if (value === 'browser' || value === 'navegador') return 'navegador';
  return 'plataforma';
}

export function toSupabaseChannel(channel: Channel) {
  return channel === 'plataforma' ? 'plataforma' : 'navegador';
}

/**
 * Busca todos os registros do banco de dados remoto (setores, usuários, chamados, histórico e notificações).
 */
export async function loadDataFromSupabase(): Promise<AppData | null> {
  if (!supabase) return null;

  try {
    const [
      { data: depts, error: deptError },
      { data: users, error: userError },
      { data: tickets, error: ticketError },
      { data: notifications, error: notifError },
      eventsRes,
      attachmentsRes
    ] = await Promise.all([
      supabase.from('departments').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('tickets').select('*'),
      supabase.from('notifications').select('*'),
      supabase.from('ticket_events').select('*'),
      supabase.from('ticket_attachments').select('*')
    ]);

    if (deptError || userError || ticketError || notifError) {
      throw new Error('Erro ao carregar dados do Supabase.');
    }

    const ticketEvents = eventsRes.error ? [] : eventsRes.data;
    const ticketAttachments = attachmentsRes.error ? [] : attachmentsRes.data;

    const departments: Department[] = (depts ?? []).map((d: any) => ({ id: d.id, name: d.name }));
    const usersMapped: User[] = (users ?? []).map((u: any) => {
      const approved = u.approved_by_tic === true;
      const isPending = !approved && (u.pending_approval === true || u.requested_role != null);
      const isActive = u.active !== false;
      return {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        role: u.role as Role,
        departmentId: u.department_id,
        managedDepartmentIds: u.managed_department_ids || [],
        // `approved_by_tic` registra quem aprovou o perfil, mas jamais deve
        // reativar alguém que a função administrativa já desativou.
        active: isActive && !isPending,
        pendingApproval: isPending,
        requestedRole: (u.requested_role as Role) || undefined,
        approvedByTic: approved,
        onboardingCompletedAt: u.onboarding_completed_at || undefined,
        avatarUrl: u.avatar_url || undefined
        ,mustChangePassword: u.must_change_password === true
      };
    });

    const eventsByTicket = (ticketEvents ?? []).reduce((acc: any, e: any) => {
      if (!acc[e.ticket_id]) acc[e.ticket_id] = [];
      acc[e.ticket_id].push({
        id: e.id,
        ticketId: e.ticket_id,
        actorId: e.actor_id,
        type: e.event_type as TicketEvent['type'],
        message: e.message || undefined,
        createdAt: e.created_at
      });
      return acc;
    }, {});

    const attachmentsByTicket: Record<number, Attachment[]> = {};
    const signedAttachments = await Promise.all((ticketAttachments ?? []).map(async (a: any) => {
      const { data: signed } = await supabase.storage.from('ticket-attachments').createSignedUrl(a.storage_path, 3600);
      const ticketId = Number(a.ticket_id);
      const attachment: Attachment = {
        id: a.id,
        name: a.file_name,
        size: a.file_size_bytes,
        url: signed?.signedUrl || undefined,
        type: a.mime_type || undefined,
        eventId: a.event_id || undefined
      };
      return { ticketId, attachment };
    }));

    for (const { ticketId, attachment } of signedAttachments) {
      if (!attachmentsByTicket[ticketId]) attachmentsByTicket[ticketId] = [];
      attachmentsByTicket[ticketId].push(attachment);
    }
    const ticketsMapped: Ticket[] = (tickets ?? []).map((t: any) => ({
      id: t.id,
      type: t.type as TicketType,
      category: t.category,
      title: t.title,
      description: t.description,
      status: t.status as TicketStatus,
      priority: t.priority as Priority,
      requesterId: t.requester_id,
      departmentId: t.department_id,
      assignedId: t.assigned_id,
      observerIds: t.observer_ids || [],
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      responseStartedAt: t.response_started_at,
      solvedAt: t.solved_at,
      closedAt: t.closed_at,
      plannedFor: t.planned_for,
      plannedNotificationSent: t.planned_notification_sent,
      pendingStartedAt: t.pending_started_at,
      totalPendingMs: Number(t.total_pending_ms || 0),
      statusBeforeDelete: (t.status_before_delete as TicketStatus) || undefined,
      events: eventsByTicket[t.id] || [],
      attachments: attachmentsByTicket[t.id] || []
    }));


    const notificationsMapped: NotificationItem[] = (notifications ?? []).map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      ticketId: n.ticket_id,
      channel: normalizeChannel(String(n.channel ?? 'plataforma')),
      title: n.title,
      body: n.body,
      read: n.read === true,
      createdAt: n.created_at
    }));

    return {
      version: 1,
      departments,
      users: usersMapped,
      tickets: ticketsMapped,
      notifications: notificationsMapped
    };
  } catch (err) {
    devError('Falha ao carregar dados do Supabase.', err);
    return null;
  }
}

/**
 * Salva as alterações da aplicação de volta para as tabelas do Supabase.
 */
export async function saveDataToSupabase(data: AppData) {
  if (!supabase) throw new Error('Supabase não configurado.');

    // Nunca sincronize tabelas globais por "espelhamento" do navegador. A RLS pode
    // ocultar linhas legítimas e fazer o cliente interpretá-las como excluídas.
    // Perfis, departamentos e chamados são persistidos por operações atômicas próprias.
    const { data: authData } = await supabase.auth.getUser();
    const currentAuthId = authData.user?.id;
    const ticketEventsRows = data.tickets.flatMap(ticket => ticket.events
      .filter(event => event.actorId === currentAuthId)
      .map(event => ({
      id: event.id,
      ticket_id: ticket.id,
      actor_id: event.actorId,
      event_type: event.type,
      message: event.message,
      created_at: event.createdAt
    })));

    if (ticketEventsRows.length) {
      const { error: eventsError } = await supabase.from('ticket_events').upsert(ticketEventsRows, { onConflict: 'id', ignoreDuplicates: true });
      if (eventsError) throw new Error(`Não foi possível sincronizar o histórico: ${eventsError.message}`);
    }

    // Notificações têm fluxo próprio: criação pontual, marcação como lida e exclusão.
    // Reenviar a lista inteira aqui pode tentar recriar avisos antigos ligados a
    // chamados já removidos, violando a chave estrangeira notifications.ticket_id.
}

function ticketPayload(ticket: Ticket) {
  const clearingPreviousStatus = ticket.events[ticket.events.length - 1]?.type === 'Restauração';
  return {
    type: ticket.type,
    category: ticket.category,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    requester_id: ticket.requesterId,
    department_id: ticket.departmentId,
    assigned_id: ticket.assignedId || null,
    observer_ids: ticket.observerIds,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    response_started_at: ticket.responseStartedAt || null,
    solved_at: ticket.solvedAt || null,
    closed_at: ticket.closedAt || null,
    planned_for: ticket.plannedFor || null,
    planned_notification_sent: ticket.plannedNotificationSent || false,
    pending_started_at: ticket.pendingStartedAt || null,
    total_pending_ms: ticket.totalPendingMs || 0,
    ...(ticket.statusBeforeDelete !== undefined || clearingPreviousStatus
      ? { status_before_delete: ticket.statusBeforeDelete ?? null }
      : {})
  };
}

/** Cria o chamado no banco e deixa a sequence gerar um ID global sem colisões. */
export async function createTicketInSupabase(ticket: Ticket): Promise<number | null> {
  if (!supabase) return null;
  const { data: created, error } = await supabase
    .from('tickets')
    .insert(ticketPayload(ticket))
    .select('id')
    .single();
  if (error || !created) {
    devError('Erro ao criar chamado no Supabase:', error?.code, error?.message, error?.details, error?.hint);
    return null;
  }
  return Number(created.id);
}

/** Atualiza somente um chamado existente; nunca substitui a coleção inteira. */
export async function updateTicketInSupabase(ticket: Ticket) {
  if (!supabase) return false;
  const { error } = await supabase.rpc('update_ticket_secure', {
    p_ticket_id: ticket.id,
    p_patch: ticketPayload(ticket)
  });
  if (error) devError(`Erro ao atualizar chamado #${ticket.id}:`, error);
  return !error;
}

/** Conclui o perfil recém-criado sem permitir alterações posteriores de departamento ou papel. */
export async function completeOwnProfileInSupabase(input: {
  fullName: string;
  departmentId: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('complete_own_profile', {
    p_full_name: input.fullName,
    p_department_id: input.departmentId
  });
  if (error) throw new Error(error.message);
}

export async function createTicketEventInSupabase(ticketId: number, event: TicketEvent) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('ticket_events').insert({
    id: event.id,
    ticket_id: ticketId,
    actor_id: event.actorId,
    event_type: event.type,
    message: event.message,
    created_at: event.createdAt
  });
  if (error) throw new Error(error.message);
}

export async function createNotificationsInSupabase(notifications: NotificationItem[]) {
  if (!supabase || notifications.length === 0) return;
  const { error } = await supabase.from('notifications').insert(notifications.map((notification) => ({
    id: notification.id,
    user_id: notification.userId,
    ticket_id: notification.ticketId || null,
    channel: toSupabaseChannel(notification.channel),
    title: notification.title,
    body: notification.body,
    read: false,
    created_at: notification.createdAt
  })));
  if (error) throw new Error(error.message);
}

export async function markNotificationsReadInSupabase(notificationIds: string[]) {
  if (!supabase || notificationIds.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', notificationIds);
  if (error) throw new Error(error.message);
}

export async function uploadTicketAttachments(ticketId: number, files: File[], eventId?: string): Promise<Attachment[]> {
  if (!supabase || files.length === 0) return [];
  const { data: auth } = await supabase.auth.getUser();
  const uploaded: Attachment[] = [];
  for (const file of files) {
    if (validateAttachment(file)) continue;
    const id = createUuid();
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${ticketId}/${id}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('ticket-attachments').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (uploadError) {
      devError(`Erro no upload de ${file.name}:`, uploadError);
      continue;
    }
    const { error: metadataError } = await supabase.from('ticket_attachments').insert({
      id,
      ticket_id: ticketId,
      event_id: eventId || null,
      uploaded_by: auth.user?.id || null,
      file_name: file.name,
      file_size_bytes: file.size,
      storage_path: storagePath,
      mime_type: file.type || null
    });
    if (metadataError) {
      await supabase.storage.from('ticket-attachments').remove([storagePath]);
      devError(`Erro ao registrar anexo ${file.name}:`, metadataError);
      continue;
    }
    const { data: signed } = await supabase.storage.from('ticket-attachments').createSignedUrl(storagePath, 3600);
    uploaded.push({ id, name: file.name, size: file.size, type: file.type, url: signed?.signedUrl, eventId });
  }
  return uploaded;
}

// Apaga um chamado específico no Supabase juntamente com seu histórico e anexos
export async function deleteTicketFromSupabase(ticketId: number) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data: attachments, error: attachmentsError } = await supabase
    .from('ticket_attachments').select('storage_path').eq('ticket_id', ticketId);
  if (attachmentsError) throw new Error(attachmentsError.message);
  const paths = (attachments ?? []).map((item) => item.storage_path).filter(Boolean);
  const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
  if (error) throw new Error(error.message);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('ticket-attachments').remove(paths);
    if (storageError) devWarn(`Chamado #${ticketId} excluído, mas alguns arquivos órfãos precisam de limpeza:`, storageError.message);
  }
}

// Remove do banco todos os chamados que foram movidos para a lixeira
export async function emptyTrashInSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data: trashTickets, error: listError } = await supabase.from('tickets').select('id').eq('status', 'excluido');
  if (listError) throw new Error(listError.message);
  if (!trashTickets?.length) return;
  const ids = trashTickets.map((ticket) => ticket.id);
  const { data: attachments, error: attachmentError } = await supabase.from('ticket_attachments').select('storage_path').in('ticket_id', ids);
  if (attachmentError) throw new Error(attachmentError.message);
  const paths = (attachments ?? []).map((item) => item.storage_path).filter(Boolean);
  const { error } = await supabase.from('tickets').delete().in('id', ids);
  if (error) throw new Error(error.message);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('ticket-attachments').remove(paths);
    if (storageError) devWarn('Lixeira esvaziada, mas alguns arquivos órfãos precisam de limpeza:', storageError.message);
  }
}

// Exclui um setor/departamento no banco remoto
export async function deleteDepartmentFromSupabase(deptId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('departments').delete().eq('id', deptId);
  if (error) throw new Error(error.message);
}

// Remove o perfil do usuário e limpa o histórico de notificações e ações associadas a ele
export async function deleteUserFromSupabase(userId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'delete', userId }
  });
  if (error) throw new Error(await managedUserFunctionError(error));
  if (data?.error) throw new Error(data.error);
  if (data?.success !== true) throw new Error('O servidor não confirmou a exclusão do usuário.');
  return data;
}

export async function createUserInSupabase(input: {
  fullName: string;
  email: string;
  role: Role;
  departmentIds: string[];
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'create', ...input }
  });
  if (error) throw new Error(await managedUserFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createTemporaryPasswordInSupabase(userId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'reset-password', userId }
  });
  if (error) throw new Error(await managedUserFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return String(data?.temporaryPassword ?? '');
}

export async function updateManagedUserInSupabase(input: {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  departmentIds: string[];
  active?: boolean;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'update', ...input }
  });
  if (error) throw new Error(await managedUserFunctionError(error));
  if (data?.error) throw new Error(data.error);
  if (data?.success !== true) throw new Error('O servidor não confirmou a atualização do usuário.');
  return data;
}

async function managedUserFunctionError(error: any): Promise<string> {
  try {
    const context = error?.context;
    if (context && typeof context.clone === 'function') {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    }
  } catch (_) {}
  const message = String(error?.message ?? '');
  if (/failed to send|fetch|network/i.test(message)) {
    return 'A função administrativa manage-user ainda não está publicada ou não está acessível neste projeto Supabase.';
  }
  return message || 'Não foi possível executar a administração de usuários no Supabase.';
}

// Exclui todas as notificações registradas para um usuário no banco
export async function deleteUserNotificationsFromSupabase(userId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw new Error(`Não foi possível excluir as notificações: ${error.message}`);
}
