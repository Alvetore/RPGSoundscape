// SoundEngine.ts - High performance Web Audio Engine for up to 16 channels

export interface ChannelState {
  id: number;
  trackId: string | null;
  title: string;
  filename: string | null;
  isPlaying: boolean;
  volume: number; // 0.0 to 1.0
  loop: boolean;
  pan: number; // -1.0 to 1.0
  playbackRate: number; // 0.5 to 2.0
  isMuted: boolean;
  isSolo: boolean;
  currentTime: number;
  duration: number;
  audioLevel: number; // 0 to 100 for VU-meter
}

export type ChannelCallback = (channels: ChannelState[]) => void;

class ChannelSlot {
  id: number;
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null = null;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | null = null;
  analyserNode: AnalyserNode;
  ctx: AudioContext;

  trackId: string | null = null;
  title: string = "Пустой слот";
  filename: string | null = null;
  volume: number = 0.7;
  loop: boolean = true;
  pan: number = 0.0;
  playbackRate: number = 1.0;
  isMuted: boolean = false;
  isSolo: boolean = false;
  isPlaying: boolean = false;

  private dataArray: Uint8Array;

  constructor(id: number, ctx: AudioContext, masterNode: GainNode) {
    this.id = id;
    this.ctx = ctx;

    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = this.loop;
    this.audio.preload = "auto";

    // Create gain & analyser
    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.volume, ctx.currentTime);

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 64;
    this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    // Stereo Panner (if supported)
    if (typeof ctx.createStereoPanner === "function") {
      this.pannerNode = ctx.createStereoPanner();
      this.pannerNode.pan.setValueAtTime(0, ctx.currentTime);
      this.gainNode.connect(this.pannerNode);
      this.pannerNode.connect(this.analyserNode);
    } else {
      this.gainNode.connect(this.analyserNode);
    }

    this.analyserNode.connect(masterNode);

    // Event listeners
    this.audio.addEventListener("ended", () => {
      if (!this.loop) {
        this.isPlaying = false;
      }
    });

    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
    });

    this.audio.addEventListener("error", (e) => {
      console.warn(`Audio error in slot ${this.id}:`, e);
      this.isPlaying = false;
    });
  }

  private ensureSourceNode() {
    if (!this.sourceNode) {
      try {
        this.sourceNode = this.ctx.createMediaElementSource(this.audio);
        this.sourceNode.connect(this.gainNode);
      } catch (err) {
        console.error("Failed to create media element source:", err);
      }
    }
  }

  loadTrack(track: { id: string; title: string; filename: string; url?: string }, autoPlay: boolean = false) {
    this.trackId = track.id;
    this.title = track.title;
    this.filename = track.filename;

    const audioUrl = track.url || `/api/audio/${encodeURIComponent(track.filename)}`;
    this.audio.src = audioUrl;
    this.audio.loop = this.loop;
    this.audio.playbackRate = this.playbackRate;
    this.audio.load();

    this.ensureSourceNode();

    if (autoPlay) {
      this.play();
    }
  }

  async play() {
    if (!this.audio.src) return;
    this.ensureSourceNode();
    try {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      await this.audio.play();
      this.isPlaying = true;
    } catch (e) {
      console.warn(`Could not play slot ${this.id}:`, e);
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
  }

  stop(fadeOutSec: number = 0) {
    if (fadeOutSec > 0 && this.isPlaying) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeOutSec);
      setTimeout(() => {
        this.pause();
        this.audio.currentTime = 0;
        this.applyVolume();
      }, fadeOutSec * 1000);
    } else {
      this.pause();
      this.audio.currentTime = 0;
    }
  }

  seek(timeInSeconds: number) {
    if (this.audio.duration && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(timeInSeconds, this.audio.duration));
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolume();
  }

  setLoop(isLoop: boolean) {
    this.loop = isLoop;
    this.audio.loop = isLoop;
  }

  setPan(pan: number) {
    this.pan = Math.max(-1, Math.min(1, pan));
    if (this.pannerNode) {
      this.pannerNode.pan.setValueAtTime(this.pan, this.ctx.currentTime);
    }
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.25, Math.min(4.0, rate));
    this.audio.playbackRate = this.playbackRate;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    this.applyVolume();
  }

  setSolo(solo: boolean) {
    this.isSolo = solo;
  }

  applyVolume(hasSoloInOtherChannels: boolean = false) {
    const now = this.ctx.currentTime;
    let effectiveVolume = this.volume;

    if (this.isMuted) {
      effectiveVolume = 0;
    } else if (hasSoloInOtherChannels && !this.isSolo) {
      effectiveVolume = 0;
    }

    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.linearRampToValueAtTime(effectiveVolume, now + 0.05);
  }

  fadeTo(targetVolume: number, durationSec: number) {
    const now = this.ctx.currentTime;
    this.volume = targetVolume;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(targetVolume, now + durationSec);
  }

  getAudioLevel(): number {
    if (!this.isPlaying || this.isMuted) return 0;
    this.analyserNode.getByteFrequencyData(this.dataArray as any);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const avg = sum / this.dataArray.length;
    return Math.min(100, Math.round((avg / 255) * 100));
  }

  getState(): ChannelState {
    return {
      id: this.id,
      trackId: this.trackId,
      title: this.title,
      filename: this.filename,
      isPlaying: this.isPlaying,
      volume: this.volume,
      loop: this.loop,
      pan: this.pan,
      playbackRate: this.playbackRate,
      isMuted: this.isMuted,
      isSolo: this.isSolo,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      audioLevel: this.getAudioLevel(),
    };
  }

  clear() {
    this.stop();
    this.audio.src = "";
    this.trackId = null;
    this.title = `Слот ${this.id + 1}`;
    this.filename = null;
    this.isPlaying = false;
  }
}

