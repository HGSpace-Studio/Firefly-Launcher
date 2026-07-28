<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { X, Settings, Zap, Puzzle, Terminal, SlidersHorizontal, Save, Folder, Check } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceData } from "./view/rootpages/instance_detail.vue";

const props = defineProps<{
  instance: InstanceData;
}>();
const emit = defineEmits<{
  (e: "close"): void;
}>();

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

const instanceInitial = computed(() => {
  return props.instance.name.charAt(0).toUpperCase()
})

const instanceColor = computed(() => {
  const colors = ["#00BAAD", "#6C5CE7", "#E17055", "#0984E3", "#A29BFE", "#00B894", "#E84393", "#FDCB6E"]
  let hash = 0
  for (const ch of props.instance.name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
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
})

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

const platformLabel = computed(() => {
  if (navigator.userAgent.includes("Windows")) return "在资源管理器中显示"
  if (navigator.userAgent.includes("Mac")) return "在 Finder 中显示"
  return "打开目录"
})

async function openGameFolder() {
  try {
    await invoke("open_instance_game_folder", { instanceName: props.instance.name })
  } catch {
    // ignore
  }
}

async function saveSettings() {
  saveMsg.value = "saving"
  try {
    await invoke("save_instance_settings", { instanceName: props.instance.name, settings: instSettings.value })
    saveMsg.value = "saved"
  } catch {
    saveMsg.value = "error"
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { saveMsg.value = "" }, 2500)
}

const tabs = [
  { key: "general" as const, label: "常规", icon: Settings },
  { key: "quicklaunch" as const, label: "快速启动", icon: Zap },
  { key: "extensions" as const, label: "可选扩展", icon: Puzzle },
  { key: "java" as const, label: "Java 与运行", icon: Terminal },
  { key: "other" as const, label: "其他", icon: SlidersHorizontal },
]
</script>

<template>
  <div class="isettings-overlay" @click.self="emit('close')">
    <div class="isettings-window">
      <div class="isettings-header">
        <div class="isettings-header-left">
          <div class="isettings-avatar" :style="{ background: instanceColor }">
            {{ instanceInitial }}
          </div>
          <div class="isettings-header-text">
            <span class="isettings-title">{{ instance.name }}</span>
            <span class="isettings-subtitle">{{ instance.version }} &middot; {{ loaderLabel }}</span>
          </div>
        </div>
        <div class="isettings-header-right">
          <button v-if="saveMsg" class="isettings-save-indicator" :class="saveMsg">
            <Check v-if="saveMsg === 'saved'" :size="13" />
            <span v-if="saveMsg === 'saving'">保存中…</span>
            <span v-else-if="saveMsg === 'saved'">已保存</span>
            <span v-else-if="saveMsg === 'error'">保存失败</span>
          </button>
          <button class="isettings-close" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
      </div>
      <div class="isettings-body">
        <div class="iset-layout">
          <div class="iset-sidebar">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="iset-nav-item"
              :class="{ active: settingsTab === tab.key }"
              @click="settingsTab = tab.key"
            >
              <component :is="tab.icon" :size="15" />
              <span>{{ tab.label }}</span>
            </button>
            <div class="iset-sidebar-spacer"></div>
            <div class="iset-sidebar-divider"></div>
            <button class="iset-nav-item iset-nav-folder" @click="openGameFolder">
              <Folder :size="15" />
              <span>{{ platformLabel }}</span>
            </button>
          </div>
          <div class="iset-content">
            <div class="iset-scroll">
              <!-- 常规 -->
              <div v-if="settingsTab === 'general'" class="iset-section">
                <div class="iset-info-grid">
                  <div class="iset-info-cell">
                    <span class="iset-info-key">实例名称</span>
                    <span class="iset-info-val">{{ instance.name }}</span>
                  </div>
                  <div class="iset-info-cell">
                    <span class="iset-info-key">游戏版本</span>
                    <span class="iset-info-val">{{ instance.version }}</span>
                  </div>
                  <div class="iset-info-cell">
                    <span class="iset-info-key">版本类型</span>
                    <span class="iset-info-val">{{ instance.versionType }}</span>
                  </div>
                  <div class="iset-info-cell">
                    <span class="iset-info-key">模组加载器</span>
                    <span class="iset-info-val">{{ loaderLabel }}</span>
                  </div>
                </div>
              </div>
              <!-- 快速启动 -->
              <div v-if="settingsTab === 'quicklaunch'" class="iset-section">
                <div class="iset-card">
                  <div class="iset-card-row">
                    <div class="iset-card-text">
                      <span class="iset-card-title">跳过启动动画</span>
                      <span class="iset-card-desc">启动游戏时跳过启动器动画，直接进入游戏</span>
                    </div>
                    <label class="iset-toggle">
                      <input v-model="instSettings.skipLauncher" type="checkbox" />
                      <span class="iset-toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="iset-card">
                  <div class="iset-card-row">
                    <div class="iset-card-text">
                      <span class="iset-card-title">全屏启动</span>
                      <span class="iset-card-desc">游戏启动后自动切换为全屏模式</span>
                    </div>
                    <label class="iset-toggle">
                      <input v-model="instSettings.fullscreen" type="checkbox" />
                      <span class="iset-toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="iset-card">
                  <div class="iset-card-head">
                    <span class="iset-card-title">自动连接服务器</span>
                    <span class="iset-card-desc">启动后自动加入指定服务器，留空则不连接</span>
                  </div>
                  <input v-model="instSettings.autoConnectAddress" placeholder="例如: example.com:25565" class="iset-input-full" />
                </div>
              </div>
              <!-- 可选扩展 -->
              <div v-if="settingsTab === 'extensions'" class="iset-section">
                <div class="iset-info-grid">
                  <div class="iset-info-cell full">
                    <span class="iset-info-key">当前加载器</span>
                    <span class="iset-info-val">{{ loaderLabel }}</span>
                  </div>
                </div>
                <div class="iset-empty-hint">
                  <Puzzle :size="20" class="iset-empty-icon" />
                  <span>加载器信息由创建实例时决定，如需更换请新建实例</span>
                </div>
              </div>
              <!-- Java 与运行 -->
              <div v-if="settingsTab === 'java'" class="iset-section">
                <div class="iset-card">
                  <div class="iset-card-head">
                    <span class="iset-card-title">Java 版本</span>
                    <span class="iset-card-desc">选择启动此实例时使用的 Java 版本</span>
                  </div>
                  <div class="iset-combo-wrap">
                    <select v-model="instSettings.javaVersion" class="iset-combobox">
                      <option :value="null">自动选择</option>
                      <option v-for="jv in javaVersions" :key="jv.path" :value="jv.path">
                        {{ shortJavaLabel(jv.version) }}
                      </option>
                    </select>
                  </div>
                </div>
                <div class="iset-card">
                  <div class="iset-card-head">
                    <span class="iset-card-title">内存分配</span>
                    <span class="iset-card-desc">调整游戏运行时的内存分配区间</span>
                  </div>
                  <div class="iset-card-row">
                    <div class="iset-card-text">
                      <span class="iset-toggle-label">{{ instSettings.autoMemory ? '自动分配' : '手动调整' }}</span>
                    </div>
                    <label class="iset-toggle">
                      <input v-model="instSettings.autoMemory" type="checkbox" />
                      <span class="iset-toggle-slider"></span>
                    </label>
                  </div>
                  <div v-if="instSettings.autoMemory && systemMem" class="mem-section">
                    <div class="mem-bar">
                      <div class="mem-bar-used" :style="{ width: memBarPercent + '%' }"></div>
                    </div>
                    <div class="mem-info">
                      共 <strong>{{ totalMemGb }} GB</strong> 内存，已使用 <strong>{{ usedMemGb }} GB</strong>
                    </div>
                  </div>
                  <div v-else-if="!instSettings.autoMemory && systemMem" class="mem-section">
                    <div class="mem-slider-group">
                      <div class="mem-slider-row">
                        <span class="mem-slider-label">最小</span>
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
                        <span class="mem-slider-label">最大</span>
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
                      共 <strong>{{ totalMemGb }} GB</strong> 内存
                    </div>
                  </div>
                  <div v-else class="mem-section">
                    <div class="iset-row">
                      <label class="iset-label">最小内存</label>
                      <input v-model="instSettings.minMemory" placeholder="1024M" class="iset-input narrow" />
                    </div>
                    <div class="iset-row">
                      <label class="iset-label">最大内存</label>
                      <input v-model="instSettings.maxMemory" placeholder="2048M" class="iset-input narrow" />
                    </div>
                  </div>
                </div>
              </div>
              <!-- 其他 -->
              <div v-if="settingsTab === 'other'" class="iset-section">
                <div class="iset-card">
                  <div class="iset-card-head">
                    <span class="iset-card-title">下载与校验</span>
                    <span class="iset-card-desc">调整并发线程数以平衡速度与稳定性</span>
                  </div>
                  <div class="iset-row">
                    <label class="iset-label">下载线程数</label>
                    <input v-model.number="instSettings.downloadConcurrency" type="number" min="1" max="64" class="iset-input narrow" />
                  </div>
                  <div class="iset-row">
                    <label class="iset-label">校验线程数</label>
                    <input v-model.number="instSettings.verifyConcurrency" type="number" min="1" max="64" class="iset-input narrow" />
                  </div>
                </div>
              </div>
            </div>
            <div class="iset-footer">
              <button class="iset-save-btn" @click="saveSettings">
                <Save :size="14" />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.isettings-overlay {
  position: fixed;
  inset: 0;
  top: 30px;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: iset-fadeIn 0.2s ease;
}

.isettings-window {
  display: flex;
  flex-direction: column;
  width: 800px;
  height: 560px;
  background: var(--content-bg);
  border-radius: 14px;
  border: 1px solid rgba(128, 128, 128, 0.1);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  overflow: hidden;
  animation: iset-slideUp 0.25s ease;
}

@keyframes iset-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes iset-slideUp {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── Header ── */
.isettings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  flex-shrink: 0;
}

.isettings-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.isettings-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  letter-spacing: -0.5px;
}

