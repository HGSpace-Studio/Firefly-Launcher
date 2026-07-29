use futures_util::StreamExt;
use minecraft_java_rs_core::launcher::events::LaunchEvent;
use minecraft_java_rs_core::launcher::options::{
    JavaOptions, LaunchOptions, LoaderConfig, MemoryConfig, ScreenConfig,
};
use minecraft_java_rs_core::launcher::Launcher;
use minecraft_java_rs_core::models::loader::LoaderType;
use minecraft_java_rs_core::models::minecraft::Authenticator;
use minecraft_java_rs_core::utils::auth::offline_uuid;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufReader, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio::sync::Mutex;

pub type GameStopSignal = Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>;
pub type GameProcessState = Arc<Mutex<Option<u32>>>;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub instance_name: String,
    pub game_version: String,
    pub java_version: String,
    pub system_version: String,
    pub error_message: String,
    pub crash_log: String,
    pub solution: String,
}

pub type CrashReportState = Arc<Mutex<Option<CrashReport>>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FabricVersion {
    pub separator: String,
    pub build: u32,
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForgeBuild {
    #[serde(rename = "_id")]
    pub id: String,
    pub build: u64,
    pub version: String,
    pub mcversion: String,
    pub modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JavaInstall {
    pub path: String,
    pub version: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemory {
    pub total_mb: u64,
    pub used_mb: u64,
}

#[tauri::command]
pub async fn get_system_memory() -> Result<SystemMemory, String> {
    let mem = tokio::task::spawn_blocking(|| {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        (
            sys.total_memory() / 1024 / 1024,
            sys.used_memory() / 1024 / 1024,
        )
    })
    .await
    .map_err(|e| format!("{e}"))?;
    Ok(SystemMemory {
        total_mb: mem.0,
        used_mb: mem.1,
    })
}

#[tauri::command]
pub async fn get_java_versions() -> Result<Vec<JavaInstall>, String> {
    let results = tokio::task::spawn_blocking(discover_java)
        .await
        .map_err(|e| format!("Java discovery task failed: {e}"))?;
    Ok(results)
}

fn discover_java() -> Vec<JavaInstall> {
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // 1. Check JAVA_HOME
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        let path = std::path::Path::new(&jh);
        let java_bin = if cfg!(target_os = "windows") {
            path.join("bin").join("java.exe")
        } else {
            path.join("bin").join("java")
        };
        if java_bin.exists() {
            if let Some(info) = probe_java(&java_bin) {
                if seen.insert(info.path.clone()) {
                    found.push(info);
                }
            }
        }
    }

    // 2. Check PATH for `java`
    let java_cmd = if cfg!(target_os = "windows") {
        "java.exe"
    } else {
        "java"
    };
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let java_bin = dir.join(java_cmd);
            if java_bin.exists() {
                if let Some(info) = probe_java(&java_bin) {
                    if seen.insert(info.path.clone()) {
                        found.push(info);
                    }
                }
            }
        }
    }

    // 3. Platform-specific comprehensive search
    // Each platform function uses native search tools (mdfind, locate, etc.)
    // to find java executables anywhere on the system, not just in known paths.
    #[cfg(target_os = "macos")]
    search_java_macos(&mut found, &mut seen);

    #[cfg(target_os = "linux")]
    search_java_linux(&mut found, &mut seen);

    #[cfg(target_os = "windows")]
    search_java_windows(&mut found, &mut seen);

    // 4. SDKMAN (cross-platform fallback)
    {
        let sdkman_dir = std::env::var("SDKMAN_DIR").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_default();
            format!("{}/.sdkman", home)
        });
        let candidates = std::path::Path::new(&sdkman_dir).join("candidates").join("java");
        if let Ok(entries) = std::fs::read_dir(candidates) {
            for entry in entries.flatten() {
                let java_bin = entry.path().join("bin").join("java");
                if java_bin.exists() {
                    if let Some(info) = probe_java(&java_bin) {
                        if seen.insert(info.path.clone()) {
                            found.push(info);
                        }
                    }
                }
            }
        }
    }

    // 5. jabba (cross-platform fallback)
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let jabba_dir = std::path::Path::new(&home).join(".jabba").join("jdk");
        if jabba_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(jabba_dir) {
                for entry in entries.flatten() {
                    let java_bin = if cfg!(target_os = "windows") {
                        entry.path().join("bin").join("java.exe")
                    } else {
                        entry.path().join("bin").join("java")
                    };
                    if java_bin.exists() {
                        if let Some(info) = probe_java(&java_bin) {
                            if seen.insert(info.path.clone()) {
                                found.push(info);
                            }
                        }
                    }
                }
            }
        }
    }

    found
}

