import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { message } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { getSystemLocale } from "../../../i18n";
import { Globe, Palette, Coffee, User, CheckCircle, X, ChevronRight, ChevronLeft, RefreshCw, MoreHorizontal, RefreshCcw, Download } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import steveAvatar from "../../../assets/imgs/skins/avator/steve.png";
import alexAvatar from "../../../assets/imgs/skins/avator/alex.png";
import "./OnboardingWindow.css";

interface JavaInstall {
  path: string;
  version: string;
}

interface OobeSettings {
  locale: string;
  theme: string;
  font: string;
  javaPath: string;
  accountType: string;
  accountName: string;
  oobeCompleted: boolean;
}

interface OnboardingWindowProps {}

const avatars = [steveAvatar, alexAvatar];

function getAppWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export default function OnboardingWindow(_props: OnboardingWindowProps) {
  const { t, i18n } = useTranslation();

  const appWindow = getAppWindow();
  const [activeTab, setActiveTab] = useState(0);
  const settingsRef = useRef<OobeSettings>({
    locale: "system",
    theme: "system",
    font: "__system_default__",
    javaPath: "",
    accountType: "offline",
    accountName: "",
    oobeCompleted: false,
  });
  const [settings, setSettings] = useState<OobeSettings>(settingsRef.current);
  const [initialized, setInitialized] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);
  const themeDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const tabs = [
    { id: "language", label: "语言", icon: Globe },
    { id: "appearance", label: "外观", icon: Palette },
    { id: "java", label: "Java JRE", icon: Coffee },
    { id: "account", label: "账户", icon: User },
    { id: "complete", label: "完成", icon: CheckCircle },
  ];

  const isLastTab = useMemo(() => activeTab === tabs.length - 1, [activeTab]);
  const isFirstTab = useMemo(() => activeTab === 0, [activeTab]);
  const accountMissing = useMemo(() => {
    if (activeTab !== 3) return false;
    return !settings.accountName && settings.accountType !== "microsoft";
  }, [activeTab, settings.accountName, settings.accountType]);

  const [javaManualPath, setJavaManualPath] = useState("");
  const [javaDetecting, setJavaDetecting] = useState(false);
  const [javaList, setJavaList] = useState<JavaInstall[]>([]);
  const [accountName, setAccountName] = useState("");

  const localeOptions = [
    { value: "system", labelKey: "app.lang.system" as const },
    { value: "zh_cn", labelKey: "app.lang.zh_cn" as const },
    { value: "en_us", labelKey: "app.lang.en_us" as const },
    { value: "ko_kr", labelKey: "app.lang.ko_kr" as const },
    { value: "fr", labelKey: "app.lang.fr" as const },
    { value: "ru", labelKey: "app.lang.ru" as const },
    { value: "vi", labelKey: "app.lang.vi" as const },
  ];

  const themeOptions = [
    { value: "system", label: "跟随系统" },
    { value: "light", label: "亮色" },
    { value: "dark", label: "暗色" },
  ];

  function onLocaleChange(val: string) {
    setSettings(prev => ({ ...prev, locale: val }));
    const lang = val === "system" ? getSystemLocale() : val;
    i18n.changeLanguage(lang);
  }

  function onThemeChange(val: string) {
    setSettings(prev => ({ ...prev, theme: val }));
    if (val === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", val);
    }
  }

  async function detectJava() {
    setJavaDetecting(true);
    try {
      const list = await invoke<JavaInstall[]>("get_java_versions");
      setJavaList(list);
      if (list.length > 0) {
        setJavaManualPath(list[0].path);
        setSettings(prev => ({ ...prev, javaPath: list[0].path }));
      }
    } catch (e) {
      console.error("Java detection failed:", e);
    }
    setJavaDetecting(false);
  }

  function selectJava(j: JavaInstall) {
    setJavaManualPath(j.path);
    setSettings(prev => ({ ...prev, javaPath: j.path }));
  }

  function onAccountTypeChange(type: string) {
    setSettings(prev => ({ ...prev, accountType: type }));
  }

  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [offlineNameInput, setOfflineNameInput] = useState("");
  const [currentAvatar, setCurrentAvatar] = useState(avatars[Math.floor(Math.random() * avatars.length)]);

  function onAvatarInput() {
    setCurrentAvatar(avatars[Math.floor(Math.random() * avatars.length)]);
  }

  function openOfflineDialog() {
    setOfflineNameInput(settingsRef.current.accountName || "");
    setShowOfflineDialog(true);
  }

  function confirmOfflineName() {
    const name = offlineNameInput.trim();
    if (name) {
      setSettings(prev => ({ ...prev, accountName: name }));
      setAccountName(name);
    }
    setSettings(prev => ({ ...prev, accountType: "offline" }));
    setShowOfflineDialog(false);
  }

  async function completeSetup() {
    setSettings(prev => ({ ...prev, oobeCompleted: true }));
    await invoke("finish_oobe", { settings: settingsRef.current });
  }

  function goNext() {
    if (activeTab < tabs.length - 1) {
      setActiveTab(prev => prev + 1);
    } else {
      completeSetup();
    }
  }

  function goPrev() {
    if (activeTab > 0) {
      setActiveTab(prev => prev - 1);
    }
  }

  function requestExit() {
    setShowExitDialog(true);
  }

  async function confirmExit() {
    setShowExitDialog(false);
    unlistenCloseRef.current?.();
    await invoke("rollback_oobe");
    await appWindow?.close();
  }

  function cancelExit() {
    setShowExitDialog(false);
  }

  const unlistenCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    message("您正在使用测试版本的Firefiles Launcher，一部分功能的工作可能会异常，也有一些未完工的功能，我们都将在以后的版本中完善它们。", {
      title: "开发版本声明",
      kind: "info",
    });

    async function init() {
      try {
        const s = await invoke<OobeSettings>("init_oobe_environment");
        setSettings(s);
        setInitialized(true);
      } catch (e) {
        console.error("Failed to init OOBE environment:", e);
      }
    }
    init();

    detectJava();

    listen<string>("tauri://close-requested", () => {
      if (!settingsRef.current.oobeCompleted) {
        requestExit();
      }
    }).then(fn => { unlistenCloseRef.current = fn; });

    return () => {
      unlistenCloseRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (langDropdownOpen) {
      setTimeout(() => {
        const el = langDropdownRef.current;
        if (!el) return;
        const selected = el.querySelector<HTMLElement>(".combo-option.selected");
        if (selected) {
          el.scrollTo({ top: selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2, behavior: "smooth" });
        }
      }, 0);
    } else {
      setTimeout(() => {
        langDropdownRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    }
  }, [langDropdownOpen]);

  useEffect(() => {
    if (themeDropdownOpen) {
      setTimeout(() => {
        const el = themeDropdownRef.current;
        if (!el) return;
        const selected = el.querySelector<HTMLElement>(".combo-option.selected");
        if (selected) {
          el.scrollTo({ top: selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2, behavior: "smooth" });
        }
      }, 0);
    } else {
      setTimeout(() => {
        themeDropdownRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    }
  }, [themeDropdownOpen]);

  return (
    <div className="oobe-overlay">
      <div className="oobe-window">
        <div className="oobe-header">
          <div className="tabview">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === idx ? "active" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                <tab.icon size={14} className="tab-icon" />
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="oobe-body">
          {!initialized ? (
            <div className="loading-state">
              <RefreshCw size={24} className="spinner" />
              <span>{t("initializing")}</span>
            </div>
          ) : (
            <>
              {activeTab === 0 && (
                <div className="tab-content lang-content">
                  <div className="lang-center">
                    <Globe size={28} className="lang-icon" />
                    <div className="section-title">选择语言</div>
                    <div className="section-desc">选择应用的显示语言</div>
                    <div className="lang-combobox">
                      <button className="combo-trigger" onClick={() => setLangDropdownOpen(!langDropdownOpen)}>
                        <span className="combo-label">{t(localeOptions.find(o => o.value === settings.locale)?.labelKey || "app.lang.system")}</span>
                        <svg className={`combo-arrow ${langDropdownOpen ? "open" : ""}`} width="12" height="12" viewBox="0 0 12 12">
                          <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {langDropdownOpen && (
                        <div className="combo-dropdown" ref={langDropdownRef}>
                          {localeOptions.map(opt => (
                            <button
                              key={opt.value}
                              className={`combo-option ${settings.locale === opt.value ? "selected" : ""}`}
                              onClick={() => { onLocaleChange(opt.value); setLangDropdownOpen(false); }}
                            >
                              <span className="combo-option-label">{t(opt.labelKey)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 1 && (
                <div className="tab-content lang-content">
                  <div className="lang-center">
                    <Palette size={28} className="lang-icon" />
                    <div className="section-title">选择外观</div>
                    <div className="section-desc">选择应用的明暗主题</div>
                    <div className="lang-combobox">
                      <button className="combo-trigger" onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}>
                        <span className="combo-label">{themeOptions.find(o => o.value === settings.theme)?.label}</span>
                        <svg className={`combo-arrow ${themeDropdownOpen ? "open" : ""}`} width="12" height="12" viewBox="0 0 12 12">
                          <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {themeDropdownOpen && (
                        <div className="combo-dropdown" ref={themeDropdownRef}>
                          {themeOptions.map(opt => (
                            <button
                              key={opt.value}
                              className={`combo-option ${settings.theme === opt.value ? "selected" : ""}`}
                              onClick={() => { onThemeChange(opt.value); setThemeDropdownOpen(false); }}
                            >
                              <span className="combo-option-label">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 2 && (
                <div className="tab-content java-content">
                  <div className="java-sidebar">
                    <Coffee size={64} className="java-big-icon" />
                  </div>
                  <div className="java-main">
                    <div className="java-main-header">
                      <div className="section-title">Java 运行时</div>
                      <div className="section-desc">选择 Java 路径或自动检测</div>
                    </div>
                    <div className="java-list">
                      {javaDetecting ? (
                        <div className="java-list-loading">
                          <RefreshCw size={16} className="spinner" />
                          <span>检测中...</span>
                        </div>
                      ) : null}
                      {javaList.map(j => (
                        <button
                          key={j.path}
                          className={`java-item ${settings.javaPath === j.path ? "selected" : ""}`}
                          onClick={() => selectJava(j)}
                        >
                          <div className="java-item-version">{j.version}</div>
                          <div className="java-item-path">{j.path}</div>
                        </button>
                      ))}
                      {!javaDetecting && javaList.length === 0 && (
                        <div className="java-list-empty">
                          <span>未检测到 Java 运行时</span>
                        </div>
                      )}
                    </div>
                    <div className="input-group">
                      <span className="input-label">或手动输入 Java 路径</span>
                      <input
                        value={javaManualPath}
                        onChange={(e) => { setJavaManualPath(e.target.value); setSettings(prev => ({ ...prev, javaPath: e.target.value })); }}
                        className="text-input"
                        placeholder="/usr/bin/java"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 3 && (
                <div className="tab-content lang-content">
                  <div className="lang-center">
                    <User size={28} className="lang-icon" />
                    <div className="section-title">账户设置</div>
                    <div className="section-desc">选择登录方式</div>
                    <div className="account-cards">
                      <button
                        className={`account-card ${settings.accountType === "microsoft" ? "selected" : ""}`}
                        onClick={() => onAccountTypeChange("microsoft")}
                      >
                        <User size={24} className="account-card-icon" />
                        <div className="account-card-text">
                          <span className="account-card-header">微软账户</span>
                          <span className="account-card-desc">如果您有正版 Minecraft，可点击此处以继续</span>
                        </div>
                      </button>
                      <button className="account-card disabled-card">
                        <MoreHorizontal size={24} className="account-card-icon" />
                        <div className="account-card-text">
                          <span className="account-card-header">第三方登录</span>
                          <span className="account-card-desc">通过其他的第三方认证服务以继续</span>
                        </div>
                      </button>
                      <button
                        className={`account-card ${settings.accountType === "offline" ? "selected" : ""}`}
                        onClick={openOfflineDialog}
                      >
                        <Globe size={24} className="account-card-icon" />
                        <div className="account-card-text">
                          <span className="account-card-header">我没有正版 Minecraft</span>
                          <span className="account-card-desc">点击以创建离线账号</span>
                        </div>
                      </button>
                    </div>
                    {settings.accountType === "offline" && accountName && (
                      <div className="account-greeting">您好，{accountName}</div>
                    )}
                    {settings.accountType === "microsoft" && (
                      <div className="input-group">
                        <span className="input-label">Microsoft 账户将在首次启动时登录</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 4 && (
                <div className="tab-content lang-content">
                  <div className="finish-center">
                    <CheckCircle size={28} className="lang-icon" />
                    <div className="section-title">设置完成</div>
                    <div className="section-desc">现在您可以进行以下操作</div>
                    <div className="finish-cards">
                      <button className="finish-card" onClick={() => openUrl("https://github.com/HGSpace-Studio/FirefileLauncher")}>
                        <RefreshCcw size={24} className="finish-card-icon" />
                        <div className="finish-card-text">
                          <span className="finish-card-header">GitHub 仓库</span>
                          <span className="finish-card-desc">查看本应用的开源代码</span>
                        </div>
                      </button>
                      <button className="finish-card">
                        <Download size={24} className="finish-card-icon" />
                        <div className="finish-card-text">
                          <span className="finish-card-header">创建第一个 MC 实例</span>
                          <span className="finish-card-desc">获取最新版 Minecraft</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="oobe-footer">
          {!isFirstTab ? (
            <button className="nav-btn prev" onClick={goPrev}>
              <ChevronLeft size={16} />
              <span>上一步</span>
            </button>
          ) : (
            <div className="nav-btn-placeholder"></div>
          )}
          {isLastTab ? (
            <button className="nav-btn complete" disabled={accountMissing} onClick={completeSetup}>
              <CheckCircle size={16} />
              <span>我什么都不需要，继续</span>
            </button>
          ) : (
            <button className="nav-btn next" disabled={accountMissing} onClick={goNext}>
              <span>下一步</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {showExitDialog && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelExit(); }}>
          <div className="dialog-box">
            <div className="dialog-header">
              <X size={18} className="dialog-close" onClick={cancelExit} />
            </div>
            <div className="dialog-body">
              <div className="dialog-icon">
                <Coffee size={32} />
              </div>
              <div className="dialog-title">还未完成设置</div>
              <div className="dialog-desc">
                您尚未完成初始化设置，确定要退出吗？<br />
                退出后将清除所有已配置的内容。
              </div>
            </div>
            <div className="dialog-footer">
              <button className="dialog-btn cancel" onClick={cancelExit}>取消</button>
              <button className="dialog-btn confirm" onClick={confirmExit}>确认退出</button>
            </div>
          </div>
        </div>
      )}

      {showOfflineDialog && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowOfflineDialog(false); }}>
          <div className="dialog-box">
            <div className="dialog-header">
              <X size={18} className="dialog-close" onClick={() => setShowOfflineDialog(false)} />
            </div>
            <div className="dialog-body">
              <div className="dialog-icon">
                <User size={32} />
              </div>
              <div className="dialog-title">创建离线账号</div>
              <div className="dialog-desc">输入您的玩家名称以继续</div>
              <div className="dialog-input-wrap">
                <img src={currentAvatar} className="dialog-avatar" />
                <input
                  value={offlineNameInput}
                  onChange={(e) => setOfflineNameInput(e.target.value)}
                  className="dialog-input"
                  placeholder="Steve"
                  maxLength={16}
                  onInput={onAvatarInput}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmOfflineName(); }}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="dialog-btn cancel" onClick={() => setShowOfflineDialog(false)}>取消</button>
              <button className="dialog-btn accent" disabled={!offlineNameInput.trim()} onClick={confirmOfflineName}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}