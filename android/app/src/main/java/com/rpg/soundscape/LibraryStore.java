package com.rpg.soundscape;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Offline library storage for the Android app. Mirrors the metadata shape of
 * the desktop backend so the same React UI can run against it.
 */
public class LibraryStore {
    private static final String TAG = "LibraryStore";
    private static final Set<String> AUDIO_EXTENSIONS = new HashSet<>(Arrays.asList(
            ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".webm", ".aac", ".opus"));
    private static final long MAX_IMPORT_BYTES = 8L * 1024 * 1024 * 1024;

    private final File audioDir;
    private final File libraryFile;
    private final File presetsFile;
    private final Object lock = new Object();

    public LibraryStore(Context context) {
        File root = new File(context.getFilesDir(), "local");
        audioDir = new File(root, "audio_library");
        File dataDir = new File(root, "data");
        if (!audioDir.exists() && !audioDir.mkdirs()) {
            Log.e(TAG, "Could not create audio directory: " + audioDir);
        }
        if (!dataDir.exists() && !dataDir.mkdirs()) {
            Log.e(TAG, "Could not create data directory: " + dataDir);
        }
        libraryFile = new File(dataDir, "library.json");
        presetsFile = new File(dataDir, "presets.json");
        if (!libraryFile.exists()) {
            writeText(libraryFile, "[]");
        }
        if (!presetsFile.exists()) {
            writeText(presetsFile, "[]");
        }
    }

    public File getAudioDir() {
        return audioDir;
    }

    public JSONArray getTracks() {
        synchronized (lock) {
            return readArray(libraryFile);
        }
    }

    public JSONArray getPresets() {
        synchronized (lock) {
            return readArray(presetsFile);
        }
    }

    public File getAudioFile(String filename) {
        if (filename == null) {
            return null;
        }
        String base = new File(filename).getName();
        if (!base.equals(filename) || filename.contains("/") || filename.contains("\\")) {
            return null;
        }
        if (!AUDIO_EXTENSIONS.contains(extension(filename))) {
            return null;
        }
        try {
            File file = new File(audioDir, filename);
            if (!file.getCanonicalFile().getParentFile().equals(audioDir.getCanonicalFile())) {
                return null;
            }
            return file;
        } catch (IOException e) {
            return null;
        }
    }

