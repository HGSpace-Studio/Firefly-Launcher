import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import steveAvatar from "../../../assets/imgs/skins/avator/steve.png";
import alexAvatar from "../../../assets/imgs/skins/avator/alex.png";
import "./AccountScreen.css";

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

const avatars = [steveAvatar, alexAvatar];
const MS_CLIENT_ID = "1cabeaef-70e5-4834-8aeb-85ff3671c46d";

const typeLabels: Record<string, string> = {
  offline: "离线账号",
  microsoft: "微软账户",
};

export default function AccountScreen() {
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
    } catch {}
  }

  async function loadAccounts() {
    try {
      setAccounts(await invoke<AccountEntry[]>("get_accounts"));
    } catch {
      setAccounts([]);
    }
  }

  async function loadAuthServers() {
    try {
      setAuthServers(await invoke<AuthServerEntry[]>("get_auth_servers"));
    } catch {
      setAuthServers([]);
    }
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
    } catch {}
  }

  function onOfflineInput() {
    setCurrentAvatar(avatars[Math.floor(Math.random() * avatars.length)]);
  }

  async function removeAccount(name: string) {
    try {
      setAccounts(await invoke<AccountEntry[]>("remove_account", { name }));
      window.dispatchEvent(new CustomEvent("account-changed"));
    } catch {}
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
    <>
      <div className="settings-body">
        <div className="setting-panel">
          <div className="setting-card">
            <div className="setting-card-info">
              <label className="setting-label">账号管理</label>
              <span className="setting-desc">当前共有 {currentAccountCount} 个账户</span>
            </div>
          </div>
        </div>

        <div className="setting-panel">
          <div className="setting-card col" style={{ gap: "8px", padding: "16px" }}>
            <div className="acc-create-row">
              <button className="acc-create-btn" onClick={() => { setShowAddOffline(true); setCurrentAvatar(avatars[Math.floor(Math.random() * avatars.length)]); }}>
                <span className="material-symbols-outlined">person_add</span>
                <span>添加离线账户</span>
              </button>
              <button className="acc-create-btn" onClick={() => { setShowMsAuth(true); }}>
                <span className="material-symbols-outlined">cloud</span>
                <span>添加微软账户</span>
              </button>
            </div>
          </div>
        </div>

        <div className="setting-panel">
          {accounts.length === 0 ? (
            <div className="setting-card" style={{ justifyContent: "center", padding: "32px", gap: "12px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.38 }}>person_off</span>
              <span style={{ opacity: 0.6, fontSize: 14 }}>暂无账号，请添加一个账户</span>
            </div>
          ) : (
            <div className="setting-card col" style={{ gap: "4px", padding: "8px" }}>
              {accounts.map((acc) => {
                const isCurrent = currentAccountName === acc.name;
                return (
                  <div key={acc.name} className={`acc-list-item${isCurrent ? " current" : ""}`} onClick={() => selectAccount(acc.name, acc.type)}>
                    <div className={`acc-list-radio${isCurrent ? " checked" : ""}`}>
                      {isCurrent && <div className="acc-list-radio-dot" />}
                    </div>
                    <img src={getAvatar(acc.name)} className="acc-list-avatar" />
                    <div className="acc-list-body">
                      <span className="acc-list-name">{acc.name}</span>
                      <span className="acc-list-type">{getTypeLabel(acc.type)}</span>
                    </div>
                    <button className="acc-list-delete" onClick={(e) => { e.stopPropagation(); removeAccount(acc.name); }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="setting-panel">
          <div className="setting-card" style={{ justifyContent: "space-between" }}>
            <div className="setting-card-info">
              <label className="setting-label">认证服务器</label>
              <span className="setting-desc">{authServers.length > 0 ? `共 ${authServers.length} 个` : "暂无认证服务器"}</span>
            </div>
            <button className="acc-add-server-btn" onClick={() => setShowAddServer(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            </button>
          </div>
          {authServers.length > 0 && (
            <div className="setting-card col" style={{ gap: "4px", padding: "8px" }}>
              {authServers.map((s) => (
                <div key={s.url} className="acc-server-item">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.6 }}>dns</span>
                  <div className="acc-server-body">
                    <span className="acc-server-name">{s.name}</span>
                    <span className="acc-server-url">{s.url}</span>
                  </div>
                  <button className="acc-list-delete" onClick={(e) => { e.stopPropagation(); (async () => { try { setAuthServers(await invoke<AuthServerEntry[]>("remove_auth_server", { url: s.url })); } catch {} })(); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddServer && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddServer(); }}>
          <div className="dialog-box">
            <div className="dialog-header">
              <span className="dialog-title">新增认证服务器</span>
              <button className="dialog-close-btn" onClick={closeAddServer}>
                <span className="material-symbols-outlined" style={{fontSize:20}}>close</span>
              </button>
            </div>
            <div className="dialog-body">
              <md-outlined-text-field
                value={addServerUrl}
                label="第三方认证服务器地址"
                placeholder="https://yourlink/api/yggdrasil"
                style={{ width: "100%" }}
                onInput={(e: any) => setAddServerUrl(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === "Enter") confirmAddServer(); }}
              />
              {addServerError && <span className="authserver-error">{addServerError}</span>}
            </div>
            <div className="dialog-footer">
              <div className="authserver-actions">
                <button
                  className="authserver-next-btn"
                  disabled={!addServerUrl.trim() || addServerLoading}
                  onClick={confirmAddServer}
                >
                  <md-ripple />
                  {addServerLoading ? <md-circular-progress indeterminate style={{width:18,height:18}} /> : "创建下一步"}
                </button>
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
                <span className="material-symbols-outlined" style={{fontSize:20}}>close</span>
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
                <span className="material-symbols-outlined" style={{fontSize:20}}>close</span>
              </button>
            </div>
            <div className="dialog-body">
              <div className="dialog-microsoft">
                {!msDeviceCode ? (
                  <div className="ms-start">
                    <span className="ms-desc">使用 Microsoft 账户登录以获取您的 Minecraft Java 角色</span>
                    <button className="ms-login-btn" disabled={msLoading} onClick={startMsLogin}>
                      {msLoading ? <md-circular-progress indeterminate style={{width:18,height:18}} /> : <span className="material-symbols-outlined" style={{fontSize:18}}>microsoft</span>}
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
    </>
  );
}
