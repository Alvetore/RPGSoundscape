import React, { useState } from 'react';
import { 
  Bookmark, 
  Play, 
  Trash2, 
  Plus, 
  Sparkles, 
  Download, 
  Upload, 
  Check, 
  Clock,
  Music,
  Flame,
  Skull,
  Beer,
  Swords,
  Shield,
  Volume2
} from 'lucide-react';
import { Preset, PresetSlot, AudioTrack } from '../types';
import { ChannelState, getSoundEngine } from '../audio/SoundEngine';

interface PresetPanelProps {
  presets: Preset[];
  channels: ChannelState[];
  library: AudioTrack[];
  onRefreshPresets: () => void;
  onApplyPreset: (preset: Preset, crossfadeSec: number) => void;
}

export const PresetPanel: React.FC<PresetPanelProps> = ({
  presets,
  channels,
  library,
  onRefreshPresets,
  onApplyPreset
}) => {
  const [crossfadeSec, setCrossfadeSec] = useState<number>(1.5);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Custom');
  const icon = 'beer';
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName) {
      case 'beer':
        return <Beer className="w-5 h-5 text-amber-400" />;
      case 'skull':
        return <Skull className="w-5 h-5 text-purple-400" />;
      case 'swords':
        return <Swords className="w-5 h-5 text-red-400" />;
      case 'flame':
        return <Flame className="w-5 h-5 text-orange-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-sky-400" />;
    }
  };

  const handleSaveCurrentMix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Build slots snapshot from current channels
    const slotsSnapshot: PresetSlot[] = channels
      .filter((ch) => ch.trackId !== null)
      .map((ch) => ({
        slotIndex: ch.id,
        trackId: ch.trackId,
        title: ch.title,
        filename: ch.filename || undefined,
        volume: ch.volume,
        loop: ch.loop,
        active: ch.isPlaying,
        pan: ch.pan,
        playbackRate: ch.playbackRate
      }));

    if (slotsSnapshot.length === 0) {
      alert("В микшере нет загруженных звуков для сохранения в пресет.");
      return;
    }

    const newPreset: Partial<Preset> = {
      name: name.trim(),
      description: description.trim(),
      category: category,
      icon: icon,
      slots: slotsSnapshot
    };

    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreset)
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.json()).detail || '';
        } catch {
          // ignore non-JSON error body
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      setIsCreating(false);
      setName('');
      setDescription('');
      onRefreshPresets();
    } catch (err) {
      console.error('Failed to save preset:', err);
      alert(`Ошибка при сохранении пресета: ${err instanceof Error ? err.message : ''}`);
    }
  };

  const handleDeletePreset = async (preset: Preset) => {
    if (window.confirm(`Удалить пресет "${preset.name}"?`)) {
      try {
        await fetch(`/api/presets/${preset.id}`, { method: 'DELETE' });
        onRefreshPresets();
      } catch (err) {
        console.error('Failed to delete preset:', err);
      }
    }
  };

  // Export Presets to JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `rpg_sound_presets_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import Presets from JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (!Array.isArray(imported)) {
          alert('Некорректный формат: ожидается JSON-массив пресетов.');
          return;
        }
        let failed = 0;
        for (const p of imported) {
          const res = await fetch('/api/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
          });
          if (!res.ok) failed += 1;
        }
        onRefreshPresets();
        alert(
          failed > 0
            ? `Импорт завершён с ошибками: ${failed} из ${imported.length}.`
            : 'Пресеты успешно импортированы!'
        );
      } catch (err) {
        alert('Некорректный JSON файл');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rpg-kicker">Scene presets</div>
          <h2 className="mt-1 flex items-center gap-2.5 text-xl font-bold tracking-wide text-white font-rpg">
            <Bookmark className="h-5 w-5 text-amber-400" />
            Пресеты сцен
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Мгновенное переключение атмосферы с плавным кроссфейдом
          </p>
        </div>
        <span className="rpg-pill">{presets.length} сцен</span>
      </div>

      <div className="rpg-card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <div className="rpg-kicker">Crossfade</div>
            <p className="mt-1 text-xs text-slate-500">Плавность перехода между сценами</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={crossfadeSec}
            onChange={(e) => setCrossfadeSec(parseFloat(e.target.value))}
            className="rpg-input h-10 w-auto py-0 pl-3 pr-8 text-xs font-semibold text-amber-300"
          >
            <option value="0">Мгновенно</option>
            <option value="1.0">1.0 сек</option>
            <option value="1.5">1.5 сек</option>
            <option value="3.0">3.0 сек</option>
            <option value="5.0">5.0 сек</option>
          </select>

          <button
            onClick={() => setIsCreating(true)}
            className="rpg-btn rpg-btn-primary h-10 px-4"
          >
            <Plus className="h-4 w-4" />
            <span>Сохранить микс</span>
          </button>
        </div>
      </div>

      {/* Modal / Collapse to save new preset */}
      {isCreating && (
        <form onSubmit={handleSaveCurrentMix} className="rpg-card space-y-3 border-amber-300/30 p-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-400 font-rpg">
              Сохранить текущую звуковую сцену
            </h3>
            <span className="text-xs text-slate-400">
              Будет сохранено дорожек: {channels.filter(c => c.trackId).length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Название пресета</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="например: Ночь в лесу гоблинов"
                className="rpg-input px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Категория</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rpg-input px-3 py-2 text-sm"
              >
                <option value="Tavern">Таверна / Город</option>
                <option value="Dungeon">Подземелье / Катакомбы</option>
                <option value="Combat">Бой / Битва</option>
                <option value="Wilderness">Дикая природа / Лес</option>
                <option value="Magic">Магия / Ритуал</option>
                <option value="Custom">Пользовательский</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Краткое описание (для мастера)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="например: Спокойный лагерь, шелест ветра, засада волков"
              className="rpg-input px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors shadow-glow-gold"
            >
              Сохранить пресет
            </button>
          </div>
        </form>
      )}

      {/* Presets Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <div
              key={preset.id}
              className={`rpg-card rpg-card-hover group flex flex-col justify-between p-4 ${
                isActive
                  ? 'border-amber-300/40 bg-gradient-to-b from-amber-400/[0.06] to-transparent shadow-[0_20px_45px_-28px_rgba(234,179,8,0.55)]'
                  : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-black/20">
                      {getCategoryIcon(preset.icon)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-100 font-rpg transition-colors group-hover:text-amber-300">
                        {preset.name}
                      </h3>
                      <span className="mt-0.5 inline-flex rounded-md border border-amber-400/15 bg-amber-400/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-amber-300/90">
                        {preset.category || 'Сцена'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeletePreset(preset)}
                    className="rounded-md p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                    title="Удалить пресет"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {preset.description && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {preset.description}
                  </p>
                )}

                <div className="mt-3 space-y-2 border-t border-white/[0.055] pt-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-600">
                    <span>Слоты сцены</span>
                    <span className="font-mono text-amber-300/80">{preset.slots.length} каналов</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {preset.slots.map((s, idx) => (
                      <span
                        key={idx}
                        className="max-w-[150px] truncate rounded-md border border-white/[0.05] bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-slate-400"
                        title={s.title || `Слот ${s.slotIndex + 1}`}
                      >
                        #{s.slotIndex + 1} {s.title || 'Звук'} · {Math.round((s.volume ?? 0.7) * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => {
                    setActivePresetId(preset.id);
                    onApplyPreset(preset, crossfadeSec);
                  }}
                  className={`rpg-btn h-10 w-full ${
                    isActive
                      ? 'rpg-btn-primary'
                      : 'hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-200'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isActive ? 'Атмосфера активна' : 'Включить атмосферу'}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Export / Import presets footer */}
      <div className="flex items-center justify-between pt-4 border-t border-rpg-border text-xs text-slate-500">
        <span>Резервная копия ваших настроек</span>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer hover:text-slate-300 flex items-center gap-1 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Импорт JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                handleImportJSON(e);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
          <span>•</span>
          <button
            onClick={handleExportJSON}
            className="hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт JSON</span>
          </button>
        </div>
      </div>
    </div>
  );
};
