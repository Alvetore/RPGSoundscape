package com.rpg.soundscape;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * Tiny loopback HTTP server. It serves the bundled React frontend and a
 * backend-compatible subset of the desktop API backed by on-device storage.
 */
public class LocalLibraryServer extends NanoHTTPD {
    private static final String TAG = "LocalLibraryServer";
    private static final long MAX_UPLOAD_BYTES = 1024L * 1024 * 1024;

    private final Context context;
    private final LibraryStore store;

    public LocalLibraryServer(Context context, int port) {
        super("127.0.0.1", port);
        this.context = context.getApplicationContext();
        this.store = new LibraryStore(this.context);
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        if (uri == null || uri.isEmpty()) {
            uri = "/";
        }
        try {
            uri = URLDecoder.decode(uri, "UTF-8");
        } catch (Exception ignored) {
            // Keep the raw URI when it is not valid percent-encoding.
        }

        Method method = session.getMethod();
        try {
            if ("/health".equals(uri)) {
                return json(Response.Status.OK, "{\"status\":\"ok\",\"app\":\"RPG Soundscape local\"}");
            }
            if ("/api/info".equals(uri)) {
                JSONObject info = new JSONObject();
                info.put("status", "online");
                info.put("app", "RPG Music & Ambience Studio");
                info.put("version", "1.1.0");
                info.put("lan_ip", "127.0.0.1");
                info.put("access_url", "http://127.0.0.1:" + getListeningPort() + "/");
                info.put("transfer_url", "");
                info.put("requires_token", false);
                info.put("mode", "local");
                return json(Response.Status.OK, info.toString());
            }
            if ("/api/library".equals(uri)) {
                if (method == Method.GET) {
                    return json(Response.Status.OK, store.getTracks().toString());
                }
                return error(Response.Status.METHOD_NOT_ALLOWED, "Метод не поддерживается");
            }
            if (uri.startsWith("/api/library/")) {
                String id = uri.substring("/api/library/".length());
                if (id.isEmpty()) {
                    return error(Response.Status.BAD_REQUEST, "Не указан трек");
                }
                if (method == Method.GET) {
                    JSONObject track = store.getTrack(id);
                    return track != null
                            ? json(Response.Status.OK, track.toString())
                            : error(Response.Status.NOT_FOUND, "Трек не найден");
                }
                if (method == Method.PUT) {
                    JSONObject patch = new JSONObject(readBody(session));
                    return store.updateTrack(id, patch)
                            ? json(Response.Status.OK, "{\"status\":\"success\"}")
                            : error(Response.Status.NOT_FOUND, "Трек не найден");
                }
                if (method == Method.DELETE) {
                    return store.deleteTrack(id)
                            ? json(Response.Status.OK, "{\"status\":\"deleted\"}")
                            : error(Response.Status.NOT_FOUND, "Трек не найден");
                }
                return error(Response.Status.METHOD_NOT_ALLOWED, "Метод не поддерживается");
            }
            if (uri.startsWith("/api/audio/")) {
                if (method != Method.GET) {
                    return error(Response.Status.METHOD_NOT_ALLOWED, "Метод не поддерживается");
                }
                return serveAudio(uri.substring("/api/audio/".length()), session);
            }
            if ("/api/upload".equals(uri) && method == Method.POST) {
                return handleUpload(session);
            }
            if ("/api/presets".equals(uri)) {
                if (method == Method.GET) {
                    return json(Response.Status.OK, store.getPresets().toString());
                }
                if (method == Method.POST) {
                    JSONObject preset = new JSONObject(readBody(session));
                    JSONObject saved = store.savePreset(preset);
                    return json(Response.Status.OK, saved.toString());
                }
                return error(Response.Status.METHOD_NOT_ALLOWED, "Метод не поддерживается");
            }
            if (uri.startsWith("/api/presets/")) {
                if (method != Method.DELETE) {
                    return error(Response.Status.METHOD_NOT_ALLOWED, "Метод не поддерживается");
                }
                String id = uri.substring("/api/presets/".length());
                return store.deletePreset(id)
                        ? json(Response.Status.OK, "{\"status\":\"deleted\"}")
                        : error(Response.Status.NOT_FOUND, "Пресет не найден");
            }
            if (uri.startsWith("/api/youtube/")) {
                return error(
                        Response.Status.SERVICE_UNAVAILABLE,
                        "Скачивание YouTube доступно в режиме пульта ПК");
            }
            if ("/ws".equals(uri)) {
                return error(Response.Status.NOT_FOUND, "WebSocket доступен только в режиме пульта ПК");
            }
            return serveStatic(uri);
        } catch (Exception e) {
            Log.e(TAG, "Request failed: " + uri, e);
            return error(Response.Status.INTERNAL_ERROR,
                    e.getMessage() == null ? "Внутренняя ошибка" : e.getMessage());
        }
    }

