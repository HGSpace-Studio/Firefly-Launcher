<script setup lang="ts">
import { ref, type Ref, inject, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CircleOff, Plus, Gamepad2, RefreshCw } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";
import InstanceDetail from "./instance_detail.vue";
import type { InstanceData } from "./instance_detail.vue";
import { pendingInstance, consumePendingInstance } from "../../../stores/navigation";
import { currentInstanceName } from "../../../stores/instanceLaunch";

const { t } = useI18n();

const emit = defineEmits<{
  (e: "openNewInstance"): void;
}>();

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
  installed: boolean;
}

const instances = ref<InstanceEntry[]>([]);
const loading = ref(true);
const selectedInstance = ref<InstanceData | null>(null);
const showingInstance = inject<Ref<boolean>>('showingInstance');

watch(selectedInstance, (val) => {
  if (showingInstance) showingInstance.value = val !== null;
}, { immediate: true });

const goBackLib = inject<Ref<number>>('goBackLib');
if (goBackLib) {
  watch(goBackLib, () => {
    if (goBackLib.value) { onBack(); goBackLib.value = 0; }
  });
}

async function loadInstances() {
  loading.value = true;
  try {
    instances.value = await invoke<InstanceEntry[]>("get_instances_list");
  } catch {
    instances.value = [];
  } finally {
    loading.value = false;
  }
}

function getLoaderLabel(inst: InstanceEntry): string {
  if (!inst.loader) return "原版";
  const names: Record<string, string> = {
    fabric: "Fabric",
    forge: "Forge",
    neoforge: "NeoForge",
    quilt: "Quilt",
  };
  return `${names[inst.loader.type] || inst.loader.type} ${inst.loader.version}`;
}

function openDetail(inst: InstanceEntry) {
  currentInstanceName.value = inst.name
  selectedInstance.value = {
    name: inst.name,
    version: inst.version,
    versionType: inst.version_type,
    loader: inst.loader ? { type: inst.loader.type as "fabric" | "forge" | "neoforge" | "quilt", version: inst.loader.version } : undefined,
    icon: inst.icon || undefined,
  };
}

function onBack() {
  currentInstanceName.value = null;
  selectedInstance.value = null;
}

onMounted(() => {
  loadInstances();
  window.addEventListener("instance-installed", loadInstances);
});

watch(pendingInstance, (val) => {
  if (val) {
    const inst = consumePendingInstance();
    if (inst) openDetail(inst as any);
  }
}, { immediate: true });

onUnmounted(() => {
  window.removeEventListener("instance-installed", loadInstances);
});
</script>

<template>
  <InstanceDetail
    v-if="selectedInstance"
    :instance="selectedInstance"
    @back="onBack"
  />
  <div v-else class="lib-page">
    <div class="lib-header">
      <span class="lib-header-sub">{{ t("app.mainwindow.sidebar.library") }}</span>
      <div class="lib-header-row">
        <span class="lib-header-main">我的 Minecraft 实例</span>
        <button class="lib-create-btn" @click="emit('openNewInstance')">
          <Plus :size="16" />
          <span>新建实例</span>
        </button>
      </div>
    </div>
    <div class="lib-area">
      <div v-if="loading" class="lib-loading">
        <RefreshCw :size="20" class="spinner" />
        <span>加载中...</span>
      </div>
      <div v-else-if="instances.length === 0" class="lib-empty">
        <CircleOff :size="56" class="lib-empty-icon" />
        <span class="lib-empty-text">这里什么都没有啊</span>
      </div>
      <div v-else class="lib-grid">
        <button
          v-for="inst in instances"
          :key="inst.name"
          class="instance-card"
          @click="openDetail(inst)"
        >
          <div class="card-icon-wrap">
            <Gamepad2 :size="28" class="card-icon" />
          </div>
          <div class="card-body">
            <span class="card-version">Minecraft {{ inst.version }}</span>
            <span class="card-loader">{{ getLoaderLabel(inst) }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 0 80px;
  overflow-y: auto;
}

.lib-page > * {
  padding-left: 28px;
  padding-right: 28px;
}

.lib-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.lib-header-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.lib-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lib-header-main {
  font-size: 18px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.lib-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 10px;
  background: #0078d4;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.lib-create-btn:hover {
  opacity: 0.85;
}

.lib-area {
  flex: 1;
  margin-top: 20px;
  min-height: 0;
}

.lib-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  color: var(--title-color);
  opacity: 0.6;
  font-size: 13px;
}

.lib-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--title-color);
  opacity: 0.4;
}

.lib-empty-icon {
  opacity: 0.5;
}

.lib-empty-text {
  font-size: 14px;
}

.lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.instance-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  text-align: center;
}

.instance-card:hover {
  background: rgba(128, 128, 128, 0.12);
  transform: translateY(-2px);
}

.card-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon {
  opacity: 0.5;
  color: var(--title-color);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card-version {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.card-loader {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
