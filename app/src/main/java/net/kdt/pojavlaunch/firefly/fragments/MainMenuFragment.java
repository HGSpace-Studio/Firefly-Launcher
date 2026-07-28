package net.kdt.pojavlaunch.firefly.fragments;

import static com.firefly.utils.ToastUtils.Toast;

import static net.kdt.pojavlaunch.firefly.Tools.runOnUiThread;
import static net.kdt.pojavlaunch.firefly.Tools.shareLog;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.animation.ValueAnimator;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import net.kdt.pojavlaunch.firefly.PojavApplication;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.kdt.mcgui.mcVersionSpinner;
import com.movtery.ui.fragment.ProfilePathManagerFragment;
import com.qz.terminal2.ConsoleActivity;

import net.kdt.pojavlaunch.firefly.CustomControlsActivity;
import net.kdt.pojavlaunch.firefly.LauncherActivity;
import net.kdt.pojavlaunch.firefly.R;
import net.kdt.pojavlaunch.firefly.Tools;
import net.kdt.pojavlaunch.firefly.extra.ExtraConstants;
import net.kdt.pojavlaunch.firefly.extra.ExtraCore;
import net.kdt.pojavlaunch.firefly.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.firefly.progresskeeper.TaskCountListener;
import net.kdt.pojavlaunch.firefly.value.MinecraftAccount;

public class MainMenuFragment extends Fragment implements TaskCountListener {
    public static final String TAG = "MainMenuFragment";
    private static final int REQUEST_CODE_PERMISSIONS = 0;
    private mcVersionSpinner mVersionSpinner;
    private boolean mTasksRunning;
    private ValueAnimator mMenuAnimator;

