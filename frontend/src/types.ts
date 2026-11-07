export interface AudioTrack {
  id: string;
  title: string;
  filename: string;
  duration: number;
  category: string;
  tags: string[];
  source: 'youtube' | 'upload' | 'local';
  source_url?: string;
  filesize: number;
  date_added: string;
}

export interface PresetSlot {
  slotIndex: number;
  trackId?: string | null;
  title?: string;
  filename?: string;
  volume?: number;
  loop?: boolean;
  active?: boolean;
  pan?: number;
  playbackRate?: number;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  slots: PresetSlot[];
}

export interface AppInfo {
  status: string;
  app: string;
  version: string;
  lan_ip: string;
  access_url: string;
  transfer_url?: string;
}
