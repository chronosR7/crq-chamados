/**
 * Retorna a URL pública usada em links enviados por e-mail.
 *
 * Em produção, VITE_APP_URL deve apontar para o domínio oficial. Durante o
 * desenvolvimento, a origem aberta no navegador é usada automaticamente.
 */
export function getPublicAppUrl(configuredUrl = import.meta.env.VITE_APP_URL): string {
  const fallback = typeof window !== 'undefined' ? window.location.origin : '';
  const candidate = configuredUrl?.trim() || fallback;

  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback.replace(/\/$/, '');
  }
}

