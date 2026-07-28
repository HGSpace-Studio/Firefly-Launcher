package com.firefly.modrinth;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public class ModrinthModels {

    public static class SearchResult {
        public List<ProjectHit> hits;
        public int offset;
        public int limit;
        public int total;
    }

    public static class ProjectHit {
        public String slug;
        public String title;
        public String description;
        public List<String> categories;
        @SerializedName("project_type")
        public String projectType;
        public int downloads;
        public int follows;
        @SerializedName("icon_url")
        public String iconUrl;
        @SerializedName("author")
        public String author;
        @SerializedName("date_modified")
        public String dateModified;
        @SerializedName("latest_version")
        public String latestVersion;
        @SerializedName("project_id")
        public String projectId;
    }

    public static class Project {
        public String id;
        public String slug;
        public String title;
        public String description;
        @SerializedName("icon_url")
        public String iconUrl;
        @SerializedName("project_type")
        public String projectType;
        public List<String> categories;
        public int downloads;
        public int follows;
        @SerializedName("date_modified")
        public String dateModified;
        @SerializedName("client_side")
        public String clientSide;
        @SerializedName("server_side")
        public String serverSide;
        public String license;
    }

    public static class Version {
        public String id;
        @SerializedName("project_id")
        public String projectId;
        @SerializedName("author_id")
        public String authorId;
        public String name;
        @SerializedName("version_number")
        public String versionNumber;
        public String changelog;
        @SerializedName("game_versions")
        public List<String> gameVersions;
        public List<String> loaders;
        @SerializedName("version_type")
        public String versionType;
        public List<VersionFile> files;
        public int downloads;
    }

    public static class VersionFile {
        public Hashes hashes;
        public String url;
        public String filename;
        public boolean primary;
        public int size;
    }

    public static class Hashes {
        public String sha1;
        public String sha512;
    }
}
