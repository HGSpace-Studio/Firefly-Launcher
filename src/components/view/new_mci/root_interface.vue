<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink, Box, Search, X, ChevronDown, RefreshCw, Wrench, ArrowRight, ArrowLeft, Info } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import fabricIcon from "../../../assets/imgs/mod_loader_imgs/fabric.png";
import mcIcon from "../../../assets/imgs/mc_oringin.png";
import McVersionSelection from "./mcverselection_interface.vue";
import { getCache, setCache } from "../../../utils/cache";
import { addTask, registerInstallListeners } from "../../../stores/taskStore";

interface FabricVersion {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

interface ForgeBuild {
  id: string;
  build: number;
  version: string;
  mcversion: string;
  modified: string;
}

interface NeoForgeBuild {
  version: string;
  mcversion: string;
  build: number;
  modified: string;
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "navigate", nav: string): void;
}>();

const { t } = useI18n();

const loading = ref(true);
const fabricDropdownOpen = ref(false);
const selectedFabricVersion = ref("");
const fabricVersions = ref<string[]>([]);
const fabricSelectRef = ref<HTMLElement | null>(null);
const loaderEnabled = ref(false);
const forgeEnabled = ref(false);
const neoforgeEnabled = ref(false);
const forgeDropdownOpen = ref(false);
const neoforgeDropdownOpen = ref(false);
const selectedForgeVersion = ref("");
const selectedNeoForgeVersion = ref("");
const forgeVersions = ref<string[]>([]);
const neoforgeVersions = ref<string[]>([]);
const forgeSelectRef = ref<HTMLElement | null>(null);
const neoforgeSelectRef = ref<HTMLElement | null>(null);
const hoveredTooltip = ref<'fabric' | 'forge' | 'neoforge' | null>(null);
const loadError = ref("");
const instanceName = ref("");
const selectedMcVersion = ref("1.21.8");
const selectedMcVersionType = ref("release");

const fabricInfoDismissed = ref(false);
const installing = ref(false);
const installProgress = ref(0);
const installStep = ref("");
const installLabel = ref("正在获取清单...");
let unlistenProgress: (() => void) | null = null;

const stepLabels: Record<string, string> = {
  manifest: "正在获取版本清单...",
  version_json: "正在下载版本元数据...",
  client_jar: "正在下载游戏客户端...",
  finalize: "正在保存配置...",
  done: "安装完成!",
};

const isOldVersion = computed(() => selectedMcVersionType.value !== "release" && selectedMcVersionType.value !== "snapshot");

const canProceed = computed(() => selectedMcVersion.value.length > 0 && instanceName.value.trim().length > 0);

function buildInstanceName(): string {
  let name = selectedMcVersion.value;
  if (loaderEnabled.value && selectedFabricVersion.value) {
    name += ` Fabric ${selectedFabricVersion.value}`;
  } else if (forgeEnabled.value && selectedForgeVersion.value) {
    name += ` Forge ${selectedForgeVersion.value}`;
  } else if (neoforgeEnabled.value && selectedNeoForgeVersion.value) {
    name += ` NeoForge ${selectedNeoForgeVersion.value}`;
  }
  return name;
}

watch(selectedMcVersion, () => {
  if (selectedMcVersion.value) {
    instanceName.value = buildInstanceName();
  }
});

watch([loaderEnabled, forgeEnabled, neoforgeEnabled, selectedFabricVersion, selectedForgeVersion, selectedNeoForgeVersion], () => {
  if (selectedMcVersion.value) {
    instanceName.value = buildInstanceName();
  }
});

const viewState = ref<'root' | 'mc-version'>('root');
const searchQuery = ref('');

function toggleFabric() {
  if (forgeEnabled.value || neoforgeEnabled.value) return;
  loaderEnabled.value = !loaderEnabled.value;
}

function toggleForge() {
  if (loaderEnabled.value || neoforgeEnabled.value) return;
  forgeEnabled.value = !forgeEnabled.value;
}

function toggleNeoForge() {
  if (loaderEnabled.value || forgeEnabled.value) return;
  neoforgeEnabled.value = !neoforgeEnabled.value;
}

const forgeLoading = ref(false);
const neoforgeLoading = ref(false);

