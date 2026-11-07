const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

app.whenReady().then(async () => {
  session.defaultSession.setUserAgent(CHROME_UA);

  // Inject user cookies
  const cookiePath = 'release/win-unpacked/resources/backend/data/cookies.txt';
  let ok = 0;
  if (fs.existsSync(cookiePath)) {
    const lines = fs.readFileSync(cookiePath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        try {
          const rawDomain = parts[0].trim();
          const cleanDomain = rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain;
          const isSecure = parts[3].trim().toUpperCase() === 'TRUE';
          await session.defaultSession.cookies.set({
            url: (isSecure ? 'https://' : 'http://') + cleanDomain + parts[2].trim(),
            domain: rawDomain,
            path: parts[2].trim(),
            secure: isSecure,
            name: parts[5].trim(),
            value: parts[6].trim()
          });
          ok++;
        } catch (e) {}
      }
    }
  }
  console.log(`Injected ${ok} cookies into Electron session`);

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720
  });

  let interceptedUrl = null;
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['*://*.googlevideo.com/videoplayback*'] },
    (details) => {
      const u = new URL(details.url);
      const itag = u.searchParams.get('itag');
      const mime = u.searchParams.get('mime');
      console.log('Intercepted:', mime, 'ITAG:', itag);
      if (!interceptedUrl && (itag === '18' || mime?.includes('audio') || mime?.includes('video/mp4'))) {
        interceptedUrl = details.url;
        console.log('Starting native download of intercepted stream...');
        
        win.webContents.session.once('will-download', (event, item) => {
          console.log('WILL DOWNLOAD EVENT FIRED!');
          console.log('Total bytes:', item.getTotalBytes());
          console.log('Mime type:', item.getMimeType());
          item.setSavePath(path.join(__dirname, 'test_native_download.mp4'));
          
          item.on('updated', (e, state) => {
            if (state === 'progressing') {
              console.log(`Received: ${item.getReceivedBytes()} / ${item.getTotalBytes()} (${Math.round((item.getReceivedBytes()/item.getTotalBytes())*100)}%)`);
              if (item.getReceivedBytes() > 1000000) {
                console.log('SUCCESS! Cancelling test after 1MB received.');
                item.cancel();
                app.quit();
              }
            }
          });

          item.once('done', (e, state) => {
            console.log('Download done state:', state);
            app.quit();
          });
        });

        win.webContents.downloadURL(interceptedUrl);
      }
    }
  );

  const url = 'https://www.youtube.com/watch?v=kUKcuZkum8M';
  console.log('Navigating to:', url);
  win.loadURL(url).catch(() => {});

  setTimeout(() => {
    if (!interceptedUrl) {
      console.log('Timed out after 15s');
      app.quit();
    }
  }, 15000);
});
