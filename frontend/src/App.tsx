import React, { useState, useEffect, useCallback } from 'react';
import { UploadCloud, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Header } from './components/Header';
import { MixerPanel } from './components/MixerPanel';
import { TouchSoundboard } from './components/TouchSoundboard';
import { LibraryPanel } from './components/LibraryPanel';
import { PresetPanel } from './components/PresetPanel';
import { MobileNav } from './components/MobileNav';
import { YoutubeModal } from './components/YoutubeModal';
import { MobileConnectModal } from './components/MobileConnectModal';
import { getSoundEngine, ChannelState } from './audio/SoundEngine';
import { getClientRole } from './audio/clientRole';
import { useRemoteHostBridge } from './audio/useRemoteHostBridge';
import { AudioTrack, Preset, AppInfo } from './types';

export const App: React.FC = () => {
  const engine = getSoundEngine();

  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [library, setLibrary] = useState<AudioTrack[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [hostConnected, setHostConnected] = useState<boolean>(true);

  const handleMasterVolumeChange = useCallback((volume: number) => {
    setMasterVolume(volume);
    engine.setMasterVolume(volume);
  }, [engine]);

  const handleToggleMasterMute = useCallback(() => {
    setIsMasterMuted(engine.toggleMasterMute());
  }, [engine]);

  const [activeTab, setActiveTab] = useState<'mixer' | 'soundboard' | 'library' | 'presets'>('mixer');
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [selectedSlotForAssign, setSelectedSlotForAssign] = useState<number | null>(null);

  // Global Drag & Drop audio state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploadingDropped, setIsUploadingDropped] = useState(false);
  const [dropToastMessage, setDropToastMessage] = useState<string | null>(null);
  const [dropToastIsError, setDropToastIsError] = useState(false);

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingFile(false);
    }
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.webm', '.aac', '.opus'];
    const validFiles = Array.from(files).filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return audioExtensions.includes(ext);
    });

    if (validFiles.length === 0) return;

    setIsUploadingDropped(true);
    let uploaded = 0;
    try {
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'Local');
        formData.append('tags', 'upload,dragdrop');
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          let detail = '';
          try {
            detail = (await res.json()).detail || '';
          } catch {
            // ignore non-JSON error body
          }
          throw new Error(detail || `Ошибка загрузки (HTTP ${res.status})`);
        }
        uploaded += 1;
      }
      await fetchLibrary();
      setDropToastIsError(false);
      setDropToastMessage(`Добавлено треков в библиотеку: ${uploaded}`);
    } catch (err) {
      console.error('Drag & Drop upload failed:', err);
      setDropToastIsError(true);
      setDropToastMessage(err instanceof Error ? err.message : 'Не удалось загрузить файлы');
    } finally {
      setIsUploadingDropped(false);
      setTimeout(() => setDropToastMessage(null), 4000);
    }
  };

  // Subscribe to SoundEngine channels state
  useEffect(() => {
    const unsubscribe = engine.subscribe((newStates) => {
      setChannels([...newStates]);
      setMasterVolume(engine.getMasterVolume());
      setIsMasterMuted(engine.getMasterMuted());
      setHostConnected(engine.isHostConnected());
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

  // Stable callback: YoutubeModal keeps its 1-second status polling interval
  // alive instead of restarting it on every App render.
  const handleDownloaded = useCallback(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    fetchLibrary();
    fetchPresets();
    fetchInfo();
  }, [fetchLibrary, fetchPresets, fetchInfo]);

  // Keyboard hotkeys for Game Master (Keys 1-9 toggle play on slots 1-9, Esc stops all)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger while typing, but keep hotkeys working after the user
      // touched a volume/seek slider (those are INPUT[type=range]).
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isTextInput =
        tag === 'INPUT' &&
        !['range', 'checkbox', 'radio', 'button', 'submit'].includes(
          (target as HTMLInputElement).type
        );
      if (isTextInput || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
        return;
      }
      if (e.repeat) return;

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

  const handleTrackDeleted = useCallback((trackId: string) => {
    engine.getStates().forEach((channel) => {
      if (channel.trackId === trackId) {
        engine.clearSlot(channel.id);
      }
    });
  }, [engine]);

  // Preset execution with crossfade
  const handleApplyPreset = (preset: Preset, crossfadeSec: number) => {
    engine.applyPreset(preset.slots, crossfadeSec, library);
  };

  useRemoteHostBridge({
    engine,
    library,
    isMasterMuted,
    onMasterVolumeChange: handleMasterVolumeChange,
    setIsMasterMuted,
  });

  const activeCount = channels.filter((c) => c.isPlaying).length;
  const isRemote = getClientRole() === 'remote';

  return (
    <div 
      className="min-h-screen flex flex-col bg-rpg-bg text-slate-100 relative"
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* Visual Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none p-6 animate-in fade-in duration-150">
          <div className="w-full max-w-xl p-8 rounded-3xl border-2 border-dashed border-amber-500 bg-amber-500/10 flex flex-col items-center text-center space-y-4 shadow-2xl">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-bounce">
              <UploadCloud className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-rpg">
                Перетащите аудиофайлы сюда
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                Поддерживаются .mp3, .wav, .ogg, .flac, .m4a — треки сразу добавятся в вашу оффлайн-библиотеку
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Uploading Toast */}
      {isUploadingDropped && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-slate-900 border border-amber-500/50 shadow-2xl flex items-center gap-3 text-sm font-semibold text-amber-300 animate-in slide-in-from-bottom duration-200">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span>Добавление файлов в библиотеку...</span>
        </div>
      )}

      {/* Floating Success Toast */}
      {dropToastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 text-sm font-semibold animate-in slide-in-from-bottom duration-200 ${
          dropToastIsError
            ? 'bg-rose-950/90 border-rose-500/60 text-rose-300'
            : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
        }`}>
          {dropToastIsError ? (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
          <span>{dropToastMessage}</span>
        </div>
      )}

      {/* Header with Navigation and Master Controls */}
      <Header
        masterVolume={masterVolume}
        isMasterMuted={isMasterMuted}
        onMasterVolumeChange={handleMasterVolumeChange}
        onToggleMasterMute={handleToggleMasterMute}
        activeCount={activeCount}
        totalChannels={channels.length || 16}
        onOpenYoutubeModal={() => setIsYoutubeModalOpen(true)}
        onOpenMobileModal={() => setIsMobileModalOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {isRemote && !hostConnected && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-300 text-xs text-center py-2 px-4">
          Ожидание подключения к звуковому движку на ПК. Проверьте, что приложение запущено на компьютере.
        </div>
      )}

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-20 md:pb-6">
        {activeTab === 'mixer' && (
          <MixerPanel
            channels={channels}
            onSelectTrackForSlot={handleSelectTrackForSlot}
            onDropTrack={handleDropTrack}
            library={library}
          />
        )}

        {activeTab === 'soundboard' && (
          <TouchSoundboard
            channels={channels}
            onSelectTrackForSlot={handleSelectTrackForSlot}
          />
        )}

        {activeTab === 'library' && (
          <LibraryPanel
            library={library}
            onRefreshLibrary={fetchLibrary}
            onOpenYoutubeModal={() => setIsYoutubeModalOpen(true)}
            onAssignTrackToSlot={handleAssignTrackToSlot}
            onTrackDeleted={handleTrackDeleted}
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

      {/* Mobile Bottom Navigation (Visible on Android / Small screens) */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCount={activeCount}
      />

      {/* Footer Info (Hidden on mobile to save space) */}
      <footer className="hidden md:block border-t border-rpg-border/60 py-3 px-4 text-center text-xs text-slate-500 bg-rpg-panel/40">
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
        onDownloaded={handleDownloaded}
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
