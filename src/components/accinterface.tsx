import {
  User, Plus, X, Trash2, Pencil, Palette, RefreshCw, Cloud,
} from "lucide-react";
import steveAvatar from "../assets/imgs/skins/avator/steve.png";
import alexAvatar from "../assets/imgs/skins/avator/alex.png";
import "./accinterface.css";
import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";

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

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  interval: number;
}

interface MicrosoftAccount {
  name: string;
  uuid: string;
  xuid: string;
  mc_token: string;
  ms_refresh_token: string;
}

type PollResult =
  | { status: "pending" }
  | { status: "complete" } & MicrosoftAccount
  | { status: "error"; reason: string };

interface AccinterfaceProps {
  onClose: () => void;
}

const avatars = [steveAvatar, alexAvatar];

export default function Accinterface({ onClose }: AccinterfaceProps) {
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [authServers, setAuthServers] = useState<AuthServerEntry[]>([]);
  const [currentAccountName, setCurrentAccountName] = useState("");
  const [showAddOffline, setShowAddOffline] = useState(false);
  const [showMsAuth, setShowMsAuth] = useState(false);
  const [showAddServer, setShowAddServer] = useState(false);
  const [offlineNameInput, setOfflineNameInput] = useState("");
  const [currentAvatar, setCurrentAvatar] = useState(avatars[0]);
  const [addServerUrl, setAddServerUrl] = useState("");
  const [addServerLoading, setAddServerLoading] = useState(false);
  const [addServerError, setAddServerError] = useState("");
  const [msDeviceCode, setMsDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [msLoading, setMsLoading] = useState(false);
  const [msPollProgress, setMsPollProgress] = useState(0);
  const [msError, setMsError] = useState("");
  const msPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentAccountCount = useMemo(() => accounts.length, [accounts]);

  const MS_CLIENT_ID = "1cabeaef-70e5-4834-8aeb-85ff3671c46d";

  const typeLabels: Record<string, string> = {
    offline: "离线账号",
    microsoft: "微软账户",
  };

  function getTypeLabel(type: string): string {
    return typeLabels[type] || type;
  }

  function getAvatar(name: string): string {
    const hash = name ? name.charCodeAt(0) % avatars.length : 0;
    return avatars[hash];
  }

  async function loadCurrentAccount() {
    try {
      const a = await invoke<{ name: string }>("get_current_account");
      setCurrentAccountName(a.name);
    } catch {
      setCurrentAccountName("");
    }
  }

  async function selectAccount(name: string, type: string) {
    try {
      await invoke("set_current_account", { name, accountType: type });
      setCurrentAccountName(name);
      window.dispatchEvent(new CustomEvent("account-changed"));
    } catch {
      // ignore
    }
  }

  async function loadAccounts() {
    try {
      setAccounts(await invoke<AccountEntry[]>("get_accounts"));
    } catch {
      setAccounts([]);
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
      setAuthServers(await invoke<AuthServerEntry[]>("get_auth_servers"));
    } catch {
      setAuthServers([]);
    }
  }

  function openAddOffline() {
    setOfflineNameInput("");
    setCurrentAvatar(avatars[Math.floor(Math.random() * avatars.length)]);
    setShowAddOffline(true);
  }

  async function confirmOfflineAccount() {
    const name = offlineNameInput.trim();
    if (!name) return;
    try {
      setAccounts(await invoke<AccountEntry[]>("add_account", {
        name,
        accountType: "offline",
        uuid: null,
        msRefreshToken: null,
        mcToken: null,
        xuid: null,
      }));
      window.dispatchEvent(new CustomEvent("account-changed"));
      setShowAddOffline(false);
    } catch {
      // ignore
    }
  }

  function onOfflineInput() {
    setCurrentAvatar(avatars[Math.floor(Math.random() * avatars.length)]);
  }

  async function removeAccount(name: string) {
    try {
      setAccounts(await invoke<AccountEntry[]>("remove_account", { name }));
      window.dispatchEvent(new CustomEvent("account-changed"));
    } catch {
      // ignore
    }
  }

  function openMsAuth() {
    setMsDeviceCode(null);
    setMsLoading(false);
    setMsPollProgress(0);
    setMsError("");
    if (msPollTimerRef.current) clearTimeout(msPollTimerRef.current);
    setShowMsAuth(true);
  }

  async function startMsLogin() {
    setMsError("");
    setMsLoading(true);
    setMsDeviceCode(null);
    try {
      const code = await invoke<DeviceCodeResponse>("start_microsoft_auth", { clientId: MS_CLIENT_ID });
      setMsDeviceCode(code);
      setMsPollProgress(0);
      pollMsAuth(code, 0);
    } catch (e: any) {
      setMsError("启动 Microsoft 登录失败: " + (e?.toString() || "未知错误"));
    } finally {
      setMsLoading(false);
    }
  }

  async function pollMsAuth(code: DeviceCodeResponse, progress: number) {
    try {
      const result = await invoke<PollResult>("poll_microsoft_auth", {
        clientId: MS_CLIENT_ID,
        deviceCode: code.device_code,
      });
      if (result.status === "complete") {
        const account = result as MicrosoftAccount & { status: "complete" };
        await invoke<AccountEntry[]>("add_account", {
          name: account.name,
          accountType: "microsoft",
          uuid: account.uuid,
          msRefreshToken: account.ms_refresh_token,
          mcToken: account.mc_token,
          xuid: account.xuid,
        });
        window.dispatchEvent(new CustomEvent("account-changed"));
        setAccounts(await invoke<AccountEntry[]>("get_accounts"));
        setShowMsAuth(false);
        setMsDeviceCode(null);
        return;
      } else if (result.status === "pending") {
        // continue polling
      } else {
        alert("Microsoft 登录出错: " + (result as any).reason);
        return;
      }
    } catch (e: any) {
      console.error("poll invoke failed:", e);
      return;
    }
    const nextProgress = Math.min(progress + 3, 95);
    setMsPollProgress(nextProgress);
    const delay = (code.interval || 5) * 1000;
    msPollTimerRef.current = setTimeout(() => pollMsAuth(code, nextProgress), delay);
  }

  function cancelMsLogin() {
    if (msPollTimerRef.current) {
      clearTimeout(msPollTimerRef.current);
      msPollTimerRef.current = null;
    }
    setMsDeviceCode(null);
    setMsPollProgress(0);
  }

  function openMsUrl(url: string) {
    openExternalUrl(url);
  }

  function closeMsAuth() {
    cancelMsLogin();
    setShowMsAuth(false);
  }

  async function confirmAddServer() {
    const url = addServerUrl.trim();
    if (!url) return;
    setAddServerLoading(true);
    setAddServerError("");
    try {
      await invoke<AuthServerEntry>("add_auth_server", { url });
      setAuthServers(await invoke<AuthServerEntry[]>("get_auth_servers"));
      setShowAddServer(false);
      setAddServerUrl("");
    } catch (e: any) {
      setAddServerError(typeof e === "string" ? e : e?.toString() || "添加失败");
    } finally {
      setAddServerLoading(false);
    }
  }

  async function removeAuthServer(url: string) {
    try {
      setAuthServers(await invoke<AuthServerEntry[]>("remove_auth_server", { url }));
    } catch {
      // ignore
    }
  }

  function closeAddServer() {
    setShowAddServer(false);
    setAddServerUrl("");
    setAddServerError("");
    setAddServerLoading(false);
  }

  useEffect(() => {
    loadAccounts();
    loadAuthServers();
    loadCurrentAccount();
  }, []);

  useEffect(() => {
    return () => {
      if (msPollTimerRef.current) clearTimeout(msPollTimerRef.current);
    };
  }, []);

  return (
    <div className="acc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acc-window">
        <div className="acc-header-bar">
          <div className="acc-header-left">
            <span className="acc-header-icon"><User size={16} /></span>
            <span className="acc-header-title">管理账号</span>
          </div>
          <button className="acc-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="acc-divider"></div>
        <div className="acc-layout">
          <div className="acc-sidebar">
            <div className="acc-sidebar-list">
              <div className="acc-sidebar-hint">选择以下方式创建对应账户名</div>
              <div className="acc-sidebar-item" onClick={selectMicrosoft}>
                <span className="acc-sidebar-icon"><User size={16} /></span>
                <span className="acc-sidebar-label">正版账号</span>
              </div>
              <div className="acc-sidebar-item" onClick={selectOffline}>
                <span className="acc-sidebar-icon"><User size={16} /></span>
                <span className="acc-sidebar-label">离线账户</span>
              </div>

              {authServers.length > 0 && <div className="acc-sidebar-divider"></div>}
              {authServers.map(s => (
                <div key={s.url} className="acc-sidebar-item">
                  <span className="acc-sidebar-icon"><Cloud size={16} /></span>
                  <span className="acc-sidebar-label">{s.name}</span>
                  <button
                    className="acc-sidebar-remove"
                    onClick={(e) => { e.stopPropagation(); removeAuthServer(s.url); }}
                    title="删除"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="acc-sidebar-footer">
              <button className="acc-add-server-btn" onClick={() => setShowAddServer(true)}>
                <Plus size={14} />
                <span>新增认证服务器</span>
              </button>
            </div>
          </div>

          <div className="acc-divider-v"></div>

          <div className="acc-content">
            <div className="acc-content-header">
              <span className="acc-content-title">
                我的账号 <span className="acc-content-count">{currentAccountCount}</span>
              </span>
            </div>

            <div className="acc-content-body">
              {accounts.length === 0 ? (
                <div className="acc-empty">
                  <User size={48} className="acc-empty-icon" />
                  <span className="acc-empty-text">暂无账号</span>
                </div>
              ) : (
                <div className="acc-list">
                  {accounts.map(acc => (
                    <div key={acc.name} className="acc-card">
                      <button
                        className={`acc-radio ${currentAccountName === acc.name ? "checked" : ""}`}
                        onClick={() => selectAccount(acc.name, acc.type)}
                      >
                        <span className="acc-radio-dot"></span>
                      </button>
                      <img src={getAvatar(acc.name)} className="acc-card-avatar" />
                      <div className="acc-card-body">
                        <span className="acc-card-name">{acc.name}</span>
                        <span className="acc-card-type">{getTypeLabel(acc.type)}</span>
                      </div>
                      <div className="acc-card-actions">
                        <button className="acc-action-btn" title="编辑">
                          <Pencil size={16} />
                        </button>
                        <button className="acc-action-btn" title="皮肤">
                          <Palette size={16} />
                        </button>
                        <button className="acc-action-btn danger" title="删除" onClick={() => removeAccount(acc.name)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddServer && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddServer(); }}>
          <div className="dialog-box">
            <div className="dialog-header">
              <span className="dialog-title">新增认证服务器</span>
              <button className="dialog-close-btn" onClick={closeAddServer}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="authserver-form">
                <span className="authserver-label">第三方认证服务器地址</span>
                <input
                  value={addServerUrl}
                  onChange={(e) => setAddServerUrl(e.target.value)}
                  className="authserver-input"
                  placeholder="https://yourlink/api/yggdrasil"
                  onKeyDown={(e) => { if (e.key === "Enter") confirmAddServer(); }}
                />
                {addServerError && <span className="authserver-error">{addServerError}</span>}
                <div className="authserver-footer">
                  <button
                    className="authserver-next-btn"
                    disabled={!addServerUrl.trim() || addServerLoading}
                    onClick={confirmAddServer}
                  >
                    {addServerLoading ? "请稍候..." : "创建下一步"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddOffline && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddOffline(false); }}>
          <div className="dialog-box" style={{ width: "480px" }}>
            <div className="dialog-header">
              <span className="dialog-title">添加离线账户</span>
              <button className="dialog-close-btn" onClick={() => setShowAddOffline(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="offline-row">
                <div className="offline-avatar-wrap">
                  <img src={currentAvatar} className="offline-avatar" />
                </div>
                <div className="offline-input-area">
                  <span className="offline-label">输入您的玩家名称</span>
                  <input
                    value={offlineNameInput}
                    onChange={(e) => setOfflineNameInput(e.target.value)}
                    className="offline-input"
                    placeholder="Steve"
                    maxLength={16}
                    onInput={onOfflineInput}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmOfflineAccount(); }}
                  />
                </div>
              </div>
              <div className="offline-footer">
                <button
                  className="offline-confirm-btn"
                  disabled={!offlineNameInput.trim()}
                  onClick={confirmOfflineAccount}
                >确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMsAuth && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeMsAuth(); }}>
          <div className="dialog-box">
            <div className="dialog-header">
              <span className="dialog-title">添加微软账户</span>
              <button className="dialog-close-btn" onClick={closeMsAuth}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="dialog-microsoft">
                {!msDeviceCode ? (
                  <div className="ms-start">
                    <span className="ms-desc">使用 Microsoft 账户登录以获取您的 Minecraft Java 角色</span>
                    <button className="ms-login-btn" disabled={msLoading} onClick={startMsLogin}>
                      <RefreshCw size={16} className={msLoading ? "spin" : ""} />
                      <span>{msLoading ? "请稍候..." : "登录微软账户"}</span>
                    </button>
                    {msError && <span className="ms-error">{msError}</span>}
                  </div>
                ) : (
                  <div className="ms-code">
                    <span className="ms-desc">请在浏览器中打开以下链接并输入代码</span>
                    <a className="ms-url" href={msDeviceCode.verification_uri} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); openMsUrl(msDeviceCode.verification_uri); }}>
                      {msDeviceCode.verification_uri}
                    </a>
                    <div className="ms-code-box">{msDeviceCode.user_code}</div>
                    <span className="ms-hint">等待验证中...</span>
                    <div className="ms-tbar">
                      <div className="ms-tfill" style={{ width: msPollProgress + "%" }}></div>
                    </div>
                    <button className="ms-cancel-btn" onClick={cancelMsLogin}>取消</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}