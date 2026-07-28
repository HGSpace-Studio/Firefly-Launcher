<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { getSystemLocale } from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Globe, Palette, Info, X, Coffee, RefreshCw, ChevronDown, Upload, Table2, Landmark } from "@lucide/vue";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import logo from "../assets/logos/logo.png";

const emit = defineEmits<{
  (e: "close"): void;
}>();

import default1Bg from "../assets/imgs/background/default1.png";

const { t, locale } = useI18n();

const currentLang = ref("system");
const currentTheme = ref(
  document.documentElement.getAttribute("data-theme") || "system"
);

// --- Background Gallery ---
const bgMap: Record<string, string> = {
  default1: default1Bg,
}

interface CustomBgEntry {
  path: string
  name: string
}

function loadCustomBgs(): CustomBgEntry[] {
  try { return JSON.parse(localStorage.getItem('firefile-custom-bgs') || '[]') }
  catch { return [] }
}
const customBgs = ref<CustomBgEntry[]>(loadCustomBgs())

const customBgPreviews = reactive<Record<string, string>>({})

async function loadCustomBgPreview(path: string) {
  if (customBgPreviews[path]) return
  try {
    const bytes = await invoke<number[]>('read_image_file', { path })
    const uint8 = new Uint8Array(bytes)
    const blb = new Blob([uint8])
    customBgPreviews[path] = URL.createObjectURL(blb)
  } catch {}
}

async function loadAllCustomBgPreviews() {
  for (const cbg of customBgs.value) {
    await loadCustomBgPreview(cbg.path)
  }
}

onMounted(loadAllCustomBgPreviews)

onUnmounted(() => {
  for (const url of Object.values(customBgPreviews)) {
    URL.revokeObjectURL(url)
  }
})

async function uploadBg() {
  const selected = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }],
  })
  if (!selected) return
  const path = typeof selected === 'string' ? selected : selected
  const name = path.split(/[/\\]/).pop() || '背景'
  if (customBgs.value.some(e => e.path === path)) return
  customBgs.value.push({ path, name })
  localStorage.setItem('firefile-custom-bgs', JSON.stringify(customBgs.value))
  await loadCustomBgPreview(path)
}

// --- Background apply ---
const currentBg = ref(localStorage.getItem("firefile-bg") || "default1")
const bgBlur = ref(Number(localStorage.getItem("firefile-bg-blur")) || 5)

async function applyBg(val: string) {
  localStorage.setItem("firefile-bg", val)
  let url: string
  if (val === "none") {
    url = "none"
  } else if (val.startsWith("custom:")) {
    const path = val.slice(7)
    if (!customBgPreviews[path]) await loadCustomBgPreview(path)
    url = `url("${customBgPreviews[path]}")`
  } else {
    url = `url("${bgMap[val]}")`
  }
  if (currentBg.value !== val) return
  localStorage.setItem("firefile-bg-url", url)
  document.documentElement.style.setProperty("--bg-image", url)
}

watch(currentBg, (val) => { applyBg(val) }, { immediate: true })

watch(bgBlur, (val) => {
  localStorage.setItem("firefile-bg-blur", String(val))
  document.documentElement.style.setProperty("--bg-blur", val + "px")
}, { immediate: true })

watch(currentLang, (val) => {
  locale.value = val === "system" ? getSystemLocale() : val;
});

watch(currentTheme, (val) => {
  if (val === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", val);
  }
});

const activeSetting = ref("appearance");
const useFullscreenUI = ref(localStorage.getItem("firefile-ui-layout") === "fullscreen");
watch(useFullscreenUI, (val) => {
  localStorage.setItem("firefile-ui-layout", val ? "fullscreen" : "sidebar");
});

const DEFAULT_FONT = "__system_default__";
const availableFonts = ref<string[]>([DEFAULT_FONT]);

function getCurrentFont(): string {
  const raw = document.documentElement.style.getPropertyValue("--app-font").replace(/^"|"$/g, "").trim();
  return raw || DEFAULT_FONT;
}

const selectedFont = ref(getCurrentFont());
const fontDropdownOpen = ref(false);
const fontSelectRef = ref<HTMLElement | null>(null);

const fontChanged = computed(() => selectedFont.value !== DEFAULT_FONT);

