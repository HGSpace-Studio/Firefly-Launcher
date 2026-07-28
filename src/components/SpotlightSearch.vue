<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Search, Package, Puzzle, Palette, ArrowRight, Loader2, Gamepad2, Settings, FolderOpen, Play, Trash2, ChevronDown, Globe, Server, Layers, Plus, Check } from "@lucide/vue";

const props = defineProps<{
  defaultScope?: SearchScope;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

type SearchScope = "global" | "instances" | "modrinth";
const scope = ref<SearchScope>(props.defaultScope || "global");
const scopeOpen = ref(false);
const scopeOptions: { value: SearchScope; label: string; icon: any }[] = [
  { value: "global", label: "全局", icon: Globe },
  { value: "instances", label: "我的实例", icon: Server },
  { value: "modrinth", label: "在线资源", icon: Layers },
];
const currentScopeOption = computed(() => scopeOptions.find((o) => o.value === scope.value)!);

function selectScope(val: SearchScope) {
  scope.value = val;
  scopeOpen.value = false;
}

interface ModrinthHit {
  slug: string;
  title: string;
  description: string;
  project_type: string;
  downloads: number;
  icon_url: string | null;
}

interface McVersion {
  id: string;
  type: string;
}

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
}

const modrinthResults = ref<ModrinthHit[]>([]);
const popularProjects = ref<ModrinthHit[]>([]);
const mcVersions = ref<McVersion[]>([]);
const instances = ref<InstanceEntry[]>([]);
const modrinthLoading = ref(false);
const versionsLoaded = ref(false);

const projectTypeIcons: Record<string, any> = {
  mod: Puzzle,
  modpack: Package,
  shader: Palette,
  resourcepack: Palette,
};

const projectTypeLabels: Record<string, string> = {
  mod: "模组",
  modpack: "整合包",
  shader: "光影",
  resourcepack: "资源包",
};

const filteredMcVersions = computed(() => {
  if (!query.value) return [];
  const q = query.value.toLowerCase();
  return mcVersions.value
    .filter((v) => v.id.toLowerCase().includes(q))
    .slice(0, 8);
});

const filteredInstances = computed(() => {
  if (!query.value) return instances.value;
  const q = query.value.toLowerCase();
  return instances.value.filter((i) => i.name.toLowerCase().includes(q));
});

const hasResults = computed(() =>
  modrinthResults.value.length > 0 ||
  filteredMcVersions.value.length > 0 ||
  filteredInstances.value.length > 0
);
const showEmpty = computed(() => query.value.length > 0 && !modrinthLoading.value && !hasResults.value);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(query, (val) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!val || scope.value === 'instances') {
    modrinthResults.value = [];
    return;
  }
  if (scope.value === 'global' || scope.value === 'modrinth') {
    searchTimer = setTimeout(() => searchModrinth(val), 300);
  }
});

watch(scope, (val) => {
  if (query.value && (val === 'global' || val === 'modrinth')) {
    searchModrinth(query.value);
  } else {
    modrinthResults.value = [];
  }
});

async function searchModrinth(q: string) {
  modrinthLoading.value = true;
  try {
    const res = await fetch(
      `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=6&index=relevance`
    );
    const data = await res.json();
    modrinthResults.value = (data.hits || []).map((h: any) => ({
      slug: h.slug,
      title: h.title,
      description: h.description,
      project_type: h.project_type,
      downloads: h.downloads,
      icon_url: h.icon_url,
    }));
  } catch {
    modrinthResults.value = [];
  } finally {
    modrinthLoading.value = false;
  }
}