.isettings-header-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.isettings-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.isettings-subtitle {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.4;
  line-height: 1.2;
}

.isettings-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.isettings-save-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  animation: iset-fadeIn 0.2s ease;
}

.isettings-save-indicator.saving {
  background: rgba(128, 128, 128, 0.12);
  color: var(--title-color);
  opacity: 0.5;
}

.isettings-save-indicator.saved {
  background: rgba(0, 186, 173, 0.12);
  color: #00BAAD;
}

.isettings-save-indicator.error {
  background: rgba(225, 112, 85, 0.12);
  color: #E17055;
}

.isettings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--title-color);
  opacity: 0.45;
  transition: opacity 0.15s, background 0.15s;
}

.isettings-close:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.12);
}

/* ── Body ── */
.isettings-body {
  flex: 1;
  min-height: 0;
  padding: 0 0 16px 0;
}

.iset-layout {
  display: flex;
  height: 100%;
}

/* ── Sidebar ── */
.iset-sidebar {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
  width: 150px;
  flex-shrink: 0;
  padding: 0 8px;
  border-right: 1px solid rgba(128, 128, 128, 0.08);
}

.iset-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0.45;
  text-align: left;
  position: relative;
}

.iset-nav-item:hover {
  background: rgba(128, 128, 128, 0.08);
  opacity: 0.75;
}

