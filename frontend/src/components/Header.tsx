import React from 'react';
import { 
  Volume2, 
  VolumeX, 
  Square, 
  Play, 
  Smartphone, 
  SlidersHorizontal,
  Bookmark, 
  FolderPlus
} from 'lucide-react';
import { YoutubeIcon } from './Icons';
import { getSoundEngine } from '../audio/SoundEngine';

interface HeaderProps {
  masterVolume: number;
  isMasterMuted: boolean;
  onMasterVolumeChange: (vol: number) => void;
  onToggleMasterMute: () => void;
  activeCount: number;
  totalChannels: number;
  onOpenYoutubeModal: () => void;
  onOpenMobileModal: () => void;
  activeTab: 'mixer' | 'library' | 'presets';
  setActiveTab: (tab: 'mixer' | 'library' | 'presets') => void;
}

export const Header: React.FC<HeaderProps> = ({
  masterVolume,
  isMasterMuted,
  onMasterVolumeChange,
  onToggleMasterMute,
  activeCount,
  totalChannels,
  onOpenYoutubeModal,
  onOpenMobileModal,
  activeTab,
  setActiveTab
}) => {
  const engine = getSoundEngine();

  const handleStopAll = () => {
    engine.stopAll(1.2);
  };

  const handlePlayAll = () => {
    engine.playAll();
  };

  return (
    <header className="sticky top-0 z-40 bg-rpg-panel/90 backdrop-blur-md border-b border-rpg-border px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Status */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-glow-gold text-white font-bold text-xl select-none">
              ⚔️
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-wider text-amber-400 font-rpg drop-shadow-sm flex items-center gap-2">
                RPG SOUNDSCAPE
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-sans border border-amber-500/30 font-medium">
                  16ch Studio
                </span>
              </h1>
              <p className="text-xs text-slate-400">Звуки & Музыка для Настольных Ролевых Игр</p>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
              activeCount > 0 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse' 
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {activeCount} / {totalChannels}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-rpg-bg/80 p-1 rounded-xl border border-rpg-border w-full md:w-auto justify-center">
          <button
            onClick={() => setActiveTab('mixer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'mixer'
                ? 'bg-amber-500 text-black shadow-glow-gold font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Микшер (16)</span>
            {activeCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[11px] rounded-full bg-black/30 text-white font-bold">
                {activeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'library'
                ? 'bg-amber-500 text-black shadow-glow-gold font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            <span>Библиотека</span>
          </button>

          <button
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'presets'
                ? 'bg-amber-500 text-black shadow-glow-gold font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Пресеты сцен</span>
          </button>
        </div>

        {/* Master Controls & Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          
          {/* Quick Global Audio Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePlayAll}
              title="Запустить все загруженные звуки"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Старт</span>
            </button>

            <button
              onClick={handleStopAll}
              title="Плавная остановка всех каналов (Fade out)"
              className="px-2.5 py-1.5 rounded-lg bg-crimson/20 hover:bg-crimson/30 text-red-400 border border-red-500/30 hover:border-red-500/60 text-xs font-semibold flex items-center gap-1 transition-all shadow-sm"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Стоп всё</span>
            </button>
          </div>

          {/* Master Volume Slider */}
          <div className="flex items-center gap-2 bg-rpg-surface px-3 py-1.5 rounded-xl border border-rpg-border">
            <button
              onClick={onToggleMasterMute}
              title={isMasterMuted ? "Включить звук" : "Заглушить мастер"}
              className="text-slate-300 hover:text-amber-400 transition-colors"
            >
              {isMasterMuted ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-amber-400" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMasterMuted ? 0 : masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-20 sm:w-28 accent-amber-500 h-1.5"
            />
            <span className="text-xs font-mono text-slate-300 w-8 text-right">
              {Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%
            </span>
          </div>

          {/* Utility Modals */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenYoutubeModal}
              title="Скачать музыку с YouTube в оффлайн"
              className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 hover:border-red-500/60 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <YoutubeIcon className="w-4 h-4 text-red-400" />
              <span className="hidden xl:inline">YouTube</span>
            </button>

            <button
              onClick={onOpenMobileModal}
              title="Подключить Android / Планшет по Wi-Fi"
              className="p-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 hover:border-sky-500/60 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <Smartphone className="w-4 h-4 text-sky-400" />
              <span className="hidden xl:inline">Android</span>
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};
