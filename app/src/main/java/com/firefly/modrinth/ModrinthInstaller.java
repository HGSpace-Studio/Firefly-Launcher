package com.firefly.modrinth;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import net.kdt.pojavlaunch.firefly.Tools;
import net.kdt.pojavlaunch.firefly.utils.DownloadUtils;
import net.kdt.pojavlaunch.firefly.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.firefly.value.launcherprofiles.MinecraftProfile;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.Callable;

public class ModrinthInstaller {

    public interface InstallCallback {
        void onSuccess(String message);
        void onError(String message);
    }

    public static void install(Context context, ModrinthModels.ProjectHit project, ModrinthModels.Version version, InstallCallback callback) {
        if (version == null || version.files == null || version.files.isEmpty()) {
            if (callback != null) {
                new Handler(Looper.getMainLooper()).post(() -> callback.onError("未找到可用文件"));
            }
            return;
        }

        ModrinthModels.VersionFile file = ModrinthApi.getPrimaryFile(version);
        if (file == null) {
            if (callback != null) {
                new Handler(Looper.getMainLooper()).post(() -> callback.onError("未找到主文件"));
            }
            return;
        }

        File targetDir = getTargetDirectory(project.projectType);
        if (targetDir == null) {
            if (callback != null) {
                new Handler(Looper.getMainLooper()).post(() -> callback.onError("无法获取游戏目录"));
            }
            return;
        }

        if (!targetDir.exists()) {
            targetDir.mkdirs();
        }

        File outputFile = new File(targetDir, file.filename);

        Tools.runOnUiThread(() -> Toast.makeText(context, "开始下载: " + project.title, Toast.LENGTH_SHORT).show());

        new Thread(() -> {
            try {
                downloadFile(file.url, outputFile, file.hashes != null ? file.hashes.sha1 : null);
                String msg = "安装完成: " + file.filename;
                Tools.runOnUiThread(() -> {
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show();
                    if (callback != null) callback.onSuccess(msg);
                });
            } catch (IOException e) {
                String msg = "下载失败: " + e.getMessage();
                Tools.runOnUiThread(() -> {
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show();
                    if (callback != null) callback.onError(msg);
                });
            }
        }).start();
    }

    private static void downloadFile(String url, File output, String expectedSha1) throws IOException {
        if (expectedSha1 != null && !expectedSha1.isEmpty()) {
            DownloadUtils.ensureSha1(output, expectedSha1, (Callable<Void>) () -> {
                DownloadUtils.downloadFileMonitored(url, output, new byte[8192], (curr, max) -> {});
                return null;
            });
        } else {
            DownloadUtils.downloadFileMonitored(url, output, new byte[8192], (curr, max) -> {});
        }
    }

    private static File getTargetDirectory(String projectType) {
        try {
            MinecraftProfile profile = LauncherProfiles.getCurrentProfile();
            File gameDir = Tools.getGameDirPath(profile);

            if (gameDir == null || !gameDir.exists()) {
                return null;
            }

            switch (projectType) {
                case "mod":
                    return new File(gameDir, "mods");
                case "resourcepack":
                    return new File(gameDir, "resourcepacks");
                case "shader":
                    return new File(gameDir, "shaderpacks");
                default:
                    return new File(gameDir, "mods");
            }
        } catch (Exception e) {
            return null;
        }
    }
}
