import React from 'react';
import { ChannelState, getSoundEngine } from '../audio/SoundEngine';
import { AudioTrack } from '../types';
import { Play, Pause, Repeat, Disc, Volume2, Square } from 'lucide-react';

interface TouchSoundboardProps {
  channels: ChannelState[];
  onSelectTrackForSlot: (slotIndex: number) => void;
}

export const TouchSoundboard: React.FC<TouchSoundboardProps> = ({
  channels,
  onSelectTrackForSlot
}) => {
  const engine = getSoundEngine();

  return (
    <div className="space-y-3 pb-24 md:pb-6">
      {/* Mobile Soundboard Header */}
      <div className="bg-rpg-panel/80 p-3 rounded-xl border border-rpg-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-amber-400 font-rpg flex items-center gap-2">
            <span>📱</span> Тачпад ведущего (Touch Soundboard)
          </h2>
          <p className="text-[11px] text-slate-400">
            Оптимизировано для пальцевого управления на планшетах и смартфонах
          </p>
        </div>

        <button
          onClick={() => engine.stopAll(1.0)}
          className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold active:scale-95 transition-all"
        >
          Заглушить всё
        </button>
      </div>

      {/* 4x4 Mobile Touch Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {channels.map((channel, idx) => {
          const hasTrack = !!channel.trackId;
          const isPlaying = channel.isPlaying;

          return (
            <div
              key={channel.id}
              className={`relative rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 select-none ${
                isPlaying
                  ? 'border-amber-400 bg-gradient-to-br from-amber-950/40 via-rpg-panel to-slate-900 shadow-glow-gold'
                  : hasTrack
                  ? 'border-rpg-border bg-rpg-panel active:border-slate-500'
                  : 'border-dashed border-slate-800 bg-slate-950/40 text-slate-600'
              }`}
              style={{ minHeight: '120px' }}
            >
              {/* Header: Slot Badge & Loop */}
              <div className="flex items-center justify-between">
                <span className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center font-mono ${
                  isPlaying 
                    ? 'bg-amber-500 text-black shadow-glow-gold' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {idx + 1}
                </span>

                {hasTrack && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.setLoop(idx, !channel.loop);
                    }}
                    className={`p-1 rounded-md text-[10px] font-bold ${
                      channel.loop ? 'text-amber-400 bg-amber-500/20' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title="Зацикленность"
                  >
                    <Repeat className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Center Touch Trigger */}
              {hasTrack ? (
                <div 
                  onClick={() => engine.togglePlay(idx)}
                  className="my-1.5 cursor-pointer flex-1 flex flex-col justify-center items-center text-center active:scale-95 transition-transform"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1.5 transition-colors ${
                    isPlaying 
                      ? 'bg-amber-500 text-black shadow-glow-gold' 
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </div>
                  <p className="text-xs font-semibold text-slate-200 line-clamp-2 leading-tight">
                    {channel.title}
                  </p>
                </div>
              ) : (
                <div 
                  onClick={() => onSelectTrackForSlot(idx)}
                  className="my-2 cursor-pointer flex-1 flex flex-col justify-center items-center text-center hover:text-amber-400 text-slate-500 active:scale-95 transition-transform"
                >
                  <Disc className="w-7 h-7 mb-1 text-slate-600" />
                  <span className="text-[11px] font-medium">+ Выбрать звук</span>
                </div>
              )}

              {/* Bottom Quick Volume Bar */}
              {hasTrack && (
                <div className="pt-1 border-t border-slate-800/80 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-slate-500 shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={channel.volume}
                    onChange={(e) => engine.setVolume(idx, parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-amber-500 rounded-lg bg-slate-800"
                  />
                  <span className="text-[10px] font-mono text-amber-400 shrink-0 w-6 text-right">
                    {Math.round(channel.volume * 100)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