const FALLBACK_FONTS = [
  "HarmonyOS Sans", "SF Pro Display", "SF Pro Text",
  "Helvetica Neue", "Helvetica", "Arial", "Segoe UI",
  "Roboto", "Ubuntu", "Noto Sans", "DejaVu Sans",
  "Liberation Sans", "Tahoma", "Verdana", "Trebuchet MS",
  "Times New Roman", "Georgia", "Palatino", "Garamond",
  "Courier New", "Menlo", "Monaco", "Consolas", "Lucida Console",
  "Apple Color Emoji", "Segoe UI Emoji"
];

async function loadFonts() {
  try {
    const fonts: { family: string }[] | undefined = await (window as any).queryLocalFonts?.();
    if (fonts) {
      const families = [...new Set(fonts.map((f: any) => f.family))];
      availableFonts.value = [DEFAULT_FONT, ...families.sort()];
      return;
    }
  } catch { /* fallback */ }
  availableFonts.value = [DEFAULT_FONT, ...FALLBACK_FONTS];
}

function applyFont(font: string) {
  if (font === DEFAULT_FONT) {
    document.documentElement.style.removeProperty("--app-font");
  } else {
    document.documentElement.style.setProperty("--app-font", `"${font}"`);
  }
}

watch(selectedFont, (val) => applyFont(val));

function resetFont() {
  selectedFont.value = DEFAULT_FONT;
}

function getFontStyle(f: string) {
  return f !== DEFAULT_FONT ? { fontFamily: `"${f}"` } : {};
}

interface JavaInstall {
  path: string;
  version: string;
}

const javaInstalls = ref<JavaInstall[]>([]);
const javaLoading = ref(false);
const javaError = ref("");
const javaExpanded = ref(true);

interface SystemMemory {
  total_mb: number;
  used_mb: number;
}

const sysMem = ref<SystemMemory>({ total_mb: 0, used_mb: 0 });
const autoMem = ref(true);

const usedPercent = computed(() => {
  if (sysMem.value.total_mb === 0) return 0;
  return Math.round((sysMem.value.used_mb / sysMem.value.total_mb) * 100);
});

const freePercent = computed(() => {
  return Math.max(0, 100 - usedPercent.value);
});

function cleanVersion(raw: string): string {
  const m = raw.match(/"([^"]+)"/);
  return m ? m[1] : raw;
}

async function fetchJavaVersions() {
  javaLoading.value = true;
  javaError.value = "";
  try {
    javaInstalls.value = await invoke<JavaInstall[]>("get_java_versions");
  } catch (e: any) {
    javaError.value = String(e);
  } finally {
    javaLoading.value = false;
  }
}

function onDocMouseDown(e: MouseEvent) {
  if (fontDropdownOpen.value && fontSelectRef.value && !fontSelectRef.value.contains(e.target as Node)) {
    fontDropdownOpen.value = false;
  }
}

onMounted(() => {
  loadFonts();
  fetchJavaVersions();
  invoke<SystemMemory>("get_system_memory").then((m) => { sysMem.value = m; }).catch(() => {});
  document.addEventListener("mousedown", onDocMouseDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDocMouseDown);
});
</script>

