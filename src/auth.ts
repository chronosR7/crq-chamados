import type { Role } from './types';

/** Nome apresentado na interface para cada nível de acesso. */
export function getRoleLabel(role: Role) {
  return {
    usuario: 'Usuário',
    gestor: 'Gestor',
    tic: 'TIC'
  }[role];
}
