import React from 'react';
import { SlidersHorizontal, Grid, FolderPlus, Bookmark } from 'lucide-react';

interface MobileNavProps {
  activeTab: 'mixer' | 'soundboard' | 'library' | 'presets';
  setActiveTab: (tab: 'mixer' | 'soundboard' | 'library' | 'presets') => void;
  activeCount: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  activeCount
}) => {
  const tabs = [
    { id: 'mixer', label: 'Микшер', icon: SlidersHorizontal },
    { id: 'soundboard', label: 'Тачпад', icon: Grid },
    { id: 'library', label: 'Звуки', icon: FolderPlus },
    { id: 'presets', label: 'Сцены', icon: Bookmark },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/[0.07] bg-[#090c13]/92 px-2 py-1.5 shadow-[0_-18px_45px_-25px_rgba(0,0,0,1)] backdrop-blur-xl md:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-all ${
              isActive
                ? 'text-amber-300'
                : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            {isActive && (
              <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
            )}
            <div className="relative">
              <Icon className={`mb-0.5 h-5 w-5 ${isActive ? 'scale-105' : ''}`} />
              {tab.id === 'mixer' && activeCount > 0 && (
                <span className="absolute -right-2.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 font-mono text-[9px] font-bold text-[#211906]">
                  {activeCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] tracking-tight ${isActive ? 'font-bold' : ''}`}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
