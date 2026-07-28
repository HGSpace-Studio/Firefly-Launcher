<script setup lang="ts">
import {
  User, Plus, X, Trash2, Pencil, Palette, RefreshCw, Cloud,
} from "@lucide/vue";
import steveAvatar from "../assets/imgs/skins/avator/steve.png";
import alexAvatar from "../assets/imgs/skins/avator/alex.png";

import { ref, computed, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";

// ── Types ──
interface AccountEntry {
  name: string;
  type: string;
  uuid: string;
  ms_refresh_token?: string | null;
  mc_token?: string | null;
  xuid?: string | null;
}

interface AuthServerEntry {
  url: string;
  name: string;
}

// ── State ──
const accounts = ref<AccountEntry[]>([]);
const authServers = ref<AuthServerEntry[]>([]);
const currentAccountName = ref("");

const showAddOffline = ref(false);
const showMsAuth = ref(false);
const showAddServer = ref(false);
const offlineNameInput = ref("");
const avatars = [steveAvatar, alexAvatar];
const currentAvatar = ref(avatars[0]);
const addServerUrl = ref("");
const addServerLoading = ref(false);
const addServerError = ref("");

// ── Computed ──
const currentAccountCount = computed(() => accounts.value.length);

// ── Helpers ──
function getAvatar(name: string): string {
  const hash = name ? name.charCodeAt(0) % avatars.length : 0;
  return avatars[hash];
}

const typeLabels: Record<string, string> = {
  offline: "离线账号",
  microsoft: "微软账户",
};

function getTypeLabel(type: string): string {
  return typeLabels[type] || type;
}

// ── Load Data ──
async function loadCurrentAccount() {
  try {
    const a = await invoke<{ name: string }>("get_current_account");
    currentAccountName.value = a.name;
  } catch {
    currentAccountName.value = "";
  }
}

async function selectAccount(name: string, type: string) {
  try {
    await invoke("set_current_account", { name, accountType: type });
    currentAccountName.value = name;
    window.dispatchEvent(new CustomEvent("account-changed"));
  } catch {
    // ignore
  }
}

async function loadAccounts() {
  try {
    accounts.value = await invoke<AccountEntry[]>("get_accounts");
  } catch {
    accounts.value = [];
  }
}

function selectMicrosoft() {
  openMsAuth();
}

function selectOffline() {
  openAddOffline();
}

async function loadAuthServers() {
  try {
    authServers.value = await invoke<AuthServerEntry[]>("get_auth_servers");
  } catch {
    authServers.value = [];
  }
}

// ── Offline Account ──
function openAddOffline() {
  offlineNameInput.value = "";
  currentAvatar.value = avatars[Math.floor(Math.random() * avatars.length)];
  showAddOffline.value = true;
}

async function confirmOfflineAccount() {
  const name = offlineNameInput.value.trim();
  if (!name) return;
  try {
    accounts.value = await invoke<AccountEntry[]>("add_account", {
      name,
      accountType: "offline",
      uuid: null,
      msRefreshToken: null,
      mcToken: null,
      xuid: null,
    });
    window.dispatchEvent(new CustomEvent("account-changed"));
    showAddOffline.value = false;
  } catch {
    // ignore
  }
}

function onOfflineInput() {
  currentAvatar.value = avatars[Math.floor(Math.random() * avatars.length)];
}

async function removeAccount(name: string) {
  try {
    accounts.value = await invoke<AccountEntry[]>("remove_account", { name });
    window.dispatchEvent(new CustomEvent("account-changed"));
  } catch {
    // ignore
  }
}

// ── Microsoft Auth ──
const MS_CLIENT_ID = "1cabeaef-70e5-4834-8aeb-85ff3671c46d"
interface DeviceCodeResponse {
  user_code: string
  device_code: string
  verification_uri: string
  interval: number
}
interface MicrosoftAccount {
  name: string
  uuid: string
  xuid: string
  mc_token: string
  ms_refresh_token: string
}

type PollResult =
  | { status: "pending" }
  | { status: "complete" } & MicrosoftAccount
  | { status: "error"; reason: string }

const msDeviceCode = ref<DeviceCodeResponse | null>(null)
const msLoading = ref(false)
const msPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const msPollProgress = ref(0)
const msError = ref("")

function openMsAuth() {
  msDeviceCode.value = null;
  msLoading.value = false;
  msPollProgress.value = 0;
  msError.value = "";
  if (msPollTimer.value) clearTimeout(msPollTimer.value);
  showMsAuth.value = true;
}

async function startMsLogin() {
  msError.value = ""
  msLoading.value = true
  msDeviceCode.value = null
  try {
    const code = await invoke<DeviceCodeResponse>("start_microsoft_auth", { clientId: MS_CLIENT_ID })
    msDeviceCode.value = code
    msPollProgress.value = 0
    pollMsAuth(code)
  } catch (e: any) {
    msError.value = "启动 Microsoft 登录失败: " + (e?.toString() || "未知错误")
  } finally {
    msLoading.value = false
  }
}

async function pollMsAuth(code: DeviceCodeResponse) {
  try {
    const result = await invoke<PollResult>("poll_microsoft_auth", {
      clientId: MS_CLIENT_ID,
      deviceCode: code.device_code,
    })
    if (result.status === "complete") {
      const account = result as MicrosoftAccount & { status: "complete" }
      await invoke<AccountEntry[]>("add_account", {
        name: account.name,
        accountType: "microsoft",
        uuid: account.uuid,
        msRefreshToken: account.ms_refresh_token,
        mcToken: account.mc_token,
        xuid: account.xuid,
      })
      window.dispatchEvent(new CustomEvent("account-changed"))
      accounts.value = await invoke<AccountEntry[]>("get_accounts")
      showMsAuth.value = false
      msDeviceCode.value = null
      return
    } else if (result.status === "pending") {
    } else {
      alert("Microsoft 登录出错: " + (result as any).reason)
      return
    }
  } catch (e: any) {
    console.error("poll invoke failed:", e)
    return
  }
  const progress = Math.min(msPollProgress.value + 3, 95)
  msPollProgress.value = progress
  const delay = (code.interval || 5) * 1000
  msPollTimer.value = setTimeout(() => pollMsAuth(code), delay)
}

function cancelMsLogin() {
  if (msPollTimer.value) {
    clearTimeout(msPollTimer.value)
    msPollTimer.value = null
  }
  msDeviceCode.value = null
  msPollProgress.value = 0
}

function openMsUrl(url: string) {
  openExternalUrl(url)
}

function closeMsAuth() {
  cancelMsLogin();
  showMsAuth.value = false;
}

// ── Auth Server ──
async function confirmAddServer() {
  const url = addServerUrl.value.trim();
  if (!url) return;
  addServerLoading.value = true;
  addServerError.value = "";
  try {
    await invoke<AuthServerEntry>("add_auth_server", { url });
    authServers.value = await invoke<AuthServerEntry[]>("get_auth_servers");
    showAddServer.value = false;
    addServerUrl.value = "";
  } catch (e: any) {
    addServerError.value = typeof e === 'string' ? e : (e?.toString() || "添加失败");
  } finally {
    addServerLoading.value = false;
  }
}

async function removeAuthServer(url: string) {
  try {
    authServers.value = await invoke<AuthServerEntry[]>("remove_auth_server", { url });
  } catch {
    // ignore
  }
}

function closeAddServer() {
  showAddServer.value = false;
  addServerUrl.value = "";
  addServerError.value = "";
  addServerLoading.value = false;
}

// ── Lifecycle ──
onMounted(() => {
  loadAccounts();
  loadAuthServers();
  loadCurrentAccount();
});

const emit = defineEmits<{
  (e: "close"): void;
}>();

onUnmounted(() => {
  if (msPollTimer.value) clearTimeout(msPollTimer.value)
})
</script>

<template>
  <div class="acc-overlay" @click.self="emit('close')">
    <div class="acc-window">
      <div class="acc-header-bar">
        <div class="acc-header-left">
          <span class="acc-header-icon"><User :size="16" /></span>
          <span class="acc-header-title">管理账号</span>
        </div>
        <button class="acc-close-btn" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>
      <div class="acc-divider"></div>
      <div class="acc-layout">
        <!-- Sidebar -->
        <div class="acc-sidebar">
          <div class="acc-sidebar-list">
            <div class="acc-sidebar-hint">选择以下方式创建对应账户名</div>
            <div class="acc-sidebar-item" @click="selectMicrosoft">
              <span class="acc-sidebar-icon"><User :size="16" /></span>
              <span class="acc-sidebar-label">正版账号</span>
            </div>
            <div class="acc-sidebar-item" @click="selectOffline">
              <span class="acc-sidebar-icon"><User :size="16" /></span>
              <span class="acc-sidebar-label">离线账户</span>
            </div>

            <div v-if="authServers.length > 0" class="acc-sidebar-divider"></div>
            <div v-for="s in authServers" :key="s.url" class="acc-sidebar-item">
              <span class="acc-sidebar-icon"><Cloud :size="16" /></span>
              <span class="acc-sidebar-label">{{ s.name }}</span>
              <button class="acc-sidebar-remove" @click.stop="removeAuthServer(s.url)" title="删除">
                <X :size="12" />
              </button>
            </div>
          </div>
          <div class="acc-sidebar-footer">
            <button class="acc-add-server-btn" @click="showAddServer = true">
              <Plus :size="14" />
              <span>新增认证服务器</span>
            </button>
          </div>
        </div>

        <div class="acc-divider-v"></div>

        <!-- Content -->
        <div class="acc-content">
          <div class="acc-content-header">
            <span class="acc-content-title">我的账号 <span class="acc-content-count">{{ currentAccountCount }}</span></span>
          </div>

          <div class="acc-content-body">
            <div v-if="accounts.length === 0" class="acc-empty">
              <User :size="48" class="acc-empty-icon" />
              <span class="acc-empty-text">暂无账号</span>
            </div>
            <div v-else class="acc-list">
              <div v-for="acc in accounts" :key="acc.name" class="acc-card">
                <button
                  class="acc-radio"
                  :class="{ checked: currentAccountName === acc.name }"
                  @click="selectAccount(acc.name, acc.type)"
                >
                  <span class="acc-radio-dot"></span>
                </button>
                <img :src="getAvatar(acc.name)" class="acc-card-avatar" />
                <div class="acc-card-body">
                  <span class="acc-card-name">{{ acc.name }}</span>
                  <span class="acc-card-type">{{ getTypeLabel(acc.type) }}</span>
                </div>
                <div class="acc-card-actions">
                  <button class="acc-action-btn" title="编辑">
                    <Pencil :size="16" />
                  </button>
                  <button class="acc-action-btn" title="皮肤">
                    <Palette :size="16" />
                  </button>
                  <button class="acc-action-btn danger" title="删除" @click="removeAccount(acc.name)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Auth Server Dialog -->
    <Teleport to="body">
      <div v-if="showAddServer" class="dialog-overlay" @click.self="closeAddServer">
        <div class="dialog-box">
          <div class="dialog-header">
            <span class="dialog-title">新增认证服务器</span>
            <button class="dialog-close-btn" @click="closeAddServer">
              <X :size="18" />
            </button>
          </div>
          <div class="dialog-body">
            <div class="authserver-form">
              <span class="authserver-label">第三方认证服务器地址</span>
              <input
                v-model="addServerUrl"
                class="authserver-input"
                placeholder="https://yourlink/api/yggdrasil"
                @keyup.enter="confirmAddServer"
              />
              <span v-if="addServerError" class="authserver-error">{{ addServerError }}</span>
              <div class="authserver-footer">
                <button
                  class="authserver-next-btn"
                  :disabled="!addServerUrl.trim() || addServerLoading"
                  @click="confirmAddServer"
                >
                  {{ addServerLoading ? '请稍候...' : '创建下一步' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add Offline Account Dialog -->
    <Teleport to="body">
      <div v-if="showAddOffline" class="dialog-overlay" @click.self="showAddOffline = false">
        <div class="dialog-box" style="width:480px">
          <div class="dialog-header">
            <span class="dialog-title">添加离线账户</span>
            <button class="dialog-close-btn" @click="showAddOffline = false">
              <X :size="18" />
            </button>
          </div>
          <div class="dialog-body">
            <div class="offline-row">
              <div class="offline-avatar-wrap">
                <img :src="currentAvatar" class="offline-avatar" />
              </div>
              <div class="offline-input-area">
                <span class="offline-label">输入您的玩家名称</span>
                <input
                  v-model="offlineNameInput"
                  class="offline-input"
                  placeholder="Steve"
                  maxlength="16"
                  @input="onOfflineInput"
                  @keyup.enter="confirmOfflineAccount"
                />
              </div>
            </div>
            <div class="offline-footer">
              <button
                class="offline-confirm-btn"
                :disabled="!offlineNameInput.trim()"
                @click="confirmOfflineAccount"
              >确认</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Microsoft Auth Dialog -->
    <Teleport to="body">
      <div v-if="showMsAuth" class="dialog-overlay" @click.self="closeMsAuth">
        <div class="dialog-box">
          <div class="dialog-header">
            <span class="dialog-title">添加微软账户</span>
            <button class="dialog-close-btn" @click="closeMsAuth">
              <X :size="18" />
            </button>
          </div>
          <div class="dialog-body">
            <div class="dialog-microsoft">
              <div v-if="!msDeviceCode" class="ms-start">
                <span class="ms-desc">使用 Microsoft 账户登录以获取您的 Minecraft Java 角色</span>
                <button class="ms-login-btn" :disabled="msLoading" @click="startMsLogin">
                  <RefreshCw :size="16" v-if="msLoading" class="spin" />
                  <span>{{ msLoading ? '请稍候...' : '登录微软账户' }}</span>
                </button>
                <span v-if="msError" class="ms-error">{{ msError }}</span>
              </div>
              <div v-else class="ms-code">
                <span class="ms-desc">请在浏览器中打开以下链接并输入代码</span>
                <a class="ms-url" :href="msDeviceCode.verification_uri" target="_blank" @click.prevent="openMsUrl(msDeviceCode.verification_uri)">{{ msDeviceCode.verification_uri }}</a>
                <div class="ms-code-box">{{ msDeviceCode.user_code }}</div>
                <span class="ms-hint">等待验证中...</span>
                <div class="ms-tbar"><div class="ms-tfill" :style="{ width: msPollProgress + '%' }"></div></div>
                <button class="ms-cancel-btn" @click="cancelMsLogin">取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.acc-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
}

.acc-window {
  display: flex;
  flex-direction: column;
  width: 700px;
  height: 520px;
  background: var(--content-bg);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.25);
  overflow: hidden;
}

.acc-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  flex-shrink: 0;
}