async function fetchForgeVersions(mcVersion: string) {
  const cacheKey = "forge_versions_" + mcVersion;
  const cached = getCache<string[]>(cacheKey);
  if (cached) {
    forgeVersions.value = cached;
    if (forgeVersions.value.length > 0) {
      selectedForgeVersion.value = forgeVersions.value[0];
    }
    return;
  }
  forgeLoading.value = true;
  try {
    const forgeList = await invoke<ForgeBuild[]>("get_forge_versions", {
      mcVersion,
    });
    forgeVersions.value = forgeList.map((v) => v.version).reverse();
    setCache(cacheKey, forgeVersions.value);
    if (forgeVersions.value.length > 0) {
      selectedForgeVersion.value = forgeVersions.value[0];
    }
  } catch {
    // keep current list
  } finally {
    forgeLoading.value = false;
  }
}

async function fetchNeoForgeVersions(mcVersion: string) {
  const cacheKey = "neoforge_versions_" + mcVersion;
  const cached = getCache<string[]>(cacheKey);
  if (cached) {
    neoforgeVersions.value = cached;
    if (neoforgeVersions.value.length > 0) {
      selectedNeoForgeVersion.value = neoforgeVersions.value[0];
    }
    return;
  }
  neoforgeLoading.value = true;
  try {
    const list = await invoke<NeoForgeBuild[]>("get_neoforge_versions", {
      mcVersion,
    });
    neoforgeVersions.value = list.map((v) => v.version).reverse();
    setCache(cacheKey, neoforgeVersions.value);
    if (neoforgeVersions.value.length > 0) {
      selectedNeoForgeVersion.value = neoforgeVersions.value[0];
    }
  } catch {
    // keep current list
  } finally {
    neoforgeLoading.value = false;
  }
}

onMounted(async () => {
  const cached = getCache<string[]>("fabric_versions");
  if (cached) {
    fabricVersions.value = cached;
    if (fabricVersions.value.length > 0) {
      selectedFabricVersion.value = fabricVersions.value[0];
    }
    loading.value = false;
  } else {
    try {
      const [fabricList] = await Promise.all([
        invoke<FabricVersion[]>("get_fabric_versions"),
      ]);
      fabricVersions.value = fabricList.map((v) => v.version);
      setCache("fabric_versions", fabricVersions.value);
      if (fabricVersions.value.length > 0) {
        selectedFabricVersion.value = fabricVersions.value[0];
      }
    } catch (e: any) {
      loadError.value = String(e);
    } finally {
      loading.value = false;
    }
  }
  document.addEventListener("mousedown", onDocMouseDown);
  fetchForgeVersions(selectedMcVersion.value);
  fetchNeoForgeVersions(selectedMcVersion.value);
});

watch(selectedMcVersion, (newVer) => {
  if (newVer) {
    fetchForgeVersions(newVer);
    fetchNeoForgeVersions(newVer);
  }
});

onUnmounted(() => document.removeEventListener("mousedown", onDocMouseDown));

function onDocMouseDown(e: MouseEvent) {
  if (fabricDropdownOpen.value && fabricSelectRef.value && !fabricSelectRef.value.contains(e.target as Node)) {
    fabricDropdownOpen.value = false;
  }
  if (forgeDropdownOpen.value && forgeSelectRef.value && !forgeSelectRef.value.contains(e.target as Node)) {
    forgeDropdownOpen.value = false;
  }
  if (neoforgeDropdownOpen.value && neoforgeSelectRef.value && !neoforgeSelectRef.value.contains(e.target as Node)) {
    neoforgeDropdownOpen.value = false;
  }
}

const overlayRef = ref<HTMLElement | null>(null);

function handleClose() {
  if (installing.value) {
    // 取消安装：清理进度监听。后端的下载请求无法中止，
    // 但组件卸载后 UI 会关闭，用户可以重新发起安装。
    if (unlistenProgress) {
      unlistenProgress();
      unlistenProgress = null;
    }
    installing.value = false;
  }
  emit("close");
}

function onOverlayClick(e: MouseEvent) {
  // To prevent user to click blank place to cancel installation occasionally
  if (installing.value) return;
  if (e.target === overlayRef.value) {
    emit("close");
  }
}

