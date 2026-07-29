<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useTaskStore } from "./stores/taskStore";
import { addTask, updateTask, registerLaunchListeners } from "./stores/taskStore";
import { currentInstanceName, currentStopFn } from "./stores/instanceLaunch";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";import { Home, Store, LayoutGrid, Plus, Settings, Zap, Square, ChevronRight, Play, RefreshCw, Search, Gamepad2, ArrowLeftRight } from "@lucide/vue";

import steve from "./assets/imgs/skins/avator/steve.png";
import alex from "./assets/imgs/skins/avator/alex.png";
import default1Bg from "./assets/imgs/background/default1.png";

import NewMciRoot from "./components/view/new_mci/root_interface.vue";
import HomePage from "./components/view/HomePage.vue";
import ResourcesCenter from "./components/view/ResourcesCenter.vue";
import AccountInterface from "./components/accinterface.vue";
import SettingsInterface from "./components/settings_interface.vue";
import InstanceSettingsInterface from "./components/InstanceSettingsInterface.vue";
import SpotlightSearch from "./components/SpotlightSearch.vue";
import OnboardingWindow from "./components/view/onboarding/OnboardingWindow.vue";
import CrashShell from "./components/view/window/crush_shell.vue";
const app = getCurrentWindow();
const isOobe = app.label === "oobe";
const isCrash = app.label === "crash-shell";

const nav = ref("home");
const showSettings = ref(false);
const showSpotlight = ref(false);
const spotlightScope = ref<"global" | "instances" | "modrinth">("global");
const spotlightSelectMode = ref(false);
const showInstanceSettings = ref(false);
const showAccount = ref(false);
const showNewInst = ref(false);
const taskOpen = ref(false);
const userName = ref("");
const userType = ref("");

const avatar = computed(() => {
  const imgs = [steve, alex];
  const i = userName.value ? userName.value.charCodeAt(0) % 2 : 0;
  return imgs[i];
});

const userLabel = computed(() => {
  const m: Record<string, string> = { offline: "离线账号", microsoft: "微软账户" };
  return m[userType.value] || "";
});

const navItems = [
  { id: "home", icon: Home },
  { id: "resourcescenter", icon: Store },
  { id: "add-instance", icon: Plus },
  { id: "settings", icon: Settings },
];
const taskTab = ref<"tasks" | "running">("tasks");
const { tasks } = useTaskStore();
const running = computed(() => tasks.value.filter(t => t.status === "running"));
const filteredTasks = computed(() => tasks.value.filter(t => t.status !== "running" && t.status !== "exited"));

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
  installed: boolean;
}

const instances = ref<InstanceEntry[]>([]);
async function loadInstances() {
  try {
    instances.value = await invoke<InstanceEntry[]>("get_instances_list");
  } catch {
    instances.value = [];
  }
}


const loaderDisplayNames: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

const currentInstEntry = computed(() => {
  if (!currentInstanceName.value) return null;
  return instances.value.find(i => i.name === currentInstanceName.value) || null;
});

const dockTask = computed(() => {
  if (!currentInstanceName.value) return null;
  return tasks.value.find(t => t.id === "launch:" + currentInstanceName.value) || null;
});

function onDockLaunch() {
  if (dockTask.value?.status === "running" && currentStopFn.value) {
    currentStopFn.value();
    return;
  }
  if (!currentInstanceName.value) return;
  launchGame(currentInstanceName.value);
}

async function launchGame(instName: string) {
  const inst = instances.value.find(i => i.name === instName);
  if (!inst) return;

  const taskId = "launch:" + instName;
  const existing = tasks.value.find(t => t.id === taskId);
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
  } catch (err) {
    updateTask(taskId, { status: "error", label: "启动失败: " + String(err) });
  }
}

