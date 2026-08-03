import { describe, expect, it } from 'vitest';
import { createInitialData } from './local-data';
import { getSupabaseAuthOptions } from './supabase';

describe('createInitialData', () => {
  it('inicia sem contas ou dados fictícios', () => {
    const data = createInitialData();
    expect(data.users).toHaveLength(0);
    expect(data.tickets).toHaveLength(0);
    expect(data.notifications).toHaveLength(0);
    expect(data.departments).toHaveLength(0);
  });
});

describe('getSupabaseAuthOptions', () => {
  it('mantém a sessão após recarregar a página', () => {
    expect(getSupabaseAuthOptions()).toMatchObject({
      persistSession: true,
      autoRefreshToken: true
    });
  });
});
