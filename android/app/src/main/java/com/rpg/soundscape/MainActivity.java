package com.rpg.soundscape;

import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import java.net.URI;

public class MainActivity extends AppCompatActivity {
    private static final int FILE_CHOOSER_REQUEST = 2001;
    private static final String PREFS = "rpg_android";
    private static final String PREF_LAST_PC = "last_pc_url";

    private WebView webView;
    private LocalLibraryServer server;
    private SharedPreferences prefs;
    private String mode = "local";
    private String scanPurpose = "remote";
    private ValueCallback<Uri[]> filePathCallback;
    private int pendingLibraryUpdate = -1;
    private boolean pendingOpenLibrary = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        // NanoHTTPD stores multipart uploads under java.io.tmpdir. Point it at
        // the app cache so uploads never depend on an unwritable system path.
        java.io.File cache = getCacheDir();
        if (cache != null) {
            if (!cache.exists()) {
                //noinspection ResultOfMethodCallIgnored
                cache.mkdirs();
            }
            System.setProperty("java.io.tmpdir", cache.getAbsolutePath());
        }

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#090c13"));
        getWindow().setNavigationBarColor(Color.parseColor("#090c13"));

        startLocalServer();
        if (server == null) {
            new AlertDialog.Builder(this)
                    .setTitle("Ошибка запуска")
                    .setMessage("Не удалось запустить локальный сервер библиотеки.")
                    .setPositiveButton("Закрыть", (dialog, which) -> finish())
                    .setCancelable(false)
                    .show();
            return;
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0c0e14"));
        configureWebView();
        setContentView(webView);
        if (!handleDeepLink(getIntent())) {
            loadLocalLibrary();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private boolean handleDeepLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return false;
        }
        Uri data = intent.getData();
        if (data == null || !"rpg".equalsIgnoreCase(data.getScheme())) {
            return false;
        }
        String target = data.getQueryParameter("url");
        if (target == null || target.trim().isEmpty()) {
            Toast.makeText(this, "Ссылка не содержит адрес", Toast.LENGTH_LONG).show();
            return false;
        }
        boolean transfer = "transfer".equalsIgnoreCase(data.getHost())
                || target.contains("transfer=library")
                || target.contains("/api/library/export");
        if (transfer) {
            startTransfer(target);
        } else {
            loadRemote(target);
        }
        return true;
    }

