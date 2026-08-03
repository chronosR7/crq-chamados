import { describe, expect, it } from 'vitest';
import { getPublicAppUrl } from './app-url';

describe('getPublicAppUrl', () => {
  it('remove barra final da URL configurada', () => {
    expect(getPublicAppUrl('https://chamados.crq12.gov.br/')).toBe('https://chamados.crq12.gov.br');
  });

  it('descarta pesquisa e fragmento de uma URL configurada', () => {
    expect(getPublicAppUrl('https://crq-chamados.pages.dev/?preview=1#login')).toBe('https://crq-chamados.pages.dev');
  });
});

