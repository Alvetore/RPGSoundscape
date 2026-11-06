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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-rpg-panel/95 backdrop-blur-lg border-t border-rpg-border px-2 py-1.5 shadow-2xl flex items-center justify-around">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
              isActive
                ? 'text-amber-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5 mb-0.5" />
              {tab.id === 'mixer' && activeCount > 0 && (
                <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-mono font-bold flex items-center justify-center animate-pulse">
                  {activeCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
