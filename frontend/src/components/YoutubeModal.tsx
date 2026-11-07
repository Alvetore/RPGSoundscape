import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Clock, 
  User,
  Cookie,
  Upload,
  Trash2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  XCircle
} from 'lucide-react';
import { YoutubeIcon } from './Icons';

interface YoutubeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloaded: () => void;
}

interface VideoInfo {
  title: string;
  duration: number;
  uploader: string;
  thumbnail: string;
  id: string;
}

interface CookieStatus {
  has_cookies_file: boolean;
  file_size: number;
  cookie_source: string;
  available_browsers: string[];
}

export const YoutubeModal: React.FC<YoutubeModalProps> = ({
  isOpen,
  onClose,
  onDownloaded
}) => {
  const [url, setUrl] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [category, setCategory] = useState('YouTube');
  const [tags, setTags] = useState('youtube,ambient');

  const [downloadTaskId, setDownloadTaskId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Cookie settings state
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [selectedBrowser, setSelectedBrowser] = useState<string>('auto');
  const [showCookieSettings, setShowCookieSettings] = useState(false);
  const [showCookieGuide, setShowCookieGuide] = useState(false);
  const [isUploadingCookie, setIsUploadingCookie] = useState(false);
  const cookieFileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch cookie status
  const fetchCookieStatus = async () => {
    try {
      const res = await fetch('/api/youtube/cookies');
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
        setSelectedBrowser(data.cookie_source || 'auto');
      }
    } catch (e) {
      console.warn('Could not fetch cookie status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCookieStatus();
    }
  }, [isOpen]);

  // Poll status when downloading
  useEffect(() => {
    if (!downloadTaskId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/youtube/status/${downloadTaskId}`);
        if (!res.ok) return;
        const data = await res.json();

        setDownloadStatus(data.status);
        if (data.percent !== undefined) {
          setDownloadPercent(data.percent);
        }

        if (data.status === 'completed') {
          clearInterval(interval);
          setDownloadTaskId(null);
          onDownloaded();
        } else if (data.status === 'error') {
          clearInterval(interval);
          setDownloadError(data.error || 'Ошибка при скачивании аудио');
          setDownloadStatus(null);
          setDownloadTaskId(null);
        } else if (data.status === 'cancelled') {
          clearInterval(interval);
          setDownloadStatus(null);
          setDownloadTaskId(null);
          setDownloadError('Скачивание отменено пользователем');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [downloadTaskId, onDownloaded]);

  if (!isOpen) return null;

  const handleCheckUrl = async () => {
    if (!url.trim()) return;
    setIsChecking(true);
    setDownloadError(null);
    setVideoInfo(null);

    try {
      const res = await fetch('/api/youtube/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: url.trim(),
          browser: selectedBrowser 
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Не удалось получить информацию о видео');
      }

      const data = await res.json();
      setVideoInfo(data);
      setCustomTitle(data.title);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
      if (msg.includes('cookies') || msg.includes('бот')) {
        setShowCookieSettings(true);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setDownloadError(null);
    setDownloadStatus('starting');
    setDownloadPercent(0);

    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          title: customTitle.trim() || undefined,
          category: category,
          tags: tagList,
          browser_cookies: selectedBrowser
        })
      });

      if (!res.ok) {
        throw new Error('Ошибка запуска загрузки');
      }

      const data = await res.json();
      setDownloadTaskId(data.task_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
      setDownloadStatus(null);
      if (msg.includes('cookies') || msg.includes('бот')) {
        setShowCookieSettings(true);
      }
    }
  };

  const handleCancelDownload = async () => {
    if (!downloadTaskId) {
      setDownloadStatus(null);
      setDownloadTaskId(null);
      return;
    }
    setDownloadStatus('cancelling');
    try {
      await fetch(`/api/youtube/cancel/${downloadTaskId}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel download:', err);
      setDownloadStatus(null);
      setDownloadTaskId(null);
    }
  };

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCookie(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/youtube/cookies', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Ошибка сохранения cookies');
      await fetchCookieStatus();
      setDownloadError(null);
      alert('Файл cookies.txt успешно загружен и активирован!');
    } catch (err) {
      alert('Ошибка при загрузке cookies.txt');
    } finally {
      setIsUploadingCookie(false);
      if (cookieFileInputRef.current) cookieFileInputRef.current.value = '';
    }
  };

  const handleDeleteCookie = async () => {
    if (window.confirm('Удалить сохраненный файл cookies.txt?')) {
      await fetch('/api/youtube/cookies', { method: 'DELETE' });
      await fetchCookieStatus();
    }
  };

  const handleBrowserChange = async (browser: string) => {
    setSelectedBrowser(browser);
    try {
      await fetch('/api/youtube/cookies/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: browser })
      });
    } catch (e) {
      console.warn('Error saving cookie mode:', e);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-rpg-panel border border-rpg-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-rpg-border flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center">
              <YoutubeIcon className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-rpg">
                Загрузчик звуков и музыки с YouTube
              </h2>
              <p className="text-[11px] text-slate-400">
                Конвертация в MP3 192kbps для оффлайн воспроизведения на сессиях
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* URL Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Ссылка на YouTube видео или трек
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-500"
              />
              <button
                type="button"
                onClick={handleCheckUrl}
                disabled={isChecking || !url.trim()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-all shrink-0"
              >
                {isChecking ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Search className="w-4 h-4 text-amber-400" />
                )}
                <span>Проверить</span>
              </button>
            </div>
          </div>

          {/* Video Preview Card (if fetched) */}
          {videoInfo && (
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex gap-3 animate-in fade-in">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-20 h-16 object-cover rounded-lg shrink-0 border border-slate-700"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-200 truncate" title={videoInfo.title}>
                  {videoInfo.title}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-500" />
                    {videoInfo.uploader}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {formatDuration(videoInfo.duration)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Form: Metadata and Category */}
          <form onSubmit={handleStartDownload} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Название в библиотеке
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Название трека для мастера"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Категория
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Tavern">Таверна / Город</option>
                  <option value="Dungeon">Подземелье</option>
                  <option value="Combat">Бой / Битва</option>
                  <option value="Wilderness">Природа / Лес</option>
                  <option value="Weather">Погода / Дождь</option>
                  <option value="Magic">Магия / Мистика</option>
                  <option value="YouTube">YouTube</option>
                  <option value="General">Общее</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Теги
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="rain, combat, boss"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Error Message with action to show cookie settings */}
            {downloadError && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-400">Внимание от YouTube:</p>
                    <p className="mt-0.5 text-slate-300 text-[11px] leading-relaxed">{downloadError}</p>
                  </div>
                </div>

                {!cookieStatus?.has_cookies_file && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCookieSettings(true);
                      cookieFileInputRef.current?.click();
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Загрузить cookies.txt для обхода проверки</span>
                  </button>
                )}
              </div>
            )}

            {/* Progress / Status display */}
            {downloadStatus && (
              <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-amber-400 flex items-center gap-1.5">
                    {downloadStatus === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : downloadStatus === 'cancelling' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    )}
                    {downloadStatus === 'downloading'
                      ? 'Скачивание аудио...'
                      : downloadStatus === 'converting'
                      ? 'Конвертация в MP3 (FFmpeg)...'
                      : downloadStatus === 'cancelling'
                      ? 'Остановка и отмена...'
                      : downloadStatus === 'completed'
                      ? 'Скачивание успешно завершено!'
                      : 'Подготовка...'}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-300">
                      {downloadPercent}%
                    </span>
                    {(downloadStatus === 'downloading' || downloadStatus === 'starting') && (
                      <button
                        type="button"
                        onClick={handleCancelDownload}
                        className="px-2 py-0.5 text-xs text-rose-400 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 rounded border border-rose-800/60 transition-colors flex items-center gap-1"
                        title="Остановить скачивание"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Отмена</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${downloadStatus === "cancelling" ? "bg-rose-500" : "bg-amber-500"}`}
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Download Button */}
            <div className="pt-2 flex items-center gap-2">
              {downloadTaskId ? (
                <>
                  <button
                    type="button"
                    disabled
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed border border-slate-700"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>
                      {downloadStatus === 'cancelling'
                        ? 'Отмена скачивания...'
                        : `Скачивание: ${downloadPercent}%`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDownload}
                    disabled={downloadStatus === 'cancelling'}
                    className="px-4 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-200 hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Остановить</span>
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-glow-gold"
                >
                  {downloadStatus === 'completed' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Скачать ещё один</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Скачать в оффлайн библиотеку</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>

          {/* YouTube Authentication & Cookies Settings Accordion */}
          <div className="pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowCookieSettings(!showCookieSettings)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-amber-400 font-medium py-1 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-400" />
                <span>Авторизация YouTube & Cookies (Обход проверки бота)</span>
              </div>
              <div className="flex items-center gap-2">
                {cookieStatus?.has_cookies_file ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold">
                    Файл подключен
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Не настроено
                  </span>
                )}
                {showCookieSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showCookieSettings && (
              <div className="mt-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs animate-in fade-in">
                
                {/* Status and file controls */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">🍪</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 text-xs truncate">
                        {cookieStatus?.has_cookies_file ? 'Файл cookies.txt активен' : 'Файл cookies.txt отсутствует'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {cookieStatus?.has_cookies_file 
                          ? `Размер: ${Math.round(cookieStatus.file_size / 1024)} KB • yt-dlp авторизован` 
                          : 'Используется для подтверждения аккаунта при защите от ботов'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="file"
                      ref={cookieFileInputRef}
                      onChange={handleCookieUpload}
                      accept=".txt"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => cookieFileInputRef.current?.click()}
                      disabled={isUploadingCookie}
                      className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{cookieStatus?.has_cookies_file ? 'Заменить' : 'Загрузить .txt'}</span>
                    </button>

                    {cookieStatus?.has_cookies_file && (
                      <button
                        type="button"
                        onClick={handleDeleteCookie}
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700"
                        title="Удалить файл cookies"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Browser Selection */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Источник cookies для загрузчика:
                  </label>
                  <select
                    value={selectedBrowser}
                    onChange={(e) => handleBrowserChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="auto">Авто (cookies.txt если есть, иначе прямо из браузера)</option>
                    <option value="file">Только загруженный cookies.txt</option>
                    <option value="chrome">Google Chrome</option>
                    <option value="firefox">Mozilla Firefox</option>
                    <option value="edge">Microsoft Edge</option>
                    <option value="opera">Opera</option>
                    <option value="none">Без cookies (анонимный режим)</option>
                  </select>
                </div>

                {/* Guide toggle */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCookieGuide(!showCookieGuide)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Инструкция: как получить cookies.txt за 30 секунд</span>
                  </button>

                  {showCookieGuide && (
                    <div className="mt-2 p-2.5 rounded-lg bg-black/40 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                      <p className="font-semibold text-amber-400">Простые шаги:</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-400">
                        <li>Установите в Chrome/Firefox бесплатное расширение: <b className="text-slate-200">Get cookies.txt LOCALLY</b>.</li>
                        <li>Откройте сайт <b>youtube.com</b> в вашем браузере (где вы вошли в аккаунт).</li>
                        <li>Нажмите на иконку расширения и нажмите кнопку <b className="text-slate-200">«Export»</b> — сохранится файл <code className="text-amber-300">youtube.com_cookies.txt</code>.</li>
                        <li>Нажмите кнопку <b>«Загрузить .txt»</b> выше и выберите этот файл.</li>
                      </ol>
                      <p className="text-[10px] text-slate-500 italic mt-1">
                        Файл хранится только локально на вашем компьютере и передается напрямую в yt-dlp для подтверждения сессии.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
