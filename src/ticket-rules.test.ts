import { describe, expect, it } from 'vitest';
import { activeUsersForDepartment, authorizedDepartmentIds, canManagerDeleteUser, canUserSeeTicket, reportRangeError } from './ticket-rules';
import type { Ticket, User } from './types';

const departments = [{ id: 'tic' }, { id: 'compras' }, { id: 'financeiro' }];
const user = (overrides: Partial<User>): User => ({
  id: 'u1', fullName: 'Pessoa', email: 'pessoa@crq12.org.br', role: 'usuario',
  departmentId: 'compras', managedDepartmentIds: [], active: true, ...overrides
});
const ticket = (overrides: Partial<Ticket>): Ticket => ({
  id: 1, type: 'incidente', category: 'Outros', title: 'Teste', description: 'Teste',
  status: 'novo', priority: 'media', requesterId: 'requester', departmentId: 'compras',
  observerIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  attachments: [], events: [], ...overrides
});

describe('ticket access rules', () => {
  it('allows TIC to see every department and ticket', () => {
    const tic = user({ role: 'tic', departmentId: 'tic' });
    expect(authorizedDepartmentIds(tic, departments)).toEqual(['tic', 'compras', 'financeiro']);
    expect(canUserSeeTicket(tic, ticket({ departmentId: 'financeiro' }), departments)).toBe(true);
  });

  it('allows managers only in linked departments', () => {
    const manager = user({ role: 'gestor', departmentId: 'compras', managedDepartmentIds: ['financeiro'] });
    expect(canUserSeeTicket(manager, ticket({ departmentId: 'financeiro' }), departments)).toBe(true);
    expect(canUserSeeTicket(manager, ticket({ departmentId: 'tic' }), departments)).toBe(false);
  });

  it('allows requester, observer and assignee independently of department', () => {
    const common = user({ id: 'person', departmentId: 'compras' });
    expect(canUserSeeTicket(common, ticket({ requesterId: 'person', departmentId: 'tic' }), departments)).toBe(true);
    expect(canUserSeeTicket(common, ticket({ observerIds: ['person'], departmentId: 'tic' }), departments)).toBe(true);
    expect(canUserSeeTicket(common, ticket({ assignedId: 'person', departmentId: 'tic' }), departments)).toBe(true);
  });
});

describe('manager user administration', () => {
  const manager = user({ id: 'manager', role: 'gestor', managedDepartmentIds: ['financeiro'] });

  it('allows deletion only when every target department is managed', () => {
    expect(canManagerDeleteUser(manager, user({ id: 'target', departmentId: 'compras', managedDepartmentIds: ['financeiro'] }), departments)).toBe(true);
    expect(canManagerDeleteUser(manager, user({ id: 'target', departmentId: 'compras', managedDepartmentIds: ['tic'] }), departments)).toBe(false);
  });

  it('never allows a manager to delete another manager or TIC', () => {
    expect(canManagerDeleteUser(manager, user({ id: 'target', role: 'gestor' }), departments)).toBe(false);
    expect(canManagerDeleteUser(manager, user({ id: 'target', role: 'tic' }), departments)).toBe(false);
  });
});

describe('report period limits', () => {
  it('accepts a monthly period and rejects reversed or excessive periods', () => {
    expect(reportRangeError('2026-08-01', '2026-08-31')).toBeNull();
    expect(reportRangeError('2026-08-10', '2026-08-01')).toContain('anterior');
    expect(reportRangeError('2026-06-01', '2026-08-01')).toContain('31 dias');
  });
});

describe('dashboard requester filters', () => {
  const users = [
    user({ id: 'active-compras', fullName: 'Compras', departmentId: 'compras', active: true }),
    user({ id: 'active-multi', fullName: 'Multi', departmentId: 'financeiro', managedDepartmentIds: ['compras'], active: true }),
    user({ id: 'inactive', fullName: 'Antigo', departmentId: 'compras', active: false }),
    user({ id: 'other', fullName: 'TIC', departmentId: 'tic', active: true })
  ];

  it('lists active department members even when they have no tickets', () => {
    expect(activeUsersForDepartment(users, ['compras', 'financeiro'], 'compras').map((item) => item.id))
      .toEqual(['active-compras', 'active-multi']);
  });

  it('lists every active authorized member for the general view', () => {
    expect(activeUsersForDepartment(users, ['compras', 'financeiro'], 'todos').map((item) => item.id))
      .toEqual(['active-compras', 'active-multi']);
  });
});