<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-window">
      <div class="settings-header">
        <div class="settings-header-left">
          <span class="settings-icon-wrap">
            <Settings :size="16" class="settings-icon" />
          </span>
          <span class="settings-title">{{ t("app.mainwindow.settings.title") }}</span>
        </div>
        <button class="settings-close" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-body">
        <nav class="settings-nav">
          <button
            class="settings-nav-item"
            :class="{ active: activeSetting === 'java-runtime' }"
            @click="activeSetting = 'java-runtime'"
          >
            <Coffee :size="18" />
            <span>{{ t("app.mainwindow.settings.java-runtime") }}</span>
          </button>
          <div class="settings-nav-divider"></div>
          <button
            class="settings-nav-item"
            :class="{ active: activeSetting === 'appearance' }"
            @click="activeSetting = 'appearance'"
          >
            <Palette :size="18" />
            <span>{{ t("app.mainwindow.settings.appearance") }}</span>
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSetting === 'ui-layout' }"
            @click="activeSetting = 'ui-layout'"
          >
            <Table2 :size="18" />
            <span>UI 布局</span>
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSetting === 'language' }"
            @click="activeSetting = 'language'"
          >
            <Globe :size="18" />
            <span>{{ t("app.mainwindow.settings.language") }}</span>
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSetting === 'about' }"
            @click="activeSetting = 'about'"
          >
            <Info :size="18" />
            <span>{{ t("app.mainwindow.settings.about") }}</span>
          </button>
        </nav>
        <div class="settings-content">
          <div v-if="activeSetting === 'java-runtime'" class="setting-panel">
            <div class="expander-group">
              <div class="expander-header" @click="javaExpanded = !javaExpanded">
                <div class="setting-card-info">
                  <label class="setting-label">Java 运行环境</label>
                  <span class="setting-desc">检测到的 Java 安装</span>
                </div>
                <div class="expander-right">
                  <button class="refresh-btn" @click.stop="fetchJavaVersions" :disabled="javaLoading">
                      <RefreshCw v-if="javaLoading" :size="14" class="spinner" />
                      <span v-else>刷新</span>
                  </button>
                  <ChevronDown :size="18" class="expander-chevron" :class="{ expanded: javaExpanded }" />
                </div>
              </div>
              <Transition name="expander">
                <div v-if="javaExpanded" class="expander-body">
                  <div v-if="javaError" class="java-error">{{ javaError }}</div>
                  <div v-if="javaInstalls.length === 0 && !javaLoading && !javaError" class="java-empty">
                    未检测到 Java 安装
                  </div>
                  <div v-for="(jv, idx) in javaInstalls" :key="jv.path" class="java-item" :class="{ last: idx === javaInstalls.length - 1 }">
                    <div class="java-item-divider"></div>
                    <span class="java-item-version">{{ cleanVersion(jv.version) }}</span>
                    <span class="java-item-path">{{ jv.path }}</span>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="expander-group">
              <div class="expander-header">
                <div class="setting-card-info">
                  <label class="setting-label">游戏运行分配</label>
                  <span class="setting-desc">设置 Minecraft 实例可运行的运存容量</span>
                </div>
              </div>
              <div class="expander-body">
                  <div class="mem-item">
                    <div class="mem-item-row">
                      <div class="mem-item-info">
                        <span class="mem-item-label">自动分配</span>
                        <span class="mem-item-desc">根据计算机已用运行内存情况分配</span>
                      </div>
                      <label class="switch">
                        <input type="checkbox" v-model="autoMem" />
                        <span class="switch-slider"></span>
                      </label>
                    </div>
                  </div>
                  <div class="mem-item">
                    <div class="mem-slider">
                      <div class="mem-slider-bar">
                        <div class="mem-slider-segment mem-slider-used" :style="{ width: usedPercent + '%' }"></div>
                        <div class="mem-slider-segment mem-slider-free" :style="{ width: freePercent + '%' }"></div>
                      </div>
                    </div>
                    <span class="mem-status">您的计算机一共有 {{ sysMem.total_mb }} MB，已经用了 {{ sysMem.used_mb }} MB</span>
                  </div>
                </div>
            </div>
          </div>
          <div v-if="activeSetting === 'appearance'" class="setting-panel">
            <div class="setting-card">
              <div class="setting-card-info">
                <label class="setting-label">{{ t("app.mainwindow.settings.appearance.theme") }}</label>
                <span class="setting-desc">{{ t("app.mainwindow.settings.appearance.theme.desc") }}</span>
              </div>
              <div class="custom-select">
                <select v-model="currentTheme">
                  <option value="system">{{ t("app.mainwindow.settings.appearance.theme.system") }}</option>
                  <option value="light">{{ t("app.mainwindow.settings.appearance.theme.light") }}</option>
                  <option value="dark">{{ t("app.mainwindow.settings.appearance.theme.dark") }}</option>
                </select>
                <span class="select-arrow">
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
            <div class="setting-card">
              <div class="setting-card-info">
                <label class="setting-label">{{ t("app.mainwindow.settings.appearance.font") }}</label>
                <span class="setting-desc">{{ t("app.mainwindow.settings.appearance.font.desc") }}</span>
              </div>
              <div class="font-select-group">
                <div class="custom-select" ref="fontSelectRef">
                  <button class="font-select-trigger" @click.stop="fontDropdownOpen = !fontDropdownOpen">
                    <span class="font-select-text">{{ selectedFont === DEFAULT_FONT ? t("app.mainwindow.settings.appearance.font.default") : selectedFont }}</span>
                  </button>
                  <span class="select-arrow">
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <div v-if="fontDropdownOpen" class="font-dropdown">
                    <button
                      v-for="f in availableFonts"
                      :key="f"
                      class="font-option"
                      :class="{ active: f === selectedFont }"
                      :style="getFontStyle(f)"
                      @click="selectedFont = f; fontDropdownOpen = false"
                    >{{ f === DEFAULT_FONT ? t("app.mainwindow.settings.appearance.font.default") : f }}</button>
                  </div>
                </div>
                <button v-if="fontChanged" class="reset-btn" @click="resetFont">{{ t("app.mainwindow.settings.appearance.font.reset") }}</button>
              </div>
            </div>
            <div class="setting-card bg-card-col">
              <div class="setting-card-info">
                <label class="setting-label">背景</label>
                <span class="setting-desc">选择窗口背景图像</span>
              </div>
              <div class="bg-gallery">
                <div class="bg-card" :class="{ active: currentBg === 'none' }" @click="currentBg = 'none'">
                  <div class="bg-preview none-preview"><span>无</span></div>
                  <span class="bg-name">无</span>
                </div>
                <div class="bg-card" :class="{ active: currentBg === 'default1' }" @click="currentBg = 'default1'">
                  <div class="bg-preview"><img :src="default1Bg" alt="Default 1" /></div>
                  <span class="bg-name">Default 1</span>
                </div>
                <div v-for="cbg in customBgs" :key="cbg.path" class="bg-card" :class="{ active: currentBg === 'custom:' + cbg.path }" @click="currentBg = 'custom:' + cbg.path">
                  <div class="bg-preview"><img :src="customBgPreviews[cbg.path]" :alt="cbg.name" /></div>
                  <span class="bg-name">{{ cbg.name }}</span>
                </div>
                <div class="bg-card upload-card" @click="uploadBg">
                  <div class="bg-preview">                  <Upload :size="24" /></div>
                  <span class="bg-name">上传</span>
                </div>
              </div>
            </div>
            <div class="setting-card">
              <div class="setting-card-info">
                <label class="setting-label">背景模糊</label>
                <span class="setting-desc">调整高斯模糊程度（0–20px）</span>
              </div>
              <div class="blur-control">
                <input type="range" v-model.number="bgBlur" min="0" max="20" step="1" class="blur-slider" />
                <span class="blur-value">{{ bgBlur }}px</span>
              </div>
            </div>
          </div>
          <div v-if="activeSetting === 'ui-layout'" class="setting-panel">
            <div class="setting-card">
              <div class="setting-card-info">
                <label class="setting-label">UI 布局</label>
                <span class="setting-desc">选择要使用的界面布局</span>
              </div>
              <div class="ui-layout-options">
                <label class="switch">
                  <input type="checkbox" v-model="useFullscreenUI" />
                  <span class="switch-slider"></span>
                </label>
                <div class="ui-layout-texts">
                  <span class="ui-layout-option" :class="{ active: !useFullscreenUI }">传统 UI（侧边导航栏 UI）</span>
                  <span class="ui-layout-option" :class="{ active: useFullscreenUI }">大屏幕 UI</span>
                  <span v-if="useFullscreenUI" class="ui-layout-hint">此 UI 将会在启动全屏模式后自动切换</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="activeSetting === 'language'" class="setting-panel">
            <div class="setting-card">
              <div class="setting-card-info">
                <label class="setting-label">{{ t("app.mainwindow.settings.language") }}</label>
                <span class="setting-desc">{{ t("app.mainwindow.settings.language.desc") }}</span>
              </div>
              <div class="custom-select">
                <select v-model="currentLang">
                  <option value="system">{{ t("app.lang.system") }}</option>
                  <option value="zh_cn">{{ t("app.lang.zh_cn") }}</option>
                  <option value="ko_kr">{{ t("app.lang.ko_kr") }}</option>
                  <option value="en_us">{{ t("app.lang.en_us") }}</option>
                  <option value="fr">{{ t("app.lang.fr") }}</option>
                  <option value="ru">{{ t("app.lang.ru") }}</option>
                  <option value="vi">{{ t("app.lang.vi") }}</option>
                </select>
                <span class="select-arrow">
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
            <p class="language-notice">{{ t("app.mainwindow.settings.languageNotice") }}</p>
          </div>
          <div v-if="activeSetting === 'about'" class="setting-panel about-panel">
            <div class="setting-card about-card" :style="{ '--about-bg': `url(${default1Bg})` }">
              <img :src="logo" class="about-logo" />
              <span class="about-name">Firefly Launcher</span>
              <span class="about-version">版本 1.11.0</span>
            </div>
            <div class="setting-card license-card">
              <span class="license-icon"><Landmark :size="24" /></span>
              <div class="license-text">
                <span class="license-sub">Copyright(c) 2026  HGSpace Studio</span>
                <span class="license-main">本应用使用GNU General Public License v3.0 进行开源</span>
              </div>
              <button class="license-btn" @click="openUrl('https://github.com/HGSpace-Studio/Firefly-Launcher')">GitHub 仓库</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  top: 30px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: fadeIn 0.2s ease;
}

