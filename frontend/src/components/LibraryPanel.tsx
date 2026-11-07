import React, { useState, useRef, useEffect } from 'react';
import { 
  AudioTrack 
} from '../types';
import { 
  Search, 
  Upload, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  Volume2, 
  Tag, 
  CheckCircle2, 
  FileAudio,
  FolderPlus,
  GripVertical,
  ScanLine
} from 'lucide-react';
import { YoutubeIcon } from './Icons';
import { getSoundEngine } from '../audio/SoundEngine';
import { isAndroidLocalMode, scanAndroidTransfer } from '../audio/androidBridge';

interface LibraryPanelProps {
  library: AudioTrack[];
  onRefreshLibrary: () => void;
  onOpenYoutubeModal: () => void;
  onAssignTrackToSlot: (track: AudioTrack, slotIndex: number) => void;
  onTrackDeleted: (trackId: string) => void;
  selectedSlotForAssign: number | null;
  setSelectedSlotForAssign: (slot: number | null) => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  library,
  onRefreshLibrary,
  onOpenYoutubeModal,
  onAssignTrackToSlot,
  onTrackDeleted,
  selectedSlotForAssign,
  setSelectedSlotForAssign
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const androidLocal = isAndroidLocalMode();

  // Stop preview playback when the user switches to another tab.
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  // Categories list
  const categories = [
    { id: 'all', label: 'Все звуки' },
    { id: 'Tavern', label: '🍺 Таверна' },
    { id: 'Dungeon', label: '💀 Подземелье' },
    { id: 'Combat', label: '⚔️ Битва' },
    { id: 'Wilderness', label: '🌲 Природа' },
    { id: 'Weather', label: '🌧️ Погода' },
    { id: 'Magic', label: '✨ Магия' },
    { id: 'YouTube', label: '▶️ YouTube' },
    { id: 'Local', label: '📁 Свои файлы' },
    { id: 'General', label: '📦 Общее' },
  ];

