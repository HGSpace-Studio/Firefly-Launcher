import { useTranslation } from "react-i18next";
import { getSystemLocale } from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Globe, Palette, Info, X, Coffee, RefreshCw, ChevronDown, Upload, Table2, Landmark } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import "./settings_interface.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import logo from "../assets/logos/logo.png";
import default1Bg from "../assets/imgs/background/default1.png";
import { useState, useEffect, useRef, useMemo } from "react";

interface CustomBgEntry {
  path: string;
  name: string;
}

interface JavaInstall {
  path: string;
  version: string;
}

interface SystemMemory {
  total_mb: number;
  used_mb: number;
}

interface SettingsInterfaceProps {
  onClose: () => void;
}

const bgMap: Record<string, string> = {
  default1: default1Bg,
};

const DEFAULT_FONT = "__system_default__";
const FALLBACK_FONTS = [
  "HarmonyOS Sans", "SF Pro Display", "SF Pro Text",
  "Helvetica Neue", "Helvetica", "Arial", "Segoe UI",
  "Roboto", "Ubuntu", "Noto Sans", "DejaVu Sans",
  "Liberation Sans", "Tahoma", "Verdana", "Trebuchet MS",
  "Times New Roman", "Georgia", "Palatino", "Garamond",
  "Courier New", "Menlo", "Monaco", "Consolas", "Lucida Console",
  "Apple Color Emoji", "Segoe UI Emoji",
];

function getCurrentFont(): string {
  const raw = document.documentElement.style.getPropertyValue("--app-font").replace(/^"|"$/g, "").trim();
  return raw || DEFAULT_FONT;
}

