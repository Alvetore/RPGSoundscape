import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteSoundEngine } from '../RemoteEngine';

class FakeWebSocket {
  // The engine compares readyState against these static constants.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

let engine: RemoteSoundEngine | null = null;

function currentSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error('no websocket was created');
  return socket;
}

beforeEach(() => {
  sessionStorage.clear();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  engine?.destroy();
  engine = null;
  vi.unstubAllGlobals();
});

describe('RemoteSoundEngine', () => {
  it('connects to the /ws endpoint in the remote role', () => {
    engine = new RemoteSoundEngine(16);
    expect(currentSocket().url).toBe('ws://localhost:3000/ws?role=remote');
  });

  it('forwards user actions as command frames and updates channels optimistically', () => {
    engine = new RemoteSoundEngine(16);
    const socket = currentSocket();
    socket.open();

    engine.setVolume(0, 0.5);
    expect(socket.sent).toContain(
      JSON.stringify({ type: 'command', command: { type: 'setVolume', slotIndex: 0, volume: 0.5 } })
    );
    expect(engine.getStates()[0].volume).toBe(0.5);

    engine.loadTrackToSlot(1, { id: 't1', title: 'Rain', filename: 'rain.mp3' }, false);
    expect(socket.sent).toContain(
      JSON.stringify({
        type: 'command',
        command: {
          type: 'loadTrackToSlot',
          slotIndex: 1,
          track: { id: 't1', title: 'Rain', filename: 'rain.mp3' },
          autoPlay: false,
        },
      })
    );
    expect(engine.getStates()[1].title).toBe('Rain');
  });

  it('queues commands while offline and flushes them once the socket opens', () => {
    engine = new RemoteSoundEngine(16);
    const socket = currentSocket();

    engine.loadTrackToSlot(0, { id: 't1', title: 'Rain', filename: 'rain.mp3' }, false);
    expect(socket.sent).toEqual([]);

    socket.open();
    const frames = socket.sent.map((raw) => JSON.parse(raw));
    expect(frames[0]).toEqual({
      type: 'command',
      command: {
        type: 'loadTrackToSlot',
        slotIndex: 0,
        track: { id: 't1', title: 'Rain', filename: 'rain.mp3' },
        autoPlay: false,
      },
    });
    // The current state is requested right after the backlog.
    expect(frames[frames.length - 1]).toEqual({ type: 'request_state' });
  });

  it('applies the authoritative state published by the desktop host', () => {
    engine = new RemoteSoundEngine(16);
    const socket = currentSocket();
    socket.open();

    socket.message({
      type: 'state',
      state: {
        channels: [{ id: 0, title: 'Campfire', isPlaying: true, volume: 0.2 }],
        masterVolume: 0.4,
        masterMuted: true,
      },
    });

    expect(engine.getStates()[0]).toMatchObject({ title: 'Campfire', isPlaying: true, volume: 0.2 });
    expect(engine.getMasterVolume()).toBe(0.4);
    expect(engine.getMasterMuted()).toBe(true);
  });

  it('tracks host connectivity and notifies subscribers on state changes', () => {
    engine = new RemoteSoundEngine(16);
    const socket = currentSocket();
    socket.open();

    const seen: number[] = [];
    engine.subscribe((channels) => seen.push(channels.length));

    socket.message({ type: 'host_status', connected: true });
    expect(engine.isHostConnected()).toBe(true);
    socket.message({ type: 'host_status', connected: false });
    expect(engine.isHostConnected()).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('reconnects two seconds after the socket drops', () => {
    vi.useFakeTimers();
    try {
      engine = new RemoteSoundEngine(16);
      const first = currentSocket();
      first.open();
      expect(FakeWebSocket.instances.length).toBe(1);

      first.readyState = FakeWebSocket.CLOSED;
      first.onclose?.();
      expect(FakeWebSocket.instances.length).toBe(1); // not before the delay

      vi.advanceTimersByTime(2000);
      expect(FakeWebSocket.instances.length).toBe(2);
      expect(FakeWebSocket.instances[1].url).toBe(first.url);
    } finally {
      vi.useRealTimers();
    }
  });
});
