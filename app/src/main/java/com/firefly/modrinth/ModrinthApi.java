package com.firefly.modrinth;

import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import net.kdt.pojavlaunch.firefly.Tools;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.lang.reflect.Type;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class ModrinthApi {
    private static final String BASE_URL = "https://api.modrinth.com/v2";
    private static final String USER_AGENT = "FireflyLauncher/1.0";
    private static final Gson GSON = new Gson();

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return value;
        }
    }

    private static String getRaw(String urlString) throws IOException {
        Log.d("ModrinthApi", "Request: " + urlString);
        HttpURLConnection conn = (HttpURLConnection) new URL(urlString).openConnection();
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setDoInput(true);

        int responseCode = conn.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            conn.disconnect();
            throw new IOException("HTTP " + responseCode);
        }

        String data = Tools.read(conn.getInputStream());
        conn.disconnect();
        return data;
    }

    public static ModrinthModels.SearchResult searchProjects(String query, String projectType, String mcVersion, int offset, int limit) {
        try {
            StringBuilder urlBuilder = new StringBuilder(BASE_URL + "/search?");
            urlBuilder.append("query=").append(encode(query != null ? query : ""));
            urlBuilder.append("&index=relevance");
            urlBuilder.append("&offset=").append(offset);
            urlBuilder.append("&limit=").append(limit);

            List<String> facets = new ArrayList<>();
            if (projectType != null && !projectType.isEmpty()) {
                facets.add("[\"project_type:" + projectType + "\"]");
            }
            if (mcVersion != null && !mcVersion.isEmpty()) {
                facets.add("[\"versions:" + mcVersion + "\"]");
            }
            if (!facets.isEmpty()) {
                urlBuilder.append("&facets=").append(encode("[" + String.join(",", facets) + "]"));
            }

            String response = getRaw(urlBuilder.toString());
            return GSON.fromJson(response, ModrinthModels.SearchResult.class);
        } catch (IOException e) {
            Log.e("ModrinthApi", "Search failed", e);
            return null;
        }
    }

    public static ModrinthModels.Project getProject(String projectId) {
        try {
            String url = BASE_URL + "/project/" + encode(projectId);
            String response = getRaw(url);
            return GSON.fromJson(response, ModrinthModels.Project.class);
        } catch (IOException e) {
            Log.e("ModrinthApi", "Get project failed", e);
            return null;
        }
    }

    public static List<ModrinthModels.Version> getProjectVersions(String projectId, List<String> loaders, List<String> gameVersions) {
        try {
            StringBuilder urlBuilder = new StringBuilder(BASE_URL + "/project/" + encode(projectId) + "/version?");
            if (loaders != null && !loaders.isEmpty()) {
                urlBuilder.append("loaders=").append(encode(GSON.toJson(loaders))).append("&");
            }
            if (gameVersions != null && !gameVersions.isEmpty()) {
                urlBuilder.append("game_versions=").append(encode(GSON.toJson(gameVersions))).append("&");
            }
            String response = getRaw(urlBuilder.toString());
            Type listType = new TypeToken<List<ModrinthModels.Version>>(){}.getType();
            return GSON.fromJson(response, listType);
        } catch (IOException e) {
            Log.e("ModrinthApi", "Get versions failed", e);
            return null;
        }
    }

    public static List<ModrinthModels.Version> getProjectVersions(String projectId) {
        return getProjectVersions(projectId, null, null);
    }

    public static ModrinthModels.VersionFile getPrimaryFile(ModrinthModels.Version version) {
        if (version == null || version.files == null || version.files.isEmpty()) {
            return null;
        }
        for (ModrinthModels.VersionFile file : version.files) {
            if (file.primary) {
                return file;
            }
        }
        return version.files.get(0);
    }
}
