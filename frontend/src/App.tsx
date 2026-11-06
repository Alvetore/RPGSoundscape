import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MixerPanel } from './components/MixerPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { PresetPanel } from './components/PresetPanel';
import { YoutubeModal } from './components/YoutubeModal';
import { MobileConnectModal } from './components/MobileConnectModal';
import { getSoundEngine, ChannelState } from './audio/SoundEngine';
import { AudioTrack, Preset, AppInfo } from './types';

export const App: React.FC = () => {
  const engine = getSoundEngine();

  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [library, setLibrary] = useState<AudioTrack[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'mixer' | 'library' | 'presets'>('mixer');
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [selectedSlotForAssign, setSelectedSlotForAssign] = useState<number | null>(null);

  // Subscribe to SoundEngine channels state
  useEffect(() => {
    const unsubscribe = engine.subscribe((newStates) => {
      setChannels([...newStates]);
    });
    return () => unsubscribe();
  }, [engine]);

  // Fetch initial data
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        setLibrary(data);
      }
    } catch (e) {
      console.warn('Could not fetch library:', e);
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch('/api/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch (e) {
      console.warn('Could not fetch presets:', e);
    }
  }, []);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        setAppInfo(data);
      }
    } catch (e) {
      console.warn('Could not fetch app info:', e);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    fetchPresets();
    fetchInfo();
  }, [fetchLibrary, fetchPresets, fetchInfo]);

  // Keyboard hotkeys for Game Master (Keys 1-9 toggle play on slots 1-9, Esc stops all)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        engine.stopAll(1.0);
      } else if (e.key >= '1' && e.key <= '9') {
        const slotIdx = parseInt(e.key, 10) - 1;
        engine.togglePlay(slotIdx);
      } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey) {
        const muted = engine.toggleMasterMute();
        setIsMasterMuted(muted);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  // Slot track assign
  const handleAssignTrackToSlot = (track: AudioTrack, slotIndex: number) => {
    engine.loadTrackToSlot(slotIndex, track, false);
    setActiveTab('mixer');
  };

  const handleSelectTrackForSlot = (slotIndex: number) => {
    setSelectedSlotForAssign(slotIndex);
    setActiveTab('library');
  };

  const handleDropTrack = (slotIndex: number, track: AudioTrack) => {
    engine.loadTrackToSlot(slotIndex, track, false);
  };

  // Preset execution with crossfade
  const handleApplyPreset = (preset: Preset, crossfadeSec: number) => {
    engine.applyPreset(preset.slots, crossfadeSec, library);
  };

  const activeCount = channels.filter((c) => c.isPlaying).length;

  return (
    <div className="min-h-screen flex flex-col bg-rpg-bg text-slate-100">
      {/* Header with Navigation and Master Controls */}
      <Header
        masterVolume={masterVolume}
        isMasterMuted={isMasterMuted}
        onMasterVolumeChange={(vol) => {
          setMasterVolume(vol);
          engine.setMasterVolume(vol);
        }}
        onToggleMasterMute={() => {
          const muted = engine.toggleMasterMute();
          setIsMasterMuted(muted);
        }}
        activeCount={activeCount}
        totalChannels={channels.length || 16}
        onOpenYoutubeModal={() => setIsYoutubeModalOpen(true)}
        onOpenMobileModal={() => setIsMobileModalOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'mixer' && (
          <MixerPanel
            channels={channels}
            onSelectTrackForSlot={handleSelectTrackForSlot}
            onDropTrack={handleDropTrack}
            library={library}
          />
        )}

        {activeTab === 'library' && (
          <LibraryPanel
            library={library}
            onRefreshLibrary={fetchLibrary}
            onOpenYoutubeModal={() => setIsYoutubeModalOpen(true)}
            onAssignTrackToSlot={handleAssignTrackToSlot}
            selectedSlotForAssign={selectedSlotForAssign}
            setSelectedSlotForAssign={setSelectedSlotForAssign}
          />
        )}

        {activeTab === 'presets' && (
          <PresetPanel
            presets={presets}
            channels={channels}
            library={library}
            onRefreshPresets={fetchPresets}
            onApplyPreset={handleApplyPreset}
          />
        )}
      </main>

      {/* Footer Info */}
      <footer className="border-t border-rpg-border/60 py-3 px-4 text-center text-xs text-slate-500 bg-rpg-panel/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Оффлайн движок Web Audio API • 16 одновременных каналов</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Горячие клавиши: <b>1-9</b> старт/пауза • <b>Esc</b> стоп всё • <b>M</b> глушить</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <YoutubeModal
        isOpen={isYoutubeModalOpen}
        onClose={() => setIsYoutubeModalOpen(false)}
        onDownloaded={() => {
          fetchLibrary();
        }}
      />

      <MobileConnectModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        appInfo={appInfo}
      />
    </div>
  );
};

export default App;
