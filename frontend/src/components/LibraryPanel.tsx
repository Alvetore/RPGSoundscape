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
  GripVertical
} from 'lucide-react';
import { YoutubeIcon } from './Icons';
import { getSoundEngine } from '../audio/SoundEngine';

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
    <div className="space-y-4">
      {/* Top Banner & Actions */}
      <div className="bg-rpg-panel p-4 rounded-xl border border-rpg-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 font-rpg flex items-center gap-2">
            <FileAudio className="w-5 h-5 text-amber-400" />
            Библиотека Звуков & Музыки
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-sans font-normal border border-slate-700">
              {library.length} аудиофайлов оффлайн
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Все звуки хранятся локально на диске и воспроизводятся без доступа к интернету.
          </p>
        </div>

        {/* Upload & YouTube buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*"
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all shadow-sm"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span>{isUploading ? 'Загрузка...' : 'Добавить аудиофайлы'}</span>
          </button>

          <button
            onClick={onOpenYoutubeModal}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all shadow-glow-crimson"
          >
            <YoutubeIcon className="w-4 h-4 fill-current" />
            <span>Скачать с YouTube</span>
          </button>
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
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, тегу или категории..."
            className="w-full bg-rpg-panel border border-rpg-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-black border-amber-500 font-semibold shadow-glow-gold'
                  : 'bg-rpg-panel text-slate-400 border-rpg-border hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tracks List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTracks.map((track) => {
          const isPreviewing = previewTrackId === track.id;

          return (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(track));
              }}
              className="bg-rpg-panel hover:bg-slate-900/90 border border-rpg-border hover:border-amber-500/50 p-3.5 rounded-xl transition-all flex flex-col justify-between group shadow-sm cursor-grab active:cursor-grabbing"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-200 truncate" title={track.title}>
                        {track.title}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-400/90 border border-slate-700">
                          {track.category}
                        </span>
                        {track.filesize > 0 && (
                          <span>{formatFileSize(track.filesize)}</span>
                        )}
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Оффлайн
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteTrack(track)}
                    title="Удалить из библиотеки"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tags */}
                {track.tags && track.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {track.tags.map((t, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Footer: Preview & Slot Assign */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-800/80">
                <button
                  onClick={() => handleTogglePreview(track)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isPreviewing
                      ? 'bg-amber-500 text-black font-semibold shadow-glow-gold'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title="Прослушать звук (Preview)"
                >
                  {isPreviewing ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Слушать</span>
                    </>
                  )}
                </button>

                {/* Quick Add to Slot */}
                {selectedSlotForAssign !== null ? (
                  <button
                    onClick={() => {
                      onAssignTrackToSlot(track, selectedSlotForAssign);
                      setSelectedSlotForAssign(null);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-all shadow-sm"
                  >
                    <span>Выбрать в слот #{selectedSlotForAssign + 1}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 hidden sm:inline">В слот:</span>
                    <select
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          onAssignTrackToSlot(track, val);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 py-1 px-2 focus:outline-none focus:border-amber-500 cursor-pointer"
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
          <div className="col-span-full py-12 text-center text-slate-500 space-y-3">
            <FileAudio className="w-12 h-12 mx-auto text-slate-600" />
            <p className="text-sm">Звуки по запросу не найдены.</p>
            <p className="text-xs text-slate-600">
              Вы можете скачать музыку с YouTube или загрузить собственные MP3/WAV файлы с помощью кнопок сверху.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
