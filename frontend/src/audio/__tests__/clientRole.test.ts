import { beforeEach, describe, expect, it } from 'vitest';
import { getApiToken, getClientRole, getWebSocketUrl, initClientContext } from '../clientRole';

const TOKEN = 'tok-123';

function setLocation(url: string) {
  window.location.href = url;
}

beforeEach(() => {
  sessionStorage.clear();
  setLocation('http://localhost:3000/');
});

describe('initClientContext', () => {
  it('captures ?token= into sessionStorage and strips it from the address bar', () => {
    setLocation(`http://localhost:3000/?token=${TOKEN}`);
    initClientContext();
    expect(sessionStorage.getItem('rpg_api_token')).toBe(TOKEN);
    expect(window.location.search).toBe('');
    expect(getApiToken()).toBe(TOKEN);
  });

  it('stores the role only for known values', () => {
    setLocation('http://localhost:3000/?role=host');
    initClientContext();
    expect(sessionStorage.getItem('rpg_client_role')).toBe('host');

    sessionStorage.clear();
    setLocation('http://localhost:3000/?role=bogus');
    initClientContext();
    expect(sessionStorage.getItem('rpg_client_role')).toBe(null);
  });

  it('moves the Android #rpg_token fragment into a cookie and clears the hash', () => {
    setLocation('http://localhost:8765/#rpg_token=local-secret');
    initClientContext();
    expect(document.cookie).toContain('rpg_local_token=local-secret');
    expect(window.location.hash).toBe('');
  });
});

describe('getClientRole', () => {
  it('defaults to host on loopback and remote on LAN hosts', () => {
    setLocation('http://127.0.0.1:8000/');
    expect(getClientRole()).toBe('host');
    setLocation('http://localhost:8000/');
    expect(getClientRole()).toBe('host');
    setLocation('http://192.168.0.2:8000/');
    expect(getClientRole()).toBe('remote');
  });

  it('prefers the stored role over the hostname default', () => {
    setLocation('http://localhost:8000/');
    sessionStorage.setItem('rpg_client_role', 'remote');
    expect(getClientRole()).toBe('remote');
  });
});

describe('getWebSocketUrl', () => {
  it('appends role and token query params on ws pages', () => {
    setLocation('http://192.168.0.2:8000/mixer');
    sessionStorage.setItem('rpg_api_token', TOKEN);
    expect(getWebSocketUrl('remote')).toBe(
      `ws://192.168.0.2:8000/ws?role=remote&token=${TOKEN}`
    );
  });

  it('uses wss on https pages and omits a missing token', () => {
    setLocation('https://192.168.0.2:8443/');
    expect(getWebSocketUrl('host')).toBe('wss://192.168.0.2:8443/ws?role=host');
  });
});
