package com.rpg.soundscape;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import fi.iki.elonen.NanoHTTPD;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class LocalLibraryServerTest {
    private LocalLibraryServer server;
    private String baseUrl;

    @Before
    public void setUp() throws IOException {
        Context context = ApplicationProvider.getApplicationContext();
        server = new LocalLibraryServer(context, 0);
        server.start(1000, false);
        baseUrl = "http://127.0.0.1:" + server.getListeningPort();
    }

    @After
    public void tearDown() {
        if (server != null) {
            server.stop();
        }
    }

    @Test
    public void servesInfoAndBundledFrontend() throws Exception {
        String info = read(new URL(baseUrl + "/api/info"));
        assertTrue(info.contains("\"mode\":\"local\""));
        assertTrue(info.contains("\"status\":\"online\""));

        String index = read(new URL(baseUrl + "/"));
        assertTrue(index.contains("id=\"root\""));
    }

    @Test
    public void uploadsListsAndStreamsAudioWithRange() throws Exception {
        String boundary = "----RPGSoundscapeTestBoundary";
        byte[] upload = multipartBody(boundary);
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + "/api/upload").openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        connection.setFixedLengthStreamingMode(upload.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(upload);
        }
        assertEquals(200, connection.getResponseCode());
        String trackJson = read(connection.getInputStream());
        JSONObject track = new JSONObject(trackJson);
        String filename = track.getString("filename");
        assertNotNull(track.getString("id"));

        String library = read(new URL(baseUrl + "/api/library"));
        assertTrue(library.contains(filename));
        assertTrue(library.contains("Test track"));

        HttpURLConnection audio = (HttpURLConnection) new URL(
                baseUrl + "/api/audio/" + filename).openConnection();
        audio.setRequestProperty("Range", "bytes=0-9");
        assertEquals(206, audio.getResponseCode());
        assertEquals("bytes 0-9/4096", audio.getHeaderField("Content-Range"));
        try (InputStream input = audio.getInputStream()) {
            byte[] chunk = new byte[10];
            int read = input.read(chunk);
            assertEquals(10, read);
        }

        HttpURLConnection delete = (HttpURLConnection) new URL(
                baseUrl + "/api/library/" + track.getString("id")).openConnection();
        delete.setRequestMethod("DELETE");
        assertEquals(200, delete.getResponseCode());
    }

    @Test
    public void importsDesktopLibraryZip() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        LibraryStore store = new LibraryStore(context);
        LibraryStore.ImportResult result = store.importZip(
                new ByteArrayInputStream(libraryZip()));
        assertTrue(result.tracks >= 1);
        assertTrue(result.presets >= 1);
        assertEquals(1, result.audioFiles);
        assertNotNull(store.getAudioFile("imported.mp3"));
        assertTrue(store.getTracks().toString().contains("Imported Track"));
        assertTrue(store.getPresets().toString().contains("Remote scene"));
    }

    @Test
    public void transfersLibraryFromDesktopHttpEndpoint() throws Exception {
        final byte[] zip = libraryZip();
        NanoHTTPD desktop = new NanoHTTPD("127.0.0.1", 0) {
            @Override
            public Response serve(IHTTPSession session) {
                return newFixedLengthResponse(
                        Response.Status.OK,
                        "application/zip",
                        new ByteArrayInputStream(zip),
                        zip.length);
            }
        };
        desktop.start(1000, false);

        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<LibraryStore.ImportResult> result = new AtomicReference<>();
        AtomicReference<String> error = new AtomicReference<>();
        String url = "http://127.0.0.1:" + desktop.getListeningPort()
                + "/api/library/export?token=test&transfer=library";
        try {
            new TransferClient(ApplicationProvider.getApplicationContext())
                    .downloadAndImport(url, new TransferClient.Callback() {
                        @Override
                        public void onProgress(int percent) {
                        }

                        @Override
                        public void onComplete(LibraryStore.ImportResult imported) {
                            result.set(imported);
                            finished.countDown();
                        }

                        @Override
                        public void onError(String message) {
                            error.set(message);
                            finished.countDown();
                        }
                    });
            assertTrue(finished.await(15, TimeUnit.SECONDS));
            assertEquals(null, error.get());
            assertNotNull(result.get());
            assertEquals(1, result.get().audioFiles);
        } finally {
            desktop.stop();
        }
    }

    private static byte[] libraryZip() throws IOException {
        ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(zipBytes)) {
            put(zip, "manifest.json",
                    "{\"format\":\"rpg-soundscape-library\",\"version\":1,\"tracks\":1}");
            put(zip, "library.json",
                    "[{\"id\":\"remote-1\",\"title\":\"Imported Track\","
                            + "\"filename\":\"imported.mp3\",\"duration\":0,"
                            + "\"category\":\"YouTube\",\"tags\":[\"remote\"],"
                            + "\"source\":\"youtube\",\"filesize\":4096,"
                            + "\"date_added\":\"2026-11-08T00:00:00\"}]");
            put(zip, "presets.json",
                    "[{\"id\":\"remote-preset\",\"name\":\"Remote scene\","
                            + "\"slots\":[{\"slotIndex\":0,\"filename\":\"imported.mp3\","
                            + "\"volume\":0.8,\"active\":true}]}]");
            zip.putNextEntry(new ZipEntry("audio/imported.mp3"));
            byte[] audio = new byte[4096];
            audio[0] = 'I';
            audio[1] = 'D';
            audio[2] = '3';
            zip.write(audio);
            zip.closeEntry();
        }
        return zipBytes.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String value) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(value.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static byte[] multipartBody(String boundary) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        write(out, "--" + boundary + "\r\n");
        write(out, "Content-Disposition: form-data; name=\"filename\"\r\n\r\n");
        write(out, "test_track.mp3\r\n");
        write(out, "--" + boundary + "\r\n");
        write(out, "Content-Disposition: form-data; name=\"category\"\r\n\r\n");
        write(out, "Local\r\n");
        write(out, "--" + boundary + "\r\n");
        write(out, "Content-Disposition: form-data; name=\"tags\"\r\n\r\n");
        write(out, "unit,test\r\n");
        write(out, "--" + boundary + "\r\n");
        write(out, "Content-Disposition: form-data; name=\"file\"; filename=\"test_track.mp3\"\r\n");
        write(out, "Content-Type: audio/mpeg\r\n\r\n");
        byte[] audio = new byte[4096];
        audio[0] = 'I';
        audio[1] = 'D';
        audio[2] = '3';
        out.write(audio);
        write(out, "\r\n--" + boundary + "--\r\n");
        return out.toByteArray();
    }

    private static void write(OutputStream out, String value) throws IOException {
        out.write(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String read(URL url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try (InputStream input = connection.getInputStream()) {
            return new String(readAll(input), StandardCharsets.UTF_8);
        }
    }

    private static String read(InputStream input) throws IOException {
        return new String(readAll(input), StandardCharsets.UTF_8);
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }
}