async function startInstall() {
  fabricInfoDismissed.value = true;
  installing.value = true;
  installProgress.value = 0;
  installStep.value = "";
  installLabel.value = stepLabels["manifest"];

  const taskId = "install:" + instanceName.value + "_" + Date.now()
  addTask({
    id: taskId,
    type: "install",
    title: instanceName.value,
    status: "downloading",
    progress: 0,
    label: stepLabels["manifest"],
  })
  registerInstallListeners(taskId)

  unlistenProgress = await listen<{ step: string; progress: number }>("install-progress", (event) => {
    const { step, progress } = event.payload;
    installProgress.value = progress;
    installStep.value = step;
    installLabel.value = stepLabels[step] || step;
    if (step === "done") {
      setTimeout(() => {
        installing.value = false;
        window.dispatchEvent(new CustomEvent("instance-installed"));
        emit("navigate", "library");
      }, 800);
    }
  });

  try {
    const loaderType = loaderEnabled.value ? "fabric" : forgeEnabled.value ? "forge" : neoforgeEnabled.value ? "neoforge" : null;
    const loaderVer = loaderEnabled.value ? selectedFabricVersion.value : forgeEnabled.value ? selectedForgeVersion.value : neoforgeEnabled.value ? selectedNeoForgeVersion.value : null;

    await invoke("install_instance", {
      name: instanceName.value,
      mcVersion: selectedMcVersion.value,
      versionType: selectedMcVersionType.value,
      loaderType,
      loaderVersion: loaderVer,
    });
  } catch (e: any) {
    installLabel.value = "安装失败: " + (e?.toString() || "未知错误");
    installing.value = false;
  }
}

onUnmounted(() => {
  if (unlistenProgress) {
    unlistenProgress();
    unlistenProgress = null;
  }
});
</script>