.acc-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.acc-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--settings-icon-bg);
  color: #fff;
}

.acc-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--title-color);
}

.acc-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  opacity: 0.5;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.acc-close-btn:hover {
  background: rgba(128,128,128,0.12);
  opacity: 1;
}

.acc-divider {
  height: 1px;
  background: rgba(128,128,128,0.15);
  flex-shrink: 0;
}

/* ── Layout ── */
.acc-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.acc-divider-v {
  width: 1px;
  background: rgba(128,128,128,0.12);
  flex-shrink: 0;
}

/* ── Sidebar ── */
.acc-sidebar {
  width: 210px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 12px 0;
  background: rgba(128,128,128,0.03);
}

.acc-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.acc-sidebar-hint {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.4;
  padding: 0 12px 12px;
  line-height: 1.4;
}

.acc-sidebar-divider {
  height: 1px;
  background: rgba(128,128,128,0.12);
  margin: 8px 12px;
}

.acc-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--title-color);
  font-size: 13px;
}

.acc-sidebar-item:hover {
  background: rgba(128,128,128,0.08);
}

.acc-sidebar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  opacity: 0.7;
}

.acc-sidebar-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acc-sidebar-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--title-color);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
  flex-shrink: 0;
}

.acc-sidebar-item:hover .acc-sidebar-remove {
  opacity: 0.4;
}

