<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { Rocket } from "@lucide/vue";

const { t } = useI18n();

const accountName = ref("");

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h >= 0 && h <= 10) return "上午好";
  if (h >= 11 && h <= 17) return "下午好";
  return "晚上好";
});

onMounted(async () => {
  try {
    const acc = await invoke<{ name: string }>("get_current_account");
    accountName.value = acc.name;
  } catch {
    accountName.value = "";
  }
  fetchNews();
  fetchQuickInstance();
});

interface NewsImage {
  title: string;
  url: string;
}

interface NewsEntry {
  title: string;
  date: string;
  text: string;
  playPageImage: NewsImage;
  newsPageImage: NewsImage;
  readMoreLink: string;
}

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
  installed: boolean;
}

const baseUrl = "https://launchercontent.mojang.com";
const allNews = ref<NewsEntry[]>([]);
const currentNewsIndex = ref(0);
let rotationTimer: ReturnType<typeof setInterval> | null = null;

const currentNews = computed(() => allNews.value[currentNewsIndex.value]);

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

async function fetchNews() {
  try {
    const res = await fetch(`${baseUrl}/v2/news.json`);
    if (!res.ok) return;
    const data = await res.json();
    let entries: NewsEntry[] = data.entries?.filter((e: any) => e.category === "Minecraft: Java Edition") || [];
    if (entries.length === 0) entries = data.entries || [];
    if (entries.length > 0) {
      allNews.value = entries;
      currentNewsIndex.value = Math.floor(Math.random() * entries.length);
      rotationTimer = setInterval(() => {
        currentNewsIndex.value = (currentNewsIndex.value + 1) % allNews.value.length;
      }, 6000);
    }
  } catch {
  }
}

onUnmounted(() => {
  if (rotationTimer) clearInterval(rotationTimer);
});

const quickInstance = ref<InstanceEntry | null>(null);
const quickLaunching = ref(false);

async function fetchQuickInstance() {
  try {
    const list = await invoke<InstanceEntry[]>("get_instances_list");
    const installed = list.filter(i => i.installed);
    if (installed.length > 0) quickInstance.value = installed[0];
  } catch {}
}

async function launchQuick() {
  if (!quickInstance.value || quickLaunching.value) return;
  quickLaunching.value = true;
  try {
    const inst = quickInstance.value;
    const acc = await invoke<{ name: string }>("get_current_account");
    const oobe = await invoke<{ accountName: string; javaPath: string }>("get_oobe_settings");
    const mcDir = await invoke<string>("get_minecraft_dir_string");
    await invoke("launch_minecraft", {
      args: {
        version: inst.version,
        username: acc.name || oobe.accountName || "Player",
        game_dir: mcDir,
        min_mem: "1024",
        max_mem: "2048",
        loader_type: inst.loader?.type || null,
        loader_build: inst.loader?.version || null,
        instance: inst.name,
        download_only: false,
        java_path: null,
        download_concurrency: null,
        verify_concurrency: null,
      },
    });
  } catch {}
  quickLaunching.value = false;
}
</script>

<template>
  <div class="home-page">
    <div class="home-header">
      <span class="home-header-sub">{{ t("app.mainwindow.home.title") }}</span>
      <span class="home-header-main">{{ greeting }}，{{ accountName }}</span>
    </div>
    <div class="home-area">
      <div class="home-row">
        <a
          v-if="currentNews"
          :href="currentNews.readMoreLink"
          target="_blank"
          class="news-hero"
          :style="{ backgroundImage: `url(${baseUrl}${currentNews.newsPageImage?.url || currentNews.playPageImage?.url})` }"
        >
          <div class="news-hero-overlay"></div>
          <div class="news-hero-content">
            <span class="news-hero-date">{{ formatDate(currentNews.date) }}</span>
            <span class="news-hero-title">{{ currentNews.title }}</span>
            <p class="news-hero-desc">{{ currentNews.text }}</p>
          </div>
          <div class="news-dots">
            <span
              v-for="(_, i) in allNews"
              :key="i"
              class="news-dot"
              :class="{ active: i === currentNewsIndex }"
            ></span>
          </div>
        </a>
        <div v-if="quickInstance" class="quick-launch">
          <span class="quick-launch-label">快速启动</span>
          <div class="quick-launch-body">
            <span class="quick-launch-name">{{ quickInstance.name }}</span>
            <span class="quick-launch-version">{{ quickInstance.version }}</span>
          </div>
          <button class="quick-launch-btn" :disabled="quickLaunching" @click="launchQuick">
            <Rocket :size="16" />
            <span>{{ quickLaunching ? "启动中..." : "启动" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 0 80px;
  overflow-y: auto;
}

.home-page > * {
  padding-left: 28px;
  padding-right: 28px;
}

.home-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.home-header-sub {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.home-header-main {
  font-size: 18px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.home-area {
  flex: 1;
  margin-top: 6px;
  min-height: 0;
}

.home-row {
  display: flex;
  gap: 12px;
  max-width: 50%;
  max-height: 50%;
  margin-top: 4px;
}

.news-hero {
  position: relative;
  flex: 1;
  border-radius: 12px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  background-size: cover;
  background-position: center;
  min-height: 320px;
}

.news-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 30%, rgba(0, 0, 0, 0.75));
  pointer-events: none;
}

.news-hero-content {
  position: relative;
  z-index: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.news-hero-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1;
}

.news-hero-title {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.news-hero-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.3;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 80%;
}

.news-dots {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 6px;
  z-index: 1;
}

.news-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  transition: background 0.3s;
}

.news-dot.active {
  background: #fff;
  width: 20px;
  border-radius: 4px;
}

.quick-launch {
  width: 260px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--panel-bg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
  box-sizing: border-box;
}

.quick-launch-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
  opacity: 0.6;
}

.quick-launch-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.quick-launch-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--title-color);
  line-height: 1.2;
}

.quick-launch-version {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.5;
}

.quick-launch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: var(--sidebar-active-color);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}

.quick-launch-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.quick-launch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