/// macOS: use Spotlight (mdfind) to find ALL java executables on the system,
/// plus classic paths (/Library, /usr/local/opt, /opt/homebrew/opt).
#[cfg(target_os = "macos")]
fn search_java_macos(found: &mut Vec<JavaInstall>, seen: &mut std::collections::HashSet<String>) {
    // Use /usr/libexec/java_home -V to list all registered JVMs
    if let Ok(output) = std::process::Command::new("/usr/libexec/java_home")
        .arg("-V")
        .output()
    {
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            if let Some(idx) = line.find('/') {
                let java_bin = std::path::Path::new(line[idx..].trim()).join("bin").join("java");
                if java_bin.exists() {
                    if let Some(info) = probe_java(&java_bin) {
                        if seen.insert(info.path.clone()) {
                            found.push(info);
                        }
                    }
                }
            }
        }
    }

    // Scan /Library/Java/JavaVirtualMachines/
    if let Ok(entries) = std::fs::read_dir("/Library/Java/JavaVirtualMachines/") {
        for entry in entries.flatten() {
            let java_bin = entry.path().join("Contents").join("Home").join("bin").join("java");
            if java_bin.exists() {
                if let Some(info) = probe_java(&java_bin) {
                    if seen.insert(info.path.clone()) {
                        found.push(info);
                    }
                }
            }
        }
    }

    // Homebrew directories
    for base in ["/usr/local/opt", "/opt/homebrew/opt"] {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("openjdk") || name.starts_with("java") {
                    let java_bin = entry.path().join("bin").join("java");
                    if java_bin.exists() {
                        if let Some(info) = probe_java(&java_bin) {
                            if seen.insert(info.path.clone()) {
                                found.push(info);
                            }
                        }
                    }
                }
            }
        }
    }

    // mdfind: Spotlight-based search to find ALL java executables on the system.
    // This is fast (uses macOS indexed metadata) and catches any installation.
    if let Ok(output) = std::process::Command::new("mdfind")
        .args(["-0", "-name", "java"])
        .output()
    {
        for path_bytes in output.stdout.split(|&b| b == 0) {
            if path_bytes.is_empty() {
                continue;
            }
            let path_str = String::from_utf8_lossy(path_bytes);
            let p = std::path::Path::new(path_str.as_ref());

            // Only keep files named exactly "java" (not javac, java.util, etc.)
            if p.file_name().and_then(|s| s.to_str()) != Some("java") {
                continue;
            }
            // Skip if not a regular file (or symlink to one)
            if !p.is_file() {
                continue;
            }
            // Skip non-executable files
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(p) {
                    if meta.permissions().mode() & 0o111 == 0 {
                        continue;
                    }
                }
            }
            // Probe it (probe_java runs java -version and checks success)
            if let Some(info) = probe_java(p) {
                if seen.insert(info.path.clone()) {
                    found.push(info);
                }
            }
        }
    }
}

