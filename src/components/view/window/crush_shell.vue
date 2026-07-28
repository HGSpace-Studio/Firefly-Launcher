<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { FileDown, FolderOpen, AlertTriangle } from "@lucide/vue";

interface CrashReport {
  instanceName: string;
  gameVersion: string;
  javaVersion: string;
  systemVersion: string;
  errorMessage: string;
  crashLog: string;
  solution: string;
}

const report = ref<CrashReport | null>(null);
const appWindow = getCurrentWindow();

async function loadReport() {
  try {
    const data = await invoke<CrashReport | null>("get_crash_report");
    report.value = data;
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await loadReport();
  const unlisten = await listen("tauri://focus", loadReport);
  onUnmounted(unlisten);
});

async function exportLog() {
  if (!report.value) return
  const logContent = [
    `崩溃报告 - ${report.value.instanceName}`,
    `游戏版本: ${report.value.gameVersion}`,
    `Java 版本: ${report.value.javaVersion}`,
    `系统版本: ${report.value.systemVersion}`,
    `错误信息: ${report.value.errorMessage}`,
    `可能的原因及解决方式: ${report.value.solution}`,
    ``,
    `崩溃日志:`,
    report.value.crashLog,
  ].join("\n")
  try {
    await invoke("export_crash_log", { content: logContent })
  } catch {
    // ignore
  }
}

async function openLogFolder() {
  try {
    await invoke("open_log_folder");
  } catch {
    // fallback
  }
}

async function closeWindow() {
  try {
    await invoke("clear_crash_report");
  } catch { /* ignore */ }
  appWindow.close();
}
</script>

<template>
  <div class="crash-window" v-if="report">
    <div class="crash-appbar">
      <div class="crash-appbar-left">
        <AlertTriangle :size="18" />
        <span>游戏非正常退出，请查看详细信息</span>
      </div>
      <div class="crash-appbar-right">
        <button class="crash-appbar-btn" @click="exportLog">
          <FileDown :size="15" />
          <span>导出日志</span>
        </button>
        <button class="crash-appbar-btn" @click="openLogFolder">
          <FolderOpen :size="15" />
          <span>打开日志文件夹</span>
        </button>
        <button class="crash-appbar-close" @click="closeWindow">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="crash-body">
      <div class="crash-info-grid">
        <div class="crash-info-item">
          <span class="crash-info-label">游戏版本</span>
          <span class="crash-info-value">{{ report.gameVersion }}</span>
        </div>
        <div class="crash-info-item">
          <span class="crash-info-label">Java 版本</span>
          <span class="crash-info-value">{{ report.javaVersion }}</span>
        </div>
        <div class="crash-info-item">
          <span class="crash-info-label">系统版本</span>
          <span class="crash-info-value">{{ report.systemVersion }}</span>
        </div>
      </div>

      <div class="crash-section">
        <div class="crash-section-header">
          <span>崩溃日志</span>
        </div>
        <pre class="crash-log">{{ report.crashLog || report.errorMessage }}</pre>
      </div>

      <div class="crash-section">
        <div class="crash-section-header">
          <span>可能的原因及解决方式</span>
        </div>
        <div class="crash-solution">{{ report.solution }}</div>
      </div>

      <div class="crash-warn-bar">
        <AlertTriangle :size="14" />
        <span>请不要直接截图本窗口！请勿泄露个人隐私信息。</span>
      </div>
    </div>
  </div>
  <div v-else class="crash-loading">
    <span>正在加载崩溃报告...</span>
  </div>
</template>

<style scoped>
.crash-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
}

.crash-appbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #c62828;
  color: #fff;
  flex-shrink: 0;
}

.crash-appbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.crash-appbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.crash-appbar-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.crash-appbar-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.crash-appbar-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  margin-left: 4px;
  transition: background 0.15s;
}

.crash-appbar-close:hover {
  background: rgba(0, 0, 0, 0.2);
}

.crash-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.crash-info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.crash-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: rgba(128, 128, 128, 0.06);
  border-radius: 8px;
}

.crash-info-label {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.crash-info-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.crash-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.crash-section-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--title-color);
  opacity: 0.7;
}

.crash-log {
  background: rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(128, 128, 128, 0.12);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  color: var(--title-color);
  opacity: 0.8;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.crash-solution {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.8;
  line-height: 1.6;
  padding: 12px;
  background: rgba(46, 125, 50, 0.08);
  border: 1px solid rgba(46, 125, 50, 0.2);
  border-radius: 8px;
}

.crash-warn-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 160, 0, 0.1);
  border: 1px solid rgba(255, 160, 0, 0.25);
  border-radius: 8px;
  font-size: 12px;
  color: #e65100;
}

.crash-loading {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--title-color);
  opacity: 0.5;
  font-size: 14px;
}
</style>
