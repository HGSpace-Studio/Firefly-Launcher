import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Box, Search, X, ChevronDown, RefreshCw, Wrench, ArrowRight, ArrowLeft, Info } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./root_interface.css";
import fabricIcon from "../../../assets/imgs/mod_loader_imgs/fabric.png";
import mcIcon from "../../../assets/imgs/mc_oringin.png";
import McVersionSelection from "./mcverselection_interface";
import { getCache, setCache } from "../../../utils/cache";
import { addTask, registerInstallListeners } from "../../../stores/taskStore";

export interface FabricVersion {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

export interface ForgeBuild {
  id: string;
  build: number;
  version: string;
  mcversion: string;
  modified: string;
}

export interface NeoForgeBuild {
  version: string;
  mcversion: string;
  build: number;
  modified: string;
}

interface RootInterfaceProps {
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

export default function RootInterface({ onClose, onNavigate }: RootInterfaceProps) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false);
  const [selectedFabricVersion, setSelectedFabricVersion] = useState("");
  const [fabricVersions, setFabricVersions] = useState<string[]>([]);
  const [loaderEnabled, setLoaderEnabled] = useState(false);
  const [forgeEnabled, setForgeEnabled] = useState(false);
  const [neoforgeEnabled, setNeoforgeEnabled] = useState(false);
  const [forgeDropdownOpen, setForgeDropdownOpen] = useState(false);
  const [neoforgeDropdownOpen, setNeoforgeDropdownOpen] = useState(false);
  const [selectedForgeVersion, setSelectedForgeVersion] = useState("");
  const [selectedNeoForgeVersion, setSelectedNeoForgeVersion] = useState("");
  const [forgeVersions, setForgeVersions] = useState<string[]>([]);
  const [neoforgeVersions, setNeoforgeVersions] = useState<string[]>([]);
  const [hoveredTooltip, setHoveredTooltip] = useState<'fabric' | 'forge' | 'neoforge' | null>(null);
  const [loadError, setLoadError] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [selectedMcVersion, setSelectedMcVersion] = useState("1.21.8");
  const [selectedMcVersionType, setSelectedMcVersionType] = useState("release");
  const [fabricInfoDismissed, setFabricInfoDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [, setInstallStep] = useState("");
  const [installLabel, setInstallLabel] = useState("正在获取清单...");
  const [viewState, setViewState] = useState<'root' | 'mc-version'>('root');
  const [searchQuery, setSearchQuery] = useState('');

  const fabricSelectRef = useRef<HTMLDivElement | null>(null);
  const forgeSelectRef = useRef<HTMLDivElement | null>(null);
  const neoforgeSelectRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const unlistenProgressRef = useRef<(() => void) | null>(null);

  const isOldVersion = useMemo(() => selectedMcVersionType !== "release" && selectedMcVersionType !== "snapshot", [selectedMcVersionType]);

  const canProceed = useMemo(() => selectedMcVersion.length > 0 && instanceName.trim().length > 0, [selectedMcVersion, instanceName]);

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
    if (selectedMcVersion) {
      setInstanceName(buildInstanceName());
    }
  }, [selectedMcVersion, buildInstanceName]);

  useEffect(() => {
    if (selectedMcVersion) {
      setInstanceName(buildInstanceName());
    }
  }, [loaderEnabled, forgeEnabled, neoforgeEnabled, selectedFabricVersion, selectedForgeVersion, selectedNeoForgeVersion, selectedMcVersion, buildInstanceName]);

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

  const [forgeLoading, setForgeLoading] = useState(false);
  const [neoforgeLoading, setNeoforgeLoading] = useState(false);

  const fetchForgeVersions = useCallback(async (mcVersion: string) => {
    const cacheKey = "forge_versions_" + mcVersion;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setForgeVersions(cached);
      if (cached.length > 0) {
        setSelectedForgeVersion(cached[0]);
      }
      return;
    }
    setForgeLoading(true);
    try {
      const forgeList = await invoke<ForgeBuild[]>("get_forge_versions", { mcVersion });
      const versions = forgeList.map((v) => v.version).reverse();
      setForgeVersions(versions);
      setCache(cacheKey, versions);
      if (versions.length > 0) {
        setSelectedForgeVersion(versions[0]);
      }
    } catch {
      // keep current list
    } finally {
      setForgeLoading(false);
    }
  }, []);

  const fetchNeoForgeVersions = useCallback(async (mcVersion: string) => {
    const cacheKey = "neoforge_versions_" + mcVersion;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setNeoforgeVersions(cached);
      if (cached.length > 0) {
        setSelectedNeoForgeVersion(cached[0]);
      }
      return;
    }
    setNeoforgeLoading(true);
    try {
      const list = await invoke<NeoForgeBuild[]>("get_neoforge_versions", { mcVersion });
      const versions = list.map((v) => v.version).reverse();
      setNeoforgeVersions(versions);
      setCache(cacheKey, versions);
      if (versions.length > 0) {
        setSelectedNeoForgeVersion(versions[0]);
      }
    } catch {
      // keep current list
    } finally {
      setNeoforgeLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCache<string[]>("fabric_versions");
    if (cached) {
      setFabricVersions(cached);
      if (cached.length > 0) {
        setSelectedFabricVersion(cached[0]);
      }
      setLoading(false);
    } else {
      (async () => {
        try {
          const [fabricList] = await Promise.all([
            invoke<FabricVersion[]>("get_fabric_versions"),
          ]);
          const versions = fabricList.map((v) => v.version);
          setFabricVersions(versions);
          setCache("fabric_versions", versions);
          if (versions.length > 0) {
            setSelectedFabricVersion(versions[0]);
          }
        } catch (e: any) {
          setLoadError(String(e));
        } finally {
          setLoading(false);
        }
      })();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    fetchForgeVersions(selectedMcVersion);
    fetchNeoForgeVersions(selectedMcVersion);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, []);

  useEffect(() => {
    if (selectedMcVersion) {
      fetchForgeVersions(selectedMcVersion);
      fetchNeoForgeVersions(selectedMcVersion);
    }
  }, [selectedMcVersion, fetchForgeVersions, fetchNeoForgeVersions]);

  function onDocMouseDown(e: MouseEvent) {
    if (fabricDropdownOpen && fabricSelectRef.current && !fabricSelectRef.current.contains(e.target as Node)) {
      setFabricDropdownOpen(false);
    }
    if (forgeDropdownOpen && forgeSelectRef.current && !forgeSelectRef.current.contains(e.target as Node)) {
      setForgeDropdownOpen(false);
    }
    if (neoforgeDropdownOpen && neoforgeSelectRef.current && !neoforgeSelectRef.current.contains(e.target as Node)) {
      setNeoforgeDropdownOpen(false);
    }
  }

  function handleClose() {
    if (installing) {
      if (unlistenProgressRef.current) {
        unlistenProgressRef.current();
        unlistenProgressRef.current = null;
      }
      setInstalling(false);
    }
    onClose?.();
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (installing) return;
    if (e.target === overlayRef.current) {
      onClose?.();
    }
  }

  async function startInstall() {
    setFabricInfoDismissed(true);
    setInstalling(true);
    setInstallProgress(0);
    setInstallStep("");
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

    unlistenProgressRef.current = await listen<{ step: string; progress: number }>("install-progress", (event) => {
      const { step, progress } = event.payload;
      setInstallProgress(progress);
      setInstallStep(step);
      setInstallLabel(stepLabels[step] || step);
      if (step === "done") {
        setTimeout(() => {
          setInstalling(false);
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
    <div className="overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="window">
        <div className="view-wrapper">
          {viewState === "root" ? (
            <>
              <div className="header">
                <div className="header-left">
                  <span className="icon-wrap">
                    <ExternalLink size={16} className="icon" />
                  </span>
                  <span className="title">{t("app.mainwindow.sidebar.add-instance")}</span>
                </div>
                <button className="close-btn" onClick={handleClose}>
                  <X size={18} />
                </button>
              </div>
              <div className="divider"></div>
              <div className="body">
                <div className="top-row">
                  <div className="icon-box">
                    {forgeEnabled || neoforgeEnabled ? (
                      <div className="icon-preview icon-preview-anvil">
                        <Wrench size={32} />
                      </div>
                    ) : (
                      <div className="icon-preview" style={{ backgroundImage: `url(${loaderEnabled ? fabricIcon : mcIcon})` }}></div>
                    )}
                  </div>
                  <div className="name-combo">
                    <div className="name-combo-info">
                      <span className="name-combo-sub">{t("app.mainwindow.addinstance.nameLabel")}</span>
                      <input className="name-combo-input" type="text" placeholder={selectedMcVersion || t("app.mainwindow.addinstance.namePlaceholder")} value={instanceName} onChange={(e) => setInstanceName(e.target.value)} />
                    </div>
                  </div>
                  <div className="version-combo" onClick={() => setViewState("mc-version")}>
                    <div className="version-combo-info">
                      <span className="version-combo-sub">{t("app.mainwindow.addinstance.versionSub")}</span>
                      <span className="version-combo-value">{selectedMcVersion}</span>
                    </div>
                    <ChevronDown size={16} className="version-combo-arrow" />
                  </div>
                </div>
                <div className="section-divider"></div>
                <div className={`card-row ${loading ? "card-row-loading" : ""}`}>
                  {loading ? (
                    <div className="loading-overlay">
                      <RefreshCw size={20} className="spinner" />
                      <span>{t("app.mainwindow.addinstance.loading")}</span>
                    </div>
                  ) : loadError ? (
                    <div className="loading-overlay error">
                      <span>{t("app.mainwindow.addinstance.loadError")} {loadError}</span>
                    </div>
                  ) : (
                    <div className="loaders-area">
                      <div className={`loader-row ${isOldVersion ? "global-disabled" : ""}`}>
                        <div className="btn-wrap">
                          <button
                            className={`loader-btn ${loaderEnabled ? "active" : ""} ${forgeEnabled || neoforgeEnabled ? "blocked" : ""}`}
                            disabled={isOldVersion}
                            onClick={toggleFabric}
                            onMouseEnter={() => (forgeEnabled || neoforgeEnabled) && setHoveredTooltip("fabric")}
                            onMouseLeave={() => setHoveredTooltip(null)}
                          >
                            <img src={fabricIcon} className="loader-icon" />
                            <span>Fabric</span>
                          </button>
                          {hoveredTooltip === "fabric" && <span className="btn-tooltip">{t("app.mainwindow.addinstance.tooltipConflict")}</span>}
                        </div>
                        <div className="version-combobox" ref={fabricSelectRef}>
                          <button
                            className={`combo-trigger ${!loaderEnabled || isOldVersion ? "disabled" : ""}`}
                            disabled={!loaderEnabled || isOldVersion}
                            onClick={(e) => { e.stopPropagation(); loaderEnabled && setFabricDropdownOpen(!fabricDropdownOpen); }}
                          >
                            <span className="combo-text">{selectedFabricVersion || t("app.mainwindow.addinstance.noSelection")}</span>
                            <ChevronDown size={14} className="combo-arrow" />
                          </button>
                          {fabricDropdownOpen && (
                            <div className="combo-dropdown">
                              {fabricVersions.map((v) => (
                                <button
                                  key={v}
                                  className={`combo-option ${v === selectedFabricVersion ? "active" : ""}`}
                                  disabled={isOldVersion}
                                  onClick={() => { setSelectedFabricVersion(v); setFabricDropdownOpen(false); }}
                                >{v}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`loader-row ${isOldVersion ? "global-disabled" : ""}`}>
                        <div className="btn-wrap">
                          <button
                            className={`loader-btn ${forgeEnabled ? "active" : ""} ${loaderEnabled || neoforgeEnabled ? "blocked" : ""}`}
                            disabled={isOldVersion}
                            onClick={toggleForge}
                            onMouseEnter={() => (loaderEnabled || neoforgeEnabled) && setHoveredTooltip("forge")}
                            onMouseLeave={() => setHoveredTooltip(null)}
                          >
                            <Wrench size={20} className="loader-icon" />
                            <span>Forge</span>
                          </button>
                          {hoveredTooltip === "forge" && <span className="btn-tooltip">{t("app.mainwindow.addinstance.tooltipConflict")}</span>}
                        </div>
                        <div className="version-combobox" ref={forgeSelectRef}>
                          <button
                            className={`combo-trigger ${!forgeEnabled || isOldVersion ? "disabled" : ""}`}
                            disabled={!forgeEnabled || isOldVersion}
                            onClick={(e) => { e.stopPropagation(); forgeEnabled && !forgeLoading && setForgeDropdownOpen(!forgeDropdownOpen); }}
                          >
                            {forgeLoading ? (
                              <span className="combo-loading-text">{t("app.mainwindow.addinstance.forgeLoading")}</span>
                            ) : (
                              <span className="combo-text">{selectedForgeVersion}</span>
                            )}
                            {forgeLoading ? <RefreshCw size={14} className="combo-spinner" /> : <ChevronDown size={14} className="combo-arrow" />}
                          </button>
                          {forgeDropdownOpen && (
                            <div className="combo-dropdown">
                              {forgeVersions.map((v) => (
                                <button
                                  key={v}
                                  className={`combo-option ${v === selectedForgeVersion ? "active" : ""}`}
                                  disabled={isOldVersion}
                                  onClick={() => { setSelectedForgeVersion(v); setForgeDropdownOpen(false); }}
                                >{v}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`loader-row ${isOldVersion ? "global-disabled" : ""}`}>
                        <div className="btn-wrap">
                          <button
                            className={`loader-btn ${neoforgeEnabled ? "active" : ""} ${loaderEnabled || forgeEnabled ? "blocked" : ""}`}
                            disabled={isOldVersion}
                            onClick={toggleNeoForge}
                            onMouseEnter={() => (loaderEnabled || forgeEnabled) && setHoveredTooltip("neoforge")}
                            onMouseLeave={() => setHoveredTooltip(null)}
                          >
                            <Wrench size={20} className="loader-icon" />
                            <span>NeoForge</span>
                          </button>
                          {hoveredTooltip === "neoforge" && <span className="btn-tooltip">{t("app.mainwindow.addinstance.tooltipConflict")}</span>}
                        </div>
                        <div className="version-combobox" ref={neoforgeSelectRef}>
                          <button
                            className={`combo-trigger ${!neoforgeEnabled || isOldVersion ? "disabled" : ""}`}
                            disabled={!neoforgeEnabled || isOldVersion}
                            onClick={(e) => { e.stopPropagation(); neoforgeEnabled && !neoforgeLoading && setNeoforgeDropdownOpen(!neoforgeDropdownOpen); }}
                          >
                            {neoforgeLoading ? (
                              <span className="combo-loading-text">{t("app.mainwindow.addinstance.forgeLoading")}</span>
                            ) : (
                              <span className="combo-text">{selectedNeoForgeVersion}</span>
                            )}
                            {neoforgeLoading ? <RefreshCw size={14} className="combo-spinner" /> : <ChevronDown size={14} className="combo-arrow" />}
                          </button>
                          {neoforgeDropdownOpen && (
                            <div className="combo-dropdown">
                              {neoforgeVersions.map((v) => (
                                <button
                                  key={v}
                                  className={`combo-option ${v === selectedNeoForgeVersion ? "active" : ""}`}
                                  disabled={isOldVersion}
                                  onClick={() => { setSelectedNeoForgeVersion(v); setNeoforgeDropdownOpen(false); }}
                                >{v}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="footer">
                  {loaderEnabled && selectedFabricVersion && !fabricInfoDismissed && (
                    <div className="fabric-info">
                      <Info size={16} className="info-icon" />
                      <span>{t("app.mainwindow.addinstance.fabricInfo", { version: selectedFabricVersion })}</span>
                    </div>
                  )}
                  {installing ? (
                    <div className="install-progress-wrap">
                      <div className="install-label">{installLabel}</div>
                      <div className="install-bar">
                        <div className="install-bar-fill" style={{ width: installProgress * 100 + "%" }}></div>
                      </div>
                      <div className="install-pct">{Math.round(installProgress * 100)}%</div>
                    </div>
                  ) : (
                    <>
                      <button className="pack-btn">
                        <Box size={16} />
                        <span>安装整合包</span>
                      </button>
                      <button className="confirm-btn" disabled={!canProceed} onClick={startInstall}>
                        <span>{t("app.mainwindow.addinstance.confirm")}</span>
                        <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="header mc-version-header">
                <div className="header-left">
                  <button className="back-btn" onClick={() => setViewState("root")}>
                    <ArrowLeft size={21} />
                  </button>
                  <div className="header-title-group">
                    <span className="header-sub">{t("app.mainwindow.addinstance.headerSub")}</span>
                    <span className="header-main">{t("app.mainwindow.addinstance.headerMain")}</span>
                  </div>
                </div>
                <div className="header-search">
                  <Search size={16} className="search-icon" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" placeholder="搜索版本..." />
                </div>
                <button className="close-btn" onClick={() => onClose?.()}>
                  <X size={18} />
                </button>
              </div>
              <div className="divider"></div>
              <McVersionSelection searchQuery={searchQuery} onSelectVersion={(id: string, type: string) => { setSelectedMcVersion(id); setSelectedMcVersionType(type); setViewState("root"); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}