<template>
  <div class="overlay" ref="overlayRef" @click="onOverlayClick">
    <div class="window">
      <Transition name="slide" mode="out-in">
        <div class="view-wrapper" :key="viewState">
          <template v-if="viewState === 'root'">
        <div class="header">
          <div class="header-left">
            <span class="icon-wrap">
              <ExternalLink :size="16" class="icon" />
            </span>
            <span class="title">{{ t("app.mainwindow.sidebar.add-instance") }}</span>
          </div>
          <button class="close-btn" @click="handleClose">
            <X :size="18" />
          </button>
        </div>
        <div class="divider"></div>
        <div class="body">
          <div class="top-row">
            <div class="icon-box">
              <div v-if="forgeEnabled || neoforgeEnabled" class="icon-preview icon-preview-anvil">
                <Wrench :size="32" />
              </div>
              <div v-else class="icon-preview" :style="{ backgroundImage: `url(${loaderEnabled ? fabricIcon : mcIcon})` }"></div>
            </div>
            <div class="name-combo">
              <div class="name-combo-info">
                <span class="name-combo-sub">{{ t("app.mainwindow.addinstance.nameLabel") }}</span>
                <input class="name-combo-input" type="text" :placeholder="selectedMcVersion || t('app.mainwindow.addinstance.namePlaceholder')" v-model="instanceName" />
              </div>
            </div>
            <div class="version-combo" @click="viewState = 'mc-version'">
              <div class="version-combo-info">
                <span class="version-combo-sub">{{ t("app.mainwindow.addinstance.versionSub") }}</span>
                <span class="version-combo-value">{{ selectedMcVersion }}</span>
              </div>
              <ChevronDown :size="16" class="version-combo-arrow" />
            </div>
          </div>
          <div class="section-divider"></div>
          <div class="card-row" :class="{ 'card-row-loading': loading }">
            <div v-if="loading" class="loading-overlay">
              <RefreshCw :size="20" class="spinner" />
              <span>{{ t("app.mainwindow.addinstance.loading") }}</span>
            </div>
            <div v-else-if="loadError" class="loading-overlay error">
              <span>{{ t("app.mainwindow.addinstance.loadError") }} {{ loadError }}</span>
            </div>
            <template v-else>
                <div class="loaders-area">
                 <div class="loader-row" :class="{ 'global-disabled': isOldVersion }">
                   <div class="btn-wrap">
                      <button
                        class="loader-btn"
                        :class="{ active: loaderEnabled, blocked: forgeEnabled || neoforgeEnabled }"
                        :disabled="isOldVersion"
                        @click="toggleFabric"
                        @mouseenter="(forgeEnabled || neoforgeEnabled) && (hoveredTooltip = 'fabric')"
                        @mouseleave="hoveredTooltip = null"
                      >
                        <img :src="fabricIcon" class="loader-icon" />
                        <span>Fabric</span>
                      </button>
                      <span v-if="hoveredTooltip === 'fabric'" class="btn-tooltip">{{ t("app.mainwindow.addinstance.tooltipConflict") }}</span>
                   </div>
                   <div class="version-combobox" ref="fabricSelectRef">
                     <button
                       class="combo-trigger"
                       :class="{ disabled: !loaderEnabled || isOldVersion }"
                       :disabled="!loaderEnabled || isOldVersion"
                       @click.stop="loaderEnabled && (fabricDropdownOpen = !fabricDropdownOpen)"
                     >
                       <span class="combo-text">{{ selectedFabricVersion || t('app.mainwindow.addinstance.noSelection') }}</span>
                        <ChevronDown :size="14" class="combo-arrow" />
                     </button>
                     <div v-if="fabricDropdownOpen" class="combo-dropdown">
                       <button
                         v-for="v in fabricVersions"
                         :key="v"
                         class="combo-option"
                         :class="{ active: v === selectedFabricVersion }"
                         :disabled="isOldVersion"
                         @click="selectedFabricVersion = v; fabricDropdownOpen = false"
                       >{{ v }}</button>
                     </div>
                   </div>
                 </div>
                <div class="loader-row" :class="{ 'global-disabled': isOldVersion }">
                   <div class="btn-wrap">
                      <button
                        class="loader-btn"
                        :class="{ active: forgeEnabled, blocked: loaderEnabled || neoforgeEnabled }"
                        :disabled="isOldVersion"
                        @click="toggleForge"
                        @mouseenter="(loaderEnabled || neoforgeEnabled) && (hoveredTooltip = 'forge')"
                        @mouseleave="hoveredTooltip = null"
                      >
                         <Wrench :size="20" class="loader-icon" />
                        <span>Forge</span>
                      </button>
                      <span v-if="hoveredTooltip === 'forge'" class="btn-tooltip">{{ t("app.mainwindow.addinstance.tooltipConflict") }}</span>
                   </div>
                   <div class="version-combobox" ref="forgeSelectRef">
                     <button
                       class="combo-trigger"
                       :class="{ disabled: !forgeEnabled || isOldVersion }"
                       :disabled="!forgeEnabled || isOldVersion"
                       @click.stop="forgeEnabled && !forgeLoading && (forgeDropdownOpen = !forgeDropdownOpen)"
                     >
                       <span v-if="forgeLoading" class="combo-loading-text">{{ t("app.mainwindow.addinstance.forgeLoading") }}</span>
                       <span v-else class="combo-text">{{ selectedForgeVersion }}</span>
                        <RefreshCw v-if="forgeLoading" :size="14" class="combo-spinner" />
                        <ChevronDown v-else :size="14" class="combo-arrow" />
                     </button>
                     <div v-if="forgeDropdownOpen" class="combo-dropdown">
                       <button
                         v-for="v in forgeVersions"
                         :key="v"
                         class="combo-option"
                         :class="{ active: v === selectedForgeVersion }"
                         :disabled="isOldVersion"
                         @click="selectedForgeVersion = v; forgeDropdownOpen = false"
                       >{{ v }}</button>
                     </div>
                    </div>
                  </div>
                 <div class="loader-row" :class="{ 'global-disabled': isOldVersion }">
                    <div class="btn-wrap">
                      <button
                        class="loader-btn"
                        :class="{ active: neoforgeEnabled, blocked: loaderEnabled || forgeEnabled }"
                        :disabled="isOldVersion"
                        @click="toggleNeoForge"
                        @mouseenter="(loaderEnabled || forgeEnabled) && (hoveredTooltip = 'neoforge')"
                        @mouseleave="hoveredTooltip = null"
                      >
                         <Wrench :size="20" class="loader-icon" />
                        <span>NeoForge</span>
                      </button>
                      <span v-if="hoveredTooltip === 'neoforge'" class="btn-tooltip">{{ t("app.mainwindow.addinstance.tooltipConflict") }}</span>
                    </div>
                    <div class="version-combobox" ref="neoforgeSelectRef">
                      <button
                        class="combo-trigger"
                        :class="{ disabled: !neoforgeEnabled || isOldVersion }"
                        :disabled="!neoforgeEnabled || isOldVersion"
                        @click.stop="neoforgeEnabled && !neoforgeLoading && (neoforgeDropdownOpen = !neoforgeDropdownOpen)"
                      >
                        <span v-if="neoforgeLoading" class="combo-loading-text">{{ t("app.mainwindow.addinstance.forgeLoading") }}</span>
                        <span v-else class="combo-text">{{ selectedNeoForgeVersion }}</span>
                         <RefreshCw v-if="neoforgeLoading" :size="14" class="combo-spinner" />
                         <ChevronDown v-else :size="14" class="combo-arrow" />
                      </button>
                      <div v-if="neoforgeDropdownOpen" class="combo-dropdown">
                        <button
                          v-for="v in neoforgeVersions"
                          :key="v"
                          class="combo-option"
                          :class="{ active: v === selectedNeoForgeVersion }"
                          :disabled="isOldVersion"
                          @click="selectedNeoForgeVersion = v; neoforgeDropdownOpen = false"
                        >{{ v }}</button>
                      </div>
                    </div>
                  </div>
               </div>
            </template>
          </div>
          <div class="footer">
            <Transition name="slide-right">
              <div v-if="loaderEnabled && selectedFabricVersion && !fabricInfoDismissed" class="fabric-info">
                <Info :size="16" class="info-icon" />
                <span>{{ t("app.mainwindow.addinstance.fabricInfo", { version: selectedFabricVersion }) }}</span>
              </div>
            </Transition>
            <template v-if="installing">
              <div class="install-progress-wrap">
                <div class="install-label">{{ installLabel }}</div>
                <div class="install-bar">
                  <div class="install-bar-fill" :style="{ width: (installProgress * 100) + '%' }"></div>
                </div>
                <div class="install-pct">{{ Math.round(installProgress * 100) }}%</div>
              </div>
            </template>
            <template v-else>
              <button class="pack-btn">
                <Box :size="16" />
                <span>安装整合包</span>
              </button>
              <button class="confirm-btn" :disabled="!canProceed" @click="startInstall">
                <span>{{ t("app.mainwindow.addinstance.confirm") }}</span>
                <ArrowRight :size="16" />
              </button>
            </template>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="header mc-version-header">
          <div class="header-left">
            <button class="back-btn" @click="viewState = 'root'">
              <ArrowLeft :size="21" />
            </button>
            <div class="header-title-group">
              <span class="header-sub">{{ t("app.mainwindow.addinstance.headerSub") }}</span>
              <span class="header-main">{{ t("app.mainwindow.addinstance.headerMain") }}</span>
            </div>
          </div>
          <div class="header-search">
            <Search :size="16" class="search-icon" />
            <input v-model="searchQuery" class="search-input" placeholder="搜索版本..." />
          </div>
          <button class="close-btn" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
        <div class="divider"></div>
        <McVersionSelection :search-query="searchQuery" @select-version="(id: string, type: string) => { selectedMcVersion = id; selectedMcVersionType = type; viewState = 'root' }" />
      </template>
    </div>
  </Transition>
  </div>
  </div>
