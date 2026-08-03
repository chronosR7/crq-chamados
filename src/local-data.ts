import type { AppData, Department, NotificationItem, Ticket, User } from './types';

/**
 * Cria a estrutura inicial com as listas vazias prontas para uso.
 */
export function createInitialData(): AppData {
  const departments: Department[] = [];
  const users: User[] = [];
  const notifications: NotificationItem[] = [];
  const tickets: Ticket[] = [];

  return { version: 1, departments, users, tickets, notifications };
}
