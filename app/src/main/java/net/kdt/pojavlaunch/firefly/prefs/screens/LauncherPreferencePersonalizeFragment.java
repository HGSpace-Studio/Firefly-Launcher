package net.kdt.pojavlaunch.firefly.prefs.screens;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.preference.Preference;
import androidx.preference.SwitchPreference;

import net.kdt.pojavlaunch.firefly.R;
import net.kdt.pojavlaunch.firefly.prefs.LauncherPreferences;

public class LauncherPreferencePersonalizeFragment extends LauncherPreferenceFragment {

    private static final String TAG = "PersonalizeFragment";

    private SwitchPreference mEnableBackgroundSwitch;
    private Preference mSelectBackgroundPreference;

    private final ActivityResultLauncher<String[]> mBackgroundImagePicker =
            registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts.OpenDocument(),
                    uri -> {
                        if (uri != null) {
                            try {
                                ContentResolver resolver = requireContext().getContentResolver();
                                resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            } catch (Exception e) {
                                Log.w(TAG, "Unable to persist URI: " + e.getMessage());
                            }
                            LauncherPreferences.DEFAULT_PREF.edit()
                                    .putString("backgroundImagePath", uri.toString())
                                    .apply();
                            mSelectBackgroundPreference.setSummary("已选择背景图片");
                        }
                    });

    @Override
    public void onCreatePreferences(Bundle b, String str) {
        addPreferencesFromResource(R.xml.pref_personalize);

        mEnableBackgroundSwitch = (SwitchPreference) findPreference("enableBackgroundImage");
        mSelectBackgroundPreference = findPreference("selectBackgroundImage");

        if (mEnableBackgroundSwitch != null && mSelectBackgroundPreference != null) {
            mSelectBackgroundPreference.setVisible(mEnableBackgroundSwitch.isChecked());
            mEnableBackgroundSwitch.setOnPreferenceChangeListener((preference, newValue) -> {
                boolean enabled = (boolean) newValue;
                mSelectBackgroundPreference.setVisible(enabled);
                return true;
            });

            String savedPath = LauncherPreferences.DEFAULT_PREF.getString("backgroundImagePath", "");
            if (!savedPath.isEmpty()) {
                mSelectBackgroundPreference.setSummary("已选择背景图片");
            }

            mSelectBackgroundPreference.setOnPreferenceClickListener(preference -> {
                mBackgroundImagePicker.launch(new String[]{"image/*"});
                return true;
            });
        }

        // Theme accent color
        Preference themeColorPref = findPreference("themeAccentColor");
        if (themeColorPref != null) {
            themeColorPref.setOnPreferenceChangeListener((preference, newValue) -> {
                String newColor = (String) newValue;
                LauncherPreferences.PREF_THEME_ACCENT_COLOR = newColor;
                return true;
            });
        }

        // Animation toggle
        SwitchPreference animSwitch = (SwitchPreference) findPreference("enableAnimations");
        if (animSwitch != null) {
            animSwitch.setOnPreferenceChangeListener((preference, newValue) -> {
                LauncherPreferences.PREF_ENABLE_ANIMATIONS = (boolean) newValue;
                return true;
            });
        }
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences p, String s) {
        super.onSharedPreferenceChanged(p, s);
        LauncherPreferences.loadPersonalizePreferences();
    }
}