</template>

<style scoped>
.overlay {
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

.window {
  display: flex;
  flex-direction: column;
  width: 680px;
  height: 500px;
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

.view-wrapper {
  display: contents;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.slide-right-enter-active {
  transition: transform 0.3s ease-out;
}

.slide-right-enter-from {
  transform: translateX(60px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -24px 16px -24px;
  padding: 0 24px;
  color: var(--title-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mc-version-header .header-left {
  gap: 6px;
}

.back-btn {
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
  flex-shrink: 0;
  margin-left: -4px;
}

.back-btn:hover {
  background: rgba(128, 128, 128, 0.15);
}

.header-title-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.header-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.header-main {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.header-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 240px;
  margin: 0 16px;
}

.search-icon {
  color: var(--title-color);
  opacity: 0.35;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.search-input::placeholder {
  color: var(--title-color);
  opacity: 0.3;
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #0078d4;
  flex-shrink: 0;
}

.icon {
  color: #fff;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
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

.close-btn:hover {
  background: rgba(128, 128, 128, 0.15);
}

.divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 0 -24px 20px -24px;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.top-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.icon-box {
  flex-shrink: 0;
}

.icon-preview {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.icon-preview-anvil {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.15);
  color: var(--title-color);
}

.name-combo {
  flex: 1;
  padding: 11px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: var(--panel-bg);
  transition: border-color 0.15s;
  box-sizing: border-box;
  margin-top: 7px;
}

.name-combo:focus-within {
  border-color: var(--title-color);
}

.name-combo-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.name-combo-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
  white-space: nowrap;
}

.name-combo-input {
  all: unset;
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
  width: 100%;
  min-width: 0;
}

.name-combo-input::placeholder {
  opacity: 0.4;
}

.version-combo {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px 13px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: var(--panel-bg);
  cursor: pointer;
  transition: border-color 0.15s;
  box-sizing: border-box;
  min-width: 0;
  margin-top: 6px;
}

.version-combo:hover {
  border-color: rgba(128, 128, 128, 0.4);
}

.version-combo-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.version-combo-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
  white-space: nowrap;
}

.version-combo-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
  white-space: nowrap;
}

.version-combo-arrow {
  color: var(--title-color);
  opacity: 0.4;
  flex-shrink: 0;
  margin-left: auto;
}

.section-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 12px 0 14px;
}

.card-row {
  display: flex;
  flex: 1;
  position: relative;
}

.card-row-loading {
  pointer-events: none;
}

.loading-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 80px;
  color: var(--title-color);
  opacity: 0.6;
  font-size: 13px;
}

.loading-overlay.error {
  opacity: 0.8;
  color: #e74c3c;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.v-divider {
  width: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 0 0 0 3px;
}

.loader-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 0 4px;
  padding: 8px 14px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  transition: background 0.15s;
  flex-shrink: 0;
}

.loader-btn:hover {
  background: rgba(128, 128, 128, 0.1);
}

.loader-btn.active {
  background: rgba(128, 128, 128, 0.12);
  border-color: var(--title-color);
}

.loader-btn.blocked {
  opacity: 0.35;
  cursor: not-allowed;
}

.loader-btn.blocked:hover {
  background: transparent;
}

.btn-wrap {
  position: relative;
}

.btn-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 6px;
  background: #333;
  color: #fff;
  font-size: 12px;
  pointer-events: none;
  z-index: 70;
}

.loader-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.loaders-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 6px;
  margin-top: 3px;
}

