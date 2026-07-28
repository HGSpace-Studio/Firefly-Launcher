<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { message } from "@tauri-apps/plugin-dialog";
import { useI18n } from "vue-i18n";
import { getSystemLocale } from "../../../i18n";
import { Globe, Palette, Coffee, User, CheckCircle, X, ChevronRight, ChevronLeft, RefreshCw, MoreHorizontal, RefreshCcw, Download } from "@lucide/vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import steveAvatar from "../../../assets/imgs/skins/avator/steve.png";
import alexAvatar from "../../../assets/imgs/skins/avator/alex.png";

const { t, locale } = useI18n();

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

const appWindow = getCurrentWindow();
const activeTab = ref(0);
const settings = ref<OobeSettings>({
  locale: "system",
  theme: "system",
  font: "__system_default__",
  javaPath: "",
  accountType: "offline",
  accountName: "",
  oobeCompleted: false,
});
const initialized = ref(false);
const showExitDialog = ref(false);
const langDropdownOpen = ref(false);
const langDropdownRef = ref<HTMLElement | null>(null);
const themeDropdownOpen = ref(false);
const themeDropdownRef = ref<HTMLElement | null>(null);

watch(langDropdownOpen, async (open) => {
  if (open) {
    await nextTick();
    const el = langDropdownRef.value;
    if (!el) return;
    const selected = el.querySelector<HTMLElement>(".combo-option.selected");
    if (selected) {
      el.scrollTo({ top: selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2, behavior: "smooth" });
    }
  } else {
    await nextTick();
    langDropdownRef.value?.scrollTo({ top: 0, behavior: "smooth" });
  }
});

watch(themeDropdownOpen, async (open) => {
  if (open) {
    await nextTick();
    const el = themeDropdownRef.value;
    if (!el) return;
    const selected = el.querySelector<HTMLElement>(".combo-option.selected");
    if (selected) {
      el.scrollTo({ top: selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2, behavior: "smooth" });
    }
  } else {
    await nextTick();
    themeDropdownRef.value?.scrollTo({ top: 0, behavior: "smooth" });
  }
});

const tabs = [
  { id: "language", label: "语言", icon: Globe },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "java", label: "Java JRE", icon: Coffee },
  { id: "account", label: "账户", icon: User },
  { id: "complete", label: "完成", icon: CheckCircle },
];

const isLastTab = computed(() => activeTab.value === tabs.length - 1);
const isFirstTab = computed(() => activeTab.value === 0);
const accountMissing = computed(() => {
  if (activeTab.value !== 3) return false;
  return !settings.value.accountName && settings.value.accountType !== "microsoft";
});

const javaManualPath = ref("");
const javaDetecting = ref(false);
const javaList = ref<JavaInstall[]>([]);

const accountName = ref("");

const localeOptions = [
  { value: "system", labelKey: "app.lang.system" },
  { value: "zh_cn", labelKey: "app.lang.zh_cn" },
  { value: "en_us", labelKey: "app.lang.en_us" },
  { value: "ko_kr", labelKey: "app.lang.ko_kr" },
  { value: "fr", labelKey: "app.lang.fr" },
  { value: "ru", labelKey: "app.lang.ru" },
  { value: "vi", labelKey: "app.lang.vi" },
];

const themeOptions = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
];

function onLocaleChange(val: string) {
  settings.value.locale = val;
  locale.value = val === "system" ? getSystemLocale() : val;
}

function onThemeChange(val: string) {
  settings.value.theme = val;
  if (val === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", val);
  }
}

async function detectJava() {
  javaDetecting.value = true;
  try {
    const list = await invoke<JavaInstall[]>("get_java_versions");
    javaList.value = list;
    if (list.length > 0) {
      javaManualPath.value = list[0].path;
      settings.value.javaPath = list[0].path;
    }
  } catch (e) {
    console.error("Java detection failed:", e);
  }
  javaDetecting.value = false;
}

function selectJava(j: JavaInstall) {
  javaManualPath.value = j.path;
  settings.value.javaPath = j.path;
}

function onAccountTypeChange(type: string) {
  settings.value.accountType = type;
}