.acc-sidebar-remove:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
  opacity: 1 !important;
}

.acc-sidebar-footer {
  padding: 8px;
  flex-shrink: 0;
}

.acc-add-server-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: 1px dashed rgba(128,128,128,0.25);
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  opacity: 0.6;
}

.acc-add-server-btn:hover {
  background: rgba(128,128,128,0.06);
  border-color: rgba(128,128,128,0.4);
  opacity: 1;
}

/* ── Content ── */
.acc-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 20px 24px;
}

.acc-content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.acc-content-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--title-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.acc-content-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--title-color);
  opacity: 0.4;
  line-height: 1;
}

.acc-content-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 100px;
  background: var(--sidebar-active-color);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
}

.acc-content-add-btn:hover {
  opacity: 0.85;
}

.acc-content-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ── Empty State ── */
.acc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: var(--title-color);
  opacity: 0.4;
}

.acc-empty-icon {
  opacity: 0.5;
}

.acc-empty-text {
  font-size: 14px;
}

/* ── Account Cards ── */
.acc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.acc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--panel-bg);
  transition: background 0.15s;
}

.acc-radio {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(128,128,128,0.3);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: border-color 0.15s;
}

.acc-radio:hover {
  border-color: rgba(128,128,128,0.6);
}

.acc-radio.checked {
  border-color: #00BAAD;
}

