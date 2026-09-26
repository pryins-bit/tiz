package nodomain.freeyourgadget.gadgetbridge.service.devices.sinilink;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import nodomain.freeyourgadget.gadgetbridge.GBApplication;

public final class SinilinkScheduler {
    public static final String PREF_ENABLED = "sinilink_scheduler_enabled";
    public static final String PREF_WINDOWS = "sinilink_scheduler_windows_v2";
    public static final String PREF_RANDOM_TRACK = "sinilink_scheduler_random_track";
    public static final String PREF_NEXT_AT = "sinilink_scheduler_next_at";
    public static final String PREF_NEXT_WINDOW = "sinilink_scheduler_next_window";

    public static final String INPUT_ADDRESS = "address";
    public static final String INPUT_ACTION = "action";
    public static final String INPUT_WINDOW = "window";
    public static final String ACTION_START = "start";
    public static final String ACTION_STOP = "stop";

    private SinilinkScheduler() {}

    public enum Mode { CONTINUOUS, INTERVAL }

    public static final class Window {
        public final String start;
        public final String end;
        public final int runs;
        public final int minVolume;
        public final int maxVolume;
        public final Mode mode;
        public final int durationSeconds;
        public final int onSeconds;
        public final int offSeconds;
        public final int cycles;

        public Window(String start, String end, int runs, int minVolume, int maxVolume,
                      Mode mode, int durationSeconds, int onSeconds, int offSeconds, int cycles) {
            this.start = start;
            this.end = end;
            this.runs = runs;
            this.minVolume = minVolume;
            this.maxVolume = maxVolume;
            this.mode = mode;
            this.durationSeconds = durationSeconds;
            this.onSeconds = onSeconds;
            this.offSeconds = offSeconds;
            this.cycles = cycles;
        }

        public String encode() {
            return start + "," + end + "," + runs + "," + minVolume + "," + maxVolume + "," +
                    mode.name() + "," + durationSeconds + "," + onSeconds + "," + offSeconds + "," + cycles;
        }

        @Nullable
        public static Window decode(String line) {
            try {
                String[] p = line.split(",", -1);
                if (p.length != 10) return null;
                LocalTime.parse(p[0]);
                LocalTime.parse(p[1]);
                int runs = Integer.parseInt(p[2]);
                int minVol = Integer.parseInt(p[3]);
                int maxVol = Integer.parseInt(p[4]);
                Mode mode = Mode.valueOf(p[5]);
                int duration = Integer.parseInt(p[6]);
                int on = Integer.parseInt(p[7]);
                int off = Integer.parseInt(p[8]);
                int cycles = Integer.parseInt(p[9]);
                if (runs < 1 || minVol < 0 || maxVol > 30 || maxVol < minVol) return null;
                if (duration < 1 || on < 1 || off < 1 || cycles < 1) return null;
                return new Window(p[0], p[1], runs, minVol, maxVol, mode, duration, on, off, cycles);
            } catch (RuntimeException e) {
                return null;
            }
        }
    }

    private static final class Candidate {
        final int windowIndex;
        final long atMillis;
        Candidate(int windowIndex, long atMillis) {
            this.windowIndex = windowIndex;
            this.atMillis = atMillis;
        }
    }

    @NonNull
    public static SharedPreferences prefs(@NonNull String address) {
        return GBApplication.getDeviceSpecificSharedPrefs(address);
    }

    @NonNull
    public static List<Window> getWindows(@NonNull SharedPreferences prefs) {
        List<Window> result = new ArrayList<>();
        String raw = prefs.getString(PREF_WINDOWS, "");
        if (raw == null || raw.trim().isEmpty()) return result;
        for (String line : raw.split("\\n")) {
            Window w = Window.decode(line.trim());
            if (w != null) result.add(w);
        }
        return result;
    }

    public static String encodeWindows(@NonNull List<Window> windows) {
        StringBuilder out = new StringBuilder();
        for (Window window : windows) {
            if (out.length() > 0) out.append('\n');
            out.append(window.encode());
        }
        return out.toString();
    }

