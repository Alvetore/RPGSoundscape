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

  return (
    <div className="space-y-4">
      {/* Mixer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-rpg-panel/60 p-3 rounded-xl border border-rpg-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Отображение:
          </span>

          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setBankMode('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                bankMode === 'all'
                  ? 'bg-amber-500 text-black shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Все 16 слотов
            </button>
            <button
              onClick={() => setBankMode('bankA')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                bankMode === 'bankA'
                  ? 'bg-amber-500 text-black shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Банк 1-8
            </button>
            <button
              onClick={() => setBankMode('bankB')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                bankMode === 'bankB'
                  ? 'bg-amber-500 text-black shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Банк 9-16
            </button>
          </div>
        </div>

        {/* Quick Utility Actions */}
        <div className="flex items-center gap-2">
          {library.length > 0 && (
            <button
              onClick={handleRandomMix}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all"
              title="Автоматически собрать атмосферный эмбиент из случайных звуков"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Случайный эмбиент</span>
            </button>
          )}

          <button
            onClick={handleClearAllSlots}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/60 text-xs transition-all"
            title="Очистить все слоты"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Очистить микшер</span>
          </button>
        </div>
      </div>

      {/* 16 Audio Slots Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
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
