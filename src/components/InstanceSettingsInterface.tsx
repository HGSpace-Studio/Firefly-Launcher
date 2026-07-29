import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X, Settings, Zap, Puzzle, Terminal, SlidersHorizontal,
  Save, Folder, Check,
} from "lucide-react";
import type { InstanceData } from "./view/rootpages/instance_detail";
import "./InstanceSettingsInterface.css";

interface JavaInstall {
  path: string;
  version: string;
}

interface SystemMem {
  totalMb: number;
  usedMb: number;
}

interface InstanceSettings {
  icon: string | null;
  skipLauncher: boolean;
  fullscreen: boolean;
  autoConnectAddress: string | null;
  javaVersion: string | null;
  autoMemory: boolean;
  minMemory: string;
  maxMemory: string;
  jvmArgs: string;
  gameArgs: string;
  downloadConcurrency: number;
  verifyConcurrency: number;
}

interface Props {
  instance: InstanceData;
  onClose: () => void;
}

export default function InstanceSettingsInterface({ instance, onClose }: Props) {
  const [settingsTab, setSettingsTab] = useState<"general" | "quicklaunch" | "extensions" | "java" | "other">("general");
  const [saveMsg, setSaveMsg] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const [instSettings, setInstSettings] = useState<InstanceSettings>({
    icon: null,
    skipLauncher: false,
    fullscreen: false,
    autoConnectAddress: null,
    javaVersion: null,
    autoMemory: true,
    minMemory: "1024M",
    maxMemory: "2048M",
    jvmArgs: "",
    gameArgs: "",
    downloadConcurrency: 10,
    verifyConcurrency: 4,
  });
  const [javaVersions, setJavaVersions] = useState<JavaInstall[]>([]);
  const [systemMem, setSystemMem] = useState<SystemMem | null>(null);

  function javaVersionLabel(v: string): string {
    const m = v.match(/(\d+(?:\.\d+)*)/);
    return m ? m[1] : v;
  }

  const totalMemGb = useMemo(() => {
    if (!systemMem) return 0;
    return Math.round(systemMem.totalMb / 1024);
  }, [systemMem]);

  const usedMemGb = useMemo(() => {
    if (!systemMem) return 0;
    return Math.round(systemMem.usedMb / 1024);
  }, [systemMem]);

  const memBarPercent = useMemo(() => {
    if (!systemMem || systemMem.totalMb === 0) return 0;
    return (systemMem.usedMb / systemMem.totalMb) * 100;
  }, [systemMem]);

  const instanceInitial = useMemo(() => instance.name.charAt(0).toUpperCase(), [instance.name]);

  const instanceColor = useMemo(() => {
    const colors = ["#00BAAD", "#6C5CE7", "#E17055", "#0984E3", "#A29BFE", "#00B894", "#E84393", "#FDCB6E"];
    let hash = 0;
    for (const ch of instance.name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }, [instance.name]);

  const loaderLabel = useMemo(() => {
    if (!instance.loader) return "原版";
    const map: Record<string, string> = {
      fabric: "Fabric",
      forge: "Forge",
      neoforge: "NeoForge",
      quilt: "Quilt",
    };
    return `${map[instance.loader.type] || instance.loader.type} ${instance.loader.version}`;
  }, [instance.loader]);

  useEffect(() => {
    (async () => {
      try {
        const data = await invoke<InstanceSettings>("get_instance_settings", { instanceName: instance.name });
        if (data) setInstSettings({ ...instSettings, ...data });
      } catch { /* use defaults */ }
    })();
    (async () => {
      try {
        const versions = await invoke<JavaInstall[]>("get_java_versions");
        setJavaVersions(versions);
      } catch { /* ignore */ }
    })();
    (async () => {
      try {
        const mem = await invoke<SystemMem>("get_system_memory");
        setSystemMem(mem);
      } catch { /* ignore */ }
    })();
  }, []);

  const onMinMemSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInstSettings((prev) => {
      const next = { ...prev, minMemory: v + "M" };
      const max = parseInt(prev.maxMemory) || 2048;
      if (parseInt(v) > max - 256) {
        next.maxMemory = (parseInt(v) + 256) + "M";
      }
      return next;
    });
  };

  const onMaxMemSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInstSettings((prev) => ({ ...prev, maxMemory: v + "M" }));
  };

  const platformLabel = useMemo(() => {
    if (navigator.userAgent.includes("Windows")) return "在资源管理器中显示";
    if (navigator.userAgent.includes("Mac")) return "在 Finder 中显示";
    return "打开目录";
  }, []);

  async function openGameFolder() {
    try {
      await invoke("open_instance_game_folder", { instanceName: instance.name });
    } catch { /* ignore */ }
  }

  async function saveSettings() {
    setSaveMsg("saving");
    try {
      await invoke("save_instance_settings", { instanceName: instance.name, settings: instSettings });
      setSaveMsg("saved");
    } catch {
      setSaveMsg("error");
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveMsg(""), 2500);
  }

  const tabs = [
    { key: "general" as const, label: "常规", icon: Settings },
    { key: "quicklaunch" as const, label: "快速启动", icon: Zap },
    { key: "extensions" as const, label: "可选扩展", icon: Puzzle },
    { key: "java" as const, label: "Java 与运行", icon: Terminal },
    { key: "other" as const, label: "其他", icon: SlidersHorizontal },
  ];

  return (
    <div className="isettings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="isettings-window">
        <div className="isettings-header">
          <div className="isettings-header-left">
            <div className="isettings-avatar" style={{ background: instanceColor }}>
              {instanceInitial}
            </div>
            <div className="isettings-header-text">
              <span className="isettings-title">{instance.name}</span>
              <span className="isettings-subtitle">{instance.version} · {loaderLabel}</span>
            </div>
          </div>
          <div className="isettings-header-right">
            {saveMsg && (
              <span className={`isettings-save-indicator ${saveMsg}`}>
                {saveMsg === "saved" && <Check size={13} />}
                {saveMsg === "saving" && <span>保存中…</span>}
                {saveMsg === "saved" && <span>已保存</span>}
                {saveMsg === "error" && <span>保存失败</span>}
              </span>
            )}
            <button className="isettings-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="isettings-body">
          <div className="iset-layout">
            <div className="iset-sidebar">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`iset-nav-item${settingsTab === tab.key ? " active" : ""}`}
                  onClick={() => setSettingsTab(tab.key)}
                >
                  {tab.icon && <tab.icon size={15} />}
                  <span>{tab.label}</span>
                </button>
              ))}
              <div className="iset-sidebar-spacer"></div>
              <div className="iset-sidebar-divider"></div>
              <button className="iset-nav-item iset-nav-folder" onClick={openGameFolder}>
                <Folder size={15} />
                <span>{platformLabel}</span>
              </button>
            </div>
            <div className="iset-content">
              <div className="iset-scroll">
                {settingsTab === "general" && (
                  <div className="iset-section">
                    <div className="iset-info-grid">
                      <div className="iset-info-cell">
                        <span className="iset-info-key">实例名称</span>
                        <span className="iset-info-val">{instance.name}</span>
                      </div>
                      <div className="iset-info-cell">
                        <span className="iset-info-key">游戏版本</span>
                        <span className="iset-info-val">{instance.version}</span>
                      </div>
                      <div className="iset-info-cell">
                        <span className="iset-info-key">版本类型</span>
                        <span className="iset-info-val">{instance.versionType}</span>
                      </div>
                      <div className="iset-info-cell">
                        <span className="iset-info-key">模组加载器</span>
                        <span className="iset-info-val">{loaderLabel}</span>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === "quicklaunch" && (
                  <div className="iset-section">
                    <div className="iset-card">
                      <div className="iset-card-row">
                        <div className="iset-card-text">
                          <span className="iset-card-title">跳过启动动画</span>
                          <span className="iset-card-desc">启动游戏时跳过启动器动画，直接进入游戏</span>
                        </div>
                        <label className="iset-toggle">
                          <input
                            checked={instSettings.skipLauncher}
                            onChange={(e) => setInstSettings((p) => ({ ...p, skipLauncher: e.target.checked }))}
                            type="checkbox"
                          />
                          <span className="iset-toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                    <div className="iset-card">
                      <div className="iset-card-row">
                        <div className="iset-card-text">
                          <span className="iset-card-title">全屏启动</span>
                          <span className="iset-card-desc">游戏启动后自动切换为全屏模式</span>
                        </div>
                        <label className="iset-toggle">
                          <input
                            checked={instSettings.fullscreen}
                            onChange={(e) => setInstSettings((p) => ({ ...p, fullscreen: e.target.checked }))}
                            type="checkbox"
                          />
                          <span className="iset-toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                    <div className="iset-card">
                      <div className="iset-card-head">
                        <span className="iset-card-title">自动连接服务器</span>
                        <span className="iset-card-desc">启动后自动加入指定服务器，留空则不连接</span>
                      </div>
                      <input
                        value={instSettings.autoConnectAddress || ""}
                        onChange={(e) => setInstSettings((p) => ({ ...p, autoConnectAddress: e.target.value || null }))}
                        placeholder="例如: example.com:25565"
                        className="iset-input-full"
                      />
                    </div>
                  </div>
                )}
                {settingsTab === "extensions" && (
                  <div className="iset-section">
                    <div className="iset-info-grid">
                      <div className="iset-info-cell full">
                        <span className="iset-info-key">当前加载器</span>
                        <span className="iset-info-val">{loaderLabel}</span>
                      </div>
                    </div>
                    <div className="iset-empty-hint">
                      <Puzzle size={20} className="iset-empty-icon" />
                      <span>加载器信息由创建实例时决定，如需更换请新建实例</span>
                    </div>
                  </div>
                )}
                {settingsTab === "java" && (
                  <div className="iset-section">
                    <div className="iset-card">
                      <div className="iset-card-head" style={{ marginBottom: 12 }}>
                        <div className="iset-card-text">
                          <span className="iset-card-title">Java 版本</span>
                          <span className="iset-card-desc">选择启动此实例时使用的 Java 版本，高亮项将用于启动</span>
                        </div>
                      </div>
                      <div className="iset-java-grid">
                        {javaVersions.length === 0 && (
                          <div className="iset-java-empty">未检测到 Java 环境</div>
                        )}
                        {javaVersions.map((jv) => {
                          const selected = instSettings.javaVersion === jv.path;
                          return (
                            <button
                              key={jv.path}
                              className={`iset-java-card${selected ? " selected" : ""}`}
                              onClick={() => setInstSettings((p) => ({ ...p, javaVersion: selected ? null : jv.path }))}
                            >
                              <span className="iset-java-version">{javaVersionLabel(jv.version)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="iset-card">
                      <div className="iset-card-head">
                        <span className="iset-card-title">内存分配</span>
                        <span className="iset-card-desc">调整游戏运行时的内存分配区间</span>
                      </div>
                      <div className="iset-card-row">
                        <div className="iset-card-text">
                          <span className="iset-toggle-label">{instSettings.autoMemory ? "自动分配" : "手动调整"}</span>
                        </div>
                        <label className="iset-toggle">
                          <input
                            checked={instSettings.autoMemory}
                            onChange={(e) => setInstSettings((p) => ({ ...p, autoMemory: e.target.checked }))}
                            type="checkbox"
                          />
                          <span className="iset-toggle-slider"></span>
                        </label>
                      </div>
                      {instSettings.autoMemory && systemMem && (
                        <div className="mem-section">
                          <div className="mem-bar">
                            <div className="mem-bar-used" style={{ width: `${memBarPercent}%` }}></div>
                          </div>
                          <div className="mem-info">
                            共 <strong>{totalMemGb} GB</strong> 内存，已使用 <strong>{usedMemGb} GB</strong>
                          </div>
                        </div>
                      )}
                      {!instSettings.autoMemory && systemMem && (
                        <div className="mem-section">
                          <div className="mem-slider-group">
                            <div className="mem-slider-row">
                              <span className="mem-slider-label">最小</span>
                              <div className="mem-slider-track-wrap">
                                <input
                                  type="range"
                                  className="mem-slider"
                                  min={256}
                                  max={Math.max(256, systemMem.totalMb - 512)}
                                  value={parseInt(instSettings.minMemory) || 1024}
                                  onChange={onMinMemSlide}
                                  step={128}
                                />
                                <span className="mem-slider-val">{parseInt(instSettings.minMemory) || 1024} MB</span>
                              </div>
                            </div>
                            <div className="mem-slider-row">
                              <span className="mem-slider-label">最大</span>
                              <div className="mem-slider-track-wrap">
                                <input
                                  type="range"
                                  className="mem-slider"
                                  min={Math.max(256, (parseInt(instSettings.minMemory) || 1024) + 256)}
                                  max={Math.max(512, systemMem.totalMb - 256)}
                                  value={parseInt(instSettings.maxMemory) || 2048}
                                  onChange={onMaxMemSlide}
                                  step={128}
                                />
                                <span className="mem-slider-val">{parseInt(instSettings.maxMemory) || 2048} MB</span>
                              </div>
                            </div>
                          </div>
                          <div className="mem-info">
                            共 <strong>{totalMemGb} GB</strong> 内存
                          </div>
                        </div>
                      )}
                      {!instSettings.autoMemory && !systemMem && (
                        <div className="mem-section">
                          <div className="iset-row">
                            <label className="iset-label">最小内存</label>
                            <input
                              value={instSettings.minMemory}
                              onChange={(e) => setInstSettings((p) => ({ ...p, minMemory: e.target.value }))}
                              placeholder="1024M"
                              className="iset-input narrow"
                            />
                          </div>
                          <div className="iset-row">
                            <label className="iset-label">最大内存</label>
                            <input
                              value={instSettings.maxMemory}
                              onChange={(e) => setInstSettings((p) => ({ ...p, maxMemory: e.target.value }))}
                              placeholder="2048M"
                              className="iset-input narrow"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {settingsTab === "other" && (
                  <div className="iset-section">
                    <div className="iset-card">
                      <div className="iset-card-head">
                        <span className="iset-card-title">下载与校验</span>
                        <span className="iset-card-desc">调整并发线程数以平衡速度与稳定性</span>
                      </div>
                      <div className="iset-row">
                        <label className="iset-label">下载线程数</label>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={instSettings.downloadConcurrency}
                          onChange={(e) => setInstSettings((p) => ({ ...p, downloadConcurrency: parseInt(e.target.value) || 10 }))}
                          className="iset-input narrow"
                        />
                      </div>
                      <div className="iset-row">
                        <label className="iset-label">校验线程数</label>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={instSettings.verifyConcurrency}
                          onChange={(e) => setInstSettings((p) => ({ ...p, verifyConcurrency: parseInt(e.target.value) || 4 }))}
                          className="iset-input narrow"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="iset-footer">
                <button className="iset-save-btn" onClick={saveSettings}>
                  <Save size={14} />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}