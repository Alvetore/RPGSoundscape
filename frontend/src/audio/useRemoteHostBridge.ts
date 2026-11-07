import { useEffect, useRef } from 'react';
import type { AudioTrack, PresetSlot } from '../types';
import { getClientRole, getWebSocketUrl } from './clientRole';
import type { ISoundEngine, TrackInput } from './SoundEngine';

interface HostBridgeOptions {
  engine: ISoundEngine;
  library: AudioTrack[];
  isMasterMuted: boolean;
  onMasterVolumeChange: (volume: number) => void;
  setIsMasterMuted: (muted: boolean) => void;
}

/**
 * Desktop-only bridge. It publishes the local SoundEngine state to the
 * backend hub and executes commands sent by LAN remotes.
 */
export function useRemoteHostBridge({
  engine,
  library,
  isMasterMuted,
  onMasterVolumeChange,
  setIsMasterMuted,
}: HostBridgeOptions) {
  const libraryRef = useRef(library);
  const mutedRef = useRef(isMasterMuted);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    mutedRef.current = isMasterMuted;
  }, [isMasterMuted]);

  useEffect(() => {
    if (getClientRole() !== 'host') return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let lastStateAt = 0;

    const sendState = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({
          type: 'state',
          state: {
            channels: engine.getStates(),
            masterVolume: engine.getMasterVolume(),
            masterMuted: mutedRef.current,
          },
        }));
      } catch {
        // socket closed between readyState check and send
      }
    };

    const publishState = () => {
      const now = Date.now();
      if (now - lastStateAt < 80) return;
      lastStateAt = now;
      sendState();
    };

    const handleCommand = (command: Record<string, unknown>) => {
      const type = command.type;

      switch (type) {
        case 'loadTrackToSlot': {
          if (
            typeof command.slotIndex === 'number' &&
            command.track &&
            typeof command.track === 'object'
          ) {
            const track = command.track as Partial<TrackInput>;
            if (typeof track.filename === 'string' && track.filename) {
              engine.loadTrackToSlot(
                command.slotIndex,
                {
                  id: String(track.id || track.filename),
                  title: String(track.title || track.filename),
                  filename: track.filename,
                },
                Boolean(command.autoPlay)
              );
            }
          }
          break;
        }
        case 'togglePlay':
          if (typeof command.slotIndex === 'number') engine.togglePlay(command.slotIndex);
          break;
        case 'stopSlot':
          if (typeof command.slotIndex === 'number') engine.stopSlot(command.slotIndex);
          break;
        case 'clearSlot':
          if (typeof command.slotIndex === 'number') engine.clearSlot(command.slotIndex);
          break;
        case 'setVolume':
          if (typeof command.slotIndex === 'number' && typeof command.volume === 'number') {
            engine.setVolume(command.slotIndex, command.volume);
          }
          break;
        case 'setLoop':
          if (typeof command.slotIndex === 'number' && typeof command.loop === 'boolean') {
            engine.setLoop(command.slotIndex, command.loop);
          }
          break;
        case 'setPan':
          if (typeof command.slotIndex === 'number' && typeof command.pan === 'number') {
            engine.setPan(command.slotIndex, command.pan);
          }
          break;
        case 'setPlaybackRate':
          if (typeof command.slotIndex === 'number' && typeof command.rate === 'number') {
            engine.setPlaybackRate(command.slotIndex, command.rate);
          }
          break;
        case 'seek':
          if (typeof command.slotIndex === 'number' && typeof command.time === 'number') {
            engine.seek(command.slotIndex, command.time);
          }
          break;
        case 'toggleMute':
          if (typeof command.slotIndex === 'number') engine.toggleMute(command.slotIndex);
          break;
        case 'toggleSolo':
          if (typeof command.slotIndex === 'number') engine.toggleSolo(command.slotIndex);
          break;
        case 'stopAll':
          engine.stopAll(typeof command.fadeOutSec === 'number' ? command.fadeOutSec : 1.0);
          break;
        case 'playAll':
          engine.playAll();
          break;
        case 'setMasterVolume':
          if (typeof command.volume === 'number') {
            onMasterVolumeChange(command.volume);
          }
          break;
        case 'toggleMasterMute': {
          const muted = engine.toggleMasterMute();
          mutedRef.current = muted;
          setIsMasterMuted(muted);
          break;
        }
        case 'applyPreset':
          if (Array.isArray(command.slots)) {
            engine.applyPreset(
              command.slots as PresetSlot[],
              typeof command.crossfadeSec === 'number' ? command.crossfadeSec : 1.5,
              libraryRef.current
            );
          }
          break;
        default:
          break;
      }

      sendState();
    };

    const connect = () => {
      if (destroyed) return;
      try {
        socket = new WebSocket(getWebSocketUrl('host'));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        sendState();
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'command' && message.command && typeof message.command === 'object') {
            handleCommand(message.command);
          }
        } catch {
          // ignore malformed remote command
        }
      };
      socket.onclose = () => {
        socket = null;
        scheduleReconnect();
      };
      socket.onerror = () => {
        // onclose handles reconnection
      };
    };

    const scheduleReconnect = () => {
      if (destroyed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    };

    const unsubscribe = engine.subscribe(publishState);
    connect();

    return () => {
      destroyed = true;
      unsubscribe();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    };
  }, [engine, onMasterVolumeChange, setIsMasterMuted]);
}
