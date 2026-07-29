import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, RefreshCw } from "lucide-react";
import InstanceDetail from "./instance_detail";
import type { InstanceData } from "./instance_detail";
import "./versionroot.css";

export default function VersionRoot() {
  const [version, setVersion] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instance] = useState<InstanceData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const v = await invoke<string>("get_version");
        setVersion(v);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const v = await invoke<string>("get_version");
      setVersion(v);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function selectVersion() {
    const selected = await invoke<string>("select_minecraft_version");
    if (selected) {
      setVersion(selected);
      refresh();
    }
  }

  if (loading) {
    return <div className="version-root loading">正在加载版本信息...</div>;
  }

  if (error) {
    return (
      <div className="version-root error">
        <p>加载失败: {error}</p>
        <button onClick={refresh}>重试</button>
      </div>
    );
  }

  return (
    <div className="version-root">
      <div className="version-header">
        <h1 className="version-title">{version}</h1>
        <div className="version-actions">
          <button className="version-refresh-btn" onClick={refresh}>
            <RefreshCw size={14} />
            <span>刷新</span>
          </button>
          <button className="version-select-btn" onClick={selectVersion}>
            <Gamepad2 size={14} />
            <span>选择版本</span>
          </button>
        </div>
      </div>
      {instance && <InstanceDetail instance={instance} />}
    </div>
  );
}