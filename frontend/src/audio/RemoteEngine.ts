// RemoteSoundEngine.ts - LAN client proxy for the authoritative desktop player.

import type { ChannelState, ISoundEngine, TrackInput } from './SoundEngine';
import type { PresetSlot } from '../types';
import { getWebSocketUrl } from './clientRole';

type Command = Record<string, unknown>;

const emptyChannel = (id: number): ChannelState => ({
  id,
  trackId: null,
  title: `Слот ${id + 1}`,
  filename: null,
  isPlaying: false,
  volume: 0.7,
  loop: true,
  pan: 0,
  playbackRate: 1,
  isMuted: false,
  isSolo: false,
  currentTime: 0,
  duration: 0,
  audioLevel: 0,
});

export class RemoteSoundEngine implements ISoundEngine {
  private channels: ChannelState[];
  private listeners: Array<(channels: ChannelState[]) => void> = [];
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: string[] = [];
  private masterVolume = 0.8;
  private masterMuted = false;
  private hostConnected = false;
  private destroyed = false;

  constructor(channelCount: number = 16) {
    this.channels = Array.from({ length: channelCount }, (_, index) => emptyChannel(index));
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;

    try {
      this.socket = new WebSocket(getWebSocketUrl('remote'));
    } catch (error) {
      console.warn('Could not open remote websocket:', error);
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      for (const payload of this.pending.splice(0)) {
        this.socket?.send(payload);
      }
      this.socket?.send(JSON.stringify({ type: 'request_state' }));
    };

    this.socket.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(String(event.data)));
      } catch (error) {
        console.warn('Invalid remote engine message:', error);
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.hostConnected = false;
      this.notify();
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      // onclose handles reconnection
    };
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private handleMessage(message: {
    type?: string;
    state?: {
      channels?: ChannelState[];
      masterVolume?: number;
      masterMuted?: boolean;
    };
    message?: string;
    connected?: boolean;
  }) {
    if (message.type === 'state' && message.state) {
      const state = message.state;
      if (Array.isArray(state.channels)) {
        this.channels = state.channels.map((channel, index) => ({
          ...emptyChannel(index),
          ...channel,
          id: index,
        }));
      }
      if (typeof state.masterVolume === 'number') {
        this.masterVolume = state.masterVolume;
      }
      if (typeof state.masterMuted === 'boolean') {
        this.masterMuted = state.masterMuted;
      }
      this.notify();
    } else if (message.type === 'error' && message.message) {
      console.warn('Remote playback error:', message.message);
    } else if (message.type === 'host_status') {
      this.hostConnected = Boolean(message.connected);
      this.notify();
    }
  }

  private send(command: Command) {
    const payload = JSON.stringify({ type: 'command', command });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else if (this.pending.length < 100) {
      this.pending.push(payload);
    }
  }

  private updateChannel(index: number, patch: Partial<ChannelState>) {
    const channel = this.channels[index];
    if (!channel) return;
    this.channels[index] = { ...channel, ...patch, id: index };
    this.notify();
  }

  private notify() {
    for (const listener of [...this.listeners]) {
      listener(this.getStates());
    }
  }

  subscribe(callback: (channels: ChannelState[]) => void): () => void {
    this.listeners.push(callback);
    callback(this.getStates());
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  getStates(): ChannelState[] {
    return this.channels.map((channel) => ({ ...channel }));
  }

  loadTrackToSlot(slotIndex: number, track: TrackInput, autoPlay: boolean = false): void {
    this.updateChannel(slotIndex, {
      trackId: track.id,
      title: track.title,
      filename: track.filename,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      audioLevel: 0,
    });
    this.send({ type: 'loadTrackToSlot', slotIndex, track, autoPlay });
  }

  togglePlay(slotIndex: number): void {
    const channel = this.channels[slotIndex];
    if (!channel?.trackId) return;
    this.updateChannel(slotIndex, { isPlaying: !channel.isPlaying });
    this.send({ type: 'togglePlay', slotIndex });
  }

  stopSlot(slotIndex: number): void {
    this.updateChannel(slotIndex, { isPlaying: false, currentTime: 0 });
    this.send({ type: 'stopSlot', slotIndex });
  }

  setVolume(slotIndex: number, volume: number): void {
    const value = Math.max(0, Math.min(1, volume));
    this.updateChannel(slotIndex, { volume: value });
    this.send({ type: 'setVolume', slotIndex, volume: value });
  }

  setLoop(slotIndex: number, loop: boolean): void {
    this.updateChannel(slotIndex, { loop });
    this.send({ type: 'setLoop', slotIndex, loop });
  }

  setPan(slotIndex: number, pan: number): void {
    const value = Math.max(-1, Math.min(1, pan));
    this.updateChannel(slotIndex, { pan: value });
    this.send({ type: 'setPan', slotIndex, pan: value });
  }

  setPlaybackRate(slotIndex: number, rate: number): void {
    const value = Math.max(0.25, Math.min(4, rate));
    this.updateChannel(slotIndex, { playbackRate: value });
    this.send({ type: 'setPlaybackRate', slotIndex, rate: value });
  }

  seek(slotIndex: number, time: number): void {
    const channel = this.channels[slotIndex];
    if (!channel) return;
    const value = Math.max(0, Math.min(time, channel.duration || time));
    this.updateChannel(slotIndex, { currentTime: value });
    this.send({ type: 'seek', slotIndex, time: value });
  }

  toggleMute(slotIndex: number): void {
    const channel = this.channels[slotIndex];
    if (!channel) return;
    this.updateChannel(slotIndex, { isMuted: !channel.isMuted });
    this.send({ type: 'toggleMute', slotIndex });
  }

  toggleSolo(slotIndex: number): void {
    const channel = this.channels[slotIndex];
    if (!channel) return;
    this.updateChannel(slotIndex, { isSolo: !channel.isSolo });
    this.send({ type: 'toggleSolo', slotIndex });
  }

  clearSlot(slotIndex: number): void {
    this.channels[slotIndex] = emptyChannel(slotIndex);
    this.notify();
    this.send({ type: 'clearSlot', slotIndex });
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.notify();
    this.send({ type: 'setMasterVolume', volume: this.masterVolume });
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getMasterMuted(): boolean {
    return this.masterMuted;
  }

  isHostConnected(): boolean {
    return this.hostConnected;
  }

  toggleMasterMute(): boolean {
    this.masterMuted = !this.masterMuted;
    this.notify();
    this.send({ type: 'toggleMasterMute' });
    return this.masterMuted;
  }

  stopAll(fadeOutSec: number = 1.0): void {
    this.channels = this.channels.map((channel) => ({
      ...channel,
      isPlaying: false,
      currentTime: 0,
    }));
    this.notify();
    this.send({ type: 'stopAll', fadeOutSec });
  }

  playAll(): void {
    this.channels = this.channels.map((channel) => ({
      ...channel,
      isPlaying: Boolean(channel.trackId),
    }));
    this.notify();
    this.send({ type: 'playAll' });
  }

  applyPreset(
    presetSlots: PresetSlot[],
    crossfadeSec: number = 1.5,
    libraryTracks: TrackInput[] = []
  ): void {
    for (const slot of presetSlots) {
      const channel = this.channels[slot.slotIndex];
      if (!channel) continue;
      const track =
        libraryTracks.find((item) => item.id === slot.trackId) ||
        libraryTracks.find((item) => item.filename === slot.filename);
      this.channels[slot.slotIndex] = {
        ...channel,
        trackId: track?.id || slot.trackId || slot.filename || channel.trackId,
        title: track?.title || slot.title || channel.title,
        filename: track?.filename || slot.filename || channel.filename,
        volume: slot.volume ?? 0.7,
        loop: slot.loop ?? true,
        pan: slot.pan ?? channel.pan,
        playbackRate: slot.playbackRate ?? channel.playbackRate,
        isPlaying: Boolean(slot.active && (track || slot.filename)),
      };
    }
    this.notify();
    this.send({ type: 'applyPreset', slots: presetSlots, crossfadeSec });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }
}
