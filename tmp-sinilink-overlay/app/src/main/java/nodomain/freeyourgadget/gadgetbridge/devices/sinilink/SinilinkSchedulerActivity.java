package nodomain.freeyourgadget.gadgetbridge.devices.sinilink;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import nodomain.freeyourgadget.gadgetbridge.activities.AbstractGBActivity;
import nodomain.freeyourgadget.gadgetbridge.impl.GBDevice;
import nodomain.freeyourgadget.gadgetbridge.service.devices.sinilink.SinilinkScheduler;

public class SinilinkSchedulerActivity extends AbstractGBActivity {
    private GBDevice device;
    private SharedPreferences prefs;
    private Switch enabled;
    private CheckBox randomTrack;
    private LinearLayout windowsContainer;
    private TextView nextRun;
    private final List<WindowRow> rows = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        device = getIntent().getParcelableExtra(GBDevice.EXTRA_DEVICE);
        if (device == null || device.getAddress() == null) {
            finish();
            return;
        }
        prefs = SinilinkScheduler.prefs(device.getAddress());
        setTitle("Sinilink auto scheduler");
        setContentView(buildUi());
        loadValues();
    }

    private ScrollView buildUi() {
        int pad = dp(16);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView intro = new TextView(this);
        intro.setText("Add any number of time windows. Each window has its own run count, random volume range, and continuous or interval pattern. No schedule is pre-filled.");
        root.addView(intro, matchWrap());

        enabled = new Switch(this);
        enabled.setText("Enable automatic playback");
        root.addView(enabled, matchWrap());

        randomTrack = new CheckBox(this);
        randomTrack.setText("Use XinYi random-track mode");
        root.addView(randomTrack, matchWrap());

        Button add = new Button(this);
        add.setText("+ Add time window");
        add.setOnClickListener(v -> addRow(null));
        root.addView(add, matchWrap());

        windowsContainer = new LinearLayout(this);
        windowsContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(windowsContainer, matchWrap());

        nextRun = new TextView(this);
        root.addView(nextRun, matchWrap());

        Button save = new Button(this);
        save.setText("Save and schedule");
        save.setOnClickListener(v -> saveValues());
        root.addView(save, matchWrap());

        Button schedule = new Button(this);
        schedule.setText("Recalculate next run");
        schedule.setOnClickListener(v -> {
            SinilinkScheduler.scheduleNext(this, device.getAddress());
            updateNextRun();
        });
        root.addView(schedule, matchWrap());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        return scroll;
    }

    private void loadValues() {
        enabled.setChecked(prefs.getBoolean(SinilinkScheduler.PREF_ENABLED, false));
        randomTrack.setChecked(prefs.getBoolean(SinilinkScheduler.PREF_RANDOM_TRACK, false));
        for (SinilinkScheduler.Window w : SinilinkScheduler.getWindows(prefs)) addRow(w);
        updateNextRun();
    }

    private void addRow(SinilinkScheduler.Window existing) {
        final WindowRow row = new WindowRow();
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(8), dp(12), dp(8), dp(12));
        row.root = card;

        TextView title = new TextView(this);
        title.setText("Time window");
        card.addView(title, matchWrap());

        row.start = addField(card, "Start (HH:mm)", InputType.TYPE_CLASS_DATETIME);
        row.end = addField(card, "End (HH:mm)", InputType.TYPE_CLASS_DATETIME);
        row.runs = addField(card, "Total runs in this window", InputType.TYPE_CLASS_NUMBER);
        row.minVolume = addField(card, "Minimum volume / intensity (0-30)", InputType.TYPE_CLASS_NUMBER);
        row.maxVolume = addField(card, "Maximum volume / intensity (0-30)", InputType.TYPE_CLASS_NUMBER);

        TextView modeLabel = new TextView(this);
        modeLabel.setText("Playback mode");
        card.addView(modeLabel, matchWrap());
        row.mode = new Spinner(this);
        row.mode.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Continuous", "Interval"}));
        card.addView(row.mode, matchWrap());

        row.duration = addField(card, "Continuous duration (seconds)", InputType.TYPE_CLASS_NUMBER);
        row.onSeconds = addField(card, "Interval ON seconds", InputType.TYPE_CLASS_NUMBER);
        row.offSeconds = addField(card, "Interval OFF seconds", InputType.TYPE_CLASS_NUMBER);
        row.cycles = addField(card, "Interval cycles", InputType.TYPE_CLASS_NUMBER);

        Button remove = new Button(this);
        remove.setText("Remove this window");
        remove.setOnClickListener(v -> {
            rows.remove(row);
            windowsContainer.removeView(card);
        });
        card.addView(remove, matchWrap());

        if (existing != null) {
            row.start.setText(existing.start);
            row.end.setText(existing.end);
            row.runs.setText(String.valueOf(existing.runs));
            row.minVolume.setText(String.valueOf(existing.minVolume));
            row.maxVolume.setText(String.valueOf(existing.maxVolume));
            row.mode.setSelection(existing.mode == SinilinkScheduler.Mode.CONTINUOUS ? 0 : 1);
            row.duration.setText(String.valueOf(existing.durationSeconds));
            row.onSeconds.setText(String.valueOf(existing.onSeconds));
            row.offSeconds.setText(String.valueOf(existing.offSeconds));
            row.cycles.setText(String.valueOf(existing.cycles));
        }

        rows.add(row);
        windowsContainer.addView(card, matchWrap());
    }

    private void saveValues() {
        try {
            List<SinilinkScheduler.Window> windows = new ArrayList<>();
            for (WindowRow row : rows) {
                String start = text(row.start);
                String end = text(row.end);
                java.time.LocalTime.parse(start);
                java.time.LocalTime.parse(end);

                int runs = intValue(row.runs, "runs");
                int minVol = intValue(row.minVolume, "minimum volume");
                int maxVol = intValue(row.maxVolume, "maximum volume");
                SinilinkScheduler.Mode mode = row.mode.getSelectedItemPosition() == 0
                        ? SinilinkScheduler.Mode.CONTINUOUS : SinilinkScheduler.Mode.INTERVAL;

                int duration = optionalPositive(row.duration, mode == SinilinkScheduler.Mode.CONTINUOUS ? 20 : 1, "duration");
                int on = optionalPositive(row.onSeconds, mode == SinilinkScheduler.Mode.INTERVAL ? 5 : 1, "ON seconds");
                int off = optionalPositive(row.offSeconds, mode == SinilinkScheduler.Mode.INTERVAL ? 10 : 1, "OFF seconds");
                int cycles = optionalPositive(row.cycles, mode == SinilinkScheduler.Mode.INTERVAL ? 5 : 1, "cycles");

                if (runs < 1) throw new IllegalArgumentException("runs must be >= 1");
                if (minVol < 0 || maxVol > 30 || maxVol < minVol)
                    throw new IllegalArgumentException("volume range must be 0-30 and max >= min");

                windows.add(new SinilinkScheduler.Window(start, end, runs, minVol, maxVol, mode,
                        duration, on, off, cycles));
            }

            if (enabled.isChecked() && windows.isEmpty())
                throw new IllegalArgumentException("add at least one time window before enabling");

            prefs.edit()
                    .putBoolean(SinilinkScheduler.PREF_ENABLED, enabled.isChecked())
                    .putBoolean(SinilinkScheduler.PREF_RANDOM_TRACK, randomTrack.isChecked())
                    .putString(SinilinkScheduler.PREF_WINDOWS, SinilinkScheduler.encodeWindows(windows))
                    .apply();

            if (enabled.isChecked()) SinilinkScheduler.scheduleNext(this, device.getAddress());
            else SinilinkScheduler.cancel(this, device.getAddress());

            updateNextRun();
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
        } catch (RuntimeException e) {
            Toast.makeText(this, "Invalid settings: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void updateNextRun() {
        long next = prefs.getLong(SinilinkScheduler.PREF_NEXT_AT, 0L);
        if (next == 0L) {
            nextRun.setText("Next run: not scheduled");
        } else {
            String formatted = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM).format(new Date(next));
            int window = prefs.getInt(SinilinkScheduler.PREF_NEXT_WINDOW, -1);
            nextRun.setText("Next run: " + formatted + (window >= 0 ? " (window " + (window + 1) + ")" : ""));
        }
    }

    private EditText addField(LinearLayout root, String label, int inputType) {
        TextView tv = new TextView(this);
        tv.setText(label);
        root.addView(tv, matchWrap());
        EditText edit = new EditText(this);
        edit.setSingleLine(true);
        edit.setInputType(inputType);
        root.addView(edit, matchWrap());
        return edit;
    }

    private String text(EditText edit) { return edit.getText().toString().trim(); }

    private int intValue(EditText edit, String name) {
        String value = text(edit);
        if (value.isEmpty()) throw new IllegalArgumentException(name + " is required");
        return Integer.parseInt(value);
    }

    private int optionalPositive(EditText edit, int defaultValue, String name) {
        String value = text(edit);
        int parsed = value.isEmpty() ? defaultValue : Integer.parseInt(value);
        if (parsed < 1) throw new IllegalArgumentException(name + " must be >= 1");
        return parsed;
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density); }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private static final class WindowRow {
        LinearLayout root;
        EditText start;
        EditText end;
        EditText runs;
        EditText minVolume;
        EditText maxVolume;
        Spinner mode;
        EditText duration;
        EditText onSeconds;
        EditText offSeconds;
        EditText cycles;
    }
}