interface InstanceStats {
  lastPlayDuration: number
  lastPlayTime: string
  totalPlayTime: number
  currentSessionStart: number | null
}
const STORAGE_KEY = 'firefile-instance-stats'
const instanceStats = ref<Record<string, InstanceStats>>({})
function loadStats() {
  try { instanceStats.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch {}
}
function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instanceStats.value))
}
function ensureStats(name: string): InstanceStats {
  if (!instanceStats.value[name]) {
    instanceStats.value[name] = { lastPlayDuration: 0, lastPlayTime: '', totalPlayTime: 0, currentSessionStart: null }
  }
  return instanceStats.value[name]
}
function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${mo}/${da} ${h}:${mi}`
}
const liveTimer = ref(0)
watch(dockTask, (n, o) => {
  const name = currentInstanceName.value
  if (!name) return
  const stats = ensureStats(name)
  if (n?.status === 'launching' && (!o || o.status === 'idle' || o.status === 'exited' || o.status === 'error' || o.status === 'crashed')) {
    stats.currentSessionStart = Date.now()
    saveStats()
  }
  if (o && (o.status === 'running' || o.status === 'launching') && n && (n.status === 'exited' || n.status === 'error' || n.status === 'crashed')) {
    if (stats.currentSessionStart) {
      const dur = Math.floor((Date.now() - stats.currentSessionStart) / 1000)
      stats.lastPlayDuration = dur
      stats.lastPlayTime = fmtDate(new Date())
      stats.totalPlayTime += dur
      stats.currentSessionStart = null
      saveStats()
    }
  }
  if (o && (o.status === 'running' || o.status === 'launching') && !n) {
    if (stats.currentSessionStart) {
      const dur = Math.floor((Date.now() - stats.currentSessionStart) / 1000)
      stats.lastPlayDuration = dur
      stats.lastPlayTime = fmtDate(new Date())
      stats.totalPlayTime += dur
      stats.currentSessionStart = null
      saveStats()
    }
  }
})
watch(currentInstanceName, () => { liveTimer.value = Date.now() })

const currentInstForSettings = computed(() => {
  const inst = instances.value.find(i => i.name === currentInstanceName.value)
  if (!inst) return null
  return {
    name: inst.name,
    version: inst.version,
    versionType: inst.version_type,
    loader: inst.loader ? { type: inst.loader.type as "fabric" | "forge" | "neoforge" | "quilt", version: inst.loader.version } : undefined,
    icon: inst.icon || undefined,
  }
})

function onNav(id: string) {
  if (id === "settings") { showSettings.value = true; return; }
  if (id === "account") { showAccount.value = true; return; }
  if (id === "add-instance") { showNewInst.value = true; return; }
  nav.value = id;
}

function goInst(inst: any) {
  taskOpen.value = false;
  currentInstanceName.value = inst.name;
}

async function loadAccount() {
  try {
    const a = await invoke<{ name: string; account_type: string; uuid: string }>("get_current_account");
    userName.value = a.name;
    userType.value = a.account_type;
  } catch {}
}

onMounted(async () => {
  const savedUrl = localStorage.getItem("firefile-bg-url");
  if (savedUrl) {
    document.documentElement.style.setProperty("--bg-image", savedUrl);
  } else {
    document.documentElement.style.setProperty("--bg-image", `url("${default1Bg}")`);
  }
  const savedBlur = Number(localStorage.getItem("firefile-bg-blur")) || 5;
  document.documentElement.style.setProperty("--bg-blur", savedBlur + "px");
  document.addEventListener("contextmenu", e => e.preventDefault());
  loadAccount();
  loadInstances();
  loadStats();
  window.setInterval(() => { liveTimer.value = Date.now() }, 1000);
  listen("account-refresh", loadAccount);
  window.addEventListener("account-changed", loadAccount);
  window.addEventListener("instance-installed", loadInstances);
  window.addEventListener("spotlight-new-instance", () => { showNewInst.value = true; });
  window.addEventListener("spotlight-select-inst", (e: Event) => {
    currentInstanceName.value = (e as CustomEvent).detail;
  });
  window.addEventListener("spotlight-launch", (e: Event) => {
    launchGame((e as CustomEvent).detail);
  });
  window.addEventListener("spotlight-inst-settings", (e: Event) => {
    currentInstanceName.value = (e as CustomEvent).detail;
    showInstanceSettings.value = true;
  });
  document.addEventListener("click", e => {
    if (!(e.target as HTMLElement).closest(".task-wrap")) taskOpen.value = false;
  });
});
</script>

<template>
  <OnboardingWindow v-if="isOobe" />
  <CrashShell v-else-if="isCrash" />
  <div v-else class="root">
    <Teleport to="body">
      <div class="spotlight-wrap">
        <div class="spotlight-bar" @click="showSpotlight = true; spotlightScope = 'global'; spotlightSelectMode = false">
          <Search :size="15" class="spotlight-icon" />
          <span class="spotlight-input">在此处搜索一切</span>
        </div>
      </div>
    </Teleport>
    <div class="body-area">
      <main class="main">
        <HomePage v-show="nav === 'home'" />
        <ResourcesCenter v-show="nav === 'resourcescenter'" />
      </main>
    </div>
    <Teleport to="body">
      <div class="task-float">
      <div class="task-wrap">
        <button class="taskbtn" @click.stop="taskOpen = !taskOpen">
          <Zap :size="16" />
          <span class="tasklbl">{{ tasks.length > 0 ? tasks.length + ' 个任务进行中' : '还没有任务啊' }}</span>
        </button>
        <div v-if="taskOpen" class="taskdrop">
          <div class="tasktabs">
            <button class="tasktab" :class="{ on: taskTab === 'tasks' }" @click="taskTab = 'tasks'">下载任务</button>
            <button class="tasktab" :class="{ on: taskTab === 'running' }" @click="taskTab = 'running'">运行中</button>
          </div>
          <div v-if="taskTab === 'tasks'">
            <div v-if="!filteredTasks.length" class="taskempty">暂无任务</div>
            <div v-for="t in filteredTasks" :key="t.id" class="titem">
              <div class="tih">
                <span class="titl">{{ t.title }}</span>
                <span class="titype">{{ t.type === 'launch' ? '启动' : '安装' }}</span>
              </div>
              <span class="tlabel">{{ t.label }}</span>
              <div class="tibar"><div class="tifill" :style="{ width: (t.progress * 100) + '%' }"></div></div>
            </div>
          </div>
          <div v-if="taskTab === 'running'">
            <div v-if="!running.length" class="taskempty">没有运行中的游戏</div>
            <div v-for="t in running" :key="t.id" class="titem ritem">
              <div class="tih">
                <span class="titl">{{ t.title }}</span>
                <div class="tiactions">
                  <button class="tiaction stop" @click="invoke('stop_game')"><Square :size="14" /></button>
                  <button class="tiaction" @click="goInst({ name: t.title, version: '', version_type: '' })"><ChevronRight :size="14" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Teleport>
    <AccountInterface v-if="showAccount" @close="showAccount = false" />
    <NewMciRoot v-if="showNewInst" @close="showNewInst = false" @navigate="(id: string) => { showNewInst = false; nav = id }" />
    <Teleport to="body">
      <div class="dock-wrap">
        <nav class="dock">
          <button class="daccount" @click="onNav('account')">
            <img :src="avatar" class="davatar" />
            <div class="daccinfo">
              <span class="daccname">{{ userName || '未设置' }}</span>
              <span class="dacctype">{{ userLabel }}</span>
            </div>
            <span class="dtooltip">账户</span>
          </button>
          <div class="dsep"></div>
          <button
            v-for="item in navItems.slice(0, 2)"
            :key="item.id"
            class="ditem"
            :class="{ on: nav === item.id }"
            @click="onNav(item.id)"
          >
            <component :is="item.icon" :size="21" />
            <span class="dtooltip">{{ item.id === 'home' ? '首页' : '资源中心' }}</span>
          </button>
          <button
            class="ditem"
            :class="{ on: false }"
            @click="showSpotlight = true; spotlightScope = 'instances'; spotlightSelectMode = false"
          >
            <LayoutGrid :size="21" />
            <span class="dtooltip">库</span>
          </button>
          <button
            v-for="item in navItems.slice(2)"
            :key="item.id"
            class="ditem"
            :class="{ on: nav === item.id }"
            @click="onNav(item.id)"
          >
            <component :is="item.icon" :size="21" />
            <span class="dtooltip">{{ item.id === 'add-instance' ? '创建实例' : '设置' }}</span>
          </button>
        </nav>
        <div class="inst-info-card">
          <div class="inst-info-icon-wrap">
            <Gamepad2 :size="22" />
          </div>
          <template v-if="currentInstEntry">
            <span class="inst-info-name">{{ currentInstEntry.name }}</span>
            <div class="inst-info-sep"></div>
            <div class="inst-info-col">
              <span class="inst-info-label">游戏本体版本</span>
              <span class="inst-info-value">{{ currentInstEntry.version }}</span>
            </div>
            <template v-if="currentInstEntry.loader">
              <div class="inst-info-sep"></div>
              <div class="inst-info-col">
                <span class="inst-info-label">{{ loaderDisplayNames[currentInstEntry.loader.type] || currentInstEntry.loader.type }}版本</span>
                <span class="inst-info-value">{{ currentInstEntry.loader.version }}</span>
              </div>
            </template>
          </template>
          <template v-else>
            <span class="inst-info-name inst-info-empty">未选择实例</span>
          </template>
          <button class="inst-info-switch" @click="showSpotlight = true; spotlightScope = 'instances'; spotlightSelectMode = true">
            <ArrowLeftRight :size="15" />
            <span class="dtooltip">切换实例</span>
          </button>
        </div>
        <button class="dlaunch" :class="{ running: dockTask?.status === 'running' }" @click="onDockLaunch">
          <RefreshCw v-if="dockTask?.status === 'launching'" :size="18" class="spin" />
          <Square v-else-if="dockTask?.status === 'running'" :size="18" />
          <Play v-else :size="18" />
          <span>{{ dockTask?.status === 'running' ? '运行中' : dockTask?.status === 'launching' ? '启动中...' : '启动该实例' }}</span>
        </button>
      </div>
    </Teleport>
    <SettingsInterface v-if="showSettings" @close="showSettings = false" />
    <InstanceSettingsInterface
      v-if="showInstanceSettings && currentInstForSettings"
      :instance="currentInstForSettings"
      @close="showInstanceSettings = false"
    />
    <SpotlightSearch v-if="showSpotlight" :default-scope="spotlightScope" :select-mode="spotlightSelectMode" @close="showSpotlight = false" />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { border-radius: 16px; overflow: hidden; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Thin.ttf") format("truetype"); font-weight: 100; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-ExtraLight.ttf") format("truetype"); font-weight: 200; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Light.ttf") format("truetype"); font-weight: 300; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Normal.ttf") format("truetype"); font-weight: 350; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Medium.ttf") format("truetype"); font-weight: 500; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Demibold.ttf") format("truetype"); font-weight: 600; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Semibold.ttf") format("truetype"); font-weight: 650; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Bold.ttf") format("truetype"); font-weight: 700; font-style: normal; }
@font-face { font-family: "MiSans"; src: url("./assets/fonts/MiSans-Heavy.ttf") format("truetype"); font-weight: 800; font-style: normal; }
body {
  font-family: var(--app-font, "MiSans"), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden; height: 100vh; background: #1a1a1e;
}
.root {
  height: 100vh; display: flex; flex-direction: column; overflow: hidden; position: relative;
  border-radius: 16px;
}

/* background */
.root::before {
  content: '';
  position: absolute;
  inset: -20px;
  z-index: -2;
  background-image: var(--bg-image, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(var(--bg-blur, 5px));
}
.root::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--blur-overlay);
  border-radius: 16px;
}

/* body area */
.body-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  padding: 0 12px;
}

/* main */
.main {
  flex: 1; display: flex; overflow: hidden; min-height: 0;
  --content-bottom-pad: 80px;
  padding-top: 8px;
}

/* task float */
.task-float { position: fixed; top: 8px; right: 16px; z-index: 20; }
.task-wrap { position: relative; display: flex; align-items: center; }
.taskbtn {
  display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 32px;
  border: none; border-radius: 8px; background: rgba(128,128,128,0.08); color: var(--title-color);
  opacity: 0.7; cursor: pointer; transition: background 0.15s, opacity 0.15s; white-space: nowrap;
}
.taskbtn:hover { background: rgba(128,128,128,0.18); opacity: 1; }
.tasklbl { font-size: 12px; line-height: 1; }

/* task dropdown */
.taskdrop {
  position: absolute; top: calc(100% + 4px); right: 0; width: 300px; max-height: 360px;
  overflow-y: auto; background: var(--panel-bg); border: 1px solid rgba(128,128,128,0.15);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 8px; z-index: 100;
}
.taskempty { text-align: center; color: var(--title-color); opacity: 0.4; font-size: 13px; padding: 24px 0; }
.tasktabs {
  display: flex; gap: 2px; margin-bottom: 8px; padding: 2px;
  background: rgba(128,128,128,0.08); border-radius: 8px;
}
.tasktab {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 6px 12px; border: none; border-radius: 6px; background: transparent;
  color: var(--title-color); opacity: 0.5; font-size: 12px; font-family: inherit;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.tasktab:hover { opacity: 0.8; }
.tasktab.on { background: var(--panel-bg); opacity: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.titem {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  border-radius: 8px; transition: background 0.15s;
}
.titem:hover { background: rgba(128,128,128,0.06); }
.titem + .titem { margin-top: 4px; }
.tih { display: flex; align-items: center; justify-content: space-between; }
.titl { font-size: 13px; font-weight: 600; color: var(--title-color); line-height: 1.2; }
.titype { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(128,128,128,0.1); color: var(--title-color); opacity: 0.55; }
.tlabel { font-size: 11px; color: var(--title-color); opacity: 0.5; line-height: 1; }
.tibar { width: 100%; height: 3px; border-radius: 2px; background: rgba(128,128,128,0.12); overflow: hidden; }
.tifill { height: 100%; border-radius: 2px; background: #0078d4; transition: width 0.3s ease; }
.tiactions { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.ritem .tiactions { margin-top: 0; }
.tiaction {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: none; border-radius: 6px; background: transparent; color: var(--title-color);
  opacity: 0.45; cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.tiaction:hover { background: rgba(128,128,128,0.12); opacity: 0.8; }
.tiaction.stop:hover { background: rgba(212,58,58,0.15); color: #d43a3a; opacity: 1; }

/* spotlight */
.spotlight-wrap {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  z-index: 30; pointer-events: auto;
}
.spotlight-bar {
  display: flex; align-items: center; gap: 8px;
  width: 340px; height: 34px; padding: 0 14px;
  background: rgba(128,128,128,0.12); border: 1px solid rgba(128,128,128,0.1);
  border-radius: 10px; backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  transition: background 0.2s, border-color 0.2s;
  cursor: pointer;
}
.spotlight-bar:hover {
  background: rgba(128,128,128,0.18); border-color: rgba(128,128,128,0.2);
}
.spotlight-icon {
  color: var(--title-color); opacity: 0.35; flex-shrink: 0;
}
.spotlight-input {
  flex: 1; font-size: 13px; font-family: inherit; color: var(--title-color);
  opacity: 0.5; pointer-events: none; cursor: default;
}

/* floating dock */
.dock-wrap {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 50;
}

.dock {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 50px;
  padding: 0 10px;
  border-radius: 18px;
  background: rgba(128,128,128,0.15);
  border: 1px solid rgba(128,128,128,0.12);
  box-shadow: 0 4px 20px rgba(0,0,0,0.18);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
}

.dlaunch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: #00BAAD;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.dlaunch:hover {
  background: #00CFC0;
}

.dlaunch.running {
  background: rgba(212,58,58,0.85);
}

.dlaunch.running:hover {
  background: #d43a3a;
}

/* instance info card */
.inst-info-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  height: 50px;
  border-radius: 14px;
  background: rgba(128,128,128,0.12);
  border: 1px solid rgba(128,128,128,0.1);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
}
.inst-info-icon-wrap {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px;
  background: rgba(128,128,128,0.12); color: var(--title-color); opacity: 0.75;
  flex-shrink: 0;
}
.inst-info-name {
  font-size: 13px; font-weight: 600; color: var(--title-color);
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.inst-info-sep {
  width: 1px; height: 26px; background: rgba(128,128,128,0.2); flex-shrink: 0;
}
.inst-info-col {
  display: flex; flex-direction: column; gap: 1px; flex-shrink: 0;
}
.inst-info-label {
  font-size: 10px; color: var(--title-color); opacity: 0.4; line-height: 1; white-space: nowrap;
}
.inst-info-value {
  font-size: 14px; font-weight: 600; color: var(--title-color); line-height: 1.2; white-space: nowrap;
}
.inst-info-empty {
  opacity: 0.35; font-weight: 400;
}
.inst-info-switch {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: rgba(128,128,128,0.12); color: var(--title-color);
  opacity: 0.5; cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, opacity 0.15s; margin-left: 4px;
}
.inst-info-switch:hover {
  background: rgba(128,128,128,0.22); opacity: 1;
}


.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.daccount {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.daccount:hover {
  background: var(--sidebar-hover);
}

.dsep {
  width: 1px;
  height: 28px;
  background: rgba(128,128,128,0.2);
  flex-shrink: 0;
}

.davatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  image-rendering: pixelated;
}

.daccinfo {
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
}

.daccname {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.dacctype {
  font-size: 10px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.ditem {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--title-color);
  opacity: 0.5;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.ditem:hover {
  background: var(--sidebar-hover);
  opacity: 0.85;
}

.dtooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 100;
  background: var(--tooltip-bg);
  color: var(--tooltip-color);
}
.ditem:hover .dtooltip,
.daccount:hover .dtooltip,
.inst-info-switch:hover .dtooltip {
  opacity: 1;
}

.ditem.on {
  background: #00ED5F;
  color: #fff;
  opacity: 1;
}

.inst-more.on {
  background: var(--sidebar-active);
  opacity: 1;
}

.inst-menu {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid rgba(128,128,128,0.15);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 6px;
  z-index: 200;
}

.inst-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.inst-menu-item:hover {
  background: var(--sidebar-hover);
}

.inst-menu-item.on {
  background: #0078d4;
  color: #fff;
}

/* scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,0.3);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(128,128,128,0.5);
}

/* themes */
:root {
  --panel-bg: #ececec; --title-color: #1d1d1f; --sidebar-color: #1d1d1f;
  --sidebar-hover: rgba(0,0,0,0.08); --sidebar-active: #c7c7c7;
  --sidebar-active-color: #1d1d1f; --tooltip-bg: #1d1d1f; --tooltip-color: #f5f5f7;
  --content-bg: #f6f6f6; --settings-icon-bg: #0078d4; --window-border: rgba(0,0,0,0.12);
  --content-border: rgba(0,0,0,0.25); --dock-border: #c7c7c7;
  --blur-overlay: rgba(236, 236, 236, 0.25);
}
@media (prefers-color-scheme: dark) {
  :root {
    --panel-bg: #2d2d2d; --title-color: #f5f5f7; --sidebar-color: #e0e0e0;
    --sidebar-hover: rgba(255,255,255,0.08); --sidebar-active: #4a4a4a;
    --sidebar-active-color: #f5f5f7; --tooltip-bg: #e0e0e0; --tooltip-color: #1d1d1f;
    --content-bg: #1c1c1e; --settings-icon-bg: #60a5fa; --window-border: rgba(255,255,255,0.12);
    --content-border: rgba(255,255,255,0.2); --dock-border: #555555;
    --blur-overlay: rgba(20, 20, 22, 0.45);
  }
}
html[data-theme="light"] {
  --panel-bg: #ececec; --title-color: #1d1d1f; --sidebar-color: #1d1d1f;
  --sidebar-hover: rgba(0,0,0,0.08); --sidebar-active: #c7c7c7;
  --sidebar-active-color: #1d1d1f; --tooltip-bg: #1d1d1f; --tooltip-color: #f5f5f7;
  --content-bg: #f6f6f6; --settings-icon-bg: #0078d4; --window-border: rgba(0,0,0,0.12);
  --content-border: rgba(0,0,0,0.25); --dock-border: #c7c7c7;
  --blur-overlay: rgba(236, 236, 236, 0.25);
}
html[data-theme="dark"] {
  --panel-bg: #2d2d2d; --title-color: #f5f5f7; --sidebar-color: #e0e0e0;
  --sidebar-hover: rgba(255,255,255,0.08); --sidebar-active: #4a4a4a;
  --sidebar-active-color: #f5f5f7; --tooltip-bg: #e0e0e0; --tooltip-color: #1d1d1f;
  --content-bg: #1c1c1e; --settings-icon-bg: #60a5fa; --window-border: rgba(255,255,255,0.12);
  --content-border: rgba(255,255,255,0.2); --dock-border: #555555;
  --blur-overlay: rgba(20, 20, 22, 0.45);
}

</style>