    public JSONObject getTrack(String id) {
        synchronized (lock) {
            JSONArray tracks = readArray(libraryFile);
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject track = tracks.optJSONObject(i);
                if (track != null && id.equals(track.optString("id"))) {
                    return track;
                }
            }
            return null;
        }
    }

    public JSONObject addUpload(File tempFile, String originalName, String category, String tags) throws IOException {
        String safeOriginal = new File(originalName == null ? "upload.mp3" : originalName).getName();
        String suffix = extension(safeOriginal);
        if (!AUDIO_EXTENSIONS.contains(suffix)) {
            throw new IOException("Неподдерживаемый аудиоформат");
        }
        String id = UUID.randomUUID().toString();
        File destination = new File(audioDir, id + suffix);
        copyFile(tempFile, destination);

        JSONObject track = new JSONObject();
        try {
            track.put("id", id);
            track.put("title", titleFromFilename(safeOriginal));
            track.put("filename", destination.getName());
            track.put("duration", 0);
            track.put("category", category == null || category.isEmpty() ? "Local" : category);
            track.put("tags", splitTags(tags));
            track.put("source", "upload");
            track.put("filesize", destination.length());
            track.put("date_added", nowIso());
        } catch (Exception e) {
            throw new IOException("Не удалось создать метаданные трека", e);
        }

        synchronized (lock) {
            JSONArray tracks = readArray(libraryFile);
            tracks.put(track);
            writeArray(libraryFile, tracks);
        }
        return track;
    }

    public boolean updateTrack(String id, JSONObject patch) {
        synchronized (lock) {
            JSONArray tracks = readArray(libraryFile);
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject track = tracks.optJSONObject(i);
                if (track == null || !id.equals(track.optString("id"))) {
                    continue;
                }
                try {
                    if (patch.has("title")) {
                        track.put("title", patch.optString("title", track.optString("title")));
                    }
                    if (patch.has("category")) {
                        track.put("category", patch.optString("category", track.optString("category")));
                    }
                    if (patch.has("tags")) {
                        track.put("tags", patch.optJSONArray("tags") != null
                                ? patch.optJSONArray("tags")
                                : new JSONArray());
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Could not update track", e);
                    return false;
                }
                writeArray(libraryFile, tracks);
                return true;
            }
            return false;
        }
    }

    public boolean deleteTrack(String id) {
        synchronized (lock) {
            JSONArray tracks = readArray(libraryFile);
            JSONArray kept = new JSONArray();
            String filename = null;
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject track = tracks.optJSONObject(i);
                if (track == null) {
                    continue;
                }
                if (id.equals(track.optString("id"))) {
                    filename = track.optString("filename", null);
                } else {
                    kept.put(track);
                }
            }
            if (filename == null) {
                return false;
            }
            File file = getAudioFile(filename);
            if (file != null && file.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
            writeArray(libraryFile, kept);
            return true;
        }
    }

    public JSONObject savePreset(JSONObject preset) {
        synchronized (lock) {
            JSONArray presets = readArray(presetsFile);
            try {
                String id = preset.optString("id", "");
                if (id.isEmpty()) {
                    id = "preset-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
                    preset.put("id", id);
                }
                int existing = -1;
                for (int i = 0; i < presets.length(); i++) {
                    JSONObject item = presets.optJSONObject(i);
                    if (item != null && id.equals(item.optString("id"))) {
                        existing = i;
                        break;
                    }
                }
                if (existing >= 0) {
                    presets.put(existing, preset);
                } else {
                    presets.put(preset);
                }
                writeArray(presetsFile, presets);
            } catch (Exception e) {
                Log.w(TAG, "Could not save preset", e);
            }
            return preset;
        }
    }

    public boolean deletePreset(String id) {
        synchronized (lock) {
            JSONArray presets = readArray(presetsFile);
            JSONArray kept = new JSONArray();
            boolean removed = false;
            for (int i = 0; i < presets.length(); i++) {
                JSONObject item = presets.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) {
                    removed = true;
                } else if (item != null) {
                    kept.put(item);
                }
            }
            writeArray(presetsFile, kept);
            return removed;
        }
    }

    /**
     * Import the ZIP produced by the desktop /api/library/export endpoint.
     */
    public ImportResult importZip(InputStream input) throws IOException {
        JSONArray importedTracks = null;
        JSONArray importedPresets = null;
        int audioFiles = 0;
        long totalBytes = 0;

        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(input))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = entry.getName().replace('\\', '/');
                if ("library.json".equals(name)) {
                    importedTracks = new JSONArray(readText(zip));
                } else if ("presets.json".equals(name)) {
                    importedPresets = new JSONArray(readText(zip));
                } else if (name.startsWith("audio/")) {
                    String base = new File(name).getName();
                    if (!AUDIO_EXTENSIONS.contains(extension(base))) {
                        continue;
                    }
                    File destination = new File(audioDir, base);
                    File temp = new File(audioDir, base + ".part");
                    long copied = copyStream(zip, temp, MAX_IMPORT_BYTES - totalBytes);
                    totalBytes += copied;
                    if (totalBytes > MAX_IMPORT_BYTES) {
                        //noinspection ResultOfMethodCallIgnored
                        temp.delete();
                        throw new IOException("Библиотека слишком большая для переноса");
                    }
                    if (!temp.renameTo(destination)) {
                        //noinspection ResultOfMethodCallIgnored
                        destination.delete();
                        if (!temp.renameTo(destination)) {
                            //noinspection ResultOfMethodCallIgnored
                            temp.delete();
                            throw new IOException("Не удалось сохранить " + base);
                        }
                    }
                    audioFiles += 1;
                }
            }
        } catch (org.json.JSONException e) {
            throw new IOException("Повреждённый файл библиотеки", e);
        }

        int tracks = 0;
        int presets = 0;
        synchronized (lock) {
            JSONArray library = readArray(libraryFile);
            if (importedTracks != null) {
                for (int i = 0; i < importedTracks.length(); i++) {
                    JSONObject imported = importedTracks.optJSONObject(i);
                    if (imported == null || mergeTrack(library, imported)) {
                        tracks += imported == null ? 0 : 1;
                    } else {
                        tracks += 0;
                    }
                }
                writeArray(libraryFile, library);
            }

            JSONArray existingPresets = readArray(presetsFile);
            if (importedPresets != null) {
                for (int i = 0; i < importedPresets.length(); i++) {
                    JSONObject imported = importedPresets.optJSONObject(i);
                    if (imported == null) {
                        continue;
                    }
                    try {
                        String id = imported.optString("id", "");
                        if (id.isEmpty()) {
                            id = "preset-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
                            imported.put("id", id);
                        }
                        int existing = -1;
                        for (int j = 0; j < existingPresets.length(); j++) {
                            JSONObject item = existingPresets.optJSONObject(j);
                            if (item != null && id.equals(item.optString("id"))) {
                                existing = j;
                                break;
                            }
                        }
                        if (existing >= 0) {
                            existingPresets.put(existing, imported);
                        } else {
                            existingPresets.put(imported);
                        }
                        presets += 1;
                    } catch (Exception e) {
                        Log.w(TAG, "Skipping malformed preset", e);
                    }
                }
                writeArray(presetsFile, existingPresets);
            }
        }

        return new ImportResult(tracks, presets, audioFiles);
    }

    private boolean mergeTrack(JSONArray library, JSONObject imported) {
        try {
            String filename = imported.optString("filename", "");
            File audio = getAudioFile(filename);
            if (filename.isEmpty() || audio == null || !audio.isFile()) {
                return false;
            }
            String id = imported.optString("id", "");
            if (id.isEmpty()) {
                id = UUID.randomUUID().toString();
                imported.put("id", id);
            }
            if (!imported.has("title") || imported.optString("title").isEmpty()) {
                imported.put("title", titleFromFilename(filename));
            }
            if (!imported.has("category")) {
                imported.put("category", "General");
            }
            if (!imported.has("tags") || imported.optJSONArray("tags") == null) {
                imported.put("tags", new JSONArray());
            }
            if (!imported.has("source")) {
                imported.put("source", "local");
            }
            imported.put("filename", filename);
            imported.put("filesize", audio.length());
            if (!imported.has("duration")) {
                imported.put("duration", 0);
            }
            if (!imported.has("date_added")) {
                imported.put("date_added", nowIso());
            }

            int existing = -1;
            for (int i = 0; i < library.length(); i++) {
                JSONObject item = library.optJSONObject(i);
                if (item == null) {
                    continue;
                }
                if (id.equals(item.optString("id")) || filename.equals(item.optString("filename"))) {
                    existing = i;
                    break;
                }
            }
            if (existing >= 0) {
                library.put(existing, imported);
            } else {
                library.put(imported);
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Skipping malformed track", e);
            return false;
        }
    }

    private JSONArray readArray(File file) {
        try {
            String text = readText(file).trim();
            return text.isEmpty() ? new JSONArray() : new JSONArray(text);
        } catch (Exception e) {
            Log.w(TAG, "Could not read " + file.getName(), e);
            return new JSONArray();
        }
    }

    private void writeArray(File file, JSONArray array) {
        try {
            writeText(file, array.toString(2));
        } catch (Exception e) {
            Log.e(TAG, "Could not write " + file.getName(), e);
        }
    }

    private static String readText(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            return new String(readAll(input), StandardCharsets.UTF_8);
        }
    }

    private static String readText(InputStream input) throws IOException {
        return new String(readAll(input), StandardCharsets.UTF_8);
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

    private static void writeText(File file, String text) {
        File temp = new File(file.getParentFile(), file.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException e) {
            Log.e(TAG, "Could not write temp file", e);
            return;
        }
        if (!temp.renameTo(file)) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            if (!temp.renameTo(file)) {
                Log.e(TAG, "Could not replace " + file.getName());
            }
        }
    }

    private static void copyFile(File source, File destination) throws IOException {
        try (InputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            destination.delete();
            throw e;
        }
    }

    private static long copyStream(InputStream input, File destination, long limit) throws IOException {
        long total = 0;
        try (FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (limit > 0 && total > limit) {
                    throw new IOException("Библиотека слишком большая для переноса");
                }
                output.write(buffer, 0, read);
            }
        }
        return total;
    }

    private static JSONArray splitTags(String tags) {
        JSONArray result = new JSONArray();
        if (tags == null) {
            return result;
        }
        for (String tag : tags.split(",")) {
            String clean = tag.trim();
            if (!clean.isEmpty()) {
                result.put(clean);
            }
        }
        return result;
    }

    private static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot).toLowerCase(Locale.US) : "";
    }

    private static String titleFromFilename(String filename) {
        String stem = filename;
        int dot = stem.lastIndexOf('.');
        if (dot > 0) {
            stem = stem.substring(0, dot);
        }
        stem = stem.replace('_', ' ').replace('-', ' ').trim();
        if (stem.isEmpty()) {
            return "Аудиотрек";
        }
        return Character.toUpperCase(stem.charAt(0)) + stem.substring(1);
    }

    private static String nowIso() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
    }

    public static class ImportResult {
        public final int tracks;
        public final int presets;
        public final int audioFiles;

        public ImportResult(int tracks, int presets, int audioFiles) {
            this.tracks = tracks;
            this.presets = presets;
            this.audioFiles = audioFiles;
        }
    }
}
