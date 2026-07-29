import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { FileDown, FolderOpen, AlertTriangle } from "lucide-react";
import "./crush_shell.css";

interface CrashReport {
  instanceName: string;
  gameVersion: string;
  javaVersion: string;
  systemVersion: string;
  errorMessage: string;
  crashLog: string;
  solution: string;
}

export default function CrashShell() {
  const [report, setReport] = useState<CrashReport | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await invoke<CrashReport | null>("get_crash_report");
        setReport(data);
      } catch { /* ignore */ }
    })();

    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await listen("tauri://focus", () => {
        (async () => {
          try {
            const data = await invoke<CrashReport | null>("get_crash_report");
            setReport(data);
          } catch { /* ignore */ }
        })();
      });
    })();

    return () => { if (unlisten) unlisten(); };
  }, []);

  async function exportLog() {
    if (!report) return;
    const logContent = [
      `崩溃报告 - ${report.instanceName}`,
      `游戏版本: ${report.gameVersion}`,
      `Java 版本: ${report.javaVersion}`,
      `系统版本: ${report.systemVersion}`,
      `错误信息: ${report.errorMessage}`,
      `可能的原因及解决方式: ${report.solution}`,
      ``,
      `崩溃日志:`,
      report.crashLog,
    ].join("\n");
    try {
      await invoke("export_crash_log", { content: logContent });
    } catch { /* ignore */ }
  }

  async function openLogFolder() {
    try {
      await invoke("open_log_folder");
    } catch { /* fallback */ }
  }

  async function closeWindow() {
    try {
      await invoke("clear_crash_report");
    } catch { /* ignore */ }
    getCurrentWindow().close();
  }

  if (!report) {
    return <div className="crash-window loading"><span>正在加载崩溃报告...</span></div>;
  }

  return (
    <div className="crash-window">
      <div className="crash-appbar">
        <div className="crash-appbar-left">
          <AlertTriangle size={18} />
          <span>游戏非正常退出，请查看详细信息</span>
        </div>
        <div className="crash-appbar-right">
          <button className="crash-appbar-btn" onClick={exportLog}>
            <FileDown size={15} />
            <span>导出日志</span>
          </button>
          <button className="crash-appbar-btn" onClick={openLogFolder}>
            <FolderOpen size={15} />
            <span>打开日志文件夹</span>
          </button>
          <button className="crash-appbar-close" onClick={closeWindow}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="crash-body">
        <div className="crash-info-grid">
          <div className="crash-info-item">
            <span className="crash-info-label">游戏版本</span>
            <span className="crash-info-value">{report.gameVersion}</span>
          </div>
          <div className="crash-info-item">
            <span className="crash-info-label">Java 版本</span>
            <span className="crash-info-value">{report.javaVersion}</span>
          </div>
          <div className="crash-info-item">
            <span className="crash-info-label">系统版本</span>
            <span className="crash-info-value">{report.systemVersion}</span>
          </div>
        </div>
        <div className="crash-section">
          <div className="crash-section-header">
            <span>崩溃日志</span>
          </div>
          <pre className="crash-log">{report.crashLog || report.errorMessage}</pre>
        </div>
        <div className="crash-section">
          <div className="crash-section-header">
            <span>可能的原因及解决方式</span>
          </div>
          <div className="crash-solution">{report.solution}</div>
        </div>
        <div className="crash-warn-bar">
          <AlertTriangle size={14} />
          <span>请不要直接截图本窗口！请勿泄露个人隐私信息。</span>
        </div>
      </div>
    </div>
  );
}