    public MainMenuFragment() {
        super(R.layout.fragment_launcher);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        Button mAboutLauncherButton = view.findViewById(R.id.about_launcher_button);
        Button mCustomControlButton = view.findViewById(R.id.custom_control_button);
        Button mInstallJarButton = view.findViewById(R.id.install_jar_button);
        Button mStartTerminalButton = view.findViewById(R.id.start_terminal_button);
        Button mShareLogsButton = view.findViewById(R.id.share_logs_button);
        Button mMoreButton = view.findViewById(R.id.more_button);
        View mMoreMenuContainer = view.findViewById(R.id.more_menu_container);

        ImageButton mPathManagerButton = view.findViewById(R.id.path_manager_button);
        ImageButton mEditProfileButton = view.findViewById(R.id.edit_profile_button);
        Button mPlayButton = view.findViewById(R.id.play_button);
        mVersionSpinner = view.findViewById(R.id.mc_version_spinner);

        mAboutLauncherButton.setOnClickListener(v -> {
            Tools.swapFragment(requireActivity(), AboutFragment.class, AboutFragment.TAG, null);
        });

        // Set welcome text with current account username
        TextView welcomeText = view.findViewById(R.id.welcome_text);
        updateWelcomeText(welcomeText);
        Button mModpackButton = view.findViewById(R.id.modpack_button);
        mModpackButton.setOnClickListener(v -> {
            Tools.swapFragment(requireActivity(), ModpackCreateFragment.class,
                    ModpackCreateFragment.TAG, null);
        });
        mCustomControlButton.setOnClickListener(v -> startActivity(new Intent(requireContext(), CustomControlsActivity.class)));

        // "更多"折叠菜单，带动画展开/收起
        mMoreButton.setOnClickListener(v -> {
            if (mMenuAnimator != null && mMenuAnimator.isRunning()) {
                mMenuAnimator.cancel();
            }

            boolean isExpanding = mMoreMenuContainer.getVisibility() != View.VISIBLE;
            if (isExpanding) {
                mMoreMenuContainer.setVisibility(View.VISIBLE);
                mMoreMenuContainer.setAlpha(0f);
                mMoreMenuContainer.measure(
                        View.MeasureSpec.makeMeasureSpec(mMoreMenuContainer.getWidth(), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                final int targetHeight = mMoreMenuContainer.getMeasuredHeight();
                mMoreMenuContainer.getLayoutParams().height = 0;
                mMoreMenuContainer.requestLayout();

                mMenuAnimator = ValueAnimator.ofFloat(0f, 1f);
                mMenuAnimator.setDuration(300);
                mMenuAnimator.setInterpolator(new AccelerateDecelerateInterpolator());
                mMenuAnimator.addUpdateListener(anim -> {
                    float fraction = (float) anim.getAnimatedValue();
                    mMoreMenuContainer.getLayoutParams().height = (int) (targetHeight * fraction);
                    mMoreMenuContainer.setAlpha(fraction);
                    mMoreMenuContainer.requestLayout();
                });
                mMenuAnimator.start();
            } else {
                final int startHeight = mMoreMenuContainer.getHeight();
                mMenuAnimator = ValueAnimator.ofFloat(1f, 0f);
                mMenuAnimator.setDuration(300);
                mMenuAnimator.setInterpolator(new AccelerateDecelerateInterpolator());
                mMenuAnimator.addUpdateListener(anim -> {
                    float fraction = (float) anim.getAnimatedValue();
                    mMoreMenuContainer.getLayoutParams().height = (int) (startHeight * fraction);
                    mMoreMenuContainer.setAlpha(fraction);
                    mMoreMenuContainer.requestLayout();
                });
                mMenuAnimator.addListener(new android.animation.Animator.AnimatorListener() {
                    @Override
                    public void onAnimationStart(android.animation.Animator animation) {}
                    @Override
                    public void onAnimationEnd(android.animation.Animator animation) {
                        mMoreMenuContainer.setVisibility(View.GONE);
                        mMoreMenuContainer.getLayoutParams().height = LinearLayout.LayoutParams.WRAP_CONTENT;
                    }
                    @Override
                    public void onAnimationCancel(android.animation.Animator animation) {}
                    @Override
                    public void onAnimationRepeat(android.animation.Animator animation) {}
                });
                mMenuAnimator.start();
            }
        });

        mInstallJarButton.setOnClickListener(v -> runInstallerWithConfirmation(false));
        mInstallJarButton.setOnLongClickListener(v -> {
            runInstallerWithConfirmation(true);
            return true;
        });
        mStartTerminalButton.setOnClickListener(v -> startActivity(new Intent(requireContext(), ConsoleActivity.class)));
        mShareLogsButton.setOnClickListener((v) -> shareLog(requireContext()));

        mPathManagerButton.setOnClickListener(v -> {
            if (!mTasksRunning) {
                checkPermissions(() -> Tools.swapFragment(requireActivity(), ProfilePathManagerFragment.class, ProfilePathManagerFragment.TAG, null));
            } else {
                runOnUiThread(() -> Toast(requireContext(), R.string.profiles_path_task_in_progress));
            }
        });

        mEditProfileButton.setOnClickListener(v -> mVersionSpinner.openProfileEditor(requireActivity()));

        mPlayButton.setOnClickListener(v -> {
            ExtraCore.setValue(ExtraConstants.START_DOWNLOADER, true);
        });
        mPlayButton.setOnLongClickListener(v -> {
            ExtraCore.setValue(ExtraConstants.SKIP_DOWNLOADER, true);
            return true;
        });

    }

    @Override
    public void onResume() {
        super.onResume();
        mVersionSpinner.reloadProfiles();
    }

    private void runInstallerWithConfirmation(boolean isCustomArgs) {
        if (ProgressKeeper.getTaskCount() == 0)
            Tools.installMod(requireActivity(), isCustomArgs);
        else
            Toast(requireContext(), R.string.tasks_ongoing, Toast.LENGTH_LONG);
    }

    @Override
    public void onUpdateTaskCount(int taskCount) {
        mTasksRunning = taskCount != 0;
    }

    private void checkPermissions(PermissionGranted permissionGranted) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            handlePermissionsForAndroid11AndAbove(permissionGranted);
        } else {
            handlePermissionsForAndroid10AndBelow(permissionGranted);
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.R)
    private void handlePermissionsForAndroid11AndAbove(PermissionGranted permissionGranted) {
        if (!Environment.isExternalStorageManager()) {
            showPermissionRequestDialog(() -> {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + requireActivity().getPackageName()));
                startActivityForResult(intent, REQUEST_CODE_PERMISSIONS);
            });
        } else {
            permissionGranted.granted();
        }
    }

    private void handlePermissionsForAndroid10AndBelow(PermissionGranted permissionGranted) {
        if (!hasStoragePermissions()) {
            showPermissionRequestDialog(() -> ActivityCompat.requestPermissions(requireActivity(), new String[]{
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
            }, REQUEST_CODE_PERMISSIONS));
        } else {
            permissionGranted.granted();
        }
    }

    private boolean hasStoragePermissions() {
        return ActivityCompat.checkSelfPermission(requireContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void showPermissionRequestDialog(RequestPermissions requestPermissions) {
        new AlertDialog.Builder(requireContext())
                .setMessage(R.string.permissions_manage_external_storage)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> requestPermissions.onRequest())
                .setNegativeButton(android.R.string.cancel, null)
                .setCancelable(false)
                .show();
    }

    private void updateWelcomeText(TextView welcomeText) {
        Activity activity = requireActivity();
        if (activity instanceof LauncherActivity) {
            MinecraftAccount account = ((LauncherActivity) activity).getSelectedAccount();
            if (account != null) {
                welcomeText.setText("欢迎, " + account.username);
            } else {
                welcomeText.setText("欢迎");
            }
        } else {
            welcomeText.setText("欢迎");
        }
    }

    private interface RequestPermissions {
        void onRequest();
    }

    private interface PermissionGranted {
        void granted();
    }
}