    private Response handleUpload(IHTTPSession session) throws Exception {
        String contentLength = session.getHeaders().get("content-length");
        if (contentLength != null) {
            try {
                if (Long.parseLong(contentLength) > MAX_UPLOAD_BYTES) {
                    return error(Response.Status.PAYLOAD_TOO_LARGE, "Файл слишком большой");
                }
            } catch (NumberFormatException ignored) {
                // Let NanoHTTPD report malformed lengths.
            }
        }

        Map<String, String> files = new HashMap<>();
        session.parseBody(files);
        String tempPath = files.get("file");
        if (tempPath == null) {
            return error(Response.Status.BAD_REQUEST, "Аудиофайл не получен");
        }
        Map<String, String> params = session.getParms();
        String original = params.get("filename");
        if (original == null || original.isEmpty()) {
            original = params.get("file");
        }
        if (original == null || original.isEmpty()) {
            original = "upload.mp3";
        }
        String category = params.get("category");
        String tags = params.get("tags");
        JSONObject track = store.addUpload(new File(tempPath), original, category, tags);
        return json(Response.Status.OK, track.toString());
    }

    private Response serveAudio(String rawFilename, IHTTPSession session) throws IOException {
        String filename = rawFilename;
        try {
            filename = URLDecoder.decode(rawFilename, "UTF-8");
        } catch (Exception ignored) {
            // already decoded above for the common case
        }
        File file = store.getAudioFile(filename);
        if (file == null || !file.isFile()) {
            return error(Response.Status.NOT_FOUND, "Аудиофайл не найден");
        }

        long length = file.length();
        long start = 0;
        long end = length - 1;
        boolean partial = false;
        String range = session.getHeaders().get("range");
        if (range != null && range.startsWith("bytes=")) {
            String spec = range.substring("bytes=".length()).trim();
            int comma = spec.indexOf(',');
            if (comma >= 0) {
                spec = spec.substring(0, comma);
            }
            int dash = spec.indexOf('-');
            if (dash >= 0) {
                try {
                    String from = spec.substring(0, dash).trim();
                    String to = spec.substring(dash + 1).trim();
                    if (from.isEmpty()) {
                        long suffix = Long.parseLong(to);
                        start = Math.max(0, length - suffix);
                    } else {
                        start = Long.parseLong(from);
                        if (!to.isEmpty()) {
                            end = Long.parseLong(to);
                        }
                    }
                    if (start < 0) {
                        start = 0;
                    }
                    if (end >= length) {
                        end = length - 1;
                    }
                    if (start > end) {
                        Response invalid = newFixedLengthResponse(
                                Response.Status.RANGE_NOT_SATISFIABLE, "text/plain", "");
                        invalid.addHeader("Content-Range", "bytes */" + length);
                        return invalid;
                    }
                    partial = true;
                } catch (NumberFormatException ignored) {
                    start = 0;
                    end = length - 1;
                    partial = false;
                }
            }
        }

        long contentLength = end - start + 1;
        FileInputStream input = new FileInputStream(file);
        skipFully(input, start);
        Response response = newFixedLengthResponse(
                partial ? Response.Status.PARTIAL_CONTENT : Response.Status.OK,
                mimeType(file.getName()),
                input,
                contentLength);
        response.addHeader("Accept-Ranges", "bytes");
        response.addHeader("Cache-Control", "no-cache");
        if (partial) {
            response.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + length);
        }
        return response;
    }

    private Response serveStatic(String uri) {
        String path = "/".equals(uri) ? "index.html" : uri.substring(uri.startsWith("/") ? 1 : 0);
        if (path.contains("..") || path.contains("\\")) {
            return error(Response.Status.FORBIDDEN, "Недопустимый путь");
        }
        AssetManager assets = context.getAssets();
        try (InputStream input = assets.open("www/" + path)) {
            byte[] data = readAll(input);
            Response response = newFixedLengthResponse(
                    Response.Status.OK, mimeType(path), new ByteArrayInputStream(data), data.length);
            response.addHeader(
                    "Cache-Control",
                    path.startsWith("assets/")
                            ? "public, max-age=31536000, immutable"
                            : "no-cache");
            return response;
        } catch (IOException e) {
            if (!path.contains(".")) {
                try (InputStream input = assets.open("www/index.html")) {
                    byte[] data = readAll(input);
                    return newFixedLengthResponse(
                            Response.Status.OK, "text/html; charset=utf-8",
                            new ByteArrayInputStream(data), data.length);
                } catch (IOException ignored) {
                    // fall through to 404
                }
            }
            return error(Response.Status.NOT_FOUND, "Файл не найден");
        }
    }

    private String readBody(IHTTPSession session) throws Exception {
        Map<String, String> files = new HashMap<>();
        session.parseBody(files);
        String body = files.get("postData");
        return body == null ? "{}" : body;
    }

    private Response json(Response.Status status, String body) {
        Response response = newFixedLengthResponse(status, "application/json; charset=utf-8", body);
        response.addHeader("Cache-Control", "no-store");
        return response;
    }

    private Response error(Response.Status status, String message) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("detail", message);
        } catch (Exception ignored) {
            // never fails for a string value
        }
        return json(status, payload.toString());
    }

    private static String mimeType(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
        if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "audio/mp4";
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".webm")) return "audio/webm";
        return "application/octet-stream";
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static void skipFully(InputStream input, long bytes) throws IOException {
        long remaining = bytes;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped <= 0) {
                if (input.read() == -1) {
                    break;
                }
                remaining -= 1;
            } else {
                remaining -= skipped;
            }
        }
    }
}