export default function SettingsInterface({ onClose }: SettingsInterfaceProps) {
  const { t, i18n } = useTranslation();

  const [currentLang, setCurrentLang] = useState("system");
  const [currentTheme, setCurrentTheme] = useState(
    document.documentElement.getAttribute("data-theme") || "system"
  );

  const [customBgs, setCustomBgs] = useState<CustomBgEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("firefile-custom-bgs") || "[]") }
    catch { return [] }
  });
  const [customBgPreviews, setCustomBgPreviews] = useState<Record<string, string>>({});

  async function loadCustomBgPreview(path: string) {
    if (customBgPreviews[path]) return;
    try {
      const bytes = await invoke<number[]>("read_image_file", { path });
      const uint8 = new Uint8Array(bytes);
      const blb = new Blob([uint8]);
      setCustomBgPreviews(prev => ({ ...prev, [path]: URL.createObjectURL(blb) }));
    } catch {}
  }

  async function loadAllCustomBgPreviews() {
    for (const cbg of customBgs) {
      await loadCustomBgPreview(cbg.path);
    }
  }

  useEffect(() => {
    loadAllCustomBgPreviews();
  }, []);

  useEffect(() => {
    return () => {
      for (const url of Object.values(customBgPreviews)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  async function uploadBg() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected;
    const name = path.split(/[/\\]/).pop() || "背景";
    if (customBgs.some(e => e.path === path)) return;
    const newBgs = [...customBgs, { path, name }];
    setCustomBgs(newBgs);
    localStorage.setItem("firefile-custom-bgs", JSON.stringify(newBgs));
    await loadCustomBgPreview(path);
  }

  const [currentBg, setCurrentBg] = useState(localStorage.getItem("firefile-bg") || "default1");
  const [bgBlur, setBgBlur] = useState(Number(localStorage.getItem("firefile-bg-blur")) || 5);

  function applyBg(val: string) {
    localStorage.setItem("firefile-bg", val);
    let url: string;
    if (val === "none") {
      url = "none";
    } else if (val.startsWith("custom:")) {
      const path = val.slice(7);
      if (!customBgPreviews[path]) loadCustomBgPreview(path);
      url = `url("${customBgPreviews[path]}")`;
    } else {
      url = `url("${bgMap[val]}")`;
    }
    localStorage.setItem("firefile-bg-url", url);
    document.documentElement.style.setProperty("--bg-image", url);
  }

  useEffect(() => {
    applyBg(currentBg);
  }, [currentBg]);

  useEffect(() => {
    localStorage.setItem("firefile-bg-blur", String(bgBlur));
    document.documentElement.style.setProperty("--bg-blur", bgBlur + "px");
  }, [bgBlur]);

  useEffect(() => {
    const val = currentLang === "system" ? getSystemLocale() : currentLang;
    i18n.changeLanguage(val);
  }, [currentLang]);

  useEffect(() => {
    if (currentTheme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", currentTheme);
    }
  }, [currentTheme]);

  const [activeSetting, setActiveSetting] = useState("appearance");
  const [useFullscreenUI, setUseFullscreenUI] = useState(localStorage.getItem("firefile-ui-layout") === "fullscreen");

  useEffect(() => {
    localStorage.setItem("firefile-ui-layout", useFullscreenUI ? "fullscreen" : "sidebar");
  }, [useFullscreenUI]);

  const [availableFonts, setAvailableFonts] = useState<string[]>([DEFAULT_FONT]);
  const [selectedFont, setSelectedFont] = useState(getCurrentFont());
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const fontSelectRef = useRef<HTMLDivElement>(null);

  const fontChanged = useMemo(() => selectedFont !== DEFAULT_FONT, [selectedFont]);

  function applyFont(font: string) {
    if (font === DEFAULT_FONT) {
      document.documentElement.style.removeProperty("--app-font");
    } else {
      document.documentElement.style.setProperty("--app-font", `"${font}"`);
    }
  }

  useEffect(() => {
    applyFont(selectedFont);
  }, [selectedFont]);

  function resetFont() {
    setSelectedFont(DEFAULT_FONT);
  }

  function getFontStyle(f: string): React.CSSProperties {
    return f !== DEFAULT_FONT ? { fontFamily: `"${f}"` } : {};
  }

  useEffect(() => {
    async function loadFonts() {
      try {
        const fonts: { family: string }[] | undefined = await (window as any).queryLocalFonts?.();
        if (fonts) {
          const families = [...new Set(fonts.map((f: any) => f.family))];
          setAvailableFonts([DEFAULT_FONT, ...families.sort()]);
          return;
        }
      } catch { /* fallback */ }
      setAvailableFonts([DEFAULT_FONT, ...FALLBACK_FONTS]);
    }
    loadFonts();
  }, []);

  function onDocMouseDown(e: MouseEvent) {
    if (fontDropdownOpen && fontSelectRef.current && !fontSelectRef.current.contains(e.target as Node)) {
      setFontDropdownOpen(false);
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [fontDropdownOpen]);

  const [javaInstalls, setJavaInstalls] = useState<JavaInstall[]>([]);
  const [javaLoading, setJavaLoading] = useState(false);
  const [javaError, setJavaError] = useState("");
  const [javaExpanded, setJavaExpanded] = useState(true);

  const [sysMem] = useState<SystemMemory>({ total_mb: 0, used_mb: 0 });
  const [autoMem, setAutoMem] = useState(true);

  const usedPercent = useMemo(() => {
    if (sysMem.total_mb === 0) return 0;
    return Math.round((sysMem.used_mb / sysMem.total_mb) * 100);
  }, [sysMem]);

  const freePercent = useMemo(() => {
    return Math.max(0, 100 - usedPercent);
  }, [usedPercent]);

  function cleanVersion(raw: string): string {
    const m = raw.match(/"([^"]+)"/);
    return m ? m[1] : raw;
  }

  async function fetchJavaVersions() {
    setJavaLoading(true);
    setJavaError("");
    try {
      setJavaInstalls(await invoke<JavaInstall[]>("get_java_versions"));
    } catch (e: any) {
      setJavaError(String(e));
    } finally {
      setJavaLoading(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-window">
        <div className="settings-header">
          <div className="settings-header-left">
            <span className="settings-icon-wrap">
              <Settings size={16} className="settings-icon" />
            </span>
            <span className="settings-title">{t("app.mainwindow.settings.title")}</span>
          </div>
          <button className="settings-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="settings-divider"></div>
        <div className="settings-body">
          <nav className="settings-nav">
            <button
              className={`settings-nav-item ${activeSetting === "java-runtime" ? "active" : ""}`}
              onClick={() => setActiveSetting("java-runtime")}
            >
              <Coffee size={18} />
              <span>{t("app.mainwindow.settings.java-runtime")}</span>
            </button>
            <div className="settings-nav-divider"></div>
            <button
              className={`settings-nav-item ${activeSetting === "appearance" ? "active" : ""}`}
              onClick={() => setActiveSetting("appearance")}
            >
              <Palette size={18} />
              <span>{t("app.mainwindow.settings.appearance")}</span>
            </button>
            <button
              className={`settings-nav-item ${activeSetting === "ui-layout" ? "active" : ""}`}
              onClick={() => setActiveSetting("ui-layout")}
            >
              <Table2 size={18} />
              <span>UI 布局</span>
            </button>
            <button
              className={`settings-nav-item ${activeSetting === "language" ? "active" : ""}`}
              onClick={() => setActiveSetting("language")}
            >
              <Globe size={18} />
              <span>{t("app.mainwindow.settings.language")}</span>
            </button>
            <button
              className={`settings-nav-item ${activeSetting === "about" ? "active" : ""}`}
              onClick={() => setActiveSetting("about")}
            >
              <Info size={18} />
              <span>{t("app.mainwindow.settings.about")}</span>
            </button>
          </nav>
          <div className="settings-content">
            {activeSetting === "java-runtime" && (
              <div className="setting-panel">
                <div className="expander-group">
                  <div className="expander-header" onClick={() => setJavaExpanded(!javaExpanded)}>
                    <div className="setting-card-info">
                      <label className="setting-label">Java 运行环境</label>
                      <span className="setting-desc">检测到的 Java 安装</span>
                    </div>
                    <div className="expander-right">
                      <button className="refresh-btn" onClick={() => fetchJavaVersions()} disabled={javaLoading}>
                        {javaLoading ? <RefreshCw size={14} className="spinner" /> : <span>刷新</span>}
                      </button>
                      <ChevronDown size={18} className={`expander-chevron ${javaExpanded ? "expanded" : ""}`} />
                    </div>
                  </div>
                  {javaExpanded && (
                    <div className="expander-body">
                      {javaError && <div className="java-error">{javaError}</div>}
                      {javaInstalls.length === 0 && !javaLoading && !javaError && (
                        <div className="java-empty">未检测到 Java 安装</div>
                      )}
                      {javaInstalls.map((jv, idx) => (
                        <div key={jv.path} className={`java-item ${idx === javaInstalls.length - 1 ? "last" : ""}`}>
                          <div className="java-item-divider"></div>
                          <span className="java-item-version">{cleanVersion(jv.version)}</span>
                          <span className="java-item-path">{jv.path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="expander-group">
                  <div className="expander-header">
                    <div className="setting-card-info">
                      <label className="setting-label">游戏运行分配</label>
                      <span className="setting-desc">设置 Minecraft 实例可运行的运存容量</span>
                    </div>
                  </div>
                  <div className="expander-body">
                    <div className="mem-item">
                      <div className="mem-item-row">
                        <div className="mem-item-info">
                          <span className="mem-item-label">自动分配</span>
                          <span className="mem-item-desc">根据计算机已用运行内存情况分配</span>
                        </div>
                        <label className="switch">
                          <input type="checkbox" checked={autoMem} onChange={(e) => setAutoMem(e.target.checked)} />
                          <span className="switch-slider"></span>
                        </label>
                      </div>
                    </div>
                    <div className="mem-item">
                      <div className="mem-slider">
                        <div className="mem-slider-bar">
                          <div className="mem-slider-segment mem-slider-used" style={{ width: usedPercent + "%" }}></div>
                          <div className="mem-slider-segment mem-slider-free" style={{ width: freePercent + "%" }}></div>
                        </div>
                      </div>
                      <span className="mem-status">
                        您的计算机一共有 {sysMem.total_mb} MB，已经用了 {sysMem.used_mb} MB
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSetting === "appearance" && (
              <div className="setting-panel">
                <div className="setting-card">
                  <div className="setting-card-info">
                    <label className="setting-label">{t("app.mainwindow.settings.appearance.theme")}</label>
                    <span className="setting-desc">{t("app.mainwindow.settings.appearance.theme.desc")}</span>
                  </div>
                  <div className="custom-select">
                    <select value={currentTheme} onChange={(e) => setCurrentTheme(e.target.value)}>
                      <option value="system">{t("app.mainwindow.settings.appearance.theme.system")}</option>
                      <option value="light">{t("app.mainwindow.settings.appearance.theme.light")}</option>
                      <option value="dark">{t("app.mainwindow.settings.appearance.theme.dark")}</option>
                    </select>
                    <span className="select-arrow">
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="setting-card">
                  <div className="setting-card-info">
                    <label className="setting-label">{t("app.mainwindow.settings.appearance.font")}</label>
                    <span className="setting-desc">{t("app.mainwindow.settings.appearance.font.desc")}</span>
                  </div>
                  <div className="font-select-group">
                    <div className="custom-select" ref={fontSelectRef}>
                      <button className="font-select-trigger" onClick={() => setFontDropdownOpen(!fontDropdownOpen)}>
                        <span className="font-select-text">
                          {selectedFont === DEFAULT_FONT ? t("app.mainwindow.settings.appearance.font.default") : selectedFont}
                        </span>
                      </button>
                      <span className="select-arrow">
                        <svg width="10" height="10" viewBox="0 0 10 10">
                          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {fontDropdownOpen && (
                        <div className="font-dropdown">
                          {availableFonts.map(f => (
                            <button
                              key={f}
                              className={`font-option ${f === selectedFont ? "active" : ""}`}
                              style={getFontStyle(f)}
                              onClick={() => { setSelectedFont(f); setFontDropdownOpen(false); }}
                            >
                              {f === DEFAULT_FONT ? t("app.mainwindow.settings.appearance.font.default") : f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {fontChanged && (
                      <button className="reset-btn" onClick={resetFont}>
                        {t("app.mainwindow.settings.appearance.font.reset")}
                      </button>
                    )}
                  </div>
                </div>
                <div className="setting-card bg-card-col">
                  <div className="setting-card-info">
                    <label className="setting-label">背景</label>
                    <span className="setting-desc">选择窗口背景图像</span>
                  </div>
                  <div className="bg-gallery">
                    <div className={`bg-card ${currentBg === "none" ? "active" : ""}`} onClick={() => setCurrentBg("none")}>
                      <div className="bg-preview none-preview"><span>无</span></div>
                      <span className="bg-name">无</span>
                    </div>
                    <div className={`bg-card ${currentBg === "default1" ? "active" : ""}`} onClick={() => setCurrentBg("default1")}>
                      <div className="bg-preview"><img src={default1Bg} alt="Default 1" /></div>
                      <span className="bg-name">Default 1</span>
                    </div>
                    {customBgs.map(cbg => (
                      <div key={cbg.path} className={`bg-card ${currentBg === "custom:" + cbg.path ? "active" : ""}`} onClick={() => setCurrentBg("custom:" + cbg.path)}>
                        <div className="bg-preview">
                          <img src={customBgPreviews[cbg.path]} alt={cbg.name} />
                        </div>
                        <span className="bg-name">{cbg.name}</span>
                      </div>
                    ))}
                    <div className="bg-card upload-card" onClick={uploadBg}>
                      <div className="bg-preview"><Upload size={24} /></div>
                      <span className="bg-name">上传</span>
                    </div>
                  </div>
                </div>
                <div className="setting-card">
                  <div className="setting-card-info">
                    <label className="setting-label">背景模糊</label>
                    <span className="setting-desc">调整高斯模糊程度（0–20px）</span>
                  </div>
                  <div className="blur-control">
                    <input type="range" value={bgBlur} onChange={(e) => setBgBlur(Number(e.target.value))} min="0" max="20" step="1" className="blur-slider" />
                    <span className="blur-value">{bgBlur}px</span>
                  </div>
                </div>
              </div>
            )}

            {activeSetting === "ui-layout" && (
              <div className="setting-panel">
                <div className="setting-card">
                  <div className="setting-card-info">
                    <label className="setting-label">UI 布局</label>
                    <span className="setting-desc">选择要使用的界面布局</span>
                  </div>
                  <div className="ui-layout-options">
                    <label className="switch">
                      <input type="checkbox" checked={useFullscreenUI} onChange={(e) => setUseFullscreenUI(e.target.checked)} />
                      <span className="switch-slider"></span>
                    </label>
                    <div className="ui-layout-texts">
                      <span className={`ui-layout-option ${!useFullscreenUI ? "active" : ""}`}>传统 UI（侧边导航栏 UI）</span>
                      <span className={`ui-layout-option ${useFullscreenUI ? "active" : ""}`}>大屏幕 UI</span>
                      {useFullscreenUI && <span className="ui-layout-hint">此 UI 将会在启动全屏模式后自动切换</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSetting === "language" && (
              <div className="setting-panel">
                <div className="setting-card">
                  <div className="setting-card-info">
                    <label className="setting-label">{t("app.mainwindow.settings.language")}</label>
                    <span className="setting-desc">{t("app.mainwindow.settings.language.desc")}</span>
                  </div>
                  <div className="custom-select">
                    <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)}>
                      <option value="system">{t("app.lang.system")}</option>
                      <option value="zh_cn">{t("app.lang.zh_cn")}</option>
                      <option value="ko_kr">{t("app.lang.ko_kr")}</option>
                      <option value="en_us">{t("app.lang.en_us")}</option>
                      <option value="fr">{t("app.lang.fr")}</option>
                      <option value="ru">{t("app.lang.ru")}</option>
                      <option value="vi">{t("app.lang.vi")}</option>
                    </select>
                    <span className="select-arrow">
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="language-notice">{t("app.mainwindow.settings.languageNotice")}</p>
              </div>
            )}

            {activeSetting === "about" && (
              <div className="setting-panel about-panel">
                <div className="setting-card about-card" style={{ "--about-bg": `url(${default1Bg})` } as React.CSSProperties}>
                  <img src={logo} className="about-logo" />
                  <span className="about-name">Firefly Launcher</span>
                  <span className="about-version">版本 1.11.0</span>
                </div>
                <div className="setting-card license-card">
                  <span className="license-icon"><Landmark size={24} /></span>
                  <div className="license-text">
                    <span className="license-sub">Copyright(c) 2026  HGSpace Studio</span>
                    <span className="license-main">本应用使用GNU General Public License v3.0 进行开源</span>
                  </div>
                  <button className="license-btn" onClick={() => openUrl("https://github.com/HGSpace-Studio/Firefly-Launcher")}>GitHub 仓库</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}