  // Filtered tracks
  const filteredTracks = library.filter((track) => {
    const matchesSearch = 
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      track.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = 
      selectedCategory === 'all' || 
      track.category.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === 'YouTube' && track.source === 'youtube') ||
      (selectedCategory === 'Local' && (track.source === 'local' || track.source === 'upload'));

    return matchesSearch && matchesCategory;
  });

  // Preview handling
  const handleTogglePreview = (track: AudioTrack) => {
    if (previewTrackId === track.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewTrackId(null);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = `/api/audio/${encodeURIComponent(track.filename)}`;
      previewAudioRef.current.play();
      previewAudioRef.current.onended = () => setPreviewTrackId(null);
      setPreviewTrackId(track.id);
    }
  };

  // Local File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let failed = 0;
    let lastError = '';
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);
        formData.append('category', 'Local');
        formData.append('tags', 'upload,custom');

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          failed += 1;
          try {
            lastError = (await res.json()).detail || '';
          } catch {
            lastError = `HTTP ${res.status}`;
          }
        }
      }
      onRefreshLibrary();
      if (failed > 0) {
        alert(`Не удалось загрузить файлов: ${failed}. ${lastError}`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Ошибка при загрузке аудиофайла');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete track
  const handleDeleteTrack = async (track: AudioTrack) => {
    if (window.confirm(`Удалить звук "${track.title}" из библиотеки?`)) {
      try {
        const res = await fetch(`/api/library/${track.id}`, { method: 'DELETE' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (previewTrackId === track.id && previewAudioRef.current) {
          previewAudioRef.current.pause();
          setPreviewTrackId(null);
        }
        onTrackDeleted(track.id);
        onRefreshLibrary();
      } catch (err) {
        console.error('Delete failed:', err);
        alert('Не удалось удалить трек из библиотеки.');
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rpg-kicker">Sound library</div>
          <h2 className="mt-1 flex items-center gap-2.5 text-xl font-bold tracking-wide text-white font-rpg">
            <FileAudio className="h-5 w-5 text-amber-400" />
            Библиотека звуков
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Локальные треки, эмбиент и SFX — всё доступно без интернета
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rpg-pill">{filteredTracks.length} из {library.length}</span>
          <span className="rpg-pill border-emerald-400/20 text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Offline
          </span>
        </div>
      </div>

      <div className="rpg-card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FolderPlus className="h-4 w-4 text-amber-400" />
            Пополнить библиотеку
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {androidLocal
              ? 'Добавьте файлы с телефона или перенесите всю библиотеку с ПК по QR-коду.'
              : 'Загрузите файлы с диска или скачайте трек с YouTube.'}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*"
            multiple
            className="hidden"
          />
          {androidLocal && (
            <button
              onClick={scanAndroidTransfer}
              className="rpg-btn h-10 flex-1 border-sky-400/30 bg-sky-500/10 px-3.5 text-sky-200 hover:border-sky-300/50 hover:bg-sky-500/20 md:flex-none"
              title="Сканировать QR-код переноса библиотеки на ПК"
            >
              <ScanLine className="h-4 w-4" />
              <span>Перенести с ПК</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rpg-btn h-10 flex-1 px-3.5 text-slate-200 md:flex-none"
          >
            <Upload className="h-4 w-4 text-amber-300" />
            <span>{isUploading ? 'Загрузка...' : 'Добавить файлы'}</span>
          </button>

          {!androidLocal && (
            <button
              onClick={onOpenYoutubeModal}
              className="rpg-btn h-10 flex-1 border-red-500/30 bg-red-500/10 px-3.5 text-red-200 hover:border-red-400/50 hover:bg-red-500/20 md:flex-none"
            >
              <YoutubeIcon className="h-4 w-4 fill-current" />
              <span>Скачать с YouTube</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Slot Announcement (if user clicked "Select Sound" on a slot) */}
      {selectedSlotForAssign !== null && (
        <div className="bg-amber-500/15 border border-amber-500/40 p-3 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-sm text-amber-300 font-medium">
            <span className="w-6 h-6 rounded-md bg-amber-500 text-black font-bold flex items-center justify-center text-xs">
              {selectedSlotForAssign + 1}
            </span>
            <span>Выберите звук из списка ниже для назначения в <b>Слот #{selectedSlotForAssign + 1}</b></span>
          </div>
          <button
            onClick={() => setSelectedSlotForAssign(null)}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Search and Category Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, тегу или категории..."
            className="rpg-input py-3 pl-10 pr-4 text-sm"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? 'border-amber-300/50 bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-[0_6px_18px_-12px_rgba(234,179,8,0.8)]'
                  : 'border-white/[0.06] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tracks List */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredTracks.map((track) => {
          const isPreviewing = previewTrackId === track.id;

          return (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(track));
              }}
              className="rpg-card rpg-card-hover group flex cursor-grab flex-col justify-between p-4 active:cursor-grabbing"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 text-slate-500 transition-colors group-hover:text-amber-300">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-100" title={track.title}>
                        {track.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 font-medium text-amber-300/90">
                          {track.category}
                        </span>
                        {track.filesize > 0 && (
                          <span className="font-mono">{formatFileSize(track.filesize)}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-emerald-400/80">
                          <CheckCircle2 className="h-3 w-3" /> offline
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteTrack(track)}
                    title="Удалить из библиотеки"
                    className="rounded-md p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {track.tags && track.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {track.tags.slice(0, 5).map((t, idx) => (
                      <span key={idx} className="rounded-md border border-white/[0.04] bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-slate-500">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.055] pt-3">
                <button
                  onClick={() => handleTogglePreview(track)}
                  className={`rpg-btn h-8 px-3 text-xs ${
                    isPreviewing
                      ? 'border-amber-300/50 bg-amber-400/15 text-amber-200'
                      : 'text-slate-300'
                  }`}
                  title="Прослушать звук (Preview)"
                >
                  {isPreviewing ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-current" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Слушать</span>
                    </>
                  )}
                </button>

                {selectedSlotForAssign !== null ? (
                  <button
                    onClick={() => {
                      onAssignTrackToSlot(track, selectedSlotForAssign);
                      setSelectedSlotForAssign(null);
                    }}
                    className="rpg-btn h-8 border-emerald-400/40 bg-emerald-400/15 px-2.5 text-[11px] text-emerald-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>В слот #{selectedSlotForAssign + 1}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="hidden text-[10px] text-slate-600 sm:inline">В слот</span>
                    <select
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          onAssignTrackToSlot(track, val);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="cursor-pointer rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1.5 text-[11px] text-slate-300 focus:border-amber-300/50 focus:outline-none"
                    >
                      <option value="" disabled>
                        + Слот #
                      </option>
                      {Array.from({ length: 16 }).map((_, i) => (
                        <option key={i} value={i}>
                          Слот {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredTracks.length === 0 && (
          <div className="rpg-card col-span-full flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025] text-slate-600">
              <FileAudio className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Звуки не найдены</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-600">
              Измените фильтр или добавьте музыку с YouTube/диска — она сразу появится в оффлайн-библиотеке.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
