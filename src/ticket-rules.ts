import type { Department, Ticket, User } from './types';

export function authorizedDepartmentIds(user: User, departments: Pick<Department, 'id'>[]) {
  if (user.role === 'tic') return departments.map((department) => department.id);
  return [...new Set([user.departmentId, ...user.managedDepartmentIds].filter(Boolean))];
}

export function userDepartmentMembershipIds(user: User) {
  return [...new Set([user.departmentId, ...user.managedDepartmentIds].filter(Boolean))];
}

export function activeUsersForDepartment(users: User[], allowedDepartmentIds: string[], selectedDepartmentId: string | 'todos') {
  return users.filter((user) => user.active !== false).filter((user) => {
    const memberships = userDepartmentMembershipIds(user);
    if (!memberships.some((departmentId) => allowedDepartmentIds.includes(departmentId))) return false;
    return selectedDepartmentId === 'todos' || memberships.includes(selectedDepartmentId);
  });
}

export function canUserSeeTicket(user: User, ticket: Ticket, departments: Pick<Department, 'id'>[]) {
  if (user.role === 'tic') return true;
  if (ticket.requesterId === user.id || ticket.observerIds.includes(user.id) || ticket.assignedId === user.id) return true;
  return user.role === 'gestor' && authorizedDepartmentIds(user, departments).includes(ticket.departmentId);
}

export function canManagerDeleteUser(manager: User, target: User, departments: Pick<Department, 'id'>[]) {
  if (manager.role !== 'gestor' || target.role !== 'usuario' || manager.id === target.id) return false;
  const allowed = new Set(authorizedDepartmentIds(manager, departments));
  const targetDepartments = [...new Set([target.departmentId, ...target.managedDepartmentIds].filter(Boolean))];
  return targetDepartments.length > 0 && targetDepartments.every((departmentId) => allowed.has(departmentId));
}

export function reportRangeError(startValue: string, endValue: string) {
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T23:59:59.999`);
  if (!startValue || !endValue || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Informe um período válido.';
  if (end < start) return 'A data final não pode ser anterior à data inicial.';
  if ((end.getTime() - start.getTime()) / 86_400_000 > 31) return 'Selecione um período de no máximo 31 dias.';
  return null;
}