export class SoundEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private slots: ChannelSlot[] = [];
  private totalChannels: number = 16;
  private masterVolume: number = 0.8;
  private isMasterMuted: boolean = false;
  private listeners: ChannelCallback[] = [];
  private animationFrameId: number | null = null;

  constructor(channelCount: number = 16) {
    this.totalChannels = channelCount;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    for (let i = 0; i < this.totalChannels; i++) {
      this.slots.push(new ChannelSlot(i, this.ctx, this.masterGain));
    }

    this.startStateLoop();
  }

  private startStateLoop() {
    const loop = () => {
      this.notifyListeners();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  subscribe(callback: ChannelCallback): () => void {
    this.listeners.push(callback);
    callback(this.getStates());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners() {
    const states = this.getStates();
    for (const listener of this.listeners) {
      listener(states);
    }
  }

  getStates(): ChannelState[] {
    return this.slots.map((s) => s.getState());
  }

  getSlot(index: number): ChannelSlot | undefined {
    return this.slots[index];
  }

  loadTrackToSlot(
    slotIndex: number,
    track: { id: string; title: string; filename: string; url?: string },
    autoPlay: boolean = false
  ) {
    if (this.slots[slotIndex]) {
      this.slots[slotIndex].loadTrack(track, autoPlay);
      this.notifyListeners();
    }
  }

  togglePlay(slotIndex: number) {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    if (slot.isPlaying) {
      slot.pause();
    } else {
      slot.play();
    }
  }

  setVolume(slotIndex: number, volume: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setVolume(volume);
    }
  }

  setLoop(slotIndex: number, loop: boolean) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setLoop(loop);
    }
  }

  setPan(slotIndex: number, pan: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setPan(pan);
    }
  }

  setPlaybackRate(slotIndex: number, rate: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setPlaybackRate(rate);
    }
  }

  seek(slotIndex: number, time: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.seek(time);
    }
  }

  toggleMute(slotIndex: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setMute(!slot.isMuted);
      this.updateSoloMuteState();
    }
  }

  toggleSolo(slotIndex: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.setSolo(!slot.isSolo);
      this.updateSoloMuteState();
    }
  }

  private updateSoloMuteState() {
    const hasSolo = this.slots.some((s) => s.isSolo);
    this.slots.forEach((s) => s.applyVolume(hasSolo));
  }

  clearSlot(slotIndex: number) {
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.clear();
    }
  }

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    const now = this.ctx.currentTime;
    if (!this.isMasterMuted) {
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.05);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  toggleMasterMute() {
    this.isMasterMuted = !this.isMasterMuted;
    const now = this.ctx.currentTime;
    const target = this.isMasterMuted ? 0 : this.masterVolume;
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(target, now + 0.05);
    return this.isMasterMuted;
  }

  stopAll(fadeOutSec: number = 1.0) {
    this.slots.forEach((s) => {
      if (s.isPlaying) {
        s.stop(fadeOutSec);
      }
    });
  }

  playAll() {
    this.slots.forEach((s) => {
      if (s.trackId && !s.isPlaying) {
        s.play();
      }
    });
  }

  /**
   * Smoothly apply a preset across channels with optional crossfade!
   */
  async applyPreset(
    presetSlots: {
      slotIndex: number;
      trackId?: string | null;
      title?: string;
      filename?: string;
      volume?: number;
      loop?: boolean;
      active?: boolean;
      pan?: number;
      playbackRate?: number;
    }[],
    crossfadeSec: number = 1.5,
    libraryTracks: { id: string; title: string; filename: string }[] = []
  ) {
    // 1. If crossfade requested, fade out currently playing slots that are changing
    if (crossfadeSec > 0) {
      for (const slot of this.slots) {
        if (slot.isPlaying) {
          slot.fadeTo(0.001, crossfadeSec * 0.8);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, crossfadeSec * 800));
    }

    // 2. Stop everything
    this.slots.forEach((s) => s.stop());

    // 3. Apply new preset slots
    for (const p of presetSlots) {
      const slot = this.slots[p.slotIndex];
      if (!slot) continue;

      let track = null;
      if (p.trackId) {
        track = libraryTracks.find((t) => t.id === p.trackId);
      }
      if (!track && p.filename) {
        track = libraryTracks.find((t) => t.filename === p.filename);
      }
      if (!track && p.title && p.filename) {
        track = { id: p.trackId || p.filename, title: p.title, filename: p.filename };
      }

      if (track) {
        slot.loadTrack(track, false);
      }

      slot.setVolume(p.volume !== undefined ? p.volume : 0.7);
      slot.setLoop(p.loop !== undefined ? p.loop : true);
      if (p.pan !== undefined) slot.setPan(p.pan);
      if (p.playbackRate !== undefined) slot.setPlaybackRate(p.playbackRate);

      if (p.active && track) {
        if (crossfadeSec > 0) {
          slot.gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);
          slot.play();
          slot.fadeTo(slot.volume, crossfadeSec);
        } else {
          slot.play();
        }
      }
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.slots.forEach((s) => s.stop());
    this.ctx.close();
  }
}

// Global Singleton
let soundEngineInstance: SoundEngine | null = null;

export function getSoundEngine(): SoundEngine {
  if (!soundEngineInstance) {
    soundEngineInstance = new SoundEngine(16);
  }
  return soundEngineInstance;
}
