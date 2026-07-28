package net.kdt.pojavlaunch.firefly.prefs;

import android.content.Context;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.View;
import android.widget.TextView;

import androidx.preference.Preference;

import net.kdt.pojavlaunch.firefly.R;
import net.kdt.pojavlaunch.firefly.extra.ExtraConstants;
import net.kdt.pojavlaunch.firefly.extra.ExtraCore;

public class BackButtonPreference extends Preference {
    public BackButtonPreference(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    @SuppressWarnings("unused")
    public BackButtonPreference(Context context) {
        this(context, null);
    }

    private void init() {
        if (getTitle() == null) {
            setTitle(R.string.preference_back_title);
        }
        if (getIcon() == null) {
            setIcon(R.drawable.ic_arrow_back_white);
        }
        setLayoutResource(R.layout.preference_item_back_firefly);
    }


    @Override
    protected void onClick() {
        // It is caught by an ExtraListener in the LauncherActivity
        ExtraCore.setValue(ExtraConstants.BACK_PREFERENCE, "true");
    }
}