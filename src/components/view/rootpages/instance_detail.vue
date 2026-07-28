<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { Gamepad2, Square, RefreshCw, Zap, Settings, Puzzle, Terminal, SlidersHorizontal, Save } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";

interface InstanceCardData {
  screenshots: string[];
  modCount: number;
  resourcepackCount: number;
  saveCount: number;
  recentSave: { levelName: string; lastPlayed: string; dirName: string } | null;
}
import { addTask, updateTask, getTask, registerLaunchListeners } from "../../../stores/taskStore";
import { currentInstanceName, currentLaunchFn, currentStopFn } from "../../../stores/instanceLaunch";
import { addOpenedInstance } from "../../../stores/openedInstances";

const props = defineProps<{
  instance: InstanceData;
}>();



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

const loaderLabel = computed(() => {
  if (!props.instance.loader) return "原版";
  const map: Record<string, string> = {
    fabric: "Fabric",
    forge: "Forge",
    neoforge: "NeoForge",
    quilt: "Quilt",
  };
  return `${map[props.instance.loader.type] || props.instance.loader.type} ${props.instance.loader.version}`;
});

const activeTab = ref<"launch" | "settings" | "resources">("launch");

const taskId = computed(() => "launch:" + props.instance.name)
const task = computed(() => getTask(taskId.value))
const launchState = computed(() => task.value?.status || "idle")
const launchLabel = computed(() => task.value?.label || "启动游戏")
const launchProgress = computed(() => task.value?.progress || 0)