.settings-window {
  display: flex;
  flex-direction: column;
  width: 780px;
  height: 580px;
  background: var(--content-bg);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  padding: 16px 24px 20px;
  overflow: visible;
  animation: slideUp 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -24px 16px -24px;
  padding: 0 24px;
  color: var(--title-color);
}

.settings-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #0078d4;
  flex-shrink: 0;
}

.settings-icon {
  color: #fff;
}

.settings-title {
  font-size: 14px;
  font-weight: 600;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--title-color);
  transition: background 0.15s;
  margin-right: -12px;
}

.settings-close:hover {
  background: rgba(128, 128, 128, 0.15);
}

.settings-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 0 -24px 20px -24px;
}

.settings-body {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  padding-right: 16px;
  box-sizing: border-box;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  text-align: left;
  transition: background 0.15s;
}

.settings-nav-item:hover {
  background: rgba(128, 128, 128, 0.1);
}

.settings-nav-item.active {
  background: #00BAAD;
  color: #fff;
}

.settings-nav-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 6px 12px;
}

.settings-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.setting-panel {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 4px;
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--panel-bg);
  border-radius: 10px;
}

.setting-card.bg-card-col {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.setting-card-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--title-color);
  opacity: 0.8;
}

.setting-desc {
  font-size: 11px;
  opacity: 0.5;
  color: var(--title-color);
}

