import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Gamepad2, Square, RefreshCw, Zap, Settings, Puzzle, Terminal, SlidersHorizontal, Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { addTask, updateTask, getTask, registerLaunchListeners } from "../../../stores/taskStore";
import { launchStore } from "../../../stores/instanceLaunch";
import "./instance_detail.css";
import { openedInstancesStore } from "../../../stores/openedInstances";

export interface InstanceData {
  name: string;
  version: string;
  versionType: string;
  loader?: {
    type: "fabric" | "forge" | "neoforge" | "quilt";
    version: string;
  };
  icon?: string;
}

interface InstanceDetailsProps {
  instance: InstanceData;
}

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

interface InstanceCardData {
  screenshots: string[];
  modCount: number;
  resourcepackCount: number;
  saveCount: number;
  recentSave: { levelName: string; lastPlayed: string; dirName: string } | null;
}

export default function InstanceDetail({ instance }: InstanceDetailsProps) {
  const [activeTab] = useState<"launch" | "settings" | "resources">("launch");
  const [settingsTab, setSettingsTab] = useState<"general" | "quicklaunch" | "extensions" | "java" | "other">("general");
  const [saveMsg, setSaveMsg] = useState("");
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
  const [cardData, setCardData] = useState<InstanceCardData | null>(null);
  const [cardScreenshotUrl, setCardScreenshotUrl] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const instSettingsRef = useRef(instSettings);
  const cardScreenshotUrlRef = useRef<string | null>(null);

  instSettingsRef.current = instSettings;
  cardScreenshotUrlRef.current = cardScreenshotUrl;

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

  const taskId = useMemo(() => `launch:${instance.name}`, [instance.name]);
  const task = useMemo(() => getTask(taskId), [taskId]);
  const launchState = useMemo(() => task?.status || "idle", [task]);
  const launchLabel = useMemo(() => task?.label || "启动游戏", [task]);
  const launchProgress = useMemo(() => task?.progress || 0, [task]);

  const launchGame = useCallback(async () => {
    if (launchState !== "idle") return;

    const ua = navigator.userAgent.toLowerCase();
    const osName = ua.includes("mac") ? "macOS" : ua.includes("linux") ? "Linux" : "Windows";
    const curInstSettings = instSettingsRef.current;

    addTask({
      id: taskId,
      type: "launch",
      title: instance.name,
      status: "launching",
      progress: 0,
      label: "准备启动...",
      instanceId: instance.name,
      gameVersion: instance.version,
      systemVersion: osName + " " + navigator.userAgent,
    });
    await registerLaunchListeners(instance.name);

    try {
      const acc = await invoke<{ name: string; account_type: string; uuid: string }>("get_current_account");
      const oobe = await invoke<{ accountName: string; javaPath: string }>("get_oobe_settings");
      const mcDir = await invoke<string>("get_minecraft_dir_string");

      updateTask(taskId, { javaVersion: oobe.javaPath || "未知" });

      await invoke("launch_minecraft", {
        args: {
          version: instance.version,
          username: acc.name || oobe.accountName || "Player",
          game_dir: mcDir,
          min_mem: curInstSettings.minMemory,
          max_mem: curInstSettings.maxMemory,
          loader_type: instance.loader?.type || null,
          loader_build: instance.loader?.version || null,
          instance: instance.name,
          download_only: false,
          fullscreen: curInstSettings.fullscreen,
          java_path: curInstSettings.javaVersion || null,
          download_concurrency: curInstSettings.downloadConcurrency,
          verify_concurrency: curInstSettings.verifyConcurrency,
        },
      });
    } catch (e: any) {
      const errMsg = e?.toString() || "未知错误";
      updateTask(taskId, { status: "error", label: "启动失败: " + errMsg });
      const t = getTask(taskId);
      if (t) {
        invoke("open_crash_shell", {
          report: {
            instanceName: t.title,
            gameVersion: t.gameVersion || "未知",
            javaVersion: t.javaVersion || "未知",
            systemVersion: t.systemVersion || navigator.userAgent,
            errorMessage: errMsg,
            crashLog: errMsg,
            solution: "启动器返回错误，无法启动游戏。请检查游戏版本、Java 路径和模组配置是否正确。",
          },
        }).catch(() => {});
      }
    }
  }, [instance.name, instance.version, instance.loader, taskId, launchState]);

  const stopGame = useCallback(async () => {
    try {
      await invoke("stop_game");
    } catch {
      // ignore
    }
  }, []);

  function syncInstance() {
    launchStore.setCurrentInstanceName(instance.name);
    launchStore.setCurrentLaunchFn(launchGame);
    launchStore.setCurrentStopFn(stopGame);
    openedInstancesStore.addOpenedInstance({
      name: instance.name,
      version: instance.version,
      version_type: instance.versionType,
      loader: instance.loader?.type,
    });
  }

  useEffect(() => {
    syncInstance();
  }, [instance, launchGame, stopGame]);

  useEffect(() => {
    return () => {
      launchStore.setCurrentInstanceName(null);
      launchStore.setCurrentLaunchFn(null);
      launchStore.setCurrentStopFn(null);
      if (cardScreenshotUrlRef.current) URL.revokeObjectURL(cardScreenshotUrlRef.current);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  function shortJavaLabel(version: string): string {
    const m = version.match(/"(\d+)\.(\d+)/);
    if (m) {
      if (m[1] === "1") return `Java ${m[2]}`;
      return `Java ${m[1]}`;
    }
    const m2 = version.match(/(\d+)/);
    return m2 ? `Java ${m2[1]}` : version;
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

  useEffect(() => {
    (async () => {
      try {
        const data = await invoke<InstanceSettings>("get_instance_settings", { instanceName: instance.name });
        if (data) {
          setInstSettings((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // use defaults
      }
      try {
        setJavaVersions(await invoke<JavaInstall[]>("get_java_versions"));
      } catch {
        // ignore
      }
      try {
        setSystemMem(await invoke<SystemMem>("get_system_memory"));
      } catch {
        // ignore
      }
      loadCardData();
    })();
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = window.setInterval(loadCardData, 5000);
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [instance.name]);

  const loadCardData = useCallback(() => {
    (async () => {
      try {
        const data = await invoke<InstanceCardData>("get_instance_card_data", { instanceName: instance.name });
        setCardData(data);
        if (data.screenshots?.[0]) {
          try {
            const mcDir = await invoke<string>("get_minecraft_dir_string");
            const bytes = await invoke<number[]>("read_image_file", {
              path: mcDir + "/instances/" + instance.name + "/screenshots/" + data.screenshots[0],
            });
            const uint8 = new Uint8Array(bytes);
            const blob = new Blob([uint8]);
            if (cardScreenshotUrlRef.current) URL.revokeObjectURL(cardScreenshotUrlRef.current);
            const newUrl = URL.createObjectURL(blob);
            cardScreenshotUrlRef.current = newUrl;
            setCardScreenshotUrl(newUrl);
          } catch {
            // ignore
          }
        }
      } catch {
        setCardData(null);
      }
    })();
  }, [instance.name]);

  function onMinMemSlide(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInstSettings((prev) => ({ ...prev, minMemory: v + "M" }));
    const max = parseInt(instSettingsRef.current.maxMemory) || 2048;
    if (parseInt(v) > max - 256) {
      setInstSettings((prev) => ({ ...prev, maxMemory: (parseInt(v) + 256) + "M" }));
    }
  }

  function onMaxMemSlide(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInstSettings((prev) => ({ ...prev, maxMemory: v + "M" }));
  }

  async function saveSettings() {
    setSaveMsg("保存中...");
    try {
      await invoke("save_instance_settings", { instanceName: instance.name, settings: instSettingsRef.current });
      setSaveMsg("已保存");
    } catch {
      setSaveMsg("保存失败");
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveMsg(""), 3000);
  }

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="detail-icon-area">
          {instance.icon ? (
            <img src={instance.icon} className="detail-icon" />
          ) : (
            <Gamepad2 size={40} className="detail-icon-placeholder" />
          )}
        </div>
        <div className="detail-meta">
          <span className="detail-loader">{loaderLabel}</span>
          <span className="detail-version">Minecraft {instance.version}</span>
        </div>
      </div>
      <div className="detail-content">
        {activeTab === "launch" && (
          <div className="tab-panel">
            <div className="dcards">
              <div className="dcard dcard-left">
                <div className="dcard-screenshot">
                  {cardScreenshotUrl ? (
                    <img src={cardScreenshotUrl} className="dcard-screenshot-img" />
                  ) : (
                    <div className="dcard-screenshot-placeholder">
                      <Gamepad2 size={32} className="dcard-screenshot-icon" />
                      <span>暂无截图</span>
                    </div>
                  )}
                  <div className="dcard-screenshot-gradient"></div>
                </div>
                <div className="dcard-stats">
                  <div className="dcard-stat-item">
                    <span className="dcard-stat-label">模组</span>
                    <span className="dcard-stat-value">{cardData?.modCount ?? 0}</span>
                  </div>
                  <div className="dcard-stat-item">
                    <span className="dcard-stat-label">资源包</span>
                    <span className="dcard-stat-value">{cardData?.resourcepackCount ?? 0}</span>
                  </div>
                  <div className="dcard-stat-item">
                    <span className="dcard-stat-label">存档</span>
                    <span className="dcard-stat-value">{cardData?.saveCount ?? 0}</span>
                  </div>
                </div>
              </div>
              <div className="dcard dcard-right">
                {cardData?.recentSave ? (
                  <div className="dcard-save">
                    <span className="dcard-save-label">最近游玩</span>
                    <span className="dcard-save-name">{cardData.recentSave.levelName}</span>
                    <span className="dcard-save-time">{cardData.recentSave.lastPlayed}</span>
                  </div>
                ) : (
                  <div className="dcard-save empty">
                    <span>暂无存档记录</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "settings" && (
          <div className="tab-panel">
            <div className="set-layout">
              <div className="set-sidebar">
                <button
                  className={`set-nav-item ${settingsTab === "general" ? "active" : ""}`}
                  onClick={() => setSettingsTab("general")}
                >
                  <Settings size={16} />
                  <span>常规</span>
                </button>
                <button
                  className={`set-nav-item ${settingsTab === "quicklaunch" ? "active" : ""}`}
                  onClick={() => setSettingsTab("quicklaunch")}
                >
                  <Zap size={16} />
                  <span>快速启动</span>
                </button>
                <button
                  className={`set-nav-item ${settingsTab === "extensions" ? "active" : ""}`}
                  onClick={() => setSettingsTab("extensions")}
                >
                  <Puzzle size={16} />
                  <span>可选扩展</span>
                </button>
                <button
                  className={`set-nav-item ${settingsTab === "java" ? "active" : ""}`}
                  onClick={() => setSettingsTab("java")}
                >
                  <Terminal size={16} />
                  <span>Java 与运行</span>
                </button>
                <button
                  className={`set-nav-item ${settingsTab === "other" ? "active" : ""}`}
                  onClick={() => setSettingsTab("other")}
                >
                  <SlidersHorizontal size={16} />
                  <span>其他</span>
                </button>
              </div>
              <div className="set-content">
                <div className="set-scroll">
                  {settingsTab === "general" && (
                    <div className="set-section">
                      <h3 className="set-heading">常规</h3>
                      <div className="set-row">
                        <label className="set-label">实例名称</label>
                        <input value={instance.name} disabled className="set-input disabled" />
                      </div>
                      <div className="set-row">
                        <label className="set-label">游戏版本</label>
                        <input value={instance.version} disabled className="set-input disabled" />
                      </div>
                      <div className="set-row">
                        <label className="set-label">版本类型</label>
                        <input value={instance.versionType} disabled className="set-input disabled" />
                      </div>
                    </div>
                  )}
                  {settingsTab === "quicklaunch" && (
                    <div className="set-section">
                      <h3 className="set-heading">快速启动</h3>
                      <div className="set-row">
                        <label className="set-label">跳过启动动画</label>
                        <label className="set-toggle">
                          <input
                            checked={instSettings.skipLauncher}
                            onChange={(e) => setInstSettings((prev) => ({ ...prev, skipLauncher: e.target.checked }))}
                            type="checkbox"
                          />
                          <span className="set-toggle-slider"></span>
                        </label>
                      </div>
                      <div className="set-row">
                        <label className="set-label">自动连接服务器</label>
                        <input
                          value={instSettings.autoConnectAddress || ""}
                          onChange={(e) => setInstSettings((prev) => ({ ...prev, autoConnectAddress: e.target.value || null }))}
                          placeholder="例如: example.com:25565"
                          className="set-input"
                        />
                      </div>
                      <div className="set-row">
                        <label className="set-label">以全屏进入游戏</label>
                        <label className="set-toggle">
                          <input
                            checked={instSettings.fullscreen}
                            onChange={(e) => setInstSettings((prev) => ({ ...prev, fullscreen: e.target.checked }))}
                            type="checkbox"
                          />
                          <span className="set-toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  )}
                  {settingsTab === "extensions" && (
                    <div className="set-section">
                      <h3 className="set-heading">可选扩展</h3>
                      <div className="set-row">
                        <label className="set-label">加载器</label>
                        <input value={loaderLabel} disabled className="set-input disabled" />
                      </div>
                    </div>
                  )}
                  {settingsTab === "java" && (
                    <div className="set-section">
                      <div className="set-card">
                        <div className="set-card-head">
                          <span className="set-card-title">游戏启动时的 Java 版本</span>
                          <span className="set-card-desc">选择启动这个实例时使用的 Java 版本</span>
                        </div>
                        <div className="set-combo-wrap">
                          <select
                            value={instSettings.javaVersion || ""}
                            onChange={(e) => setInstSettings((prev) => ({ ...prev, javaVersion: e.target.value || null }))}
                            className="set-combobox"
                          >
                            <option value="">自动选择</option>
                            {javaVersions.map((jv) => (
                              <option key={jv.path} value={jv.path}>
                                {shortJavaLabel(jv.version)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="set-card">
                        <div className="set-card-head">
                          <span className="set-card-title">游戏运行内存分配</span>
                          <span className="set-card-desc">自动设置游戏运行的内存区间</span>
                        </div>
                        <div className="set-card-controls">
                          <label className="set-toggle">
                            <input
                              checked={instSettings.autoMemory}
                              onChange={(e) => setInstSettings((prev) => ({ ...prev, autoMemory: e.target.checked }))}
                              type="checkbox"
                            />
                            <span className="set-toggle-slider"></span>
                          </label>
                          <span className="set-toggle-label">{instSettings.autoMemory ? "自动分配" : "手动调整"}</span>
                        </div>
                        {instSettings.autoMemory && systemMem && (
                          <div className="mem-section">
                            <div className="mem-bar">
                              <div className="mem-bar-used" style={{ width: memBarPercent + "%" }}></div>
                            </div>
                            <div className="mem-info">
                              您的电脑一共有 <strong>{totalMemGb} GB</strong> 运行内存，已用了 <strong>{usedMemGb} GB</strong>
                            </div>
                          </div>
                        )}
                        {!instSettings.autoMemory && systemMem && (
                          <div className="mem-section">
                            <div className="mem-slider-group">
                              <div className="mem-slider-row">
                                <span className="mem-slider-label">最小内存</span>
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
                                <span className="mem-slider-label">最大内存</span>
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
                              您的电脑一共有 <strong>{totalMemGb} GB</strong> 运行内存
                            </div>
                          </div>
                        )}
                        {!instSettings.autoMemory && !systemMem && (
                          <div className="mem-section">
                            <div className="set-row">
                              <label className="set-label">最小内存</label>
                              <input
                                value={instSettings.minMemory}
                                onChange={(e) => setInstSettings((prev) => ({ ...prev, minMemory: e.target.value }))}
                                placeholder="1024M"
                                className="set-input narrow"
                              />
                            </div>
                            <div className="set-row">
                              <label className="set-label">最大内存</label>
                              <input
                                value={instSettings.maxMemory}
                                onChange={(e) => setInstSettings((prev) => ({ ...prev, maxMemory: e.target.value }))}
                                placeholder="2048M"
                                className="set-input narrow"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {settingsTab === "other" && (
                    <div className="set-section">
                      <h3 className="set-heading">其他</h3>
                      <div className="set-row">
                        <label className="set-label">下载线程数</label>
                        <input
                          value={instSettings.downloadConcurrency}
                          onChange={(e) => setInstSettings((prev) => ({ ...prev, downloadConcurrency: Number(e.target.value) }))}
                          type="number"
                          min={1}
                          max={64}
                          className="set-input narrow"
                        />
                      </div>
                      <div className="set-row">
                        <label className="set-label">校验线程数</label>
                        <input
                          value={instSettings.verifyConcurrency}
                          onChange={(e) => setInstSettings((prev) => ({ ...prev, verifyConcurrency: Number(e.target.value) }))}
                          type="number"
                          min={1}
                          max={64}
                          className="set-input narrow"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="set-footer">
                  <button className="set-save-btn" onClick={saveSettings}>
                    <Save size={15} />
                    <span>保存设置</span>
                  </button>
                  {saveMsg && <span className="set-save-msg">{saveMsg}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "resources" && (
          <div className="tab-panel"></div>
        )}
      </div>
      {activeTab === "launch" && (
        <div className="tab-footer">
          {(launchState === "launching" || launchState === "running") && (
            <div className="launch-status">
              {launchState === "launching" ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <Square size={16} />
              )}
              <span>{launchLabel}</span>
              {launchState === "launching" && (
                <div className="launch-bar">
                  <div className="launch-bar-fill" style={{ width: launchProgress * 100 + "%" }}></div>
                </div>
              )}
            </div>
          )}
          {(launchState === "exited" || launchState === "error") && (
            <div className="launch-status">
              <span>{launchLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}