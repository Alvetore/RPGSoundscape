import React, { useState } from 'react';
import { ChannelState } from '../audio/SoundEngine';
import { SoundSlot } from './SoundSlot';
import { AudioTrack } from '../types';
import { Sparkles, Trash2, LayoutGrid, Layers } from 'lucide-react';
import { getSoundEngine } from '../audio/SoundEngine';

interface MixerPanelProps {
  channels: ChannelState[];
  onSelectTrackForSlot: (slotIndex: number) => void;
  onDropTrack: (slotIndex: number, track: AudioTrack) => void;
  library: AudioTrack[];
}

export const MixerPanel: React.FC<MixerPanelProps> = ({
  channels,
  onSelectTrackForSlot,
  onDropTrack,
  library
}) => {
  const engine = getSoundEngine();
  const [bankMode, setBankMode] = useState<'all' | 'bankA' | 'bankB'>('all');

  const visibleChannels = channels.filter((_, idx) => {
    if (bankMode === 'bankA') return idx < 8;
    if (bankMode === 'bankB') return idx >= 8;
    return true; // 'all'
  });

  // Random atmosphere generator for quick GM inspiration
  const handleRandomMix = () => {
    if (library.length === 0) return;
    engine.stopAll();

    // Pick 3 random tracks
    const shuffled = [...library].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, Math.min(3, library.length));

    picked.forEach((track, idx) => {
      engine.loadTrackToSlot(idx, track, true);
      engine.setVolume(idx, 0.4 + Math.random() * 0.3);
      engine.setLoop(idx, true);
    });
  };

  const handleClearAllSlots = () => {
    if (window.confirm("Очистить все 16 слотов микшера?")) {
      channels.forEach((_, idx) => engine.clearSlot(idx));
    }
  };

  const activeCount = channels.filter((channel) => channel.isPlaying).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rpg-kicker">Live mixer</div>
          <h2 className="mt-1 flex items-center gap-2.5 text-xl font-bold tracking-wide text-white font-rpg">
            <LayoutGrid className="h-5 w-5 text-amber-400" />
            Микшер каналов
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {activeCount > 0
              ? `${activeCount} источников играют одновременно`
              : 'Перетащите звук из библиотеки в свободный слот'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rpg-pill border-emerald-400/20 bg-emerald-400/5 text-emerald-300">
            <span className={`h-1.5 w-1.5 rounded-full ${activeCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {activeCount > 0 ? 'Audio active' : 'Audio idle'}
          </span>
          <span className="rpg-pill">16 каналов</span>
        </div>
      </div>

      <div className="rpg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rpg-kicker">Банк</span>
          <div className="flex rounded-xl border border-white/[0.07] bg-black/25 p-1 text-xs">
            {[
              { id: 'all' as const, label: 'Все 16', icon: LayoutGrid },
              { id: 'bankA' as const, label: '1–8', icon: Layers },
              { id: 'bankB' as const, label: '9–16', icon: Layers },
            ].map((bank) => {
              const Icon = bank.icon;
              const isActive = bankMode === bank.id;
              return (
                <button
                  key={bank.id}
                  onClick={() => setBankMode(bank.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-sm'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {bank.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {library.length > 0 && (
            <button
              onClick={handleRandomMix}
              className="rpg-btn h-9 border-purple-400/25 bg-purple-500/10 px-3 text-purple-300 hover:border-purple-300/45 hover:bg-purple-500/20 hover:text-purple-200"
              title="Собрать случайный эмбиент из библиотеки"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Случайный эмбиент</span>
            </button>
          )}
          <button
            onClick={handleClearAllSlots}
            className="rpg-btn h-9 border-white/[0.06] px-3 text-slate-400 hover:border-red-400/35 hover:bg-red-500/10 hover:text-red-300"
            title="Очистить все слоты"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Очистить</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleChannels.map((channel) => (
          <SoundSlot
            key={channel.id}
            channel={channel}
            index={channel.id}
            onSelectTrackForSlot={onSelectTrackForSlot}
            onDropTrack={onDropTrack}
          />
        ))}
      </div>
    </div>
  );
};