.iset-nav-item.active {
  background: rgba(0, 186, 173, 0.1);
  color: #00BAAD;
  opacity: 1;
  font-weight: 500;
}

.iset-sidebar-spacer {
  flex: 1;
}

.iset-sidebar-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.08);
  margin: 4px 6px;
}

.iset-nav-folder {
  opacity: 0.35;
}

.iset-nav-folder:hover {
  opacity: 0.65;
}

/* ── Content ── */
.iset-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.iset-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 20px 0;
}

.iset-scroll::-webkit-scrollbar {
  width: 5px;
}

.iset-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.iset-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.15);
  border-radius: 3px;
}

.iset-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Info Grid (General / Extensions) ── */
.iset-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.iset-info-cell {
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.08);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.iset-info-cell.full {
  grid-column: 1 / -1;
}

.iset-info-key {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--title-color);
  opacity: 0.35;
  font-weight: 500;
}

.iset-info-val {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.3;
}

/* ── Empty Hint ── */
.iset-empty-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-radius: 10px;
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.08);
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.4;
}

.iset-empty-icon {
  flex-shrink: 0;
  opacity: 0.5;
}

/* ── Card ── */
.iset-card {
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.iset-card-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.iset-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
}

.iset-card-desc {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.35;
  line-height: 1.3;
}

.iset-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.iset-card-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

/* ── Inputs ── */
.iset-input {
  padding: 7px 10px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
  background: var(--content-bg);
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.iset-input:focus {
  border-color: #00BAAD;
}

.iset-input.narrow {
  width: 90px;
  flex: none;
}

.iset-input.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.iset-input-full {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
  background: var(--content-bg);
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.iset-input-full:focus {
  border-color: #00BAAD;
}

.iset-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.iset-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.6;
  min-width: 80px;
  flex-shrink: 0;
}

/* ── Toggle ── */
.iset-toggle {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  flex-shrink: 0;
}

.iset-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.iset-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(128, 128, 128, 0.25);
  border-radius: 22px;
  transition: background 0.2s;
}

.iset-toggle-slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.iset-toggle input:checked + .iset-toggle-slider {
  background: #00BAAD;
}

.iset-toggle input:checked + .iset-toggle-slider::before {
  transform: translateX(16px);
}

.iset-toggle-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.65;
}

/* ── Combobox ── */
.iset-combo-wrap {
  max-width: 280px;
}

.iset-combobox {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
  background: var(--content-bg);
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color 0.15s;
}

.iset-combobox:focus {
  border-color: #00BAAD;
}

/* ── Memory ── */
.mem-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mem-bar {
  height: 6px;
  background: rgba(128, 128, 128, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.mem-bar-used {
  height: 100%;
  background: linear-gradient(90deg, #00BAAD, #00CFC0);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.mem-info {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.4;
  line-height: 1.4;
}

.mem-info strong {
  font-weight: 600;
  opacity: 1;
}

.mem-slider-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mem-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mem-slider-label {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.5;
  min-width: 32px;
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
  height: 5px;
  appearance: none;
  background: rgba(128, 128, 128, 0.12);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.mem-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #00BAAD;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.1s;
}

.mem-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.mem-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #00BAAD;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.mem-slider-val {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.6;
  min-width: 62px;
  text-align: right;
  font-family: "SF Mono", "Menlo", "Monaco", "Courier New", monospace;
}

/* ── Footer ── */
.iset-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 0;
  flex-shrink: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.06);
}

.iset-save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  border: none;
  border-radius: 8px;
  background: #00BAAD;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.iset-save-btn:hover {
  background: #00CFC0;
}
</style>
