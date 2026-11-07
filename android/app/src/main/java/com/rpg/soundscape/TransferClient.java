package com.rpg.soundscape;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Downloads the desktop library ZIP over Wi-Fi and imports it locally. */
public class TransferClient {
    public interface Callback {
        /** percent is 0..100, or -1 when the server did not send a length. */
        void onProgress(int percent);

        void onComplete(LibraryStore.ImportResult result);

        void onError(String message);
    }

    private final Context context;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public TransferClient(Context context) {
        this.context = context.getApplicationContext();
    }

    public void downloadAndImport(String url, Callback callback) {
        executor.execute(() -> {
            File zip = new File(context.getCacheDir(), "rpg-library-transfer.zip");
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/zip");
                connection.setRequestProperty("Accept-Encoding", "identity");
                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new IOException("Сервер вернул HTTP " + code);
                }

                long total = connection.getContentLengthLong();
                if (total <= 0) {
                    callback.onProgress(-1);
                }
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(zip)) {
                    byte[] buffer = new byte[128 * 1024];
                    long downloaded = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        downloaded += read;
                        if (total > 0) {
                            int percent = (int) Math.min(100, downloaded * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                callback.onProgress(percent);
                            }
                        }
                    }
                }

                LibraryStore store = new LibraryStore(context);
                LibraryStore.ImportResult result;
                try (InputStream input = new FileInputStream(zip)) {
                    result = store.importZip(input);
                }
                callback.onComplete(result);
            } catch (Exception e) {
                callback.onError(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
                //noinspection ResultOfMethodCallIgnored
                zip.delete();
                executor.shutdown();
            }
        });
    }
}