.custom-select {
  position: relative;
  width: 200px;
}

.custom-select select {
  appearance: none;
  width: 100%;
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.custom-select select:hover {
  border-color: rgba(128, 128, 128, 0.4);
}

.custom-select select:focus {
  border-color: var(--title-color);
}

.custom-select select option {
  background: var(--panel-bg);
  color: var(--title-color);
}

.select-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--title-color);
  opacity: 0.6;
}

.font-select-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.font-select-trigger {
  width: 100%;
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
  text-align: left;
}

.font-select-trigger:hover {
  border-color: rgba(128, 128, 128, 0.4);
}

.font-select-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.font-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  z-index: 60;
}

.font-option {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  color: var(--title-color);
  transition: background 0.1s;
}

.font-option:hover {
  background: rgba(128, 128, 128, 0.12);
}

.font-option.active {
  background: var(--sidebar-active);
  color: var(--sidebar-active-color);
}

.reset-btn {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--sidebar-active-color);
  white-space: nowrap;
  transition: background 0.15s;
}

.reset-btn:hover {
  background: var(--sidebar-active);
}

.language-notice {
  font-size: 11px;
  line-height: 1.5;
  color: var(--title-color);
  opacity: 0.5;
  padding: 0 4px;
  margin: 0;
}

.ui-layout-options {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.ui-layout-texts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ui-layout-option {
  font-size: 13px;
  color: var(--title-color);
}

.ui-layout-option.active {
  color: var(--accent-color, #0078d4);
  font-weight: 500;
}

.ui-layout-hint {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.5;
  line-height: 1.4;
}

.bg-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  width: 100%;
}

.bg-card {
  border-radius: 10px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
  overflow: hidden;
}

.bg-card:hover {
  border-color: rgba(128,128,128,0.3);
}

.bg-card.active {
  border-color: #0078d4;
}

.bg-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: rgba(128,128,128,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px 6px 0 0;
}

.bg-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bg-preview.none-preview {
  font-size: 14px;
  color: var(--title-color);
  opacity: 0.35;
}

.bg-name {
  display: block;
  padding: 6px 8px;
  font-size: 12px;
  text-align: center;
  color: var(--title-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-card .bg-preview {
  color: var(--title-color);
  opacity: 0.35;
  font-size: 24px;
}

.upload-card:hover .bg-preview {
  opacity: 0.7;
}

.blur-control {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 180px;
}

.blur-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(128,128,128,0.2);
  outline: none;
  cursor: pointer;
}

.blur-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sidebar-active-color);
  border: 2px solid var(--panel-bg);
  cursor: pointer;
  transition: transform 0.15s;
}