const showOfflineDialog = ref(false);
const offlineNameInput = ref("");
const avatars = [steveAvatar, alexAvatar];
const currentAvatar = ref(avatars[Math.floor(Math.random() * avatars.length)]);

function onAvatarInput() {
  currentAvatar.value = avatars[Math.floor(Math.random() * avatars.length)];
}

function openOfflineDialog() {
  offlineNameInput.value = settings.value.accountName || "";
  showOfflineDialog.value = true;
}

function confirmOfflineName() {
  const name = offlineNameInput.value.trim();
  if (name) {
    settings.value.accountName = name;
    accountName.value = name;
  }
  settings.value.accountType = "offline";
  showOfflineDialog.value = false;
}

async function completeSetup() {
  settings.value.oobeCompleted = true;
  await invoke("finish_oobe", { settings: settings.value });
}

function goNext() {
  if (activeTab.value < tabs.length - 1) {
    activeTab.value++;
  } else {
    completeSetup();
  }
}

function goPrev() {
  if (activeTab.value > 0) {
    activeTab.value--;
  }
}

function requestExit() {
  showExitDialog.value = true;
}

async function confirmExit() {
  showExitDialog.value = false;
  unlistenClose?.();
  await invoke("rollback_oobe");
  await appWindow.close();
}

function cancelExit() {
  showExitDialog.value = false;
}

let unlistenClose: (() => void) | null = null;

onMounted(async () => {
  await message("您正在使用测试版本的Firefiles Launcher，一部分功能的工作可能会异常，也有一些未完工的功能，我们都将在以后的版本中完善它们。", {
    title: "开发版本声明",
    kind: "info",
  });

  try {
    settings.value = await invoke<OobeSettings>("init_oobe_environment");
    initialized.value = true;
  } catch (e) {
    console.error("Failed to init OOBE environment:", e);
  }

  detectJava();

  unlistenClose = await listen<string>("tauri://close-requested", () => {
    if (!settings.value.oobeCompleted) {
      requestExit();
    }
  });
});

onUnmounted(() => {
  unlistenClose?.();
});
</script>

