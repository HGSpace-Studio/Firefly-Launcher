import { useRef, useEffect, useState } from "react";

interface InstanceEntry {
  name: string;
  version: string;
  loader?: { type: string; version: string };
}

interface TaskEntry {
  id: string;
  status: string;
}

interface Props {
  currentInstEntry: InstanceEntry | null;
  dockTask: TaskEntry | null;
  onDockLaunch: () => void;
  onSwitchInstance: () => void;
}

export function RightCard({ currentInstEntry, dockTask, onDockLaunch, onSwitchInstance }: Props) {
  const [tab, setTab] = useState(0);
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const handler = () => setTab((el as any).activeTabIndex);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  return (
    <aside className="right-card">
      <md-tabs ref={tabsRef} activeTabIndex={tab}>
        <md-primary-tab>启动</md-primary-tab>
        <md-primary-tab>运行中的任务</md-primary-tab>
      </md-tabs>
      <div className="right-card-content">
        {tab === 0 && (
          <div className="right-card-pane right-card-launch-pane">
            <div className="rc-fab-wrapper">
              <button className="rc-fab-switch" onClick={onSwitchInstance}>
                <span className="material-symbols-outlined">extension</span>
                {currentInstEntry ? (
                  <span className="rc-fab-switch-text">
                    <span className="rc-fab-switch-name">{currentInstEntry.name}</span>
                    <span className="rc-fab-switch-loader">{currentInstEntry.version}</span>
                  </span>
                ) : (
                  <span className="rc-fab-switch-text">
                    <span className="rc-fab-switch-name">选择实例</span>
                  </span>
                )}
              </button>
              {dockTask?.status === "launching" ? (
                <div className="rc-fab-loading">
                  <md-circular-progress indeterminate />
                </div>
              ) : (
                <md-fab
                  variant="primary"
                  size="medium"
                  style={{ "--md-sys-color-primary": dockTask?.status === "running" ? "#d43a3a" : "#00ED5F", "--md-sys-color-on-primary": "#ffffff" } as any}
                  onClick={onDockLaunch}
                >
                  <span slot="icon" className="material-symbols-outlined">
                    {dockTask?.status === "running" ? "stop" : "play_arrow"}
                  </span>
                </md-fab>
              )}
            </div>
          </div>
        )}
        {tab === 1 && <div className="right-card-pane">任务面板</div>}
      </div>
    </aside>
  );
}