.blur-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.blur-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
  min-width: 36px;
  text-align: right;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: var(--sidebar-active-color);
  transition: background 0.15s;
  flex-shrink: 0;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--sidebar-active);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.expander-group {
  background: var(--panel-bg);
  border-radius: 10px;
  overflow: hidden;
}

.expander-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
}

.expander-header:active {
  opacity: 0.8;
}

.expander-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.expander-chevron {
  color: var(--title-color);
  opacity: 0.4;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expander-chevron.expanded {
  transform: rotate(180deg);
}

.expander-body {
  display: flex;
  flex-direction: column;
}

.expander-enter-active,
.expander-leave-active {
  transition: opacity 0.2s ease;
}

.expander-enter-from,
.expander-leave-to {
  opacity: 0;
}

.java-error {
  font-size: 12px;
  color: #e74c3c;
  padding: 8px 16px;
  opacity: 0.8;
}

.java-empty {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.45;
  padding: 16px;
  text-align: center;
}

.java-item {
  padding: 6px 16px;
}

.java-item.last {
  border-radius: 0 0 10px 10px;
  padding-bottom: 8px;
}

.java-item-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.15);
  margin: 0 -16px 6px;
}

.java-item-version {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.java-item-path {
  display: block;
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.5;
  line-height: 1;
  word-break: break-all;
  margin-top: 2px;
}

.mem-item {
  padding: 12px 16px;
}

.mem-item-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.15);
  margin: 0 -16px 6px;
}

.mem-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mem-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mem-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--title-color);
  line-height: 1.2;
}

.mem-item-desc {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.5;
  line-height: 1;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  inset: 0;
  background: rgba(128, 128, 128, 0.3);
  border-radius: 11px;
  cursor: pointer;
  transition: background 0.2s;
}

.switch-slider::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.switch input:checked + .switch-slider {
  background: #0078d4;
}

.switch input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.mem-slider {
  padding: 0 0 6px;
  margin-top: 3px;
}

.mem-slider-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.15);
}

.mem-slider-segment {
  transition: width 0.3s ease;
}

.mem-slider-used {
  background: #0078d4;
}

.mem-slider-free {
  background: rgba(128, 128, 128, 0.2);
}

.mem-status {
  display: block;
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
  padding-bottom: 8px;
}

.about-panel {
  gap: 0;
}

.about-card {
  position: relative;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  background: linear-gradient(45deg, var(--panel-bg) 0%, var(--panel-bg) 35%, transparent 70%);
  border: none;
  overflow: hidden;
  isolation: isolate;
}

.about-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--about-bg) center / cover;
  z-index: -1;
  transition: transform 0.3s ease;
}

.about-card:hover::before {
  transform: scale(1.05);
}

.about-logo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  flex-shrink: 0;
  margin-bottom: 5px;
}

.about-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--title-color);
}

.about-version {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.6;
}

.license-card {
  margin-top: 7px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
}

.license-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(128,128,128,0.08);
  color: var(--title-color);
  opacity: 0.6;
  flex-shrink: 0;
}

.license-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.license-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1.3;
}

.license-main {
  font-size: 14px;
  font-weight: 700;
  color: var(--title-color);
  line-height: 1.3;
}

.license-btn {
  flex-shrink: 0;
  margin-left: auto;
  padding: 8px 14px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.license-btn:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.12);
}

</style>
