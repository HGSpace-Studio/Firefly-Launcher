import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./NewRootInterface.css";
import fabricIcon from "../../../assets/imgs/mod_loader_imgs/fabric.png";
import mcIcon from "../../../assets/imgs/mc_oringin.png";
import { getCache, setCache } from "../../../utils/cache";
import { addTask, registerInstallListeners } from "../../../stores/taskStore";

interface VersionInfo {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionInfo[];
}

interface FabricVersion {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

interface ForgeBuild {
  id: string;
  build: number;
  version: string;
  mcversion: string;
  modified: string;
}

interface NeoForgeBuild {
  version: string;
  mcversion: string;
  build: number;
  modified: string;
}

interface Props {
  onClose: () => void;
  onNavigate: (nav: string) => void;
}

const stepLabels: Record<string, string> = {
  manifest: "正在获取版本清单...",
  version_json: "正在下载版本元数据...",
  client_jar: "正在下载游戏客户端...",
  finalize: "正在保存配置...",
  done: "安装完成!",
};

const aprilFoolsPatterns = [
  "rv-pre", "shareware", "20w14∞", "20w14infinite",
  "oneblockatatime", "potato", "_or_b", "3d shareware",
];

function isAprilFools(id: string): boolean {
  const lower = id.toLowerCase();
  return aprilFoolsPatterns.some((p) => lower.includes(p));
}

const tabs = [
  { id: "release", label: "正式版" },
  { id: "snapshot", label: "快照版" },
  { id: "old", label: "远古版" },
  { id: "april", label: "愚人节版" },
];

export default function NewRootInterface({ onClose, onNavigate }: Props) {
  const [tabIndex, setTabIndex] = useState(0);

  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);

  const [selectedMcVersion, setSelectedMcVersion] = useState("1.21.8");
  const [selectedMcVersionType, setSelectedMcVersionType] = useState("release");

  const [instanceName, setInstanceName] = useState("");

  const [loaderEnabled, setLoaderEnabled] = useState(false);
  const [forgeEnabled, setForgeEnabled] = useState(false);
  const [neoforgeEnabled, setNeoforgeEnabled] = useState(false);

