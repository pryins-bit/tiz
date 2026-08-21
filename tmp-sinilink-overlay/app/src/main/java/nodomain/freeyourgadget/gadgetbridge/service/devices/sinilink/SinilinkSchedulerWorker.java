package nodomain.freeyourgadget.gadgetbridge.service.devices.sinilink;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.List;
import java.util.Locale;

import nodomain.freeyourgadget.gadgetbridge.GBApplication;
import nodomain.freeyourgadget.gadgetbridge.activities.devicesettings.DeviceSettingsPreferenceConst;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;

public class SinilinkSchedulerWorker extends Worker {
    public SinilinkSchedulerWorker(@NonNull Context appContext, @NonNull WorkerParameters workerParams) {
        super(appContext, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        String address = getInputData().getString(SinilinkScheduler.INPUT_ADDRESS);
        String action = getInputData().getString(SinilinkScheduler.INPUT_ACTION);
        if (address == null || action == null) return Result.failure();

        SharedPreferences prefs = SinilinkScheduler.prefs(address);
        if (SinilinkScheduler.ACTION_STOP.equals(action)) {
            stopIfPlaying(address);
            return Result.success();
        }

        if (!prefs.getBoolean(SinilinkScheduler.PREF_ENABLED, false)) return Result.success();

        int windowIndex = getInputData().getInt(SinilinkScheduler.INPUT_WINDOW, -1);
        List<SinilinkScheduler.Window> windows = SinilinkScheduler.getWindows(prefs);
        if (windowIndex < 0 || windowIndex >= windows.size()) {
            SinilinkScheduler.scheduleNext(getApplicationContext(), address);
            return Result.success();
        }

        SinilinkScheduler.Window window = windows.get(windowIndex);
        if (!SinilinkScheduler.isActiveNow(window)) {
            SinilinkScheduler.scheduleNext(getApplicationContext(), address);
            return Result.success();
        }

        GBDevice device = GBApplication.app().getDeviceManager().getDeviceByAddress(address);
        if (device != null && device.isConnected()) {
            int volume = SinilinkScheduler.randomVolume(window);
            GBApplication.getDeviceSpecificSharedPrefs(address).edit()
                    .putInt(DeviceSettingsPreferenceConst.PREF_VOLUME, volume)
                    .apply();
            GBApplication.deviceService(device).onSendConfiguration(DeviceSettingsPreferenceConst.PREF_VOLUME);

            if (prefs.getBoolean(SinilinkScheduler.PREF_RANDOM_TRACK, false)) {
                GBApplication.getDeviceSpecificSharedPrefs(address).edit()
                        .putString(DeviceSettingsPreferenceConst.PREF_MEDIA_PLAYBACK_MODE,
                                SinilinkPlaybackMode.RANDOM.name().toLowerCase(Locale.ROOT))
                        .apply();
                GBApplication.deviceService(device).onSendConfiguration(DeviceSettingsPreferenceConst.PREF_MEDIA_PLAYBACK_MODE);
                GBApplication.deviceService(device).onSendConfiguration(SinilinkButton.NEXT.name());
            }

            if (window.mode == SinilinkScheduler.Mode.CONTINUOUS) {
                ensurePlaying(device);
                SinilinkScheduler.scheduleStop(getApplicationContext(), address, window.durationSeconds);
            } else {
                runIntervalPattern(device, window);
            }
            SinilinkScheduler.markExecuted(prefs, windowIndex, window);
        }

        SinilinkScheduler.scheduleNext(getApplicationContext(), address);
        return Result.success();
    }

    private void runIntervalPattern(@NonNull GBDevice device, @NonNull SinilinkScheduler.Window window) {
        try {
            for (int i = 0; i < window.cycles; i++) {
                ensurePlaying(device);
                Thread.sleep(window.onSeconds * 1000L);
                stopIfPlaying(device.getAddress());
                if (i + 1 < window.cycles) Thread.sleep(window.offSeconds * 1000L);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            stopIfPlaying(device.getAddress());
        }
    }

    private void ensurePlaying(@NonNull GBDevice device) {
        String state = (String) device.getExtraInfo("playback_state");
        if (state == null || !SinilinkPlaybackState.PLAYING.name().equalsIgnoreCase(state)) {
            GBApplication.deviceService(device).onSendConfiguration(SinilinkButton.PLAY_PAUSE.name());
        }
    }

    private void stopIfPlaying(@NonNull String address) {
        GBDevice device = GBApplication.app().getDeviceManager().getDeviceByAddress(address);
        if (device == null || !device.isConnected()) return;
        String state = (String) device.getExtraInfo("playback_state");
        if (SinilinkPlaybackState.PLAYING.name().equalsIgnoreCase(state)) {
            GBApplication.deviceService(device).onSendConfiguration(SinilinkButton.PLAY_PAUSE.name());
        }
    }
}
