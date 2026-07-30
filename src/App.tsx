import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import default1Bg from "./assets/imgs/background/default1.png";
import HomePage from "./components/view/HomePage";
import ResourcesCenter from "./components/view/ResourcesCenter";
import SettingsScreen from "./components/view/screens/SettingsScreen";
import AccountScreen from "./components/view/screens/AccountScreen";
import InstanceSettingsInterface from "./components/InstanceSettingsInterface";
import SpotlightSearch from "./components/SpotlightSearch";
import OnboardingWindow from "./components/view/onboarding/OnboardingWindow";
import CrashShell from "./components/view/window/crush_shell";
import NewRootInterface from "./components/view/new_mci/NewRootInterface";
import { NavRail } from "./components/NavRail";
import { RightCard } from "./components/RightCard";
import { TitleBar } from "./components/TitleBar";
import Watermark from "./components/watermap/Watermark";
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
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [spotlightScope, setSpotlightScope] = useState<"global" | "instances" | "modrinth">("global");
  const [spotlightSelectMode, setSpotlightSelectMode] = useState(false);
  const [showInstanceSettings, setShowInstanceSettings] = useState(false);
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const currentInstanceName = useLaunchStore().currentInstanceName;
  const tasks = useTaskStore();

  const currentInstEntry = useMemo(() => {
    if (!currentInstanceName) return null;
    return instances.find((i: any) => i.name === currentInstanceName) || null;
  }, [currentInstanceName, instances]);

  const dockTask = useMemo(() => {
    if (!currentInstanceName) return null;
    return tasks.find((t: any) => t.id === "launch:" + currentInstanceName) || null;
  }, [currentInstanceName, tasks]);

  function onNav(id: string) {
    if (id === "add-instance") { setShowCreateInstance(true); return; }
    if (id === "library") {
      setShowSpotlight(true);
      setSpotlightScope("instances");
      setSpotlightSelectMode(false);
      return;
    }
    setNav(id);
  }

  async function loadAccount() {
    try {
      await invoke<{ name: string }>("get_current_account");
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

    loadInstances();
    loadAccount();
    const timer = window.setInterval(() => {}, 1000);
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

    return () => {
      clearInterval(timer);
    };
  }, []);

  if (isOobe) return <OnboardingWindow />;
  if (isCrash) return <CrashShell />;

  return (
    <div className="root">
      <TitleBar
        onOpenSpotlight={() => { setShowSpotlight(true); setSpotlightScope("global"); setSpotlightSelectMode(false); }}
        showBack={nav !== "home"}
        onBack={() => setNav("home")}
      />

      <div className="flex flex-1 overflow-hidden">
        {nav !== "settings" && nav !== "account" ? (
          <>
            <NavRail
              topItems={[
                { id: "home", label: "首页", icon: "home" },
                { id: "resourcescenter", label: "资源", icon: "store" },
                { id: "library", label: "库", icon: "grid_view" },
              ]}
              bottomItems={[
                { id: "add-instance", label: "新建", icon: "add_box" },
                { id: "settings", label: "设置", icon: "settings" },
                { id: "account", label: "账户", icon: "person" },
              ]}
              activeId={nav}
              onNavigate={onNav}
            />
            <div className="body-area flex-1">
              <main className="main">
                {nav === "home" && <HomePage />}
                {nav === "resourcescenter" && <ResourcesCenter />}
              </main>
            </div>
          </>
        ) : nav === "settings" ? (
          <SettingsScreen />
        ) : (
          <AccountScreen />
        )}
        {nav !== "settings" && nav !== "account" && (
          <RightCard
            currentInstEntry={currentInstEntry}
            dockTask={dockTask}
            onDockLaunch={onDockLaunch}
            onSwitchInstance={() => {
              setShowSpotlight(true);
              setSpotlightScope("instances");
              setSpotlightSelectMode(true);
            }}
          />
        )}
      </div>

      <Watermark />

      {showCreateInstance && (
        <NewRootInterface
          onClose={() => setShowCreateInstance(false)}
          onNavigate={(nav: string) => { setShowCreateInstance(false); setNav(nav); }}
        />
      )}
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

    </div>
  );
}

export default App;