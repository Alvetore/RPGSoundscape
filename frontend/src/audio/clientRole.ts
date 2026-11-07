export type ClientRole = 'host' | 'remote';

const ROLE_KEY = 'rpg_client_role';
const TOKEN_KEY = 'rpg_api_token';

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Capture ?token= and ?role= once at startup. The desktop app is the
 * authoritative player; phones/tablets on a LAN IP default to remote.
 * The token is removed from the address bar but kept in sessionStorage.
 */
export function initClientContext(): void {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  const role = url.searchParams.get('role');

  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    url.searchParams.delete('token');
  }
  if (role === 'host' || role === 'remote') {
    sessionStorage.setItem(ROLE_KEY, role);
  }
  if (token || role) {
    const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }
}

export function getApiToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('token');
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function getClientRole(): ClientRole {
  const stored = sessionStorage.getItem(ROLE_KEY);
  if (stored === 'host' || stored === 'remote') {
    return stored;
  }
  return isLoopbackHost(window.location.hostname) ? 'host' : 'remote';
}

export function getWebSocketUrl(role: ClientRole): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ role });
  const token = getApiToken();
  if (token) {
    params.set('token', token);
  }
  return `${protocol}//${window.location.host}/ws?${params.toString()}`;
}