<template>
  <div class="oobe-overlay">
    <div class="oobe-window">
      <div class="oobe-header">
        <div class="tabview">
          <button
            v-for="(tab, idx) in tabs"
            :key="tab.id"
            class="tab-item"
            :class="{ active: activeTab === idx }"
          >
            <component :is="tab.icon" :size="14" class="tab-icon" />
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <div class="oobe-body">
        <div v-if="!initialized" class="loading-state">
          <RefreshCw :size="24" class="spinner" />
          <span>初始化中...</span>
        </div>

        <template v-else>
          <!-- 语言 -->
          <div v-show="activeTab === 0" class="tab-content lang-content">
            <div class="lang-center">
              <Globe :size="28" class="lang-icon" />
              <div class="section-title">选择语言</div>
              <div class="section-desc">选择应用的显示语言</div>
              <div class="lang-combobox">
                <button class="combo-trigger" @click="langDropdownOpen = !langDropdownOpen">
                  <span class="combo-label">{{ t(localeOptions.find(o => o.value === settings.locale)?.labelKey || 'app.lang.system') }}</span>
                  <svg :class="['combo-arrow', { open: langDropdownOpen }]" width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <Transition name="dropdown">
                  <div v-if="langDropdownOpen" ref="langDropdownRef" class="combo-dropdown">
                    <button
                      v-for="opt in localeOptions"
                      :key="opt.value"
                      class="combo-option"
                      :class="{ selected: settings.locale === opt.value }"
                      @click="onLocaleChange(opt.value); langDropdownOpen = false"
                    >
                      <span class="combo-option-label">{{ t(opt.labelKey) }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- 外观 -->
          <div v-show="activeTab === 1" class="tab-content lang-content">
            <div class="lang-center">
              <Palette :size="28" class="lang-icon" />
              <div class="section-title">选择外观</div>
              <div class="section-desc">选择应用的明暗主题</div>
              <div class="lang-combobox">
                <button class="combo-trigger" @click="themeDropdownOpen = !themeDropdownOpen">
                  <span class="combo-label">{{ themeOptions.find(o => o.value === settings.theme)?.label }}</span>
                  <svg :class="['combo-arrow', { open: themeDropdownOpen }]" width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <Transition name="dropdown">
                  <div v-if="themeDropdownOpen" ref="themeDropdownRef" class="combo-dropdown">
                    <button
                      v-for="opt in themeOptions"
                      :key="opt.value"
                      class="combo-option"
                      :class="{ selected: settings.theme === opt.value }"
                      @click="onThemeChange(opt.value); themeDropdownOpen = false"
                    >
                      <span class="combo-option-label">{{ opt.label }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- Java JRE -->
          <div v-show="activeTab === 2" class="tab-content java-content">
            <div class="java-sidebar">
              <Coffee :size="64" class="java-big-icon" />
            </div>
            <div class="java-main">
              <div class="java-main-header">
                <div class="section-title">Java 运行时</div>
                <div class="section-desc">选择 Java 路径或自动检测</div>
              </div>
              <div class="java-list">
                <div v-if="javaDetecting" class="java-list-loading">
                  <RefreshCw :size="16" class="spinner" />
                  <span>检测中...</span>
                </div>
                <button
                  v-for="j in javaList"
                  :key="j.path"
                  class="java-item"
                  :class="{ selected: settings.javaPath === j.path }"
                  @click="selectJava(j)"
                >
                  <div class="java-item-version">{{ j.version }}</div>
                  <div class="java-item-path">{{ j.path }}</div>
                </button>
                <div v-if="!javaDetecting && javaList.length === 0" class="java-list-empty">
                  <span>未检测到 Java 运行时</span>
                </div>
              </div>
              <div class="input-group">
                <span class="input-label">或手动输入 Java 路径</span>
                <input
                  v-model="javaManualPath"
                  class="text-input"
                  placeholder="/usr/bin/java"
                  @input="settings.javaPath = javaManualPath"
                />
              </div>
            </div>
          </div>

          <!-- 账户 -->
          <div v-show="activeTab === 3" class="tab-content lang-content">
            <div class="lang-center">
              <User :size="28" class="lang-icon" />
              <div class="section-title">账户设置</div>
              <div class="section-desc">选择登录方式</div>
              <div class="account-cards">
                <button
                  class="account-card"
                  :class="{ selected: settings.accountType === 'microsoft' }"
                  @click="onAccountTypeChange('microsoft')"
                >
                  <User :size="24" class="account-card-icon" />
                  <div class="account-card-text">
                    <span class="account-card-header">微软账户</span>
                    <span class="account-card-desc">如果您有正版 Minecraft，可点击此处以继续</span>
                  </div>
                </button>
                <button class="account-card disabled-card">
                  <MoreHorizontal :size="24" class="account-card-icon" />
                  <div class="account-card-text">
                    <span class="account-card-header">第三方登录</span>
                    <span class="account-card-desc">通过其他的第三方认证服务以继续</span>
                  </div>
                </button>
                <button
                  class="account-card"
                  :class="{ selected: settings.accountType === 'offline' }"
                  @click="openOfflineDialog"
                >
                  <Globe :size="24" class="account-card-icon" />
                  <div class="account-card-text">
                    <span class="account-card-header">我没有正版 Minecraft</span>
                    <span class="account-card-desc">点击以创建离线账号</span>
                  </div>
                </button>
              </div>
              <div v-if="settings.accountType === 'offline' && accountName" class="account-greeting">
                您好，{{ accountName }}
              </div>
              <div v-if="settings.accountType === 'microsoft'" class="input-group">
                <span class="input-label">Microsoft 账户将在首次启动时登录</span>
              </div>
            </div>
          </div>

          <!-- 完成 -->
          <div v-show="activeTab === 4" class="tab-content lang-content">
            <div class="finish-center">
              <CheckCircle :size="28" class="lang-icon" />
              <div class="section-title">设置完成</div>
              <div class="section-desc">现在您可以进行以下操作</div>
              <div class="finish-cards">
                <button class="finish-card" @click="openUrl('https://github.com/HGSpace-Studio/FirefileLauncher')">
                  <RefreshCcw :size="24" class="finish-card-icon" />
                  <div class="finish-card-text">
                    <span class="finish-card-header">GitHub 仓库</span>
                    <span class="finish-card-desc">查看本应用的开源代码</span>
                  </div>
                </button>
                <button class="finish-card">
                  <Download :size="24" class="finish-card-icon" />
                  <div class="finish-card-text">
                    <span class="finish-card-header">创建第一个 MC 实例</span>
                    <span class="finish-card-desc">获取最新版 Minecraft</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="oobe-footer">
        <button v-if="!isFirstTab" class="nav-btn prev" @click="goPrev">
          <ChevronLeft :size="16" />
          <span>上一步</span>
        </button>
        <div v-else class="nav-btn-placeholder"></div>
        <button v-if="isLastTab" class="nav-btn complete" :disabled="accountMissing" @click="completeSetup">
          <CheckCircle :size="16" />
          <span>我什么都不需要，继续</span>
        </button>
        <button v-else class="nav-btn next" :disabled="accountMissing" @click="goNext">
          <span>下一步</span>
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <!-- 退出挽留 Dialog -->
    <Transition name="dialog">
      <div v-if="showExitDialog" class="dialog-overlay" @click.self="cancelExit">
        <div class="dialog-box">
          <div class="dialog-header">
            <X :size="18" class="dialog-close" @click="cancelExit" />
          </div>
          <div class="dialog-body">
            <div class="dialog-icon">
              <Coffee :size="32" />
            </div>
            <div class="dialog-title">还未完成设置</div>
            <div class="dialog-desc">
              您尚未完成初始化设置，确定要退出吗？<br />
              退出后将清除所有已配置的内容。
            </div>
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn cancel" @click="cancelExit">取消</button>
            <button class="dialog-btn confirm" @click="confirmExit">确认退出</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 离线用户名 Dialog -->
    <Transition name="dialog">
      <div v-if="showOfflineDialog" class="dialog-overlay" @click.self="showOfflineDialog = false">
        <div class="dialog-box">
          <div class="dialog-header">
            <X :size="18" class="dialog-close" @click="showOfflineDialog = false" />
          </div>
          <div class="dialog-body">
            <div class="dialog-icon">
              <User :size="32" />
            </div>
            <div class="dialog-title">创建离线账号</div>
            <div class="dialog-desc">输入您的玩家名称以继续</div>
            <div class="dialog-input-wrap">
              <img :src="currentAvatar" class="dialog-avatar" />
              <input
                v-model="offlineNameInput"
                class="dialog-input"
                placeholder="Steve"
                maxlength="16"
                @input="onAvatarInput"
                @keyup.enter="confirmOfflineName"
              />
            </div>
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn cancel" @click="showOfflineDialog = false">取消</button>
            <button class="dialog-btn accent" :disabled="!offlineNameInput.trim()" @click="confirmOfflineName">确认</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.oobe-overlay {
  position: fixed;
  inset: 0;
  background: var(--content-bg, #1c1c1e);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.oobe-window {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--content-bg, #1c1c1e);
  overflow: hidden;
}

.oobe-header {
  display: flex;
  justify-content: center;
  padding: 33px 0 8px;
}

.tabview {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  padding: 3px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color, #f5f5f7);
  opacity: 0.5;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: all 0.15s;
  white-space: nowrap;
}

.tab-item.active {
  opacity: 1;
  background: var(--content-bg, #1c1c1e);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tab-item:hover:not(.active) {
  opacity: 0.7;
}

.tab-icon {
  flex-shrink: 0;
}

.oobe-body {
  flex: 1;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--title-color, #f5f5f7);
  font-size: 14px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.java-content {
  flex-direction: row;
  gap: 20px;
  align-items: stretch;
  flex: 1;
}

.java-sidebar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.java-big-icon {
  opacity: 0.2;
  color: var(--title-color, #f5f5f7);
}

.java-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.java-main-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.java-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.java-list-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  font-size: 13px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.5;
}

.java-list-empty {
  padding: 12px;
  font-size: 13px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.4;
  text-align: center;
}

.java-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}

.java-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.java-item.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.java-item-version {
  font-size: 13px;
  font-weight: 500;
  color: var(--title-color, #f5f5f7);
}

.java-item-path {
  font-size: 11px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--title-color, #f5f5f7);
}

.section-desc {
  font-size: 13px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.5;
  margin-bottom: 4px;
}

/* Language combobox */
.lang-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.lang-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.lang-icon {
  opacity: 0.35;
  margin-bottom: 4px;
  color: var(--title-color, #f5f5f7);
}

.lang-center .section-desc {
  margin-bottom: 12px;
}

.lang-combobox {
  position: relative;
  width: 220px;
}

.combo-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.15);
  color: var(--title-color, #f5f5f7);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s;
}

.combo-trigger:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.combo-arrow {
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform 0.2s;
}

.combo-arrow.open {
  transform: rotate(180deg);
}

.combo-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  background: var(--content-bg, #1c1c1e);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  z-index: 10;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.combo-option {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 9px 14px;
  border: none;
  background: transparent;
  color: var(--title-color, #f5f5f7);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s;
}

.combo-option:hover {
  background: rgba(255, 255, 255, 0.05);
}

.combo-option.selected {
  color: var(--sidebar-active-color, #60a5fa);
  background: rgba(59, 130, 246, 0.1);
}

.combo-option-label {
  font-size: 13px;
}

.account-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 360px;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}

.account-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
}

.account-card.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.account-card.disabled-card {
  opacity: 0.35;
  cursor: not-allowed;
}

.account-card-icon {
  flex-shrink: 0;
  color: var(--title-color, #f5f5f7);
  opacity: 0.5;
}

.account-card.selected .account-card-icon {
  color: var(--sidebar-active-color, #60a5fa);
  opacity: 1;
}

.account-card-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.account-card-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--title-color, #f5f5f7);
}

.account-card-desc {
  font-size: 11px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.45;
  line-height: 1.3;
}

.account-greeting {
  margin-top: 16px;
  font-size: 14px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.8;
  text-align: center;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.detect-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: transparent;
  color: var(--title-color, #f5f5f7);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}

.detect-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.detect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 12px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.6;
}

.text-input {
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
  color: var(--title-color, #f5f5f7);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.text-input:focus {
  border-color: var(--title-color);
}

.finish-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.finish-cards {
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-top: 4px;
}

.finish-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: 200px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  transition: all 0.15s;
}

.finish-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
}

.finish-card-icon {
  flex-shrink: 0;
  color: var(--title-color, #f5f5f7);
  opacity: 0.4;
}

.finish-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.finish-card-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--title-color, #f5f5f7);
}

.finish-card-desc {
  font-size: 11px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.45;
  line-height: 1.3;
}

.oobe-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 16px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: transparent;
  color: var(--title-color, #f5f5f7);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.nav-btn.complete {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: var(--sidebar-active-color, #60a5fa);
}

.nav-btn.complete:hover {
  background: rgba(59, 130, 246, 0.3);
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.nav-btn:disabled:hover {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.08);
}

.nav-btn-placeholder {
  width: 1px;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog-box {
  width: 360px;
  background: var(--panel-bg, #2d2d2d);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: flex-end;
  padding: 8px 8px 0;
}

.dialog-close {
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--title-color, #f5f5f7);
  opacity: 0.5;
  transition: opacity 0.15s;
}

.dialog-close:hover {
  opacity: 1;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 24px 20px;
  text-align: center;
  gap: 8px;
}

.dialog-icon {
  opacity: 0.4;
  color: var(--title-color, #f5f5f7);
}

.dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--title-color, #f5f5f7);
}

.dialog-desc {
  font-size: 12px;
  color: var(--title-color, #f5f5f7);
  opacity: 0.6;
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  gap: 8px;
  padding: 0 24px 20px;
  justify-content: center;
}

.dialog-btn {
  flex: 1;
  padding: 8px 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: transparent;
  color: var(--title-color, #f5f5f7);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}

.dialog-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dialog-btn.confirm {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.dialog-btn.confirm:hover {
  background: rgba(239, 68, 68, 0.25);
}

.dialog-btn.accent {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.dialog-btn.accent:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.25);
}

.dialog-btn.accent:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dialog-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.dialog-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  image-rendering: pixelated;
}

.dialog-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
  color: var(--title-color, #f5f5f7);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  text-align: left;
  transition: border-color 0.15s;
}

.dialog-input:focus {
  border-color: var(--title-color);
}

.dialog-enter-active {
  transition: opacity 0.2s ease;
}

.dialog-leave-active {
  transition: opacity 0.15s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