/// Linux: scan standard locations, use locate if available,
/// and check common alternative directories.
#[cfg(target_os = "linux")]
fn search_java_linux(found: &mut Vec<JavaInstall>, seen: &mut std::collections::HashSet<String>) {
    // Standard JVM directory
    let jvm_base = std::path::Path::new("/usr/lib/jvm");
    if jvm_base.exists() {
        if let Ok(entries) = std::fs::read_dir(jvm_base) {
            for entry in entries.flatten() {
                let java_bin = entry.path().join("bin").join("java");
                if java_bin.exists() {
                    if let Some(info) = probe_java(&java_bin) {
                        if seen.insert(info.path.clone()) {
                            found.push(info);
                        }
                    }
                }
            }
        }
    }

    // Additional common directory scans
    for base in ["/usr/java", "/usr/local", "/opt"] {
        let dir = std::path::Path::new(base);
        if dir.exists() {
            scan_for_java(dir, found, seen);
        }
    }

    // Try locate (fast, but depends on updatedb having been run)
    if let Ok(output) = std::process::Command::new("locate")
        .args(["-b", "--regex", r"^java$"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let p = std::path::Path::new(line.trim());
            if p.is_file() {
                if let Some(info) = probe_java(p) {
                    if seen.insert(info.path.clone()) {
                        found.push(info);
                    }
                }
            }
        }
    }

    // Scan home SDKMAN/jabba (cross-platform but keep here for thoroughness)
    if let Ok(home) = std::env::var("HOME") {
        for candidate_dir in &[
            format!("{home}/.sdkman/candidates/java"),
            format!("{home}/.jabba/jdk"),
        ] {
            let dir = std::path::Path::new(candidate_dir);
            if dir.exists() {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let java_bin = entry.path().join("bin").join("java");
                        if java_bin.exists() {
                            if let Some(info) = probe_java(&java_bin) {
                                if seen.insert(info.path.clone()) {
                                    found.push(info);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Windows: registry scanning, common install paths, and where.exe.
#[cfg(target_os = "windows")]
fn search_java_windows(found: &mut Vec<JavaInstall>, seen: &mut std::collections::HashSet<String>) {
    // Common program file locations
    let prog_files = ["Program Files", "Program Files (x86)"];
    for pf in &prog_files {
        let path = std::path::Path::new("C:\\").join(pf).join("Java");
        if path.exists() {
            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    let java_bin = entry.path().join("bin").join("java.exe");
                    if java_bin.exists() {
                        if let Some(info) = probe_java(&java_bin) {
                            if seen.insert(info.path.clone()) {
                                found.push(info);
                            }
                        }
                    }
                }
            }
        }
    }

    // where.exe - finds java in PATH and beyond
    if let Ok(output) = std::process::Command::new("where").arg("java").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let p = line.trim().to_string();
            if !p.is_empty() {
                let java_bin = std::path::Path::new(&p);
                if java_bin.is_file() && seen.insert(p.clone()) {
                    if let Some(info) = probe_java(java_bin) {
                        found.push(info);
                    }
                }
            }
        }
    }

    // Registry-based discovery: query CurrentVersion for the JRE path
    let reg_keys = [
        r"HKLM\SOFTWARE\JavaSoft\Java Runtime Environment",
        r"HKLM\SOFTWARE\JavaSoft\Java Development Kit",
        r"HKLM\SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment",
        r"HKLM\SOFTWARE\WOW6432Node\JavaSoft\Java Development Kit",
    ];
    for key in &reg_keys {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", key, "-s"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(val) = line.split("REG_SZ").nth(1) {
                    let java_path = val.trim().trim_matches('"').to_string() + "\\bin\\java.exe";
                    let java_bin = std::path::Path::new(&java_path);
                    if java_bin.is_file() && seen.insert(java_path) {
                        if let Some(info) = probe_java(java_bin) {
                            found.push(info);
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn scan_for_java(dir: &std::path::Path, found: &mut Vec<JavaInstall>, seen: &mut std::collections::HashSet<String>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Check if this directory has a bin/java
                let java_bin = if cfg!(target_os = "windows") {
                    path.join("bin").join("java.exe")
                } else {
                    path.join("bin").join("java")
                };
                if java_bin.exists() {
                    if let Some(info) = probe_java(&java_bin) {
                        if seen.insert(info.path.clone()) {
                            found.push(info);
                        }
                    }
                } else {
                    // Recurse one level
                    scan_for_java(&path, found, seen);
                }
            }
        }
    }
}

fn probe_java(path: &std::path::Path) -> Option<JavaInstall> {
    let path_str = path.to_string_lossy().to_string();
    let output = std::process::Command::new(path)
        .arg("-version")
        .output()
        .ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let version = stderr.lines().next().unwrap_or("").trim().to_string();
    Some(JavaInstall {
        path: path_str,
        version,
    })
}

#[tauri::command]
pub async fn get_fabric_versions() -> Result<Vec<FabricVersion>, String> {
    let url = "https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader";
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch fabric versions: {e}"))?;
    let versions: Vec<FabricVersion> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse fabric versions: {e}"))?;
    Ok(versions)
}

#[tauri::command]
pub async fn get_forge_versions(mc_version: String) -> Result<Vec<ForgeBuild>, String> {
    let url = format!(
        "https://bmclapi2.bangbang93.com/forge/minecraft/{}",
        mc_version
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch forge versions: {e}"))?;
    let builds: Vec<ForgeBuild> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse forge versions: {e}"))?;
    Ok(builds)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NeoForgeBuild {
    pub version: String,
    pub mcversion: String,
    pub build: u32,
    pub modified: String,
}

#[tauri::command]
pub async fn get_neoforge_versions(mc_version: String) -> Result<Vec<NeoForgeBuild>, String> {
    let url = format!(
        "https://bmclapi2.bangbang93.com/neoforge/minecraft/{}",
        mc_version
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch neoforge versions: {e}"))?;
    let builds: Vec<NeoForgeBuild> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse neoforge versions: {e}"))?;
    Ok(builds)
}

#[tauri::command]
pub async fn get_minecraft_versions() -> Result<VersionManifest, String> {
    let url = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch versions: {e}"))?;
    let manifest: VersionManifest = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse versions: {e}"))?;
    Ok(manifest)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchArgs {
    pub version: String,
    pub username: String,
    pub game_dir: String,
    pub min_mem: String,
    pub max_mem: String,
    pub java_path: Option<String>,
    pub loader_type: Option<String>,
    pub loader_build: Option<String>,
    pub instance: Option<String>,
    pub download_only: bool,
    pub fullscreen: bool,
    pub download_concurrency: Option<u32>,
    pub verify_concurrency: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum MinecraftEvent {
    Progress {
        kind: String,
        downloaded: u64,
        total: u64,
    },
    Data {
        line: String,
    },
    Close {
        code: i32,
    },
    Error {
        message: String,
    },
    GameDownloadFinished,
}

#[tauri::command]
pub async fn launch_minecraft(app: AppHandle, args: LaunchArgs) -> Result<(), String> {
    let auth = Authenticator {
        access_token: "offline".into(),
        name: args.username.clone(),
        uuid: offline_uuid(&args.username),
        xbox_account: None,
        user_properties: None,
        client_id: None,
        client_token: None,
    };

    let loader = if let Some(loader_type_str) = args.loader_type {
        let loader_type = match loader_type_str.to_lowercase().as_str() {
            "forge" => LoaderType::Forge,
            "neoforge" | "neo_forge" => LoaderType::NeoForge,
            "fabric" => LoaderType::Fabric,
            "legacyfabric" | "legacy_fabric" => LoaderType::LegacyFabric,
            "quilt" => LoaderType::Quilt,
            _ => return Err(format!("Unknown loader type: {loader_type_str}")),
        };
        LoaderConfig {
            enable: true,
            loader_type: Some(loader_type),
            build: args.loader_build.unwrap_or_else(|| "latest".into()),
            path: None,
            config: None,
        }
    } else {
        LoaderConfig {
            enable: false,
            ..Default::default()
        }
    };

    let options = LaunchOptions {
        path: args.game_dir.into(),
        version: args.version,
        authenticator: auth,
        timeout_secs: 30,
        download_concurrency: args.download_concurrency.unwrap_or(10),
        verify_concurrency: args.verify_concurrency.unwrap_or(4),
        memory: MemoryConfig {
            min: args.min_mem,
            max: args.max_mem,
        },
        java: JavaOptions {
            path: args.java_path.map(std::path::PathBuf::from),
            ..Default::default()
        },
        loader,
        screen: ScreenConfig {
            fullscreen: args.fullscreen,
            ..Default::default()
        },
        verify: false,
        game_args: vec![],
        jvm_args: vec![],
        instance: args.instance,
        url: None,
        mcp: None,
        intel_enabled_mac: false,
        bypass_offline: true,
        skip_bundle_check: false,
        force_ipv4: false,
        dns: None,
    };

    let mut launcher = Launcher::new(options);
    let (tx, mut rx) = mpsc::channel::<LaunchEvent>(512);
    let app_clone = app.clone();

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                LaunchEvent::Progress {
                    downloaded,
                    total,
                    kind,
                } => {
                    let _ = app_clone.emit(
                        "minecraft-progress",
                        MinecraftEvent::Progress {
                            kind,
                            downloaded,
                            total,
                        },
                    );
                }
                LaunchEvent::Data(line) => {
                    let _ = app_clone.emit("minecraft-output", MinecraftEvent::Data { line });
                }
                LaunchEvent::Close(code) => {
                    let _ = app_clone.emit("minecraft-exit", MinecraftEvent::Close { code });
                }
                LaunchEvent::Error(msg) => {
                    let _ =
                        app_clone.emit("minecraft-error", MinecraftEvent::Error { message: msg });
                }
                LaunchEvent::GameDownloadFinished => {
                    let _ = app_clone.emit("minecraft-ready", MinecraftEvent::GameDownloadFinished);
                }
                _ => {}
            }
        }
    });

    if args.download_only {
        launcher
            .download_game(tx)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        let mut child = launcher.start(tx).await.map_err(|e| e.to_string())?;
        let _ = app.emit("minecraft-ready", serde_json::json!({}));

        // Store the child PID for global process monitoring
        {
            let proc_state = app.state::<GameProcessState>();
            *proc_state.lock().await = child.id();
        }

        let (tx_stop, mut rx_stop) = tokio::sync::oneshot::channel::<()>();
        let signal = app.state::<GameStopSignal>();
        *signal.lock().await = Some(tx_stop);

        let app_clone2 = app.clone();

        // Poll the child process every 2 seconds instead of blocking on wait()
        // This ensures we detect process exit even if the library doesn't emit
        // LaunchEvent::Close (e.g. when game is killed via system close button)
        loop {
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code().unwrap_or(-1);
                            let _ = app_clone2.emit("minecraft-exit", MinecraftEvent::Close { code });
                            break;
                        }
                        Ok(None) => {} // Still running, continue polling
                        Err(e) => {
                            let _ = app_clone2.emit("minecraft-error",
                                MinecraftEvent::Error { message: format!("游戏进程错误: {e}") });
                            break;
                        }
                    }
                }
                _ = &mut rx_stop => {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    let _ = app.emit("minecraft-exit", MinecraftEvent::Close { code: 0 });
                    break;
                }
            }
        }

        // Clear the stop signal
        *signal.lock().await = None;
        // Clear the process state
        {
            let proc_state = app.state::<GameProcessState>();
            *proc_state.lock().await = None;
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OobeSettings {
    pub locale: String,
    pub theme: String,
    pub font: String,
    #[serde(alias = "java_path")]
    pub java_path: String,
    #[serde(alias = "account_type")]
    pub account_type: String,
    #[serde(alias = "account_name")]
    pub account_name: String,
    #[serde(alias = "oobe_completed")]
    pub oobe_completed: bool,
}

impl Default for OobeSettings {
    fn default() -> Self {
        Self {
            locale: "system".into(),
            theme: "system".into(),
            font: "__system_default__".into(),
            java_path: String::new(),
            account_type: "offline".into(),
            account_name: String::new(),
            oobe_completed: false,
        }
    }
}

fn get_minecraft_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                return dir.join(".minecraft");
            }
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    std::path::PathBuf::from(home).join(".minecraft")
}

fn get_settings_path() -> std::path::PathBuf {
    get_minecraft_dir().join("settings.json")
}

#[tauri::command]
pub fn init_oobe_environment() -> Result<OobeSettings, String> {
    let mc_dir = get_minecraft_dir();
    std::fs::create_dir_all(&mc_dir).map_err(|e| format!("Failed to create .minecraft: {}", e))?;

    let dirs = ["versions", "logs", "caches"];
    for d in &dirs {
        let path = mc_dir.join(d);
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create .minecraft/{}: {}", d, e))?;
    }

    let settings = OobeSettings::default();
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(get_settings_path(), &json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(settings)
}

#[tauri::command]
pub fn save_oobe_settings(settings: OobeSettings) -> Result<(), String> {
    let mc_dir = get_minecraft_dir();
    std::fs::create_dir_all(&mc_dir).map_err(|e| format!("Failed to create .minecraft: {}", e))?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(get_settings_path(), &json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn rollback_oobe() -> Result<(), String> {
    let mc_dir = get_minecraft_dir();
    let settings_path = get_settings_path();
    if settings_path.exists() {
        std::fs::remove_file(&settings_path).ok();
    }
    if mc_dir.exists() {
        std::fs::remove_dir_all(&mc_dir)
            .map_err(|e| format!("Failed to remove .minecraft: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn check_oobe_completed() -> Result<bool, String> {
    let path = get_settings_path();
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    let settings: OobeSettings = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))?;
    Ok(settings.oobe_completed)
}

#[tauri::command]
pub fn get_oobe_settings() -> Result<OobeSettings, String> {
    let path = get_settings_path();
    if !path.exists() {
        return Ok(OobeSettings::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    let settings: OobeSettings = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))?;
    Ok(settings)
}

#[tauri::command]
pub fn get_minecraft_dir_string() -> String {
    get_minecraft_dir().to_string_lossy().to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CurrentAccount {
    pub name: String,
    pub account_type: String,
    pub uuid: String,
}

#[tauri::command]
pub fn get_current_account() -> Result<CurrentAccount, String> {
    let path = get_settings_path();
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        if let Ok(settings) = serde_json::from_str::<OobeSettings>(&content) {
            if !settings.account_name.is_empty() {
                let uuid = offline_uuid(&settings.account_name);
                return Ok(CurrentAccount {
                    name: settings.account_name,
                    account_type: settings.account_type,
                    uuid,
                });
            }
        }
    }
    let accounts = read_accounts();
    if let Some(first) = accounts.first() {
        return Ok(CurrentAccount {
            name: first.name.clone(),
            account_type: first.r#type.clone(),
            uuid: first.uuid.clone(),
        });
    }
    Ok(CurrentAccount {
        name: String::new(),
        account_type: String::new(),
        uuid: String::new(),
    })
}

#[tauri::command]
pub fn set_current_account(name: String, account_type: String) -> Result<(), String> {
    let path = get_settings_path();
    let mut settings = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<OobeSettings>(&s).ok())
            .unwrap_or_default()
    } else {
        OobeSettings::default()
    };
    settings.account_name = name;
    settings.account_type = account_type;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, &json)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoaderEntry {
    #[serde(rename = "type")]
    pub r#type: String,
    pub version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstanceEntry {
    pub name: String,
    pub version: String,
    pub version_type: String,
    pub loader: Option<LoaderEntry>,
    pub icon: Option<String>,
    pub installed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionDownload {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionDownloads {
    pub client: VersionDownload,
    pub server: Option<VersionDownload>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub downloads: VersionDownloads,
    pub assets: Option<String>,
    #[serde(rename = "assetIndex")]
    pub asset_index: Option<VersionDownload>,
}

#[tauri::command]
pub fn finish_oobe(settings: OobeSettings, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut s = settings;
    s.oobe_completed = true;
    let json = serde_json::to_string_pretty(&s)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(get_settings_path(), &json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    if let Some(main_window) = app_handle.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }

    if let Some(oobe_window) = app_handle.get_webview_window("oobe") {
        let _ = oobe_window.close();
    }

    let _ = app_handle.emit("account-refresh", ());

    Ok(())
}

fn get_instances_list_path() -> std::path::PathBuf {
    get_minecraft_dir().join("in_versions_list.json")
}

fn read_instances_list() -> Vec<InstanceEntry> {
    let path = get_instances_list_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_instances_list(instances: &[InstanceEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(instances)
        .map_err(|e| format!("Failed to serialize instances list: {}", e))?;
    std::fs::write(get_instances_list_path(), &json)
        .map_err(|e| format!("Failed to write instances list: {}", e))
}

#[tauri::command]
pub async fn install_instance(
    app: AppHandle,
    name: String,
    mc_version: String,
    version_type: String,
    loader_type: Option<String>,
    loader_version: Option<String>,
) -> Result<(), String> {
    let mc_dir = get_minecraft_dir();
    let instance_dir = mc_dir.join("versions").join(&name);
    std::fs::create_dir_all(&instance_dir)
        .map_err(|e| format!("Failed to create instance dir: {}", e))?;

    let _ = app.emit(
        "install-progress",
        serde_json::json!({
            "step": "manifest",
            "progress": 0.0
        }),
    );

    let manifest_url = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";
    let manifest_resp = reqwest::get(manifest_url)
        .await
        .map_err(|e| format!("Failed to fetch version manifest: {}", e))?;
    let manifest: VersionManifest = manifest_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse version manifest: {}", e))?;

    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Version {} not found in manifest", mc_version))?;

    let _ = app.emit(
        "install-progress",
        serde_json::json!({
            "step": "version_json",
            "progress": 0.2
        }),
    );

    let version_json_resp = reqwest::get(&version_info.url)
        .await
        .map_err(|e| format!("Failed to fetch version JSON: {}", e))?;
    let version_json: VersionJson = version_json_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

    let version_json_path = instance_dir.join(format!("{}.json", &name));
    let version_json_content = serde_json::to_string_pretty(&version_json)
        .map_err(|e| format!("Failed to serialize version JSON: {}", e))?;
    std::fs::write(&version_json_path, &version_json_content)
        .map_err(|e| format!("Failed to write version JSON: {}", e))?;

    let _ = app.emit(
        "install-progress",
        serde_json::json!({
            "step": "client_jar",
            "progress": 0.4
        }),
    );

    let jar_url = &version_json.downloads.client.url;
    let jar_path = instance_dir.join(format!("{}.jar", &name));

    let jar_resp = reqwest::get(jar_url)
        .await
        .map_err(|e| format!("Failed to fetch client jar: {}", e))?;

    let total_size = jar_resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&jar_path)
        .map_err(|e| format!("Failed to create jar file: {}", e))?;
    let mut stream = jar_resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write jar data: {}", e))?;

        if total_size > 0 {
            let progress = 0.4 + (downloaded as f64 / total_size as f64) * 0.4;
            let _ = app.emit(
                "install-progress",
                serde_json::json!({
                    "step": "client_jar",
                    "progress": progress
                }),
            );
        }
    }

    let _ = app.emit(
        "install-progress",
        serde_json::json!({
            "step": "finalize",
            "progress": 0.9
        }),
    );

    let loader = loader_type.map(|lt| LoaderEntry {
        r#type: lt,
        version: loader_version.unwrap_or_default(),
    });

    let new_entry = InstanceEntry {
        name: name.clone(),
        version: mc_version,
        version_type,
        loader,
        icon: None,
        installed: false,
    };

    let mut instances = read_instances_list();
    instances.push(new_entry);
    write_instances_list(&instances)?;

    let _ = app.emit(
        "install-progress",
        serde_json::json!({
            "step": "done",
            "progress": 1.0
        }),
    );

    Ok(())
}

#[tauri::command]
pub fn get_instances_list() -> Result<Vec<InstanceEntry>, String> {
    Ok(read_instances_list())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountEntry {
    pub name: String,
    pub r#type: String,
    pub uuid: String,
    #[serde(default)]
    pub ms_refresh_token: Option<String>,
    #[serde(default)]
    pub mc_token: Option<String>,
    #[serde(default)]
    pub xuid: Option<String>,
}

fn get_accounts_path() -> std::path::PathBuf {
    get_minecraft_dir().join("accounts.json")
}

fn read_accounts() -> Vec<AccountEntry> {
    let path = get_accounts_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_accounts(accounts: &[AccountEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(accounts)
        .map_err(|e| format!("Failed to serialize accounts: {}", e))?;
    std::fs::write(get_accounts_path(), &json)
        .map_err(|e| format!("Failed to write accounts: {}", e))
}

#[tauri::command]
pub fn get_accounts() -> Result<Vec<AccountEntry>, String> {
    let mut accounts = read_accounts();
    if accounts.is_empty() {
        let settings_path = get_settings_path();
        if settings_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<OobeSettings>(&content) {
                    if !settings.account_name.is_empty() {
                        let uuid = offline_uuid(&settings.account_name);
                        accounts.push(AccountEntry {
                            name: settings.account_name.clone(),
                            r#type: settings.account_type.clone(),
                            uuid,
                            ms_refresh_token: None,
                            mc_token: None,
                            xuid: None,
                        });
                        write_accounts(&accounts).ok();
                    }
                }
            }
        }
    }
    Ok(accounts)
}

#[tauri::command]
pub fn add_account(
    name: String,
    account_type: String,
    uuid: Option<String>,
    ms_refresh_token: Option<String>,
    mc_token: Option<String>,
    xuid: Option<String>,
) -> Result<Vec<AccountEntry>, String> {
    let account_uuid = uuid.unwrap_or_else(|| {
        if name.is_empty() { String::new() } else { offline_uuid(&name) }
    });
    let entry = AccountEntry {
        name,
        r#type: account_type,
        uuid: account_uuid,
        ms_refresh_token,
        mc_token,
        xuid,
    };
    let mut accounts = read_accounts();
    accounts.push(entry);
    write_accounts(&accounts)?;
    Ok(accounts)
}

#[tauri::command]
pub fn remove_account(name: String) -> Result<Vec<AccountEntry>, String> {
    let mut accounts = read_accounts();
    accounts.retain(|a| a.name != name);
    write_accounts(&accounts)?;
    Ok(accounts)
}

// ── Third-party Auth Servers ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthServerEntry {
    pub url: String,
    pub name: String,
}

fn get_auth_servers_path() -> std::path::PathBuf {
    get_minecraft_dir().join("auth_servers.json")
}

fn read_auth_servers() -> Vec<AuthServerEntry> {
    let path = get_auth_servers_path();
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_auth_servers(servers: &[AuthServerEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(servers)
        .map_err(|e| format!("Failed to serialize auth servers: {}", e))?;
    std::fs::write(get_auth_servers_path(), &json)
        .map_err(|e| format!("Failed to write auth servers: {}", e))
}

#[tauri::command]
pub fn get_auth_servers() -> Result<Vec<AuthServerEntry>, String> {
    Ok(read_auth_servers())
}

#[tauri::command]
pub fn remove_auth_server(url: String) -> Result<Vec<AuthServerEntry>, String> {
    let mut servers = read_auth_servers();
    servers.retain(|s| s.url != url);
    write_auth_servers(&servers)?;
    Ok(servers)
}

fn extract_hostname(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or(url)
        .to_string()
}

#[tauri::command]
pub async fn add_auth_server(url: String) -> Result<AuthServerEntry, String> {
    // Validate URL format
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".to_string());
    }

    let hostname = extract_hostname(&url);

    // Try to fetch the API root to get server name
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let api_url = if url.ends_with('/') {
        format!("{}api/yggdrasil", url)
    } else {
        format!("{}/api/yggdrasil", url)
    };

    let server_name = match client.get(&api_url).send().await {
        Ok(r) if r.status().is_success() => {
            if let Ok(json) = r.json::<serde_json::Value>().await {
                json.get("meta")
                    .and_then(|m| m.get("serverName"))
                    .or_else(|| json.get("serverName"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| hostname.clone())
            } else {
                hostname.clone()
            }
        }
        _ => hostname.clone(),
    };

    let entry = AuthServerEntry {
        url: url.clone(),
        name: server_name,
    };

    let mut servers = read_auth_servers();
    if servers.iter().any(|s| s.url == url) {
        return Err("该认证服务器已存在".to_string());
    }
    servers.push(entry.clone());
    write_auth_servers(&servers)?;
    Ok(entry)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSettings {
    pub icon: Option<String>,
    pub skip_launcher: bool,
    pub fullscreen: bool,
    pub auto_connect_address: Option<String>,
    pub java_version: Option<String>,
    pub auto_memory: bool,
    pub min_memory: String,
    pub max_memory: String,
    pub jvm_args: String,
    pub game_args: String,
    pub download_concurrency: u32,
    pub verify_concurrency: u32,
}

impl Default for InstanceSettings {
    fn default() -> Self {
        Self {
            icon: None,
            skip_launcher: false,
            fullscreen: false,
            auto_connect_address: None,
            java_version: None,
            auto_memory: true,
            min_memory: "1024M".into(),
            max_memory: "2048M".into(),
            jvm_args: String::new(),
            game_args: String::new(),
            download_concurrency: 10,
            verify_concurrency: 4,
        }
    }
}

fn get_instance_settings_path(name: &str) -> std::path::PathBuf {
    get_minecraft_dir().join("versions").join(name).join("settings.json")
}

#[tauri::command]
pub fn get_instance_settings(instance_name: String) -> Result<InstanceSettings, String> {
    let path = get_instance_settings_path(&instance_name);
    if !path.exists() {
        return Ok(InstanceSettings::default());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("无法读取实例设置: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("无法解析实例设置: {e}"))
}

#[tauri::command]
pub fn save_instance_settings(
    instance_name: String,
    settings: InstanceSettings,
) -> Result<(), String> {
    let path = get_instance_settings_path(&instance_name);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建设置目录: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("无法序列化设置: {e}"))?;
    std::fs::write(&path, &json).map_err(|e| format!("无法保存设置: {e}"))
}

#[tauri::command]
pub async fn stop_game(app: AppHandle) -> Result<(), String> {
    let signal = app.state::<GameStopSignal>();
    let mut guard = signal.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_game_running(app: AppHandle) -> Result<bool, String> {
    let state = app.state::<GameProcessState>();
    let pid = {
        let guard = state.lock().await;
        *guard
    };

    match pid {
        Some(pid) => {
            let running = tokio::task::spawn_blocking(move || {
                let mut system = sysinfo::System::new();
                system.refresh_processes(
                    sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
                );
                system.process(sysinfo::Pid::from_u32(pid)).is_some()
            })
            .await
            .map_err(|e| format!("Failed to check process: {e}"))?;
            Ok(running)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn open_crash_shell(app: AppHandle, report: CrashReport) -> Result<(), String> {
    let state = app.state::<CrashReportState>();
    {
        let mut guard = state.lock().await;
        *guard = Some(report);
    }

    // check if window already exists, reuse it
    if let Some(window) = app.get_webview_window("crash-shell") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    use tauri::WebviewWindowBuilder;
    let crash_builder = WebviewWindowBuilder::new(
        &app,
        "crash-shell",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("崩溃报告")
    .inner_size(750.0, 600.0)
    .resizable(true)
    .center();

    #[cfg(not(target_os = "macos"))]
    let crash_builder = crash_builder.decorations(false);

    let crash_window = crash_builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    crash_window
        .set_title_bar_style(tauri::TitleBarStyle::Transparent)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_crash_report(app: AppHandle) -> Result<Option<CrashReport>, String> {
    let state = app.state::<CrashReportState>();
    let guard = state.lock().await;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn clear_crash_report(app: AppHandle) -> Result<(), String> {
    let state = app.state::<CrashReportState>();
    let mut guard = state.lock().await;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn read_image_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("无法读取文件: {e}"))
}

#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), String> {
    let mc_dir = get_minecraft_dir();
    let logs_dir = mc_dir.join("logs");
    std::fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("无法创建日志目录: {e}"))?;
    let opener = app.state::<tauri_plugin_opener::Opener<tauri::Wry>>();
    opener
        .open_path(logs_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("无法打开日志文件夹: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn open_instance_game_folder(app: AppHandle, instance_name: String) -> Result<(), String> {
    let mc_dir = get_minecraft_dir().join("instances").join(&instance_name);
    std::fs::create_dir_all(&mc_dir)
        .map_err(|e| format!("无法创建实例目录: {e}"))?;
    let opener = app.state::<tauri_plugin_opener::Opener<tauri::Wry>>();
    opener
        .open_path(mc_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("无法打开游戏目录: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn export_crash_log(app: AppHandle, content: String) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<std::path::PathBuf>>();
    app.dialog()
        .file()
        .add_filter("日志文件", &["log", "txt"])
        .set_file_name("crash-report.log")
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.into_path().ok()));
        });
    if let Some(path) = rx.await.unwrap_or(None) {
        std::fs::write(&path, &content)
            .map_err(|e| format!("无法保存日志文件: {e}"))?;
    }
    Ok(())
}

// ── Microsoft Authentication ──

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftAccount {
    pub name: String,
    pub uuid: String,
    pub xuid: String,
    pub mc_token: String,
    pub ms_refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum PollResult {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "complete")]
    Complete(MicrosoftAccount),
    #[serde(rename = "error")]
    Error { reason: String },
}

#[tauri::command]
pub async fn start_microsoft_auth(client_id: String) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id.as_str()),
        ("scope", "XboxLive.signin offline_access"),
    ];
    let resp = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("请求设备代码失败: {e}"))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析设备代码响应失败: {e}"))?;

    eprintln!("[start_microsoft_auth] response: {}", serde_json::to_string(&json).unwrap_or_default());

    if let Some(err) = json["error"].as_str() {
        let desc = json["error_description"].as_str().unwrap_or("未知错误");
        return Err(format!("Microsoft 设备代码请求失败: {err} - {desc}"));
    }

    Ok(DeviceCodeResponse {
        user_code: json["user_code"].as_str().unwrap_or("").to_string(),
        device_code: json["device_code"].as_str().unwrap_or("").to_string(),
        verification_uri: json["verification_uri"]
            .as_str()
            .unwrap_or("https://microsoft.com/devicelogin")
            .to_string(),
        interval: json["interval"].as_u64().unwrap_or(5),
    })
}

async fn complete_minecraft_auth(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<MicrosoftAccount, String> {
    // Step 1: Xbox Live token
    let xbox_resp: serde_json::Value = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("x-xbl-contract-version", "1")
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("Xbox Live 认证失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析 Xbox Live 响应失败: {e}"))?;

    let xbox_token = xbox_resp["Token"].as_str().unwrap_or("").to_string();
    let uhs = xbox_resp["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Step 2: XSTS
    let xsts_resp: serde_json::Value = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("x-xbl-contract-version", "1")
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbox_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("XSTS 认证失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析 XSTS 响应失败: {e}"))?;

    let xsts_token = xsts_resp["Token"].as_str().unwrap_or("").to_string();
    let xuid = xsts_resp["DisplayClaims"]["xui"][0]["xid"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let identity_token = format!("XBL3.0 x={};{}", uhs, xsts_token);

    // Step 3: Minecraft access token
    let mc_resp: serde_json::Value = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&serde_json::json!({
            "identityToken": identity_token
        }))
        .send()
        .await
        .map_err(|e| format!("Minecraft 认证失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析 Minecraft 响应失败: {e}"))?;

    let mc_token = mc_resp["access_token"].as_str().unwrap_or("").to_string();

    // Step 4: Profile
    let profile_resp: serde_json::Value = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc_token))
        .send()
        .await
        .map_err(|e| format!("获取角色信息失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析角色信息失败: {e}"))?;

    let name = profile_resp["name"].as_str().unwrap_or("").to_string();
    let uuid_raw = profile_resp["id"].as_str().unwrap_or("").to_string();
    let uuid = if uuid_raw.len() == 32 {
        format!(
            "{}-{}-{}-{}-{}",
            &uuid_raw[0..8],
            &uuid_raw[8..12],
            &uuid_raw[12..16],
            &uuid_raw[16..20],
            &uuid_raw[20..32]
        )
    } else {
        uuid_raw
    };

    if name.is_empty() {
        return Err(
            "未获取到 Minecraft 角色信息，请确认该账号已购买 Minecraft Java 版".into(),
        );
    }

    Ok(MicrosoftAccount {
        name,
        uuid,
        xuid,
        mc_token,
        ms_refresh_token: ms_refresh_token.to_string(),
    })
}

#[tauri::command]
pub async fn poll_microsoft_auth(
    client_id: String,
    device_code: String,
) -> PollResult {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ("client_id", client_id.as_str()),
        ("device_code", device_code.as_str()),
    ];
    let resp = match client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&params)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return PollResult::Error { reason: format!("网络请求失败: {e}") },
    };

    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) => return PollResult::Error { reason: format!("读取响应失败: {e}") },
    };
    eprintln!("[poll_microsoft_auth] body: {}", body);

    let json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => return PollResult::Error { reason: format!("解析响应失败: {e}") },
    };

    if let Some(access_token) = json["access_token"].as_str() {
        let refresh_token = json["refresh_token"].as_str().unwrap_or("");
        match complete_minecraft_auth(&client, access_token, refresh_token).await {
            Ok(account) => PollResult::Complete(account),
            Err(e) => PollResult::Error { reason: e },
        }
    } else {
        let error = json["error"].as_str().unwrap_or("unknown");
        match error {
            "authorization_pending" | "slow_down" => PollResult::Pending,
            "expired_token" | "authorization_declined" => {
                PollResult::Error { reason: "验证已过期或已拒绝".into() }
            }
            _ => PollResult::Error { reason: format!("验证失败: {error}") },
        }
    }
}

// ---- Instance stats cards ----

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInfo {
    pub level_name: String,
    pub last_played: String,
    pub dir_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceCardData {
    pub screenshots: Vec<String>,
    pub mod_count: usize,
    pub resourcepack_count: usize,
    pub save_count: usize,
    pub recent_save: Option<SaveInfo>,
}

#[tauri::command]
pub fn get_instance_card_data(instance_name: String) -> InstanceCardData {
    let mc_dir = get_minecraft_dir().join("instances").join(&instance_name);
    let screenshot_dir = mc_dir.join("screenshots");
    let mods_dir = mc_dir.join("mods");
    let rp_dir = mc_dir.join("resourcepacks");
    let saves_dir = mc_dir.join("saves");

    let screenshots = fs::read_dir(&screenshot_dir)
        .map(|d| {
            d.filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mod_count = fs::read_dir(&mods_dir)
        .map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().is_file()).count())
        .unwrap_or(0);

    let resourcepack_count = fs::read_dir(&rp_dir)
        .map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().is_file()).count())
        .unwrap_or(0);

    let save_count = fs::read_dir(&saves_dir)
        .map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count())
        .unwrap_or(0);

    let recent_save = parse_recent_save(&saves_dir);

    InstanceCardData {
        screenshots,
        mod_count,
        resourcepack_count,
        save_count,
        recent_save,
    }
}