.loader-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.loader-row.global-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.version-combobox {
  position: relative;
  flex: 1;
  margin: 0 3px 0 3px;
}

.combo-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--title-color);
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.combo-trigger:hover {
  border-color: rgba(128, 128, 128, 0.4);
}

.combo-trigger.disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.combo-trigger.disabled:hover {
  border-color: rgba(128, 128, 128, 0.25);
}

.combo-text {
  opacity: 0.7;
}

.combo-arrow {
  color: var(--title-color);
  opacity: 0.5;
  flex-shrink: 0;
}

.combo-spinner {
  animation: spin 1s linear infinite;
  color: var(--title-color);
  opacity: 0.5;
  flex-shrink: 0;
}

.combo-loading-text {
  opacity: 0.5;
  font-size: 12px;
}

.combo-dropdown {
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

.combo-option {
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

.combo-option:hover {
  background: rgba(128, 128, 128, 0.12);
}

.combo-option.active {
  background: var(--sidebar-active);
  color: var(--sidebar-active-color);
}

.version-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 13px;
}

.version-sub {
  font-size: 14px;
  color: var(--title-color);
  opacity: 0.45;
  margin-top: -16px;
}

.version-value {
  font-size: 18px;
  font-weight: 500;
  color: var(--title-color);
}

.footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 12px;
}

.install-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.install-label {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.7;
  white-space: nowrap;
}

.install-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.2);
  overflow: hidden;
}

.install-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--sidebar-active-color);
  transition: width 0.3s ease;
}

.install-pct {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.6;
  min-width: 36px;
  text-align: right;
}

.fabric-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  margin-right: auto;
  border-radius: 8px;
  background: rgba(46, 204, 113, 0.12);
  border: 1px solid rgba(46, 204, 113, 0.3);
  color: #27ae60;
  font-size: 12px;
}

.info-icon {
  flex-shrink: 0;
}

.pack-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  margin-right: auto;
}

.pack-btn:hover {
  background: rgba(128, 128, 128, 0.1);
}

.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #0078d4;
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.pack-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  margin-right: 8px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.pack-btn:hover {
  background: rgba(128, 128, 128, 0.1);
  border-color: rgba(128, 128, 128, 0.4);
}

.confirm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.confirm-btn:hover:not(:disabled) {
  background: #1a8ae8;
}
</style>
