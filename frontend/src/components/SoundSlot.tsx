import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Repeat, 
  Volume2, 
  VolumeX, 
  X, 
  Disc, 
  ChevronDown, 
  ChevronUp,
  Sliders,
  Sparkles
} from 'lucide-react';
import { ChannelState, getSoundEngine } from '../audio/SoundEngine';
import { AudioTrack } from '../types';

interface SoundSlotProps {
  channel: ChannelState;
  index: number;
  onSelectTrackForSlot: (slotIndex: number) => void;
  onDropTrack: (slotIndex: number, track: AudioTrack) => void;
}

export const SoundSlot: React.FC<SoundSlotProps> = ({
  channel,
  index,
  onSelectTrackForSlot,
  onDropTrack
}) => {
  const engine = getSoundEngine();
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const track: AudioTrack = JSON.parse(dataStr);
        onDropTrack(index, track);
      }
    } catch (err) {
      console.error('Failed to parse dropped track:', err);
    }
  };

  const hasTrack = !!channel.trackId;

  // VU meter gradient
  const levelPercent = Math.min(100, channel.audioLevel);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rpg-card rpg-card-hover relative flex flex-col justify-between overflow-hidden transition-all duration-200 ${
        isDragOver
          ? 'border-amber-300/70 bg-amber-500/10 scale-[1.015] shadow-glow-gold'
          : channel.isPlaying
          ? 'border-amber-400/35 shadow-[0_20px_45px_-28px_rgba(234,179,8,0.55)]'
          : 'hover:border-slate-500/30'
      }`}
    >
      {channel.isPlaying && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
      )}

      {/* Top Bar: Slot ID, Title, Unload */}
      <div className="border-b border-white/[0.055] p-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
              channel.isPlaying 
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-glow-gold' 
                : 'border border-white/[0.07] bg-black/25 text-slate-400'
            }`}>
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p 
                className={`truncate text-xs font-semibold ${
                  hasTrack ? 'text-slate-100' : 'italic text-slate-500'
                }`}
                title={channel.title}
              >
                {channel.title}
              </p>
              {hasTrack ? (
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                  <span className="text-slate-400">{formatTime(channel.currentTime)}</span>
                  <span className="text-slate-700">/</span>
                  <span>{formatTime(channel.duration)}</span>
                  <span className={`ml-1 h-1 w-1 rounded-full ${channel.isPlaying ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className={channel.isPlaying ? 'text-emerald-400/90' : ''}>
                    {channel.isPlaying ? 'playing' : 'paused'}
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-[10px] text-slate-600">Свободный канал</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => engine.toggleSolo(index)}
              title={channel.isSolo ? "Отключить соло" : "Соло этого канала"}
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold transition-colors ${
                channel.isSolo
                  ? 'border-amber-300/50 bg-amber-400/20 text-amber-300'
                  : 'border-white/[0.06] bg-black/20 text-slate-500 hover:border-white/15 hover:text-slate-200'
              }`}
            >
              S
            </button>

            <button
              onClick={() => engine.toggleMute(index)}
              title={channel.isMuted ? "Включить звук" : "Заглушить канал"}
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold transition-colors ${
                channel.isMuted
                  ? 'border-red-400/50 bg-red-500/20 text-red-300'
                  : 'border-white/[0.06] bg-black/20 text-slate-500 hover:border-white/15 hover:text-slate-200'
              }`}
            >
              M
            </button>

            {hasTrack && (
              <button
                onClick={() => engine.clearSlot(index)}
                title="Очистить слот"
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${levelPercent}%`,
              background: levelPercent > 80
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                : levelPercent > 50
                ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                : 'linear-gradient(90deg, #059669, #10b981)',
              boxShadow: levelPercent > 0 ? '0 0 10px rgba(16,185,129,0.45)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Main Controls Body */}
      <div className="flex flex-1 flex-col justify-center space-y-3 p-3.5">
        
        {hasTrack ? (
          <>
            <div className="flex items-center justify-between gap-2">
              
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => engine.togglePlay(index)}
                  className={`flex h-10 w-12 items-center justify-center rounded-xl transition-all ${
                    channel.isPlaying
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-glow-gold hover:from-amber-200 hover:to-amber-400'
                      : 'border border-white/[0.09] bg-white/[0.04] text-slate-200 hover:border-amber-300/30 hover:bg-white/[0.07]'
                  }`}
                  title={channel.isPlaying ? "Пауза" : "Воспроизвести"}
                >
                  {channel.isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="ml-0.5 w-4 h-4 fill-current" />
                  )}
                </button>

                <button
                  onClick={() => engine.stopSlot(index)}
                  className="flex h-10 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-white"
                  title="Остановить и перемотать в начало"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              <button
                onClick={() => engine.setLoop(index, !channel.loop)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-all ${
                  channel.loop
                    ? 'border-amber-300/35 bg-amber-400/10 text-amber-300'
                    : 'border-white/[0.06] bg-black/20 text-slate-500 hover:border-white/15 hover:text-slate-300'
                }`}
                title={channel.loop ? "Зацикленность ВКЛЮЧЕНА (бесконечно)" : "Зацикленность ВЫКЛЮЧЕНА (сыграет 1 раз)"}
              >
                <Repeat className={`w-3.5 h-3.5 ${channel.loop ? 'animate-spin-slow' : ''}`} />
                <span>Петля</span>
              </button>

            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  {channel.isMuted || channel.volume === 0 ? (
                    <VolumeX className="w-3 h-3 text-red-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-slate-400" />
                  )}
                  Громкость
                </span>
                <span className="font-mono font-semibold text-amber-300">
                  {Math.round(channel.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={channel.volume}
                onChange={(e) => engine.setVolume(index, parseFloat(e.target.value))}
                className="w-full cursor-pointer bg-slate-800"
                aria-label={`Громкость канала ${index + 1}`}
              />
            </div>

            {channel.duration > 0 && (
              <input
                type="range"
                min="0"
                max={channel.duration || 100}
                step="0.1"
                value={channel.currentTime}
                onChange={(e) => engine.seek(index, parseFloat(e.target.value))}
                className="h-1 w-full cursor-pointer bg-slate-800 accent-sky-400"
                title="Перемотка дорожки"
                aria-label={`Перемотка канала ${index + 1}`}
              />
            )}

            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between py-1 text-[10px] text-slate-500 transition-colors hover:text-slate-300"
              >
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3" />
                  Панорама & Скорость
                </span>
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showAdvanced && (
                <div className="space-y-2.5 border-t border-white/[0.06] pt-2.5 animate-in fade-in duration-150">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Панорама (L/R)</span>
                      <span className="font-mono">
                        {channel.pan < -0.05 ? `L ${Math.abs(Math.round(channel.pan * 100))}%` : channel.pan > 0.05 ? `R ${Math.round(channel.pan * 100)}%` : 'Центр'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={channel.pan}
                      onChange={(e) => engine.setPan(index, parseFloat(e.target.value))}
                      className="mt-1 h-1 w-full cursor-pointer bg-slate-800"
                      aria-label={`Панорама канала ${index + 1}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Темп / Питч:</span>
                    <div className="flex items-center gap-1">
                      {[0.75, 1.0, 1.25].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => engine.setPlaybackRate(index, rate)}
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                            Math.abs(channel.playbackRate - rate) < 0.05
                              ? 'bg-amber-400 text-[#211906]'
                              : 'border border-white/[0.05] bg-black/20 text-slate-500 hover:text-slate-200'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div 
            onClick={() => onSelectTrackForSlot(index)}
            className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.09] bg-black/10 p-5 text-center transition-all hover:border-amber-300/35 hover:bg-amber-400/[0.04]"
          >
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-slate-600 transition-colors group-hover:border-amber-300/25 group-hover:text-amber-300">
              <Disc className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-slate-300 group-hover:text-amber-200">
              Выбрать звук
            </p>
            <p className="mt-0.5 text-[10px] text-slate-600">
              или перетащите из библиотеки
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
