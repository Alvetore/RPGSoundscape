export type AndroidMode = 'local' | 'remote';

interface RPGAndroidBridge {
  getMode(): string;
  getVersion(): string;
  scanRemote(): void;
  scanTransfer(): void;
  connectRemote(url: string): void;
  openLocal(): void;
}

declare global {
  interface Window {
    RPGAndroid?: RPGAndroidBridge;
  }
}

export function isAndroidShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.RPGAndroid);
}

export function getAndroidMode(): AndroidMode {
  try {
    return window.RPGAndroid?.getMode() === 'remote' ? 'remote' : 'local';
  } catch {
    return 'local';
  }
}

export function isAndroidLocalMode(): boolean {
  return isAndroidShell() && getAndroidMode() === 'local';
}

export function scanAndroidRemote(): void {
  window.RPGAndroid?.scanRemote();
}

export function scanAndroidTransfer(): void {
  window.RPGAndroid?.scanTransfer();
}

export function connectAndroidRemote(url: string): void {
  window.RPGAndroid?.connectRemote(url);
}

export function returnToAndroidLibrary(): void {
  window.RPGAndroid?.openLocal();
}
