import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Smartphone, 
  Wifi, 
  Copy, 
  Check, 
  Layers, 
  Tablet
} from 'lucide-react';
import { AppInfo } from '../types';
import { getApiToken } from '../audio/clientRole';

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
}

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  appInfo
}) => {
  const [copied, setCopied] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);

  if (!isOpen) return null;

  const lanIp = appInfo?.lan_ip || window.location.hostname;
  const port = window.location.port || '8000';
  const currentToken = getApiToken();
  // access_url already contains the API token and the actual port. Without
  // it the phone would get a 401 from the token-protected backend.
  const fullUrl =
    appInfo?.access_url ||
    `http://${lanIp}:${port}/${currentToken ? `?token=${encodeURIComponent(currentToken)}&role=remote` : ''}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      // Clipboard API needs a secure context; plain LAN HTTP often lacks it.
      const textarea = document.createElement('textarea');
      textarea.value = fullUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <h2 className="text-sm font-bold text-slate-100 font-rpg">
                Управление с Android / Планшета
              </h2>
              <p className="text-[11px] text-slate-400">
                Пульт мастера для смартфона, iPad или планшета по Wi-Fi
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

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* QR Code and URL */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
            <div className="w-36 h-36 bg-rpg-panel rounded-lg p-2 border border-slate-700 flex items-center justify-center shrink-0">
              <QRCodeSVG
                value={fullUrl}
                size={128}
                bgColor="#151922"
                fgColor="#eab308"
                level="M"
                title="QR-код для подключения телефона"
              />
            </div>

            <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-sky-400 font-semibold">
                <Wifi className="w-4 h-4" />
                <span>Локальная сеть Wi-Fi</span>
              </div>

              <p className="text-xs text-slate-300">
                Отсканируйте камерой телефона или введите в браузере:
              </p>

              <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-lg border border-slate-700">
                <code className="text-xs text-amber-400 font-mono truncate flex-1 px-1">
                  {fullUrl}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                  title="Скопировать ссылку"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Quick instructions */}
          <div className="space-y-2 text-xs text-slate-300">
            <h3 className="font-bold text-slate-200 flex items-center gap-1.5">
              <Tablet className="w-4 h-4 text-amber-400" />
              Как играть на сессии:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
              <li>Подключите телефон/планшет к <b>той же Wi-Fi сети</b>, что и этот компьютер.</li>
              <li>Откройте ссылку в Google Chrome на Android.</li>
              <li>Нажмите в меню Chrome <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b> для полноэкранного режима без рамок.</li>
              <li>Телефон работает как <b>пульт</b>: команды передаются на ПК по WebSocket, а звук идёт через колонки компьютера.</li>
            </ol>
          </div>

          {/* Multiplatform / Android APK info toggle */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setShowAndroidGuide(!showAndroidGuide)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-amber-400 font-medium py-1 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                Сборка автономного APK для Android (Capacitor)
              </span>
              <span>{showAndroidGuide ? '▲' : '▼'}</span>
            </button>

            {showAndroidGuide && (
              <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2 animate-in fade-in">
                <p>
                  Проект построен на <b>Web Audio API + React</b>, что обеспечивает 100% совместимость с Android WebView.
                </p>
                <p className="text-slate-300 font-medium">Для сборки нативного `.apk`:</p>
                <pre className="bg-black/60 p-2 rounded text-[11px] font-mono text-amber-300 overflow-x-auto">
{`npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "RPG Soundscape" com.rpg.soundscape
npm run build
npx cap add android
npx cap open android`}
                </pre>
                <p className="text-[11px] text-slate-500">
                  После этого проект открывается в Android Studio и собирается APK для установки на любой планшет или телефон.
                </p>
              </div>
            )}
          </div>

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
