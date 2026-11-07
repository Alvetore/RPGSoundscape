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
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-rpg-panel p-4 rounded-xl border border-rpg-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 font-rpg flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-400" />
            Пресеты Сцен & Саундскейпы
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-sans font-normal border border-slate-700">
              {presets.length} пресетов
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Переключайте целые звуковые атмосферы в один клик с плавным кроссфейдом.
          </p>
        </div>

        {/* Crossfade Selector & Save Mix Button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Transition duration */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Кроссфейд:</span>
            <select
              value={crossfadeSec}
              onChange={(e) => setCrossfadeSec(parseFloat(e.target.value))}
              className="bg-transparent text-amber-400 font-bold focus:outline-none cursor-pointer"
            >
              <option value="0" className="bg-slate-900 text-white">Мгновенно</option>
              <option value="1.0" className="bg-slate-900 text-white">1.0 сек</option>
              <option value="1.5" className="bg-slate-900 text-white">1.5 сек</option>
              <option value="3.0" className="bg-slate-900 text-white">3.0 сек</option>
              <option value="5.0" className="bg-slate-900 text-white">5.0 сек</option>
            </select>
          </div>

          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-glow-gold"
          >
            <Plus className="w-4 h-4" />
            <span>Сохранить текущий микс</span>
          </button>
        </div>
      </div>

      {/* Modal / Collapse to save new preset */}
      {isCreating && (
        <form onSubmit={handleSaveCurrentMix} className="bg-rpg-panel border border-amber-500/50 p-4 rounded-xl shadow-lg space-y-3 animate-in fade-in">
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
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Категория</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <div
              key={preset.id}
              className={`bg-rpg-panel border rounded-xl p-4 transition-all duration-200 flex flex-col justify-between group shadow-md ${
                isActive
                  ? 'border-amber-500 bg-gradient-to-b from-rpg-panel to-amber-950/20 shadow-glow-gold'
                  : 'border-rpg-border hover:border-slate-600'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shrink-0">
                      {getCategoryIcon(preset.icon)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 font-rpg group-hover:text-amber-400 transition-colors">
                        {preset.name}
                      </h3>
                      <span className="text-[11px] text-amber-500/90 font-medium">
                        {preset.category || 'Сцена'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeletePreset(preset)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                    title="Удалить пресет"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {preset.description && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                    {preset.description}
                  </p>
                )}

                {/* Preset Slots overview */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Слоты сцены:</span>
                    <span className="font-mono text-amber-400">{preset.slots.length} каналов</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {preset.slots.map((s, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300 truncate max-w-[140px]"
                        title={s.title || `Слот ${s.slotIndex + 1}`}
                      >
                        #{s.slotIndex + 1} {s.title || 'Звук'} ({Math.round((s.volume ?? 0.7) * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button: Trigger Preset */}
              <div className="pt-4 mt-3">
                <button
                  onClick={() => {
                    setActivePresetId(preset.id);
                    onApplyPreset(preset, crossfadeSec);
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    isActive
                      ? 'bg-amber-500 text-black shadow-glow-gold'
                      : 'bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-200 border border-slate-700 hover:border-amber-500'
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
