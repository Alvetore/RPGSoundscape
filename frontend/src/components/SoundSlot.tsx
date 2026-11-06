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
      className={`relative rounded-xl border transition-all duration-200 flex flex-col justify-between overflow-hidden ${
        isDragOver
          ? 'border-amber-400 bg-amber-500/10 scale-[1.02] shadow-glow-gold'
          : channel.isPlaying
          ? 'border-amber-500/50 bg-gradient-to-b from-rpg-panel to-slate-900/90 shadow-lg shadow-amber-500/5'
          : 'border-rpg-border bg-rpg-panel/80 hover:border-slate-600'
      }`}
    >
      {/* Top Bar: Slot ID, Title, Unload */}
      <div className="p-3 pb-2 border-b border-rpg-border/60">
        <div className="flex items-center justify-between gap-2">
          
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`w-6 h-6 rounded-md text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
              channel.isPlaying 
                ? 'bg-amber-500 text-black shadow-glow-gold' 
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p 
                className={`text-xs font-semibold truncate ${
                  hasTrack ? 'text-slate-200' : 'text-slate-500 italic'
                }`}
                title={channel.title}
              >
                {channel.title}
              </p>
              {hasTrack && (
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <span>{formatTime(channel.currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(channel.duration)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action icons: Clear slot, Solo, Mute */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => engine.toggleSolo(index)}
              title={channel.isSolo ? "Отключить соло" : "Соло этого канала"}
              className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
                channel.isSolo
                  ? 'bg-amber-500 text-black shadow-glow-gold'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              S
            </button>

            <button
              onClick={() => engine.toggleMute(index)}
              title={channel.isMuted ? "Включить звук" : "Заглушить канал"}
              className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
                channel.isMuted
                  ? 'bg-crimson text-white shadow-glow-crimson'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              M
            </button>

            {hasTrack && (
              <button
                onClick={() => engine.clearSlot(index)}
                title="Очистить слот"
                className="w-6 h-6 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Real-time LED VU Meter bar */}
        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2.5 flex">
          <div
            className="h-full transition-all duration-75"
            style={{
              width: `${levelPercent}%`,
              backgroundColor: levelPercent > 80 ? '#ef4444' : levelPercent > 50 ? '#f59e0b' : '#10b981',
              boxShadow: levelPercent > 0 ? '0 0 6px currentColor' : 'none',
            }}
          />
        </div>
      </div>

      {/* Main Controls Body */}
      <div className="p-3 space-y-3 flex-1 flex flex-col justify-center">
        
        {hasTrack ? (
          <>
            {/* Primary Transport: Play/Pause, Stop, Loop */}
            <div className="flex items-center justify-between gap-2">
              
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => engine.togglePlay(index)}
                  className={`w-11 h-9 rounded-lg flex items-center justify-center transition-all ${
                    channel.isPlaying
                      ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-glow-gold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                  title={channel.isPlaying ? "Пауза" : "Воспроизвести"}
                >
                  {channel.isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => engine.getSlot(index)?.stop()}
                  className="w-8 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60"
                  title="Остановить и перемотать в начало"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              {/* Loop Toggle */}
              <button
                onClick={() => engine.setLoop(index, !channel.loop)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  channel.loop
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm'
                    : 'bg-slate-800/60 text-slate-500 border-slate-700/50 hover:text-slate-300'
                }`}
                title={channel.loop ? "Зацикленность ВКЛЮЧЕНА (бесконечно)" : "Зацикленность ВЫКЛЮЧЕНА (сыграет 1 раз)"}
              >
                <Repeat className={`w-3.5 h-3.5 ${channel.loop ? 'animate-spin-slow' : ''}`} />
                <span>Петля</span>
              </button>

            </div>

            {/* Volume Fader */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-medium">
                  {channel.isMuted || channel.volume === 0 ? (
                    <VolumeX className="w-3 h-3 text-red-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-slate-400" />
                  )}
                  Громкость
                </span>
                <span className="font-mono text-amber-400 font-semibold">
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
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Seek Bar */}
            {channel.duration > 0 && (
              <div className="space-y-0.5">
                <input
                  type="range"
                  min="0"
                  max={channel.duration || 100}
                  step="0.1"
                  value={channel.currentTime}
                  onChange={(e) => engine.seek(index, parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  title="Перемотка дорожки"
                />
              </div>
            )}

            {/* Advanced Controls Toggle (Pan & Speed) */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-300 py-1"
              >
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3" />
                  Панорама & Скорость
                </span>
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showAdvanced && (
                <div className="pt-2 pb-1 space-y-2 border-t border-slate-800/80 animate-in fade-in duration-150">
                  {/* Stereo Pan */}
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
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  {/* Playback Rate / Pitch */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Темп / Питч:</span>
                    <div className="flex items-center gap-1">
                      {[0.75, 1.0, 1.25].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => engine.setPlaybackRate(index, rate)}
                          className={`text-[9px] px-1.5 py-0.5 rounded ${
                            Math.abs(channel.playbackRate - rate) < 0.05
                              ? 'bg-amber-500 text-black font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
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
          /* Empty Slot Dropzone View */
          <div 
            onClick={() => onSelectTrackForSlot(index)}
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-slate-700/60 hover:border-amber-500/50 hover:bg-amber-500/5 cursor-pointer transition-all text-center group"
          >
            <Disc className="w-7 h-7 text-slate-600 group-hover:text-amber-400 transition-colors mb-1.5" />
            <p className="text-xs font-medium text-slate-300 group-hover:text-amber-300">
              Выбрать звук
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              или перетащите из библиотеки
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