.acc-radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s, transform 0.15s;
  transform: scale(0);
}

.acc-radio.checked .acc-radio-dot {
  background: #00BAAD;
  transform: scale(1);
}

.acc-card:hover {
  background: rgba(128, 128, 128, 0.08);
}

.acc-card-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
  image-rendering: pixelated;
}

.acc-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.acc-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--title-color);
  line-height: 1.2;
}

.acc-card-type {
  font-size: 11px;
  color: var(--title-color);
  opacity: 0.45;
  line-height: 1;
}

.acc-card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.acc-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--title-color);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  opacity: 0.45;
}

.acc-action-btn:hover {
  background: rgba(128, 128, 128, 0.12);
  opacity: 0.85;
}

.acc-action-btn.danger:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  opacity: 1;
}

/* ── Dialogs ── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-box {
  background: var(--panel-bg);
  border-radius: 16px;
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--title-color);
}

.dialog-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--title-color);
  cursor: pointer;
  transition: background 0.15s;
}

.dialog-close-btn:hover {
  background: rgba(128, 128, 128, 0.15);
}

.dialog-body {
  padding: 20px;
}

/* ── Auth Server Form ── */
.authserver-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.authserver-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.7;
}

.authserver-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);
  color: var(--title-color);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.authserver-input:focus {
  border-color: var(--title-color);
}