  const [fabricVersions, setFabricVersions] = useState<string[]>([]);
  const [selectedFabricVersion, setSelectedFabricVersion] = useState("");
  const [forgeVersions, setForgeVersions] = useState<string[]>([]);
  const [selectedForgeVersion, setSelectedForgeVersion] = useState("");
  const [neoforgeVersions, setNeoforgeVersions] = useState<string[]>([]);
  const [selectedNeoForgeVersion, setSelectedNeoForgeVersion] = useState("");

  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false);
  const [forgeDropdownOpen, setForgeDropdownOpen] = useState(false);
  const [neoforgeDropdownOpen, setNeoforgeDropdownOpen] = useState(false);

  const [forgeLoading, setForgeLoading] = useState(false);
  const [neoforgeLoading, setNeoforgeLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installLabel, setInstallLabel] = useState("正在获取清单...");

  const [searchQuery, setSearchQuery] = useState("");

  const activeTab = tabs[tabIndex]?.id || "release";

  const filteredVersions = useMemo(() => {
    if (!manifest) return [];
    const all = manifest.versions;
    let result: VersionInfo[];
    switch (activeTab) {
      case "release":
        result = all.filter((v) => v.type === "release" && !isAprilFools(v.id));
        break;
      case "snapshot":
        result = all.filter((v) => v.type === "snapshot" && !isAprilFools(v.id));
        break;
      case "old":
        result = all.filter((v) => v.type !== "release" && v.type !== "snapshot" && !isAprilFools(v.id));
        break;
      case "april":
        result = all.filter((v) => isAprilFools(v.id));
        break;
      default:
        result = [];
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.id.toLowerCase().includes(q));
    }
    return result;
  }, [manifest, activeTab, searchQuery]);

  const isOldVersion = useMemo(
    () => selectedMcVersionType !== "release" && selectedMcVersionType !== "snapshot",
    [selectedMcVersionType]
  );

  const canProceed = useMemo(
    () => selectedMcVersion.length > 0 && instanceName.trim().length > 0,
    [selectedMcVersion, instanceName]
  );

  const buildInstanceName = useCallback(() => {
    let name = selectedMcVersion;
    if (loaderEnabled && selectedFabricVersion) {
      name += ` Fabric ${selectedFabricVersion}`;
    } else if (forgeEnabled && selectedForgeVersion) {
      name += ` Forge ${selectedForgeVersion}`;
    } else if (neoforgeEnabled && selectedNeoForgeVersion) {
      name += ` NeoForge ${selectedNeoForgeVersion}`;
    }
    return name;
  }, [selectedMcVersion, loaderEnabled, selectedFabricVersion, forgeEnabled, selectedForgeVersion, neoforgeEnabled, selectedNeoForgeVersion]);

  useEffect(() => {
    if (selectedMcVersion) setInstanceName(buildInstanceName());
  }, [buildInstanceName]);

  const fetchForgeVersions = useCallback(async (mcVersion: string) => {
    const cacheKey = "forge_versions_" + mcVersion;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setForgeVersions(cached);
      if (cached.length > 0) setSelectedForgeVersion(cached[0]);
      return;
    }
    setForgeLoading(true);
    try {
      const forgeList = await invoke<ForgeBuild[]>("get_forge_versions", { mcVersion });
      const versions = forgeList.map((v) => v.version).reverse();
      setForgeVersions(versions);
      setCache(cacheKey, versions);
      if (versions.length > 0) setSelectedForgeVersion(versions[0]);
    } catch {} finally { setForgeLoading(false); }
  }, []);

  const fetchNeoForgeVersions = useCallback(async (mcVersion: string) => {
    const cacheKey = "neoforge_versions_" + mcVersion;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setNeoforgeVersions(cached);
      if (cached.length > 0) setSelectedNeoForgeVersion(cached[0]);
      return;
    }
    setNeoforgeLoading(true);
    try {
      const list = await invoke<NeoForgeBuild[]>("get_neoforge_versions", { mcVersion });
      const versions = list.map((v) => v.version).reverse();
      setNeoforgeVersions(versions);
      setCache(cacheKey, versions);
      if (versions.length > 0) setSelectedNeoForgeVersion(versions[0]);
    } catch {} finally { setNeoforgeLoading(false); }
  }, []);

  useEffect(() => {
    const cached = getCache<VersionManifest>("mc_versions");
    if (cached) {
      setManifest(cached);
      setManifestLoading(false);
    } else {
      (async () => {
        try {
          const m = await invoke<VersionManifest>("get_minecraft_versions");
          setCache("mc_versions", m);
          setManifest(m);
        } catch {} finally { setManifestLoading(false); }
      })();
    }

    const cachedFabric = getCache<string[]>("fabric_versions");
    if (cachedFabric) {
      setFabricVersions(cachedFabric);
      if (cachedFabric.length > 0) setSelectedFabricVersion(cachedFabric[0]);
    } else {
      (async () => {
        try {
          const fabricList = await invoke<FabricVersion[]>("get_fabric_versions");
          const versions = fabricList.map((v) => v.version);
          setFabricVersions(versions);
          setCache("fabric_versions", versions);
          if (versions.length > 0) setSelectedFabricVersion(versions[0]);
        } catch (e: any) { setLoadError(String(e)); }
      })();
    }
  }, []);

  useEffect(() => {
    if (selectedMcVersion) {
      fetchForgeVersions(selectedMcVersion);
      fetchNeoForgeVersions(selectedMcVersion);
    }
  }, [selectedMcVersion, fetchForgeVersions, fetchNeoForgeVersions]);

  function toggleFabric() {
    if (forgeEnabled || neoforgeEnabled) return;
    setLoaderEnabled((prev) => !prev);
  }

  function toggleForge() {
    if (loaderEnabled || neoforgeEnabled) return;
    setForgeEnabled((prev) => !prev);
  }

  function toggleNeoForge() {
    if (loaderEnabled || forgeEnabled) return;
    setNeoforgeEnabled((prev) => !prev);
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return iso; }
  }

  async function startInstall() {
    setInstalling(true);
    setInstallProgress(0);
    setInstallLabel(stepLabels["manifest"]);

    const taskId = "install:" + instanceName + "_" + Date.now();
    addTask({
      id: taskId,
      type: "install",
      title: instanceName,
      status: "downloading",
      progress: 0,
      label: stepLabels["manifest"],
    });
    registerInstallListeners(taskId);

    const unlisten = await listen<{ step: string; progress: number }>("install-progress", (event) => {
      const { step, progress } = event.payload;
      setInstallProgress(progress);
      setInstallLabel(stepLabels[step] || step);
      if (step === "done") {
        setTimeout(() => {
          setInstalling(false);
          unlisten();
          window.dispatchEvent(new CustomEvent("instance-installed"));
          onNavigate?.("library");
        }, 800);
      }
    });

    try {
      const loaderType = loaderEnabled ? "fabric" : forgeEnabled ? "forge" : neoforgeEnabled ? "neoforge" : null;
      const loaderVer = loaderEnabled ? selectedFabricVersion : forgeEnabled ? selectedForgeVersion : neoforgeEnabled ? selectedNeoForgeVersion : null;
      await invoke("install_instance", {
        name: instanceName,
        mcVersion: selectedMcVersion,
        versionType: selectedMcVersionType,
        loaderType,
        loaderVersion: loaderVer,
      });
    } catch (e: any) {
      setInstallLabel("安装失败: " + (e?.toString() || "未知错误"));
      setInstalling(false);
    }
  }

  return (
    <div className="new-root-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="new-root-window">
        <div className="new-root-header">
          <div className="new-root-header-left">
            <span className="new-root-title">新建实例</span>
          </div>
          <button className="new-root-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="new-root-body">
          <div className="new-root-left">
            <div className="new-root-version-tabs">
              <md-tabs activeTabIndex={tabIndex}>
                {tabs.map((tab) => (
                  <md-primary-tab key={tab.id} onClick={() => setTabIndex(tabs.indexOf(tab))}>
                    {tab.label}
                  </md-primary-tab>
                ))}
              </md-tabs>
            </div>
            <div className="new-root-version-search">
              <span className="material-symbols-outlined new-root-search-icon">search</span>
              <input
                className="new-root-search-input"
                placeholder="搜索版本..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="new-root-version-list">
              {manifestLoading ? (
                <div className="new-root-loading">
                  <md-circular-progress indeterminate />
                  <span>加载中...</span>
                </div>
              ) : (
                filteredVersions.map((v) => (
                  <button
                    key={v.id}
                    className={`new-root-version-item${selectedMcVersion === v.id ? " selected" : ""}`}
                    onClick={() => { setSelectedMcVersion(v.id); setSelectedMcVersionType(v.type); }}
                  >
                    <span className="new-root-radio">
                      {selectedMcVersion === v.id && <span className="new-root-radio-dot" />}
                    </span>
                    <img src={mcIcon} className="new-root-version-icon" />
                    <div className="new-root-version-info">
                      <span className="new-root-version-id">{v.id}</span>
                      <span className="new-root-version-date">{formatDate(v.releaseTime)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="new-root-divider-v" />

          <div className="new-root-right">
            <div className="new-root-field">
              <md-outlined-text-field
                value={instanceName}
                placeholder={selectedMcVersion}
                label="实例名称"
                style={{ width: "100%" } as any}
                onInput={(e: any) => setInstanceName(e.target.value)}
              />
            </div>

            <div className="new-root-hr" />

            <div className="new-root-loaders">
              <div className={`new-root-loader-row${isOldVersion ? " disabled" : ""}`}>
                <button
                  className={`new-root-loader-btn${loaderEnabled ? " active" : ""}${(forgeEnabled || neoforgeEnabled) ? " blocked" : ""}`}
                  onClick={toggleFabric}
                >
                  <img src={fabricIcon} className="new-root-loader-icon" />
                  <span>Fabric</span>
                </button>
                <div className="new-root-combo">
                  <button
                    className={`new-root-combo-trigger${!loaderEnabled ? " disabled" : ""}`}
                    onClick={() => loaderEnabled && setFabricDropdownOpen(!fabricDropdownOpen)}
                  >
                    <span className="new-root-combo-text">{selectedFabricVersion || "无"}</span>
                    <span className="material-symbols-outlined new-root-combo-arrow">expand_more</span>
                  </button>
                  {fabricDropdownOpen && (
                    <div className="new-root-combo-dropdown">
                      {fabricVersions.map((v) => (
                        <button
                          key={v}
                          className={`new-root-combo-option${v === selectedFabricVersion ? " active" : ""}`}
                          onClick={() => { setSelectedFabricVersion(v); setFabricDropdownOpen(false); }}
                        >{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={`new-root-loader-row${isOldVersion ? " disabled" : ""}`}>
                <button
                  className={`new-root-loader-btn${forgeEnabled ? " active" : ""}${(loaderEnabled || neoforgeEnabled) ? " blocked" : ""}`}
                  onClick={toggleForge}
                >
                  <span className="material-symbols-outlined" style={{fontSize:20}}>build</span>
                  <span>Forge</span>
                </button>
                <div className="new-root-combo">
                  <button
                    className={`new-root-combo-trigger${!forgeEnabled ? " disabled" : ""}`}
                    onClick={() => forgeEnabled && setForgeDropdownOpen(!forgeDropdownOpen)}
                  >
                    {forgeLoading ? (
                      <span className="new-root-combo-text">加载中...</span>
                    ) : (
                      <span className="new-root-combo-text">{selectedForgeVersion}</span>
                    )}
                    <span className="material-symbols-outlined new-root-combo-arrow">expand_more</span>
                  </button>
                  {forgeDropdownOpen && (
                    <div className="new-root-combo-dropdown">
                      {forgeVersions.map((v) => (
                        <button
                          key={v}
                          className={`new-root-combo-option${v === selectedForgeVersion ? " active" : ""}`}
                          onClick={() => { setSelectedForgeVersion(v); setForgeDropdownOpen(false); }}
                        >{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={`new-root-loader-row${isOldVersion ? " disabled" : ""}`}>
                <button
                  className={`new-root-loader-btn${neoforgeEnabled ? " active" : ""}${(loaderEnabled || forgeEnabled) ? " blocked" : ""}`}
                  onClick={toggleNeoForge}
                >
                  <span className="material-symbols-outlined" style={{fontSize:20}}>build</span>
                  <span>NeoForge</span>
                </button>
                <div className="new-root-combo">
                  <button
                    className={`new-root-combo-trigger${!neoforgeEnabled ? " disabled" : ""}`}
                    onClick={() => neoforgeEnabled && setNeoforgeDropdownOpen(!neoforgeDropdownOpen)}
                  >
                    {neoforgeLoading ? (
                      <span className="new-root-combo-text">加载中...</span>
                    ) : (
                      <span className="new-root-combo-text">{selectedNeoForgeVersion}</span>
                    )}
                    <span className="material-symbols-outlined new-root-combo-arrow">expand_more</span>
                  </button>
                  {neoforgeDropdownOpen && (
                    <div className="new-root-combo-dropdown">
                      {neoforgeVersions.map((v) => (
                        <button
                          key={v}
                          className={`new-root-combo-option${v === selectedNeoForgeVersion ? " active" : ""}`}
                          onClick={() => { setSelectedNeoForgeVersion(v); setNeoforgeDropdownOpen(false); }}
                        >{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {loadError && <div className="new-root-error">{loadError}</div>}

            {installing && (
              <div className="new-root-progress">
                <div className="new-root-progress-label">{installLabel}</div>
                <div className="new-root-progress-bar">
                  <div className="new-root-progress-fill" style={{ width: installProgress * 100 + "%" }} />
                </div>
                <div className="new-root-progress-pct">{Math.round(installProgress * 100)}%</div>
              </div>
            )}
          </div>
        </div>

        <div className="new-root-footer">
          <button className="new-root-pack-btn">
            <span className="material-symbols-outlined">inventory_2</span>
            <span>从整合包安装</span>
          </button>
          <div className="new-root-footer-fabs">
            <md-fab
              variant="primary"
              size="large"
              label="确定安装"
              style={{ opacity: (!canProceed || installing) ? 0.4 : 1, pointerEvents: (!canProceed || installing) ? "none" as any : undefined } as any}
              onClick={startInstall}
            >
              <span slot="icon" className="material-symbols-outlined">download</span>
            </md-fab>
          </div>
        </div>
      </div>
    </div>
  );
}
