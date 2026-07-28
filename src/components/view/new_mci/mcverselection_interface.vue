<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { Box, Sparkles, RefreshCw } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";
import { getCache, setCache } from "../../../utils/cache";
import mcIcon from "../../../assets/imgs/mc_oringin.png";

const { t } = useI18n();

const props = defineProps<{
  searchQuery?: string;
}>();

interface VersionInfo {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionInfo[];
}

const aprilFoolsPatterns = [
  "rv-pre", "shareware", "20w14∞", "20w14infinite",
  "oneblockatatime", "potato", "_or_b", "3d shareware",
];

function isAprilFools(id: string): boolean {
  const lower = id.toLowerCase();
  return aprilFoolsPatterns.some((p) => lower.includes(p));
}

const emit = defineEmits<{
  (e: "select-version", id: string, type: string): void;
}>();

const loading = ref(true);
const manifest = ref<VersionManifest | null>(null);
const activeTab = ref("release");

const filteredVersions = computed(() => {
  if (!manifest.value) return [];
  const all = manifest.value.versions;
  let result: VersionInfo[];
  switch (activeTab.value) {
    case "release":
      result = all.filter((v) => v.type === "release" && !isAprilFools(v.id));
      break;
    case "snapshot":
      result = all.filter((v) => v.type === "snapshot" && !isAprilFools(v.id));
      break;
    case "old":
      result = all.filter(
        (v) =>
          v.type !== "release" &&
          v.type !== "snapshot" &&
          !isAprilFools(v.id)
      );
      break;
    case "april":
      result = all.filter((v) => isAprilFools(v.id));
      break;
    default:
      result = [];
  }
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase();
    result = result.filter((v) => v.id.toLowerCase().includes(q));
  }
  return result;
});

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

onMounted(async () => {
  const cached = getCache<VersionManifest>("mc_versions");
  if (cached) {
    manifest.value = cached;
    loading.value = false;
    return;
  }
  try {
    manifest.value = await invoke<VersionManifest>("get_minecraft_versions");
    setCache("mc_versions", manifest.value);
  } catch {
    // silent
  }
  loading.value = false;
});

function setTab(tab: string) {
  activeTab.value = tab;
}
</script>

<template>
  <div class="mc-version-body">
    <nav class="version-nav">
      <button
        class="version-nav-item"
        :class="{ active: activeTab === 'release' }"
        @click="setTab('release')"
      >
        <Box :size="18" />
        <span>{{ t("app.mainwindow.versionnav.release") }}</span>
      </button>
      <button
        class="version-nav-item"
        :class="{ active: activeTab === 'snapshot' }"
        @click="setTab('snapshot')"
      >
        <Box :size="18" />
        <span>{{ t("app.mainwindow.versionnav.snapshot") }}</span>
      </button>
      <button
        class="version-nav-item"
        :class="{ active: activeTab === 'old' }"
        @click="setTab('old')"
      >
        <Box :size="18" />
        <span>{{ t("app.mainwindow.versionnav.old") }}</span>
      </button>
      <div class="version-nav-divider"></div>
      <button
        class="version-nav-item"
        :class="{ active: activeTab === 'april' }"
        @click="setTab('april')"
      >
        <Sparkles :size="18" />
        <span>{{ t("app.mainwindow.versionnav.april") }}</span>
      </button>
    </nav>
    <div class="version-content">
      <div v-if="loading" class="version-loading">
        <RefreshCw :size="20" class="spinner" />
        <span>{{ t("app.mainwindow.versionnav.loading") }}</span>
      </div>
      <div v-else class="version-list">
        <button
          v-for="v in filteredVersions"
          :key="v.id"
          class="version-card-item"
          @click="emit('select-version', v.id, v.type)"
        >
          <img :src="mcIcon" class="version-card-icon" />
          <div class="version-card-info">
            <span class="version-card-id">{{ v.id }}</span>
            <span class="version-card-date">{{ formatDate(v.releaseTime) }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mc-version-body {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.version-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  padding-right: 16px;
  margin-left: -3px;
  box-sizing: border-box;
}

.version-nav-item {
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

.version-nav-item:hover {
  background: rgba(128, 128, 128, 0.1);
}

.version-nav-item.active {
  background: var(--sidebar-active);
  color: var(--sidebar-active-color);
}

.version-nav-divider {
  height: 1px;
  background: rgba(128, 128, 128, 0.2);
  margin: 6px 12px;
}

.version-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.version-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  color: var(--title-color);
  opacity: 0.6;
  font-size: 13px;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.version-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
}

.version-card-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
  box-sizing: border-box;
}

.version-card-item:hover {
  background: rgba(128, 128, 128, 0.08);
}

.version-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.version-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.version-card-id {
  font-size: 15px;
  font-weight: 500;
  color: var(--title-color);
  line-height: 1.2;
}

.version-card-date {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}
</style>
