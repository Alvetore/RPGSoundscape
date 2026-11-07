import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Smartphone, 
  Wifi, 
  Copy, 
  Check, 
  Layers, 
  Tablet,
  ScanLine,
  Download,
  ArrowLeft,
  Link2,
  HardDriveDownload
} from 'lucide-react';
import { AppInfo } from '../types';
import { getApiToken } from '../audio/clientRole';
import {
  isAndroidShell,
  getAndroidMode,
  scanAndroidRemote,
  scanAndroidTransfer,
  connectAndroidRemote,
  returnToAndroidLibrary,
} from '../audio/androidBridge';

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
}

type ShareTab = 'remote' | 'library';

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  appInfo
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [shareTab, setShareTab] = useState<ShareTab>('remote');
  const [manualUrl, setManualUrl] = useState('');

  if (!isOpen) return null;

  const androidShell = isAndroidShell();
  const androidMode = getAndroidMode();
  const lanIp = appInfo?.lan_ip || window.location.hostname;
  const port = window.location.port || '8000';
  const currentToken = getApiToken();
  const tokenQuery = currentToken ? `token=${encodeURIComponent(currentToken)}&role=remote` : '';
  const fullUrl =
    appInfo?.access_url ||
    `http://${lanIp}:${port}/${tokenQuery ? `?${tokenQuery}` : ''}`;
  const transferUrl =
    appInfo?.transfer_url ||
    `http://${lanIp}:${port}/api/library/export?token=${encodeURIComponent(currentToken)}&transfer=library`;

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; plain LAN HTTP often lacks it.
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleManualConnect = () => {
    const value = manualUrl.trim();
    if (!value) return;
    connectAndroidRemote(value);
  };

  const title = androidShell
    ? androidMode === 'remote'
      ? 'Подключено к пульту ПК'
      : 'Android Пульт'
    : 'Android Пульт и перенос библиотеки';

  const subtitle = androidShell
    ? androidMode === 'remote'
      ? 'Команды передаются на компьютер по Wi-Fi'
      : 'Подключите телефон к приложению на ПК'
    : 'Пульт мастера и перенос звуков на телефон';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-rpg-panel border border-rpg-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-rpg-border flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-rpg">{title}</h2>
              <p className="text-[11px] text-slate-400">{subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {androidShell ? (
            androidMode === 'remote' ? (
              <>
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-4 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-emerald-200">Пульт подключён</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      Все команды, библиотека и пресеты приходят с компьютера. Звук играет на колонках ПК.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <button
                    onClick={returnToAndroidLibrary}
                    className="rpg-btn h-11 w-full justify-start px-4 text-slate-200"
                  >
                    <ArrowLeft className="h-4 w-4 text-amber-300" />
                    Вернуться в локальную библиотеку
                  </button>
                  <button
                    onClick={() => {
                      scanAndroidTransfer();
                      onClose();
                    }}
                    className="rpg-btn h-11 w-full justify-start px-4 text-sky-200"
                  >
                    <Download className="h-4 w-4 text-sky-300" />
                    Перенести библиотеку с ПК
                  </button>
                  <button
                    onClick={() => {
                      scanAndroidRemote();
                      onClose();
                    }}
                    className="rpg-btn h-11 w-full justify-start px-4 text-slate-300"
                  >
                    <ScanLine className="h-4 w-4 text-slate-400" />
                    Подключиться к другому ПК
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
                    <Wifi className="h-4 w-4" />
                    Телефон и ПК в одной Wi-Fi сети
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    На компьютере нажмите <b className="text-slate-200">«Android Пульт»</b> и отсканируйте
                    нужный QR-код камерой телефона.
                  </p>
                </div>

                <div className="grid gap-2.5">
                  <button
                    onClick={() => {
                      scanAndroidRemote();
                      onClose();
                    }}
                    className="group flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.07] p-3.5 text-left transition-all hover:border-sky-300/45 hover:bg-sky-500/[0.12]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-300">
                      <ScanLine className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Подключиться к пульту ПК</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                        Полный пульт: микшер, тачпад, библиотека и сцены. Звук остаётся на компьютере.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      scanAndroidTransfer();
                      onClose();
                    }}
                    className="group flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3.5 text-left transition-all hover:border-amber-300/45 hover:bg-amber-500/[0.12]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                      <HardDriveDownload className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Перенести библиотеку с ПК</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                        Сканируйте QR-код библиотеки: все треки и сцены загрузятся на телефон для оффлайн-игры.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Link2 className="h-3.5 w-3.5 text-slate-500" />
                    Подключить вручную
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
                      placeholder="http://192.168.0.2:8000/?token=..."
                      className="rpg-input min-w-0 flex-1 px-3 py-2 text-xs"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      onClick={handleManualConnect}
                      disabled={!manualUrl.trim()}
                      className="rpg-btn h-9 shrink-0 px-3 text-xs text-sky-200 disabled:opacity-40"
                    >
                      Войти
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-600">
                    Ссылка с токеном находится в QR-окне на компьютере.
                  </p>
                </div>
              </>
            )
          ) : (
            <>
              {/* PC: choose what to share */}
              <div className="flex rounded-xl border border-white/[0.07] bg-black/25 p-1">
                {[
                  { id: 'remote' as const, label: 'Пульт', icon: ScanLine },
                  { id: 'library' as const, label: 'Библиотека', icon: Download },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = shareTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setShareTab(tab.id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#211906] shadow-sm'
                          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {shareTab === 'remote' ? (
                <>
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                    <div className="w-36 h-36 bg-rpg-panel rounded-lg p-2 border border-slate-700 flex items-center justify-center shrink-0">
                      <QRCodeSVG
                        value={fullUrl}
                        size={128}
                        bgColor="#151922"
                        fgColor="#eab308"
                        level="M"
                        title="QR-код для подключения Android-пульта"
                      />
                    </div>

                    <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-sky-400 font-semibold">
                        <Wifi className="w-4 h-4" />
                        <span>Пульт по локальной сети</span>
                      </div>

                      <p className="text-xs text-slate-300">
                        Отсканируйте QR в Android-приложении или откройте ссылку в браузере:
                      </p>

                      <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-lg border border-slate-700">
                        <code className="text-xs text-amber-400 font-mono truncate flex-1 px-1">
                          {fullUrl}
                        </code>
                        <button
                          onClick={() => handleCopy(fullUrl, 'remote')}
                          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                          title="Скопировать ссылку"
                        >
                          {copied === 'remote' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300">
                    <h3 className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Tablet className="w-4 h-4 text-amber-400" />
                      Как подключить пульт:
                    </h3>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                      <li>Установите APK из <b className="text-slate-200">GitHub Releases</b> или откройте ссылку в Chrome.</li>
                      <li>Подключите телефон к <b>той же Wi-Fi сети</b>, что и компьютер.</li>
                      <li>В приложении нажмите <b className="text-slate-200">«Подключиться к пульту ПК»</b> и отсканируйте QR.</li>
                      <li>Команды идут на ПК по WebSocket, звук — через колонки компьютера.</li>
                    </ol>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                    <div className="w-36 h-36 bg-rpg-panel rounded-lg p-2 border border-slate-700 flex items-center justify-center shrink-0">
                      <QRCodeSVG
                        value={transferUrl}
                        size={128}
                        bgColor="#151922"
                        fgColor="#eab308"
                        level="M"
                        title="QR-код для переноса библиотеки"
                      />
                    </div>

                    <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-amber-400 font-semibold">
                        <Download className="w-4 h-4" />
                        <span>Перенос библиотеки на Android</span>
                      </div>

                      <p className="text-xs text-slate-300">
                        Отсканируйте QR в приложении: телефон скачает все аудиофайлы и пресеты.
                      </p>

                      <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-lg border border-slate-700">
                        <code className="text-xs text-amber-400 font-mono truncate flex-1 px-1">
                          {transferUrl}
                        </code>
                        <button
                          onClick={() => handleCopy(transferUrl, 'transfer')}
                          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                          title="Скопировать ссылку"
                        >
                          {copied === 'transfer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5 text-xs leading-relaxed text-slate-400">
                    <b className="text-slate-200">Как это работает:</b> QR-код содержит только адрес
                    компьютера в локальной сети и токен доступа. Сами аудиофайлы передаются по Wi-Fi,
                    поэтому библиотека может быть любого размера. После переноса телефон играет треки
                    локально, без компьютера.
                  </div>

                  <a
                    href={transferUrl}
                    className="rpg-btn h-10 w-full justify-center text-slate-300"
                    download
                  >
                    <Download className="h-4 w-4 text-amber-300" />
                    Скачать ZIP с библиотекой на этот компьютер
                  </a>
                </>
              )}

              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-sky-400" />
                  Android APK · полный пульт и оффлайн-библиотека
                </span>
                <a
                  href="https://github.com/Alvetore/RPGSoundscape/releases"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 hover:text-sky-200 font-semibold whitespace-nowrap"
                >
                  Скачать APK
                </a>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900/80 border-t border-rpg-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
};
