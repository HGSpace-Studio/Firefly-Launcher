import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Home, Store, LayoutGrid, Plus, Settings, Zap, Square, ChevronRight, Play, RefreshCw, Search, Gamepad2, ArrowLeftRight } from "lucide-react";
import steve from "./assets/imgs/skins/avator/steve.png";
import alex from "./assets/imgs/skins/avator/alex.png";
import default1Bg from "./assets/imgs/background/default1.png";
import HomePage from "./components/view/HomePage";
import ResourcesCenter from "./components/view/ResourcesCenter";
import SettingsInterface from "./components/settings_interface";
import InstanceSettingsInterface from "./components/InstanceSettingsInterface";
import SpotlightSearch from "./components/SpotlightSearch";
import OnboardingWindow from "./components/view/onboarding/OnboardingWindow";
import CrashShell from "./components/view/window/crush_shell";
import Accinterface from "./components/accinterface";
import RootInterface from "./components/view/new_mci/root_interface";
import { useTaskStore } from "./hooks/useTaskStore";
import { useLaunchStore } from "./hooks/useLaunchStore";
import { launchStore } from "./stores/instanceLaunch";
import { addTask, updateTask, registerLaunchListeners } from "./stores/taskStore";

function getWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "";
  }
}

function App() {
  const appLabel = getWindowLabel();
  const isOobe = appLabel === "oobe";
  const isCrash = appLabel === "crash-shell";

  const [nav, setNav] = useState("home");
  const [showSettings, setShowSettings] = useState(false);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [spotlightScope, setSpotlightScope] = useState<"global" | "instances" | "modrinth">("global");
  const [spotlightSelectMode, setSpotlightSelectMode] = useState(false);
  const [showInstanceSettings, setShowInstanceSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTab, setTaskTab] = useState<"tasks" | "running">("tasks");
  const [userName, setUserName] = useState("");
  const [userType, setUserType] = useState("");
  const [instances, setInstances] = useState<any[]>([]);

  const currentInstanceName = useLaunchStore().currentInstanceName;
  const tasks = useTaskStore();

  const avatar = userName ? (userName.charCodeAt(0) % 2 === 0 ? steve : alex) : steve;
  const userLabel = userType === "offline" ? "离线账号" : userType === "microsoft" ? "微软账户" : "";

  const navItems = [
    { id: "home", icon: Home },
    { id: "resourcescenter", icon: Store },
    { id: "add-instance", icon: Plus },
    { id: "settings", icon: Settings },
  ];

  const currentInstEntry = useMemo(() => {
    if (!currentInstanceName) return null;
    return instances.find((i: any) => i.name === currentInstanceName) || null;
  }, [currentInstanceName, instances]);

  const dockTask = useMemo(() => {
    if (!currentInstanceName) return null;
    return tasks.find((t: any) => t.id === "launch:" + currentInstanceName) || null;
  }, [currentInstanceName, tasks]);

  const loaderDisplayNames: Record<string, string> = {
    fabric: "Fabric",
    forge: "Forge",
    neoforge: "NeoForge",
    quilt: "Quilt",
  };

  const filteredTasks = useMemo(() => tasks.filter((t: any) => t.status !== "running" && t.status !== "exited"), [tasks]);
  const runningTasks = useMemo(() => tasks.filter((t: any) => t.status === "running"), [tasks]);

  function onNav(id: string) {
    if (id === "settings") { setShowSettings(true); return; }
    if (id === "account") { setShowAccount(true); return; }
    if (id === "add-instance") { setShowCreateInstance(true); return; }
    setNav(id);
  }

  function goInst(inst: any) {
    setTaskOpen(false);
    launchStore.setCurrentInstanceName(inst.name);
  }

  async function loadAccount() {
    try {
      const a = await invoke<{ name: string; account_type: string; uuid: string }>("get_current_account");
      setUserName(a.name);
      setUserType(a.account_type);
    } catch { /* ignore */ }
  }

  async function loadInstances() {
    try {
      const list = await invoke<any[]>("get_instances_list");
      setInstances(list);
    } catch {
      setInstances([]);
    }
  }

  function onDockLaunch() {
    if (dockTask?.status === "running") {
      invoke("stop_game");
      return;
    }
    if (!currentInstanceName) return;
    launchGame(currentInstanceName);
  }

  async function launchGame(instName: string) {
    const inst = instances.find((i: any) => i.name === instName);
    if (!inst) return;
    const taskId = "launch:" + instName;
    const existing = tasks.find((t: any) => t.id === taskId);
    if (existing && existing.status !== "idle" && existing.status !== "exited" && existing.status !== "error") return;

    const ua = navigator.userAgent.toLowerCase();
    const osName = ua.includes("mac") ? "macOS" : ua.includes("linux") ? "Linux" : "Windows";

    addTask({
      id: taskId,
      type: "launch",
      title: inst.name,
      status: "launching",
      progress: 0,
      label: "准备启动...",
      instanceId: inst.name,
      gameVersion: inst.version,
      systemVersion: osName + " " + navigator.userAgent,
    });
    await registerLaunchListeners(instName);

    try {
      const acc = await invoke<{ name: string; account_type: string; uuid: string }>("get_current_account");
      const oobe = await invoke<{ accountName: string; javaPath: string }>("get_oobe_settings");
      const mcDir = await invoke<string>("get_minecraft_dir_string");
      updateTask(taskId, { javaVersion: oobe.javaPath || "未知" });
      await invoke("launch_minecraft", {
        args: {
          version: inst.version,
          username: acc.name || oobe.accountName || "Player",
          game_dir: mcDir,
          min_mem: "1024",
          max_mem: "4096",
          loader_type: inst.loader?.type || null,
          loader_build: inst.loader?.version || null,
          instance: inst.name,
          download_only: false,
          fullscreen: false,
          java_path: null,
          download_concurrency: 16,
        },
      });
    } catch (err: any) {
      updateTask(taskId, { status: "error", label: "启动失败: " + String(err) });
    }
  }

  useEffect(() => {
    const savedUrl = localStorage.getItem("firefile-bg-url");
    if (savedUrl) {
      document.documentElement.style.setProperty("--bg-image", savedUrl);
    } else {
      document.documentElement.style.setProperty("--bg-image", `url("${default1Bg}")`);
    }
    const savedBlur = Number(localStorage.getItem("firefile-bg-blur")) || 5;
    document.documentElement.style.setProperty("--bg-blur", savedBlur + "px");

    loadAccount();
    loadInstances();
    const timer = window.setInterval(() => {}, 1000);
    listen("account-refresh", loadAccount);
    window.addEventListener("account-changed", loadAccount);
    window.addEventListener("instance-installed", loadInstances);
    window.addEventListener("spotlight-new-instance", () => {});
    window.addEventListener("spotlight-select-inst", (e: Event) => {
      launchStore.setCurrentInstanceName((e as CustomEvent).detail);
    });
    window.addEventListener("spotlight-launch", (e: Event) => {
      launchGame((e as CustomEvent).detail);
    });
    window.addEventListener("spotlight-inst-settings", (e: Event) => {
      launchStore.setCurrentInstanceName((e as CustomEvent).detail);
      setShowInstanceSettings(true);
    });

    const docClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".task-wrap")) setTaskOpen(false);
    };
    document.addEventListener("click", docClick);

    return () => {
      clearInterval(timer);
      document.removeEventListener("click", docClick);
    };
  }, []);

  if (isOobe) return <OnboardingWindow />;
  if (isCrash) return <CrashShell />;

  return (
    <div className="root">
      <div className="spotlight-wrap">
        <div
          className="spotlight-bar"
          onClick={() => {
            setShowSpotlight(true);
            setSpotlightScope("global");
            setSpotlightSelectMode(false);
          }}
        >
          <Search size={15} className="spotlight-icon" />
          <span className="spotlight-input">在此处搜索一切</span>
        </div>
      </div>

      <div className="body-area">
        <main className="main">
          {nav === "home" && <HomePage />}
          {nav === "resourcescenter" && <ResourcesCenter />}
        </main>
      </div>

      <div className="dock-wrap">
        <nav className="dock">
          <button className="daccount" onClick={() => onNav("account")}>
            <img src={avatar} className="davatar" />
            <div className="daccinfo">
              <span className="daccname">{userName || "未设置"}</span>
              <span className="dacctype">{userLabel}</span>
            </div>
            <span className="dtooltip">账户</span>
          </button>
          <div className="dsep"></div>
          {navItems.slice(0, 2).map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={"ditem" + (nav === item.id ? " on" : "")}
                onClick={() => onNav(item.id)}
              >
                <Icon size={21} />
                <span className="dtooltip">{item.id === "home" ? "首页" : "资源中心"}</span>
              </button>
            );
          })}
          <button
            className="ditem"
            onClick={() => {
              setShowSpotlight(true);
              setSpotlightScope("instances");
              setSpotlightSelectMode(false);
            }}
          >
            <LayoutGrid size={21} />
            <span className="dtooltip">库</span>
          </button>
          {navItems.slice(2).map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={"ditem" + (nav === item.id ? " on" : "")}
                onClick={() => onNav(item.id)}
              >
                <Icon size={21} />
                <span className="dtooltip">{item.id === "add-instance" ? "创建实例" : "设置"}</span>
              </button>
            );
          })}
        </nav>

        <div className="inst-info-card">
          <div className="inst-info-icon-wrap">
            <Gamepad2 size={22} />
          </div>
          {currentInstEntry ? (
            <>
              <span className="inst-info-name">{currentInstEntry.name}</span>
              <div className="inst-info-sep"></div>
              <div className="inst-info-col">
                <span className="inst-info-label">游戏本体版本</span>
                <span className="inst-info-value">{currentInstEntry.version}</span>
              </div>
              {currentInstEntry.loader && (
                <>
                  <div className="inst-info-sep"></div>
                  <div className="inst-info-col">
                    <span className="inst-info-label">{loaderDisplayNames[currentInstEntry.loader.type] || currentInstEntry.loader.type}版本</span>
                    <span className="inst-info-value">{currentInstEntry.loader.version}</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <span className="inst-info-name inst-info-empty">未选择实例</span>
          )}
          <button
            className="inst-info-switch"
            onClick={() => {
              setShowSpotlight(true);
              setSpotlightScope("instances");
              setSpotlightSelectMode(true);
            }}
          >
            <ArrowLeftRight size={15} />
            <span className="dtooltip">切换实例</span>
          </button>
        </div>

        <button
          className={"dlaunch" + (dockTask?.status === "running" ? " running" : "")}
          onClick={onDockLaunch}
        >
          {dockTask?.status === "launching" ? (
            <RefreshCw size={18} className="spin" />
          ) : dockTask?.status === "running" ? (
            <Square size={18} />
          ) : (
            <Play size={18} />
          )}
          <span>
            {dockTask?.status === "running"
              ? "运行中"
              : dockTask?.status === "launching"
              ? "启动中..."
              : "启动该实例"}
          </span>
        </button>
      </div>

      {showAccount && <Accinterface onClose={() => setShowAccount(false)} />}
      {showCreateInstance && (
        <RootInterface
          onClose={() => setShowCreateInstance(false)}
          onNavigate={(nav: string) => { setShowCreateInstance(false); setNav(nav); }}
        />
      )}
      {showSettings && <SettingsInterface onClose={() => setShowSettings(false)} />}
      {showInstanceSettings && currentInstEntry && (
        <InstanceSettingsInterface
          instance={currentInstEntry}
          onClose={() => setShowInstanceSettings(false)}
        />
      )}
      {showSpotlight && (
        <SpotlightSearch
          defaultScope={spotlightScope}
          selectMode={spotlightSelectMode}
          onClose={() => setShowSpotlight(false)}
        />
      )}

      <div className={"task-float" + (taskOpen ? " open" : "")}>
        <div className="task-wrap">
          <button className="taskbtn" onClick={() => setTaskOpen(!taskOpen)}>
            <Zap size={16} />
            <span className="tasklbl">{tasks.length > 0 ? tasks.length + " 个任务进行中" : "还没有任务啊"}</span>
          </button>
          {taskOpen && (
            <div className="taskdrop">
              <div className="tasktabs">
                <button className={"tasktab" + (taskTab === "tasks" ? " on" : "")} onClick={() => setTaskTab("tasks")}>下载任务</button>
                <button className={"tasktab" + (taskTab === "running" ? " on" : "")} onClick={() => setTaskTab("running")}>运行中</button>
              </div>
              {taskTab === "tasks" && (
                <>
                  {!filteredTasks.length && <div className="taskempty">暂无任务</div>}
                  {filteredTasks.map((t: any) => (
                    <div key={t.id} className="titem">
                      <div className="tih">
                        <span className="titl">{t.title}</span>
                        <span className="titype">{t.type === "launch" ? "启动" : "安装"}</span>
                      </div>
                      <span className="tlabel">{t.label}</span>
                      <div className="tibar"><div className="tifill" style={{ width: (t.progress * 100) + "%" }}></div></div>
                    </div>
                  ))}
                </>
              )}
              {taskTab === "running" && (
                <>
                  {!runningTasks.length && <div className="taskempty">没有运行中的游戏</div>}
                  {runningTasks.map((t: any) => (
                    <div key={t.id} className="titem ritem">
                      <div className="tih">
                        <span className="titl">{t.title}</span>
                        <div className="tiactions">
                          <button className="tiaction stop" onClick={() => invoke("stop_game")}><Square size={14} /></button>
                          <button className="tiaction" onClick={() => goInst({ name: t.title, version: "", version_type: "" })}><ChevronRight size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;