function formatDownloads(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function openModrinth(slug: string, type: string) {
  window.open(`https://modrinth.com/${type}/${slug}`, "_blank");
  emit("close");
}

function selectVersion(id: string) {
  window.dispatchEvent(new CustomEvent("spotlight-select-version", { detail: id }));
  emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
  if (e.key === "Enter" && filteredMcVersions.value.length > 0) {
    selectVersion(filteredMcVersions.value[0].id);
  }
}

async function loadVersions() {
  if (versionsLoaded.value) return;
  try {
    const manifest = await invoke<{ versions: McVersion[] }>("get_minecraft_versions");
    mcVersions.value = manifest.versions.map((v) => ({ id: v.id, type: v.type }));
    versionsLoaded.value = true;
  } catch { /* silent */ }
}

const loaderMap: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

function getLoaderLabel(inst: InstanceEntry): string {
  if (!inst.loader) return "原版";
  return `${loaderMap[inst.loader.type] || inst.loader.type} ${inst.loader.version}`;
}

async function loadInstances() {
  try {
    instances.value = await invoke<InstanceEntry[]>("get_instances_list");
  } catch { /* silent */ }
}

async function loadPopular() {
  try {
    const res = await fetch(
      `https://api.modrinth.com/v2/search?limit=6&index=downloads`
    );
    const data = await res.json();
    popularProjects.value = (data.hits || []).map((h: any) => ({
      slug: h.slug,
      title: h.title,
      description: h.description,
      project_type: h.project_type,
      downloads: h.downloads,
      icon_url: h.icon_url,
    }));
  } catch { /* silent */ }
}

function goSettings(name: string) {
  window.dispatchEvent(new CustomEvent("spotlight-inst-settings", { detail: name }));
  emit("close");
}

function goResources(name: string) {
  window.dispatchEvent(new CustomEvent("spotlight-inst-resources", { detail: name }));
  emit("close");
}

function launchInstance(name: string) {
  window.dispatchEvent(new CustomEvent("spotlight-launch", { detail: name }));
  emit("close");
}

function deleteInstance(name: string) {
  window.dispatchEvent(new CustomEvent("spotlight-delete", { detail: name }));
  emit("close");
}

function createNewInstance() {
  window.dispatchEvent(new CustomEvent("spotlight-new-instance"));
  emit("close");
}

function selectInstance(name: string) {
  window.dispatchEvent(new CustomEvent("spotlight-select-inst", { detail: name }));
  emit("close");
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus());
  loadVersions();
  loadInstances();
  loadPopular();
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="spotlight-overlay" @click.self="emit('close')">
    <div class="spotlight-modal">
      <div class="spotlight-search-row">
        <Search :size="18" class="spotlight-search-icon" />
        <div class="spotlight-scope" @click.stop="scopeOpen = !scopeOpen">
          <component :is="currentScopeOption.icon" :size="13" />
          <span class="spotlight-scope-label">{{ currentScopeOption.label }}</span>
          <ChevronDown :size="12" class="spotlight-scope-arrow" :class="{ open: scopeOpen }" />
          <div v-if="scopeOpen" class="spotlight-scope-dropdown">
            <button
              v-for="opt in scopeOptions"
              :key="opt.value"
              class="spotlight-scope-option"
              :class="{ active: scope === opt.value }"
              @click.stop="selectScope(opt.value)"
            >
              <component :is="opt.icon" :size="13" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>
        <input
          ref="inputRef"
          v-model="query"
          class="spotlight-modal-input"
          type="text"
          :placeholder="scope === 'instances' ? '搜索实例名称...' : scope === 'modrinth' ? '搜索 Modrinth 资源...' : '搜索版本、资源、实例...'"
          spellcheck="false"
          autocomplete="off"
        />
        <Loader2 v-if="modrinthLoading" :size="16" class="spotlight-spinner" />
      </div>
      <div class="spotlight-divider"></div>
      <div class="spotlight-results">
        <template v-if="query">
          <template v-if="scope !== 'modrinth' && filteredMcVersions.length > 0">
            <div class="spotlight-section-label">Minecraft 版本</div>
            <button
              v-for="v in filteredMcVersions"
              :key="v.id"
              class="spotlight-result-item"
              @click="selectVersion(v.id)"
            >
              <div class="spotlight-result-icon-wrap mc-icon">
                <Gamepad2 :size="16" />
              </div>
              <div class="spotlight-result-info">
                <span class="spotlight-result-title">Minecraft {{ v.id }}</span>
                <span class="spotlight-result-desc">{{ v.type === 'release' ? '正式版' : v.type === 'snapshot' ? '快照版' : v.type }}</span>
              </div>
              <ArrowRight :size="14" class="spotlight-result-arrow" />
            </button>
          </template>
          <template v-if="scope !== 'instances' && modrinthResults.length > 0">
            <div class="spotlight-section-label">Modrinth 资源</div>
            <button
              v-for="h in modrinthResults"
              :key="h.slug"
              class="spotlight-result-item"
              @click="openModrinth(h.slug, h.project_type)"
            >
              <div class="spotlight-result-icon-wrap">
                <img v-if="h.icon_url" :src="h.icon_url" class="spotlight-result-icon-img" />
                <component v-else :is="projectTypeIcons[h.project_type] || Package" :size="16" />
              </div>
              <div class="spotlight-result-info">
                <span class="spotlight-result-title">{{ h.title }}</span>
                <span class="spotlight-result-desc">
                  {{ projectTypeLabels[h.project_type] || h.project_type }} · {{ formatDownloads(h.downloads) }} 下载
                </span>
              </div>
              <ArrowRight :size="14" class="spotlight-result-arrow" />
            </button>
          </template>
          <template v-if="scope !== 'modrinth' && filteredInstances.length > 0">
            <div class="spotlight-section-label">实例</div>
            <div
              v-for="inst in filteredInstances"
              :key="inst.name"
              class="spotlight-result-item spotlight-inst-row"
            >
              <button class="spotlight-inst-select-btn spotlight-inst-select-highlight" title="选择此实例" @click="selectInstance(inst.name)">
                <Check :size="14" />
              </button>
              <div class="spotlight-inst-row-left" @click="launchInstance(inst.name)">
                <div class="spotlight-result-icon-wrap mc-icon">
                  <Gamepad2 :size="16" />
                </div>
                <div class="spotlight-result-info">
                  <span class="spotlight-result-title">{{ inst.name }}</span>
                  <span class="spotlight-result-desc">Minecraft {{ inst.version }} · {{ getLoaderLabel(inst) }}</span>
                </div>
                <ArrowRight :size="14" class="spotlight-result-arrow" />
              </div>
            </div>
          </template>
          <div v-if="showEmpty" class="spotlight-empty">
            <span>没有找到 "{{ query }}" 相关的结果</span>
          </div>
        </template>
        <template v-else>
          <template v-if="scope === 'instances' || scope === 'global'">
            <div class="spotlight-section-label">已安装实例</div>
            <div v-if="instances.length === 0" class="spotlight-empty">
              <span>暂无已安装实例</span>
            </div>
            <div
              v-for="inst in filteredInstances"
              :key="inst.name"
              class="spotlight-inst-card"
            >
              <button class="spotlight-inst-select-btn spotlight-inst-select-highlight" title="选择此实例" @click="selectInstance(inst.name)">
                <Check :size="15" />
              </button>
              <div class="spotlight-inst-left">
                <div class="spotlight-inst-icon">
                  <Gamepad2 :size="20" />
                </div>
                <div class="spotlight-inst-info">
                  <span class="spotlight-inst-name">{{ inst.name }}</span>
                  <span class="spotlight-inst-meta">Minecraft {{ inst.version }} · {{ getLoaderLabel(inst) }}</span>
                </div>
              </div>
              <div class="spotlight-inst-actions">
                <button class="spotlight-inst-btn" title="版本设置" @click="goSettings(inst.name)">
                  <Settings :size="14" />
                </button>
                <button class="spotlight-inst-btn" title="资源管理" @click="goResources(inst.name)">
                  <FolderOpen :size="14" />
                </button>
                <button class="spotlight-inst-btn spotlight-inst-btn-launch" title="启动" @click="launchInstance(inst.name)">
                  <Play :size="14" />
                </button>
                <button class="spotlight-inst-btn spotlight-inst-btn-delete" title="删除" @click="deleteInstance(inst.name)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
            <button v-if="scope === 'instances'" class="spotlight-new-inst-btn" @click="createNewInstance">
              <Plus :size="15" />
              <span>新建实例</span>
            </button>
          </template>
          <template v-if="scope === 'global'">
            <div v-if="popularProjects.length > 0" class="spotlight-divider" style="margin: 4px 10px;"></div>
            <div v-if="popularProjects.length > 0" class="spotlight-section-label">推荐资源</div>
            <button
              v-for="h in popularProjects"
              :key="h.slug"
              class="spotlight-result-item"
              @click="openModrinth(h.slug, h.project_type)"
            >
              <div class="spotlight-result-icon-wrap">
                <img v-if="h.icon_url" :src="h.icon_url" class="spotlight-result-icon-img" />
                <component v-else :is="projectTypeIcons[h.project_type] || Package" :size="16" />
              </div>
              <div class="spotlight-result-info">
                <span class="spotlight-result-title">{{ h.title }}</span>
                <span class="spotlight-result-desc">
                  {{ projectTypeLabels[h.project_type] || h.project_type }} · {{ formatDownloads(h.downloads) }} 下载
                </span>
              </div>
              <ArrowRight :size="14" class="spotlight-result-arrow" />
            </button>
          </template>
          <template v-if="scope === 'modrinth'">
            <div v-if="popularProjects.length > 0" class="spotlight-section-label">热门资源</div>
            <button
              v-for="h in popularProjects"
              :key="h.slug"
              class="spotlight-result-item"
              @click="openModrinth(h.slug, h.project_type)"
            >
              <div class="spotlight-result-icon-wrap">
                <img v-if="h.icon_url" :src="h.icon_url" class="spotlight-result-icon-img" />
                <component v-else :is="projectTypeIcons[h.project_type] || Package" :size="16" />
              </div>
              <div class="spotlight-result-info">
                <span class="spotlight-result-title">{{ h.title }}</span>
                <span class="spotlight-result-desc">
                  {{ projectTypeLabels[h.project_type] || h.project_type }} · {{ formatDownloads(h.downloads) }} 下载
                </span>
              </div>
              <ArrowRight :size="14" class="spotlight-result-arrow" />
            </button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spotlight-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 18vh;
  background: rgba(0,0,0,0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  animation: spotlight-bg-in 0.2s ease forwards;
}
@keyframes spotlight-bg-in {
  to { background: rgba(0,0,0,0.35); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
}
.spotlight-modal {
  width: 520px; max-height: 480px;
  display: flex; flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--content-border);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(128,128,128,0.08);
  overflow: hidden;
  opacity: 0; transform: scale(0.95) translateY(-8px);
  animation: spotlight-modal-in 0.2s ease 0.03s forwards;
}
@keyframes spotlight-modal-in {
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.spotlight-search-row {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 18px 12px;
}
.spotlight-search-icon { color: var(--title-color); opacity: 0.35; flex-shrink: 0; }
.spotlight-scope {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px;
  background: transparent; color: var(--title-color);
  font-size: 12px; font-family: inherit; font-weight: 500;
  cursor: pointer; position: relative; flex-shrink: 0;
  transition: background 0.12s; user-select: none;
}
.spotlight-scope:hover { background: rgba(128,128,128,0.18); }
.spotlight-scope-label { line-height: 1; }
.spotlight-scope-arrow { transition: transform 0.15s; opacity: 0.5; }
.spotlight-scope-arrow.open { transform: rotate(180deg); }
.spotlight-scope-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 10;
  min-width: 130px; padding: 4px;
  background: var(--panel-bg); border: 1px solid var(--content-border);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}
.spotlight-scope-option {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 10px; border: none; border-radius: 7px;
  background: transparent; color: var(--title-color);
  font-size: 12px; font-family: inherit; cursor: pointer;
  transition: background 0.12s;
}
.spotlight-scope-option:hover { background: rgba(128,128,128,0.1); }
.spotlight-scope-option.active { background: rgba(128,128,128,0.12); font-weight: 600; }
.spotlight-modal-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: 16px; font-family: inherit; font-weight: 500;
  color: var(--title-color); caret-color: var(--title-color);
}
.spotlight-modal-input::placeholder { color: var(--title-color); opacity: 0.3; }
.spotlight-spinner {
  color: var(--title-color); opacity: 0.3;
  animation: spin 0.8s linear infinite; flex-shrink: 0;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spotlight-divider {
  height: 1px; margin: 0 18px;
  background: var(--content-border);
}
.spotlight-results {
  flex: 1; overflow-y: auto; padding: 8px;
}
.spotlight-section-label {
  font-size: 11px; font-weight: 600; color: var(--title-color); opacity: 0.35;
  padding: 6px 10px 4px; text-transform: uppercase; letter-spacing: 0.5px;
  user-select: none;
}
.spotlight-result-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 8px 10px; border: none; border-radius: 12px;
  background: transparent; cursor: pointer; text-align: left;
  transition: background 0.12s;
}
.spotlight-result-item:hover { background: rgba(128,128,128,0.1); }
.spotlight-result-icon-wrap {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(128,128,128,0.1); overflow: hidden;
}
.spotlight-result-icon-wrap.mc-icon { background: #4caf50; color: #fff; }
.spotlight-result-icon-img { width: 100%; height: 100%; object-fit: cover; }
.spotlight-result-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px;
}
.spotlight-result-title {
  font-size: 13px; font-weight: 600; color: var(--title-color);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.spotlight-result-desc {
  font-size: 11px; color: var(--title-color); opacity: 0.45;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.spotlight-result-arrow { color: var(--title-color); opacity: 0.2; flex-shrink: 0; }
.spotlight-empty {
  text-align: center; padding: 32px 16px;
  font-size: 13px; color: var(--title-color); opacity: 0.35;
}

/* instance cards */
.spotlight-inst-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: 12px;
  transition: background 0.12s;
}
.spotlight-inst-card:hover { background: rgba(128,128,128,0.08); }
.spotlight-inst-left {
  display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;
}
.spotlight-inst-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(128,128,128,0.1); color: var(--title-color);
}
.spotlight-inst-info {
  display: flex; flex-direction: column; gap: 1px; min-width: 0;
}
.spotlight-inst-name {
  font-size: 13px; font-weight: 600; color: var(--title-color);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.spotlight-inst-meta {
  font-size: 11px; color: var(--title-color); opacity: 0.45;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.spotlight-inst-actions {
  display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: 8px;
}
.spotlight-inst-btn {
  width: 28px; height: 28px; border: none; border-radius: 7px;
  background: transparent; color: var(--title-color);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0.4; transition: background 0.12s, opacity 0.12s;
}
.spotlight-inst-btn:hover { background: rgba(128,128,128,0.12); opacity: 0.9; }
.spotlight-inst-btn-launch { color: #00BAAD; }
.spotlight-inst-btn-launch:hover { background: rgba(0,186,173,0.12); opacity: 1; }
.spotlight-inst-btn-delete { color: #d43a3a; }
.spotlight-inst-btn-delete:hover { background: rgba(212,58,58,0.12); opacity: 1; }
.spotlight-inst-btn-select { color: #00BAAD; }
.spotlight-inst-btn-select:hover { background: rgba(0,186,173,0.12); opacity: 1; }
.spotlight-inst-select-btn {
  width: 28px; height: 28px; border: none; border-radius: 7px;
  background: transparent; color: #00BAAD;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0.5; flex-shrink: 0;
  transition: background 0.12s, opacity 0.12s;
}
.spotlight-inst-select-btn:hover { background: rgba(0,186,173,0.12); opacity: 1; }
.spotlight-inst-select-highlight {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(0,186,173,0.12); opacity: 0.8;
  margin-right: 5px;
}
.spotlight-inst-select-highlight:hover { background: rgba(0,186,173,0.22); opacity: 1; }
.spotlight-inst-row {
  display: flex; align-items: center; width: 100%; gap: 4px;
}
.spotlight-inst-row-left {
  display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
  cursor: pointer;
}
.spotlight-new-inst-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: calc(100% - 16px); margin: 6px 8px 4px; padding: 8px 0;
  border: 1px dashed rgba(128,128,128,0.2); border-radius: 10px;
  background: transparent; color: var(--title-color);
  font-size: 13px; font-weight: 500; font-family: inherit;
  cursor: pointer; opacity: 0.5; transition: background 0.12s, opacity 0.12s, border-color 0.12s;
}
.spotlight-new-inst-btn:hover {
  background: rgba(128,128,128,0.08); opacity: 0.9;
  border-color: rgba(128,128,128,0.35);
}
</style>