.authserver-error {
  font-size: 12px;
  color: #e74c3c;
  line-height: 1.4;
}

.authserver-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.authserver-next-btn {
  padding: 9px 24px;
  border: none;
  border-radius: 100px;
  background: #00ED5F;
  color: var(--title-color);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}

.authserver-next-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.authserver-next-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Offline Dialog ── */
.offline-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.offline-avatar-wrap {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.offline-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.offline-input-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.offline-label {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.7;
}

.offline-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);
  color: var(--title-color);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.offline-input:focus {
  border-color: var(--title-color);
}

.offline-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.offline-confirm-btn {
  padding: 9px 24px;
  border: none;
  border-radius: 100px;
  background: #00ED5F;
  color: var(--title-color);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}

.offline-confirm-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.offline-confirm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Microsoft Auth Dialog ── */
.dialog-microsoft {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px 0;
}

.ms-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.ms-desc {
  font-size: 13px;
  color: var(--title-color);
  opacity: 0.7;
  text-align: center;
  line-height: 1.5;
}

.ms-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #0078d4;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ms-login-btn:hover:not(:disabled) { opacity: 0.85; }
.ms-login-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ms-error { font-size: 12px; color: #e74c3c; text-align: center; line-height: 1.4; }

.ms-code {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.ms-url {
  font-size: 14px;
  font-weight: 600;
  color: #0078d4;
  text-decoration: none;
  cursor: pointer;
}

.ms-url:hover { text-decoration: underline; }

.ms-code-box {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 6px;
  padding: 12px 24px;
  border-radius: 10px;
  background: rgba(128,128,128,0.08);
  color: var(--title-color);
  font-family: monospace;
}

.ms-hint {
  font-size: 12px;
  color: var(--title-color);
  opacity: 0.45;
}

.ms-tbar {
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: rgba(128,128,128,0.12);
  overflow: hidden;
}

.ms-tfill {
  height: 100%;
  border-radius: 2px;
  background: #0078d4;
  transition: width 0.5s ease;
}

.ms-cancel-btn {
  padding: 6px 16px;
  border: 1px solid rgba(128,128,128,0.25);
  border-radius: 6px;
  background: transparent;
  color: var(--title-color);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.ms-cancel-btn:hover { opacity: 1; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}
</style>
