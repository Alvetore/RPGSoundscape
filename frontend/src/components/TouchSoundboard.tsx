import React from 'react';
import { ChannelState, getSoundEngine } from '../audio/SoundEngine';
import { AudioTrack } from '../types';
import { Play, Pause, Repeat, Disc, Volume2, Grid3X3 } from 'lucide-react';

interface TouchSoundboardProps {
  channels: ChannelState[];
  onSelectTrackForSlot: (slotIndex: number) => void;
}

export const TouchSoundboard: React.FC<TouchSoundboardProps> = ({
  channels,
  onSelectTrackForSlot
}) => {
  const engine = getSoundEngine();

  const activeCount = channels.filter((channel) => channel.isPlaying).length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rpg-kicker">Touch board</div>
          <h2 className="mt-1 flex items-center gap-2.5 text-xl font-bold tracking-wide text-white font-rpg">
            <Grid3X3 className="h-5 w-5 text-amber-400" />
            Тачпад ведущего
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Крупные пэды для мгновенного запуска звуков с телефона или планшета
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rpg-pill">{activeCount} активно</span>
          <button
            onClick={() => engine.stopAll(1.0)}
            className="rpg-btn h-9 border-red-500/25 bg-red-500/10 px-3 text-red-300 hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-200"
          >
            Заглушить всё
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {channels.map((channel, idx) => {
          const hasTrack = !!channel.trackId;
          const isPlaying = channel.isPlaying;

          return (
            <div
              key={channel.id}
              className={`rpg-card relative flex select-none flex-col justify-between p-3 transition-all duration-150 ${
                isPlaying
                  ? 'border-amber-300/40 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-transparent shadow-[0_18px_40px_-26px_rgba(234,179,8,0.6)]'
                  : hasTrack
                  ? 'hover:border-white/15'
                  : 'border-dashed border-white/[0.08] bg-black/15'
              }`}
              style={{ minHeight: '132px' }}
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold ${
                  isPlaying 
                    ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906]' 
                    : 'border border-white/[0.06] bg-black/20 text-slate-500'
                }`}>
                  {idx + 1}
                </span>

                {hasTrack && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.setLoop(idx, !channel.loop);
                    }}
                    className={`rounded-md border p-1 text-[10px] font-bold transition-colors ${
                      channel.loop
                        ? 'border-amber-300/30 bg-amber-400/10 text-amber-300'
                        : 'border-white/[0.05] bg-black/20 text-slate-600 hover:text-slate-300'
                    }`}
                    title="Зацикленность"
                  >
                    <Repeat className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {hasTrack ? (
                <div 
                  onClick={() => engine.togglePlay(idx)}
                  className="my-1.5 flex flex-1 cursor-pointer flex-col items-center justify-center text-center transition-transform active:scale-95"
                >
                  <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                    isPlaying 
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-glow-gold' 
                      : 'border border-white/[0.08] bg-white/[0.04] text-slate-300'
                  }`}>
                    {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                  </div>
                  <p className="line-clamp-2 text-xs font-semibold leading-tight text-slate-200">
                    {channel.title}
                  </p>
                </div>
              ) : (
                <div 
                  onClick={() => onSelectTrackForSlot(idx)}
                  className="group my-2 flex flex-1 cursor-pointer flex-col items-center justify-center text-center text-slate-500 transition-transform active:scale-95"
                >
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.05] bg-white/[0.02] text-slate-600 transition-colors group-hover:border-amber-300/25 group-hover:text-amber-300">
                    <Disc className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-medium group-hover:text-amber-300">Выбрать звук</span>
                </div>
              )}

              {hasTrack && (
                <div className="flex items-center gap-1.5 border-t border-white/[0.055] pt-2">
                  <Volume2 className="h-3 w-3 shrink-0 text-slate-600" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={channel.volume}
                    onChange={(e) => engine.setVolume(idx, parseFloat(e.target.value))}
                    className="h-1.5 w-full bg-slate-800"
                    aria-label={`Громкость канала ${idx + 1}`}
                  />
                  <span className="w-6 shrink-0 text-right font-mono text-[10px] text-amber-300">
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