fn parse_recent_save(saves_dir: &std::path::Path) -> Option<SaveInfo> {
    let dirs = fs::read_dir(saves_dir).ok()?;
    let mut candidates: Vec<SaveInfo> = Vec::new();

    for entry in dirs.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        let level_dat = path.join("level.dat");
        if !level_dat.exists() {
            continue;
        }
        if let Some(info) = parse_level_dat(&level_dat, &dir_name) {
            candidates.push(info);
        }
    }

    // sort by last_played (descending), return most recent
    candidates.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    candidates.into_iter().next()
}

#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
struct LevelDatRoot {
    Data: LevelDatData,
}

#[derive(serde::Deserialize)]
struct LevelDatData {
    #[serde(alias = "LevelName")]
    level_name: Option<String>,
    #[serde(alias = "LastPlayed")]
    last_played: Option<i64>,
}

fn parse_level_dat(path: &std::path::Path, dir_name: &str) -> Option<SaveInfo> {
    let file = fs::File::open(path).ok()?;
    let decoder = flate2::read::GzDecoder::new(file);
    let reader = BufReader::new(decoder);
    let root: LevelDatRoot = fastnbt::from_reader(reader).ok()?;

    let level_name = root.Data.level_name.unwrap_or_else(|| dir_name.to_string());
    let last_played_millis = root.Data.last_played?;

    let secs = last_played_millis / 1000;
    let nanos = ((last_played_millis % 1000) * 1_000_000) as u32;
    let naive = chrono::DateTime::from_timestamp(secs, nanos)
        .unwrap_or_default()
        .naive_utc();
    let datetime: chrono::DateTime<chrono::Local> = chrono::DateTime::from_naive_utc_and_offset(naive, *chrono::Local::now().offset());
    let last_played = datetime.format("%Y/%m/%d %H:%M").to_string();

    Some(SaveInfo {
        level_name,
        last_played,
        dir_name: dir_name.to_string(),
    })
}