async function launchGame() {
  if (launchState.value !== "idle") return;

  const ua = navigator.userAgent.toLowerCase();
  const osName = ua.includes("mac") ? "macOS" : ua.includes("linux") ? "Linux" : "Windows";

  addTask({
    id: taskId.value,
    type: "launch",
    title: props.instance.name,
    status: "launching",
    progress: 0,
    label: "准备启动...",
    instanceId: props.instance.name,
    gameVersion: props.instance.version,
    systemVersion: osName + " " + navigator.userAgent,
  })
  await registerLaunchListeners(props.instance.name)

  try {
    const acc = await invoke<{ name: string; account_type: string; uuid: string }>("get_current_account");
    const oobe = await invoke<{ accountName: string; javaPath: string }>("get_oobe_settings");
    const mcDir = await invoke<string>("get_minecraft_dir_string");

    updateTask(taskId.value, { javaVersion: oobe.javaPath || "未知" })

    await invoke("launch_minecraft", {
      args: {
        version: props.instance.version,
        username: acc.name || oobe.accountName || "Player",
        game_dir: mcDir,
        min_mem: instSettings.value.minMemory,
        max_mem: instSettings.value.maxMemory,
        loader_type: props.instance.loader?.type || null,
        loader_build: props.instance.loader?.version || null,
        instance: props.instance.name,
        download_only: false,
        fullscreen: instSettings.value.fullscreen,
        java_path: instSettings.value.javaVersion || null,
        download_concurrency: instSettings.value.downloadConcurrency,
        verify_concurrency: instSettings.value.verifyConcurrency,
      },
    });
  } catch (e: any) {
    const errMsg = e?.toString() || "未知错误";
    updateTask(taskId.value, { status: "error", label: "启动失败: " + errMsg });
    const t = getTask(taskId.value);
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
}

async function stopGame() {
  try {
    await invoke("stop_game");
  } catch (e: any) {
    // ignore
  }
}

function syncInstance() {
  currentInstanceName.value = props.instance.name
  currentLaunchFn.value = launchGame
  currentStopFn.value = stopGame
  addOpenedInstance({
    name: props.instance.name,
    version: props.instance.version,
    version_type: props.instance.versionType,
    loader: props.instance.loader?.type,
  })
}

onMounted(syncInstance)
watch(() => props.instance, syncInstance)

onUnmounted(() => {
  currentInstanceName.value = null
  currentLaunchFn.value = null
  currentStopFn.value = null
  if (cardScreenshotUrl.value) URL.revokeObjectURL(cardScreenshotUrl.value)
  if (refreshTimer) clearInterval(refreshTimer)
})

const settingsTab = ref<"general" | "quicklaunch" | "extensions" | "java" | "other">("general")
const saveMsg = ref("")
let saveTimer: number | null = null

interface JavaInstall {
  path: string
  version: string
}

interface SystemMem {
  totalMb: number
  usedMb: number
}

interface InstanceSettings {
  icon: string | null
  skipLauncher: boolean
  fullscreen: boolean
  autoConnectAddress: string | null
  javaVersion: string | null
  autoMemory: boolean
  minMemory: string
  maxMemory: string
  jvmArgs: string
  gameArgs: string
  downloadConcurrency: number
  verifyConcurrency: number
}

const instSettings = ref<InstanceSettings>({
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
})

const javaVersions = ref<JavaInstall[]>([])
const systemMem = ref<SystemMem | null>(null)

function shortJavaLabel(version: string): string {
  const m = version.match(/"(\d+)\.(\d+)/)
  if (m) {
    if (m[1] === "1") return `Java ${m[2]}`
    return `Java ${m[1]}`
  }
  const m2 = version.match(/(\d+)/)
  return m2 ? `Java ${m2[1]}` : version
}

const totalMemGb = computed(() => {
  if (!systemMem.value) return 0
  return Math.round(systemMem.value.totalMb / 1024)
})

const usedMemGb = computed(() => {
  if (!systemMem.value) return 0
  return Math.round(systemMem.value.usedMb / 1024)
})

const memBarPercent = computed(() => {
  if (!systemMem.value || systemMem.value.totalMb === 0) return 0
  return (systemMem.value.usedMb / systemMem.value.totalMb) * 100
})

onMounted(async () => {
  try {
    const data = await invoke<InstanceSettings>("get_instance_settings", { instanceName: props.instance.name })
    if (data) {
      instSettings.value = { ...instSettings.value, ...data }
    }
  } catch {
    // use defaults
  }
  try {
    javaVersions.value = await invoke<JavaInstall[]>("get_java_versions")
  } catch {
    // ignore
  }
  try {
    systemMem.value = await invoke<SystemMem>("get_system_memory")
  } catch {
    // ignore
  }
  loadCardData();
  refreshTimer = window.setInterval(loadCardData, 5000);
})

const cardData = ref<InstanceCardData | null>(null);
let refreshTimer: number | null = null;
const cardScreenshotUrl = ref<string | null>(null);
async function loadCardData() {
  try {
    const data = await invoke<InstanceCardData>("get_instance_card_data", { instanceName: props.instance.name });
    cardData.value = data;
    if (data.screenshots?.[0]) {
      try {
        const mcDir = await invoke<string>("get_minecraft_dir_string");
        const bytes = await invoke<number[]>("read_image_file", { path: mcDir + "/instances/" + props.instance.name + "/screenshots/" + data.screenshots[0] });
        const uint8 = new Uint8Array(bytes);
        const blob = new Blob([uint8]);
        if (cardScreenshotUrl.value) URL.revokeObjectURL(cardScreenshotUrl.value);
        cardScreenshotUrl.value = URL.createObjectURL(blob);
      } catch {}
    }
  } catch { cardData.value = null }
}

function onMinMemSlide(e: Event) {
  const v = (e.target as HTMLInputElement).value
  instSettings.value.minMemory = v + "M"
  const max = parseInt(instSettings.value.maxMemory) || 2048
  if (parseInt(v) > max - 256) {
    instSettings.value.maxMemory = (parseInt(v) + 256) + "M"
  }
}

function onMaxMemSlide(e: Event) {
  const v = (e.target as HTMLInputElement).value
  instSettings.value.maxMemory = v + "M"
}

async function saveSettings() {
  saveMsg.value = "保存中..."
  try {
    await invoke("save_instance_settings", { instanceName: props.instance.name, settings: instSettings.value })
    saveMsg.value = "已保存"
  } catch {
    saveMsg.value = "保存失败"
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { saveMsg.value = "" }, 3000)
}
</script>

<template>
  <div class="detail-page">
    <div class="detail-header">
      <div class="detail-icon-area">
        <img v-if="instance.icon" :src="instance.icon" class="detail-icon" />
        <Gamepad2 v-else :size="40" class="detail-icon-placeholder" />
      </div>
      <div class="detail-meta">
        <span class="detail-loader">{{ loaderLabel }}</span>
        <span class="detail-version">Minecraft {{ instance.version }}</span>
      </div>

    </div>
    <div class="detail-content">
      <div v-if="activeTab === 'launch'" class="tab-panel">
        <div class="dcards">
          <div class="dcard dcard-left">
            <div class="dcard-screenshot">
              <img v-if="cardScreenshotUrl" :src="cardScreenshotUrl" class="dcard-screenshot-img" />
              <div v-else class="dcard-screenshot-placeholder">
                <Gamepad2 :size="32" class="dcard-screenshot-icon" />
                <span>暂无截图</span>
              </div>
              <div class="dcard-screenshot-gradient"></div>
            </div>
            <div class="dcard-stats">
              <div class="dcard-stat-item">
                <span class="dcard-stat-label">模组</span>
                <span class="dcard-stat-value">{{ cardData?.modCount ?? 0 }}</span>
              </div>
              <div class="dcard-stat-item">
                <span class="dcard-stat-label">资源包</span>
                <span class="dcard-stat-value">{{ cardData?.resourcepackCount ?? 0 }}</span>
              </div>
              <div class="dcard-stat-item">
                <span class="dcard-stat-label">存档</span>
                <span class="dcard-stat-value">{{ cardData?.saveCount ?? 0 }}</span>
              </div>
            </div>
          </div>
          <div class="dcard dcard-right">
            <div v-if="cardData?.recentSave" class="dcard-save">
              <span class="dcard-save-label">最近游玩</span>
              <span class="dcard-save-name">{{ cardData.recentSave.levelName }}</span>
              <span class="dcard-save-time">{{ cardData.recentSave.lastPlayed }}</span>
            </div>
            <div v-else class="dcard-save empty">
              <span>暂无存档记录</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'settings'" class="tab-panel">
        <div class="set-layout">
          <div class="set-sidebar">
            <button class="set-nav-item" :class="{ active: settingsTab === 'general' }" @click="settingsTab = 'general'">
              <Settings :size="16" />
              <span>常规</span>
            </button>
            <button class="set-nav-item" :class="{ active: settingsTab === 'quicklaunch' }" @click="settingsTab = 'quicklaunch'">
              <Zap :size="16" />
              <span>快速启动</span>
            </button>
            <button class="set-nav-item" :class="{ active: settingsTab === 'extensions' }" @click="settingsTab = 'extensions'">
              <Puzzle :size="16" />
              <span>可选扩展</span>
            </button>
            <button class="set-nav-item" :class="{ active: settingsTab === 'java' }" @click="settingsTab = 'java'">
              <Terminal :size="16" />
              <span>Java 与运行</span>
            </button>
            <button class="set-nav-item" :class="{ active: settingsTab === 'other' }" @click="settingsTab = 'other'">
              <SlidersHorizontal :size="16" />
              <span>其他</span>
            </button>
          </div>
          <div class="set-content">
            <div class="set-scroll">
              <!-- 常规 -->
              <div v-if="settingsTab === 'general'" class="set-section">
                <h3 class="set-heading">常规</h3>
                <div class="set-row">
                  <label class="set-label">实例名称</label>
                  <input v-model="props.instance.name" disabled class="set-input disabled" />
                </div>
                <div class="set-row">
                  <label class="set-label">游戏版本</label>
                  <input :value="props.instance.version" disabled class="set-input disabled" />
                </div>
                <div class="set-row">
                  <label class="set-label">版本类型</label>
                  <input :value="props.instance.versionType" disabled class="set-input disabled" />
                </div>
              </div>
              <!-- 快速启动 -->
              <div v-if="settingsTab === 'quicklaunch'" class="set-section">
                <h3 class="set-heading">快速启动</h3>
                <div class="set-row">
                  <label class="set-label">跳过启动动画</label>
                  <label class="set-toggle">
                    <input v-model="instSettings.skipLauncher" type="checkbox" />
                    <span class="set-toggle-slider"></span>
                  </label>
                </div>
                <div class="set-row">
                  <label class="set-label">自动连接服务器</label>
                  <input v-model="instSettings.autoConnectAddress" placeholder="例如: example.com:25565" class="set-input" />
                </div>
                <div class="set-row">
                  <label class="set-label">以全屏进入游戏</label>
                  <label class="set-toggle">
                    <input v-model="instSettings.fullscreen" type="checkbox" />
                    <span class="set-toggle-slider"></span>
                  </label>
                </div>
              </div>
              <!-- 可选扩展 -->
              <div v-if="settingsTab === 'extensions'" class="set-section">
                <h3 class="set-heading">可选扩展</h3>
                <div class="set-row">
                  <label class="set-label">加载器</label>
                  <input :value="loaderLabel" disabled class="set-input disabled" />
                </div>
              </div>
              <!-- Java 与运行 -->
              <div v-if="settingsTab === 'java'" class="set-section">
                <!-- 卡片：Java 版本 -->
                <div class="set-card">
                  <div class="set-card-head">
                    <span class="set-card-title">游戏启动时的 Java 版本</span>
                    <span class="set-card-desc">选择启动这个实例时使用的 Java 版本</span>
                  </div>
                  <div class="set-combo-wrap">
                    <select v-model="instSettings.javaVersion" class="set-combobox">
                      <option :value="null">自动选择</option>
                      <option v-for="jv in javaVersions" :key="jv.path" :value="jv.path">
                        {{ shortJavaLabel(jv.version) }}
                      </option>
                    </select>
                  </div>
                </div>
                <!-- 卡片：运行内存分配 -->
                <div class="set-card">
                  <div class="set-card-head">
                    <span class="set-card-title">游戏运行内存分配</span>
                    <span class="set-card-desc">自动设置游戏运行的内存区间</span>
                  </div>
                  <div class="set-card-controls">
                    <label class="set-toggle">
                      <input v-model="instSettings.autoMemory" type="checkbox" />
                      <span class="set-toggle-slider"></span>
                    </label>
                    <span class="set-toggle-label">{{ instSettings.autoMemory ? '自动分配' : '手动调整' }}</span>
                  </div>
                  <!-- 系统内存条 -->
                  <div v-if="instSettings.autoMemory && systemMem" class="mem-section">
                    <div class="mem-bar">
                      <div class="mem-bar-used" :style="{ width: memBarPercent + '%' }"></div>
                    </div>
                    <div class="mem-info">
                      您的电脑一共有 <strong>{{ totalMemGb }} GB</strong> 运行内存，已用了 <strong>{{ usedMemGb }} GB</strong>
                    </div>
                  </div>
                  <!-- 手动模式：双滑块 -->
                  <div v-else-if="!instSettings.autoMemory && systemMem" class="mem-section">
                    <div class="mem-slider-group">
                      <div class="mem-slider-row">
                        <span class="mem-slider-label">最小内存</span>
                        <div class="mem-slider-track-wrap">
                          <input
                            type="range"
                            class="mem-slider"
                            :min="256"
                            :max="Math.max(256, systemMem.totalMb - 512)"
                            :value="parseInt(instSettings.minMemory) || 1024"
                            @input="onMinMemSlide"
                            step="128"
                          />
                          <span class="mem-slider-val">{{ parseInt(instSettings.minMemory) || 1024 }} MB</span>
                        </div>
                      </div>
                      <div class="mem-slider-row">
                        <span class="mem-slider-label">最大内存</span>
                        <div class="mem-slider-track-wrap">
                          <input
                            type="range"
                            class="mem-slider"
                            :min="Math.max(256, (parseInt(instSettings.minMemory) || 1024) + 256)"
                            :max="Math.max(512, systemMem.totalMb - 256)"
                            :value="parseInt(instSettings.maxMemory) || 2048"
                            @input="onMaxMemSlide"
                            step="128"
                          />
                          <span class="mem-slider-val">{{ parseInt(instSettings.maxMemory) || 2048 }} MB</span>
                        </div>
                      </div>
                    </div>
                    <div class="mem-info">
                      您的电脑一共有 <strong>{{ totalMemGb }} GB</strong> 运行内存
                    </div>
                  </div>
                  <!-- 无内存数据时的降级 -->
                  <div v-else class="mem-section">
                    <div class="set-row">
                      <label class="set-label">最小内存</label>
                      <input v-model="instSettings.minMemory" placeholder="1024M" class="set-input narrow" />
                    </div>
                    <div class="set-row">
                      <label class="set-label">最大内存</label>
                      <input v-model="instSettings.maxMemory" placeholder="2048M" class="set-input narrow" />
                    </div>
                  </div>
                </div>
              </div>
              <!-- 其他 -->
              <div v-if="settingsTab === 'other'" class="set-section">
                <h3 class="set-heading">其他</h3>
                <div class="set-row">
                  <label class="set-label">下载线程数</label>
                  <input v-model.number="instSettings.downloadConcurrency" type="number" min="1" max="64" class="set-input narrow" />
                </div>
                <div class="set-row">
                  <label class="set-label">校验线程数</label>
                  <input v-model.number="instSettings.verifyConcurrency" type="number" min="1" max="64" class="set-input narrow" />
                </div>
              </div>
            </div>
            <div class="set-footer">
              <button class="set-save-btn" @click="saveSettings">
                <Save :size="15" />
                <span>保存设置</span>
              </button>
              <span v-if="saveMsg" class="set-save-msg">{{ saveMsg }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'resources'" class="tab-panel">
      </div>
    </div>
    <div v-if="activeTab === 'launch'" class="tab-footer">
      <div v-if="launchState === 'launching' || launchState === 'running'" class="launch-status">
        <RefreshCw v-if="launchState === 'launching'" :size="16" class="spin" />
        <Square v-else :size="16" />
        <span>{{ launchLabel }}</span>
        <div v-if="launchState === 'launching'" class="launch-bar">
          <div class="launch-bar-fill" :style="{ width: (launchProgress * 100) + '%' }"></div>
        </div>
      </div>
      <div v-else-if="launchState === 'exited' || launchState === 'error'" class="launch-status">
        <span>{{ launchLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 0 80px;
  overflow-y: auto;
}

.detail-page > * {
  padding-left: 28px;
  padding-right: 28px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.detail-icon-area {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--panel-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.detail-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-icon-placeholder {
  opacity: 0.45;
  color: var(--title-color);
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.detail-loader {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.detail-version {
  font-size: 18px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.detail-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  background: rgba(128, 128, 128, 0.08);
  border-radius: 10px;
  padding: 4px;
  flex-shrink: 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  opacity: 0.55;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.tab-btn:hover {
  opacity: 0.8;
}

.tab-btn.active {
  background: var(--panel-bg);
  opacity: 1;
}

.tab-panel {
  width: 100%;
  height: 100%;
}

.set-layout {
  display: flex;
  gap: 24px;
  height: 100%;
}

.set-sidebar {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  flex-shrink: 0;
  padding-top: 4px;
}

.set-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  opacity: 0.55;
  text-align: left;
}

.set-nav-item:hover {
  background: rgba(128, 128, 128, 0.1);
  opacity: 0.8;
}

.set-nav-item.active {
  background: rgba(0, 120, 212, 0.12);
  color: #0078d4;
  opacity: 1;
}

.set-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.set-scroll {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.set-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.set-heading {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  margin: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);
}

.set-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.set-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.7;
  min-width: 110px;
  padding-top: 6px;
  flex-shrink: 0;
}

.set-input {
  flex: 1;
  max-width: 320px;
  padding: 6px 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.set-input:focus {
  border-color: var(--title-color);
}

.set-input.narrow {
  max-width: 100px;
}

.set-input.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.set-textarea {
  flex: 1;
  max-width: 400px;
  padding: 6px 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--title-color);
  font-size: 12px;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
  line-height: 1.5;
}

.set-textarea:focus {
  border-color: var(--title-color);
}

.set-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 4px;
}

.set-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.set-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(128, 128, 128, 0.3);
  border-radius: 20px;
  transition: background 0.2s;
}

.set-toggle-slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.set-toggle input:checked + .set-toggle-slider {
  background: #0078d4;
}

.set-toggle input:checked + .set-toggle-slider::before {
  transform: translateX(16px);
}

.set-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  flex-shrink: 0;
}

.set-save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: #0078d4;
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.set-save-btn:hover {
  background: #1a8ae8;
}

.set-save-msg {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.5;
}

/* ---- Card ---- */
.set-card {
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.12);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.set-card-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.set-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
}

.set-card-desc {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.45;
}

.set-card-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.set-toggle-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.7;
}

/* ---- Combobox ---- */
.set-combo-wrap {
  max-width: 280px;
}

.set-combobox {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color 0.15s;
}

.set-combobox:focus {
  border-color: var(--title-color);
}

/* ---- Memory bar ---- */
.mem-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mem-bar {
  height: 8px;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 6px;
  overflow: hidden;
}

.mem-bar-used {
  height: 100%;
  background: #0078d4;
  border-radius: 6px;
  transition: width 0.3s ease;
}

.mem-info {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.5;
  line-height: 1.4;
}

.mem-info strong {
  font-weight: 600;
}

/* ---- Slider ---- */
.mem-slider-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mem-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mem-slider-label {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.6;
  min-width: 56px;
  flex-shrink: 0;
}

.mem-slider-track-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 320px;
}

.mem-slider {
  flex: 1;
  height: 6px;
  appearance: none;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.mem-slider::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #0078d4;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  cursor: pointer;
  transition: transform 0.1s;
}

.mem-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.mem-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #0078d4;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  cursor: pointer;
}