    private void startLocalServer() {
        try {
            server = new LocalLibraryServer(this, 8765);
            server.start(5000, false);
        } catch (Exception first) {
            try {
                server = new LocalLibraryServer(this, 0);
                server.start(5000, false);
            } catch (Exception second) {
                server = null;
            }
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " RPGSoundscapeAndroid/1.1");

        webView.addJavascriptInterface(new AndroidBridge(), "RPGAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalIfNeeded(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalIfNeeded(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (pendingLibraryUpdate >= 0) {
                    int tracks = pendingLibraryUpdate;
                    pendingLibraryUpdate = -1;
                    // Let React mount and register its transfer event handler.
                    view.postDelayed(() -> notifyLibraryUpdated(tracks), 800);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("audio/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Выберите аудиофайлы"),
                            FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Не найдено приложение для выбора файлов",
                            Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    return;
                }
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    String filename = android.webkit.URLUtil.guessFileName(
                            url, contentDisposition, mimeType);
                    request.setTitle(filename);
                    request.setNotificationVisibility(
                            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS, filename);
                    DownloadManager manager =
                            (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (manager != null) {
                        manager.enqueue(request);
                        Toast.makeText(MainActivity.this,
                                "Загрузка началась: " + filename, Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this,
                            "Не удалось скачать файл", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private boolean openExternalIfNeeded(Uri uri) {
        if (uri == null) {
            return true;
        }
        String scheme = uri.getScheme();
        if (scheme == null) {
            return true;
        }
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // no app can handle this scheme
            }
            return true;
        }
        String targetHost = uri.getHost();
        String currentHost = null;
        if (webView.getUrl() != null) {
            currentHost = Uri.parse(webView.getUrl()).getHost();
        }
        if (targetHost != null && (targetHost.equals(currentHost)
                || "127.0.0.1".equals(targetHost)
                || "localhost".equals(targetHost))) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // keep the page usable even without a browser
        }
        return true;
    }

    private void loadLocalLibrary() {
        mode = "local";
        if (server == null) {
            return;
        }
        webView.loadUrl("http://127.0.0.1:" + server.getListeningPort() + "/");
    }

    private void loadRemote(String rawUrl) {
        String url = rawUrl == null ? "" : rawUrl.trim();
        if (url.isEmpty()) {
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        try {
            URI parsed = new URI(url);
            if (parsed.getHost() == null) {
                throw new IllegalArgumentException("Нет адреса компьютера");
            }
            if (!url.contains("token=")) {
                Toast.makeText(this, "В ссылке нет токена доступа", Toast.LENGTH_LONG).show();
                return;
            }
            if (!url.contains("role=")) {
                url += (url.contains("?") ? "&" : "?") + "role=remote";
            }
            mode = "remote";
            prefs.edit().putString(PREF_LAST_PC, url).apply();
            webView.loadUrl(url);
        } catch (Exception e) {
            Toast.makeText(this, "Некорректная ссылка: " + e.getMessage(),
                    Toast.LENGTH_LONG).show();
        }
    }

    private void startScanner(String purpose, String prompt) {
        scanPurpose = purpose;
        new IntentIntegrator(this)
                .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                .setPrompt(prompt)
                .setBeepEnabled(false)
                .setOrientationLocked(false)
                .setBarcodeImageEnabled(false)
                .initiateScan();
    }

    private void startTransfer(String url) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        box.setPadding(padding, padding, padding, padding);

        TextView message = new TextView(this);
        message.setText("Подключение к компьютеру...");
        ProgressBar progress = new ProgressBar(
                this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(true);
        box.addView(message);
        box.addView(progress, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Перенос библиотеки")
                .setView(box)
                .setCancelable(false)
                .create();
        dialog.show();

        new TransferClient(this).downloadAndImport(url, new TransferClient.Callback() {
            @Override
            public void onProgress(int percent) {
                runOnUiThread(() -> {
                    if (percent < 0) {
                        progress.setIndeterminate(true);
                        message.setText("Скачивание библиотеки...");
                    } else {
                        progress.setIndeterminate(false);
                        progress.setProgress(percent);
                        message.setText("Скачивание библиотеки: " + percent + "%");
                    }
                });
            }

            @Override
            public void onComplete(LibraryStore.ImportResult result) {
                runOnUiThread(() -> {
                    if (isFinishing()) {
                        return;
                    }
                    dialog.dismiss();
                    showTransferResult(result);
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    if (isFinishing()) {
                        return;
                    }
                    dialog.dismiss();
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Не удалось перенести библиотеку")
                            .setMessage(error + "\n\nПроверьте, что ПК включён, приложение запущено, "
                                    + "телефон и компьютер в одной Wi-Fi сети, а QR-код свежий.")
                            .setPositiveButton("Понятно", null)
                            .show();
                });
            }
        });
    }

    private void showTransferResult(LibraryStore.ImportResult result) {
        String text = "Треков: " + result.tracks
                + "\nАудиофайлов: " + result.audioFiles
                + "\nСцен: " + result.presets;
        // Always show the local library, including when the transfer was
        // started from a cold deep link and the WebView has no page yet.
        pendingLibraryUpdate = result.tracks;
        loadLocalLibrary();
        new AlertDialog.Builder(this)
                .setTitle("Библиотека перенесена")
                .setMessage(text)
                .setPositiveButton("Открыть библиотеку", (dialog, which) -> openLibraryTab())
                .setNegativeButton("Позже", null)
                .show();
    }

    private void openLibraryTab() {
        if (webView == null) {
            return;
        }
        pendingOpenLibrary = true;
        webView.postDelayed(() -> {
            if (webView != null && pendingOpenLibrary) {
                webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('rpg-android-open-library'))", null);
                pendingOpenLibrary = false;
            }
        }, 900);
    }

    private void notifyLibraryUpdated(int tracks) {
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('rpg-android-library-updated',"
                + "{detail:{tracks:" + tracks + "}}));";
        webView.evaluateJavascript(script, null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        results = new Uri[]{data.getData()};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }

        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult != null) {
            String contents = scanResult.getContents();
            if (contents != null && !contents.trim().isEmpty()) {
                String value = contents.trim();
                if ("transfer".equals(scanPurpose)
                        || value.contains("transfer=library")
                        || value.contains("/api/library/export")) {
                    startTransfer(value);
                } else {
                    loadRemote(value);
                }
            }
            scanPurpose = "remote";
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (!"local".equals(mode)) {
            loadLocalLibrary();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("RPGAndroid");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        if (server != null) {
            server.stop();
            server = null;
        }
        super.onDestroy();
    }

    private class AndroidBridge {
        @JavascriptInterface
        public String getMode() {
            return mode;
        }

        @JavascriptInterface
        public String getVersion() {
            return "1.1.0";
        }

        @JavascriptInterface
        public void scanRemote() {
            runOnUiThread(() -> startScanner(
                    "remote",
                    "Наведите камеру на QR-код пульта в приложении на ПК"));
        }

        @JavascriptInterface
        public void scanTransfer() {
            runOnUiThread(() -> startScanner(
                    "transfer",
                    "Наведите камеру на QR-код переноса библиотеки на ПК"));
        }

        @JavascriptInterface
        public void connectRemote(String url) {
            runOnUiThread(() -> loadRemote(url));
        }

        @JavascriptInterface
        public void openLocal() {
            runOnUiThread(MainActivity.this::loadLocalLibrary);
        }
    }
}