    public static void scheduleNext(@NonNull Context context, @NonNull String address) {
        final SharedPreferences prefs = prefs(address);
        final String workName = workName(address, ACTION_START);
        final WorkManager wm = WorkManager.getInstance(context);
        wm.cancelUniqueWork(workName);

        if (!prefs.getBoolean(PREF_ENABLED, false)) {
            clearNext(prefs);
            return;
        }

        List<Window> windows = getWindows(prefs);
        if (windows.isEmpty()) {
            clearNext(prefs);
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        Candidate best = null;
        for (int i = 0; i < windows.size(); i++) {
            Candidate candidate = candidateForWindow(prefs, windows.get(i), i, now);
            if (candidate != null && (best == null || candidate.atMillis < best.atMillis)) best = candidate;
        }

        if (best == null) {
            clearNext(prefs);
            return;
        }

        long delayMs = Math.max(1000L, best.atMillis - System.currentTimeMillis());
        prefs.edit().putLong(PREF_NEXT_AT, best.atMillis).putInt(PREF_NEXT_WINDOW, best.windowIndex).apply();

        Data input = new Data.Builder()
                .putString(INPUT_ADDRESS, address)
                .putString(INPUT_ACTION, ACTION_START)
                .putInt(INPUT_WINDOW, best.windowIndex)
                .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SinilinkSchedulerWorker.class)
                .setInputData(input)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .addTag(workName)
                .build();
        wm.enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request);
    }

    public static void scheduleStop(@NonNull Context context, @NonNull String address, int durationSeconds) {
        Data input = new Data.Builder().putString(INPUT_ADDRESS, address).putString(INPUT_ACTION, ACTION_STOP).build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SinilinkSchedulerWorker.class)
                .setInputData(input)
                .setInitialDelay(Math.max(1, durationSeconds), TimeUnit.SECONDS)
                .addTag(workName(address, ACTION_STOP)).build();
        WorkManager.getInstance(context).enqueueUniqueWork(workName(address, ACTION_STOP), ExistingWorkPolicy.REPLACE, request);
    }

    public static void cancel(@NonNull Context context, @NonNull String address) {
        WorkManager wm = WorkManager.getInstance(context);
        wm.cancelUniqueWork(workName(address, ACTION_START));
        wm.cancelUniqueWork(workName(address, ACTION_STOP));
        clearNext(prefs(address));
    }

    public static int randomVolume(@NonNull Window window) {
        return window.minVolume == window.maxVolume ? window.minVolume
                : ThreadLocalRandom.current().nextInt(window.minVolume, window.maxVolume + 1);
    }

    public static void markExecuted(@NonNull SharedPreferences prefs, int windowIndex, @NonNull Window window) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime start = instanceStart(window, now);
        String key = countKey(windowIndex, toMillis(start));
        int count = prefs.getInt(key, 0);
        prefs.edit().putInt(key, count + 1).apply();
    }

    public static boolean isActiveNow(@NonNull Window window) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime start = instanceStart(window, now);
        LocalDateTime end = instanceEnd(window, start);
        return !now.isBefore(start) && now.isBefore(end);
    }

    @Nullable
    private static Candidate candidateForWindow(SharedPreferences prefs, Window window, int index, LocalDateTime now) {
        LocalDateTime start = instanceStart(window, now);
        LocalDateTime end = instanceEnd(window, start);
        if (!now.isBefore(end)) {
            start = nextInstanceStart(window, now);
            end = instanceEnd(window, start);
        }
        long startMs = toMillis(start);
        int done = prefs.getInt(countKey(index, startMs), 0);
        if (done >= window.runs) {
            start = nextInstanceStart(window, end.plusSeconds(1));
            end = instanceEnd(window, start);
            startMs = toMillis(start);
            done = 0;
        }
        int remainingRuns = Math.max(1, window.runs - done);
        long from = Math.max(System.currentTimeMillis() + 1000L, toMillis(start));
        long endMs = toMillis(end) - 1000L;
        if (endMs <= from) return null;
        long remainingSpan = endMs - from;
        long sliceEnd = from + Math.max(1000L, remainingSpan / remainingRuns);
        sliceEnd = Math.min(sliceEnd, endMs);
        return new Candidate(index, randomBetween(from, sliceEnd));
    }

    private static LocalDateTime instanceStart(Window window, LocalDateTime now) {
        LocalTime start = LocalTime.parse(window.start);
        LocalTime end = LocalTime.parse(window.end);
        LocalDate date = now.toLocalDate();
        if (start.isAfter(end) && now.toLocalTime().isBefore(end)) date = date.minusDays(1);
        return date.atTime(start);
    }

    private static LocalDateTime nextInstanceStart(Window window, LocalDateTime after) {
        LocalTime start = LocalTime.parse(window.start);
        LocalDateTime candidate = after.toLocalDate().atTime(start);
        if (!candidate.isAfter(after)) candidate = candidate.plusDays(1);
        return candidate;
    }

    private static LocalDateTime instanceEnd(Window window, LocalDateTime start) {
        LocalTime end = LocalTime.parse(window.end);
        LocalTime begin = LocalTime.parse(window.start);
        LocalDateTime result = start.toLocalDate().atTime(end);
        if (!end.isAfter(begin)) result = result.plusDays(1);
        return result;
    }

    private static long randomBetween(long fromInclusive, long toInclusive) {
        if (toInclusive <= fromInclusive) return fromInclusive;
        return ThreadLocalRandom.current().nextLong(fromInclusive, toInclusive + 1L);
    }

    private static long toMillis(LocalDateTime time) {
        return time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static String countKey(int index, long instanceStartMillis) {
        return "sinilink_scheduler_count_" + index + "_" + instanceStartMillis;
    }

    private static void clearNext(SharedPreferences prefs) {
        prefs.edit().remove(PREF_NEXT_AT).remove(PREF_NEXT_WINDOW).apply();
    }

    private static String workName(String address, String action) {
        return "sinilink-scheduler-" + action + "-" + address.replace(':', '_');
    }
}