.mem-slider-val {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.7;
  min-width: 60px;
  text-align: right;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
}

.detail-content {
  flex: 1;
  margin-top: 20px;
  min-height: 0;
}

.tab-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  flex-shrink: 0;
}

.launch-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.6;
}

.launch-bar {
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 120, 212, 0.15);
  overflow: hidden;
}

.launch-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #0078d4;
  transition: width 0.4s ease;
}

.dcards {
  display: flex;
  gap: 20px;
  height: 100%;
  align-items: flex-end;
  padding: 0 0 20px;
}



.dcard-left .dcard-screenshot {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.08);
}

.dcard-left .dcard-screenshot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dcard-left .dcard-screenshot-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(transparent, var(--panel-bg));
  pointer-events: none;
}

.dcard-left .dcard-screenshot-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--title-color);
  opacity: 0.3;
  font-size: 13px;
}

.dcard-left .dcard-screenshot-icon {
  opacity: 0.5;
}

.dcard-left .dcard-stats {
  padding: 0 18px 18px;
}

.dcard {
  flex: 1;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}

.dcard-left {
  position: relative;
  top: 100px;
  padding: 0;
  gap: 0;
  overflow: hidden;
  border-radius: 15px;
}

.dcard-stats {
  display: flex;
  gap: 28px;
}

.dcard-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dcard-stat-label {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.4;
  line-height: 1;
}

.dcard-stat-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.dcard-right {
  justify-content: center;
}

.dcard-save {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dcard-save.empty {
  align-items: center;
  color: var(--title-color);
  opacity: 0.35;
  font-size: 14px;
}

.dcard-save-label {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.4;
  line-height: 1;
}

.dcard-save-name {
  font-size: 26px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.3;
}

.dcard-save-time {
  font-size: 14px;
  color: var(--title-color);
  opacity: 0.5;
  line-height: 1;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
