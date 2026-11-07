import React from 'react';
import { 
  Volume2, 
  VolumeX, 
  Square, 
  Play, 
  Smartphone, 
  SlidersHorizontal,
  Bookmark, 
  FolderPlus,
  Grid,
  Swords,
  Activity,
} from 'lucide-react';
import { YoutubeIcon } from './Icons';
import { getSoundEngine } from '../audio/SoundEngine';
import { isAndroidLocalMode } from '../audio/androidBridge';

interface HeaderProps {
  masterVolume: number;
  isMasterMuted: boolean;
  onMasterVolumeChange: (vol: number) => void;
  onToggleMasterMute: () => void;
  activeCount: number;
  totalChannels: number;
  libraryCount: number;
  presetCount: number;
  onOpenYoutubeModal: () => void;
  onOpenMobileModal: () => void;
  activeTab: 'mixer' | 'soundboard' | 'library' | 'presets';
  setActiveTab: (tab: 'mixer' | 'soundboard' | 'library' | 'presets') => void;
}

export const Header: React.FC<HeaderProps> = ({
  masterVolume,
  isMasterMuted,
  onMasterVolumeChange,
  onToggleMasterMute,
  activeCount,
  totalChannels,
  libraryCount,
  presetCount,
  onOpenYoutubeModal,
  onOpenMobileModal,
  activeTab,
  setActiveTab
}) => {
  const engine = getSoundEngine();
  const androidLocal = isAndroidLocalMode();

  const tabs = [
    { id: 'mixer' as const, label: 'Микшер', icon: SlidersHorizontal },
    { id: 'soundboard' as const, label: 'Тачпад', icon: Grid },
    { id: 'library' as const, label: 'Библиотека', icon: FolderPlus },
    { id: 'presets' as const, label: 'Сцены', icon: Bookmark },
  ];

  const handleStopAll = () => {
    engine.stopAll(1.2);
  };

  const handlePlayAll = () => {
    engine.playAll();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#090c13]/85 px-4 py-3 shadow-[0_18px_50px_-30px_rgba(0,0,0,1)] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/35 bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 text-[#241b05] shadow-glow-gold">
              <Swords className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-[#090c13]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-[0.08em] text-white font-rpg sm:text-xl">
                  RPG Soundscape
                </h1>
                <span className="hidden rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300 sm:inline">
                  16ch
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                <span className={`inline-flex items-center gap-1.5 ${activeCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${activeCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  {activeCount > 0 ? `${activeCount} активно` : 'Тишина в эфире'}
                </span>
                <span className="text-slate-700">/</span>
                <span>{totalChannels} каналов</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 lg:flex">
              <div className="flex items-center gap-1.5" title="Активные каналы">
                <Activity className={`h-3.5 w-3.5 ${activeCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span className="font-mono text-xs font-semibold text-slate-100">
                  {activeCount}
                  <span className="text-slate-600">/{totalChannels}</span>
                </span>
              </div>
              <span className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5" title="Треков в библиотеке">
                <FolderPlus className="h-3.5 w-3.5 text-sky-400" />
                <span className="font-mono text-xs font-semibold text-slate-100">{libraryCount}</span>
              </div>
              <span className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5" title="Сохранённых сцен">
                <Bookmark className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono text-xs font-semibold text-slate-100">{presetCount}</span>
              </div>
            </div>
            <button
              onClick={onOpenMobileModal}
              title="Подключить Android-пульт по Wi-Fi или перенести библиотеку"
              className="rpg-btn h-9 px-3 text-sky-300 hover:border-sky-400/40 hover:text-sky-200"
            >
              <Smartphone className="h-4 w-4" />
              <span className="hidden lg:inline">Android Пульт</span>
            </button>
            {!androidLocal && (
              <button
                onClick={onOpenYoutubeModal}
                title="Скачать музыку с YouTube"
                className="rpg-btn h-9 border-red-500/25 bg-red-500/10 px-3 text-red-300 hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-200"
              >
                <YoutubeIcon className="h-4 w-4" />
                <span className="hidden xl:inline">YouTube</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <nav className="hidden w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/25 p-1 scrollbar-none md:flex lg:w-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
                    isActive
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#221a06] shadow-[0_8px_24px_-14px_rgba(234,179,8,0.85)]'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#221a06]' : 'text-slate-500 group-hover:text-amber-300'}`} />
                  <span>{tab.label}</span>
                  {tab.id === 'mixer' && activeCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'bg-black/20 text-black' : 'bg-amber-400/15 text-amber-300'}`}>
                      {activeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayAll}
              title="Запустить все загруженные звуки"
              className="rpg-btn h-9 flex-1 px-3 text-emerald-300 hover:border-emerald-400/40 hover:text-emerald-200 sm:flex-none"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Старт</span>
            </button>
            <button
              onClick={handleStopAll}
              title="Плавно остановить все каналы"
              className="rpg-btn h-9 flex-1 border-red-500/25 bg-red-500/10 px-3 text-red-300 hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-200 sm:flex-none"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="whitespace-nowrap">Стоп всё</span>
            </button>

            <div className="flex h-9 min-w-[9.5rem] flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 sm:flex-none">
              <button
                onClick={onToggleMasterMute}
                title={isMasterMuted ? 'Включить звук' : 'Заглушить мастер'}
                className="text-slate-400 transition-colors hover:text-amber-300"
              >
                {isMasterMuted ? (
                  <VolumeX className="h-4 w-4 text-red-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-amber-300" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMasterMuted ? 0 : masterVolume}
                onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                className="w-full min-w-16 sm:w-24"
                aria-label="Общая громкость"
              />
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-400">
                {Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
