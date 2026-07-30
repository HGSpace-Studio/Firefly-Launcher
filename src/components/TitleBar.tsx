import { useEffect, useState } from "react";
import { Search, Minus, Square, X } from "lucide-react";

interface TitleBarProps {
  onOpenSpotlight?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

type Platform = "macos" | "windows" | "linux" | "unknown";

function getPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

async function winMinimize() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {}
}

async function winToggleMaximize() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().toggleMaximize();
  } catch {}
}

async function winClose() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch {}
}

function WindowControls() {
  return (
    <div className="flex h-full">
      <button
        className="flex items-center justify-center w-[46px] h-full text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
        onClick={winMinimize}
      >
        <Minus size={14} />
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
        onClick={winToggleMaximize}
      >
        <Square size={12} />
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full text-muted-foreground/60 hover:text-destructive-foreground hover:bg-destructive/80 transition-colors"
        onClick={winClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TitleBar({ onOpenSpotlight, showBack, onBack }: TitleBarProps) {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(getPlatform());
  }, []);

  // On Windows/Linux, remove native decorations so our custom title bar takes over
  useEffect(() => {
    const p = getPlatform();
    if (p === "windows" || p === "linux") {
      (async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setDecorations(false);
        } catch {}
      })();
    }
  }, []);

  const isMac = platform === "macos";

  const barStyle = { backgroundColor: "var(--panel-bg)", borderBottom: "1px solid var(--window-border)" };

  const backBtn = showBack ? (
    <button
      className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors shrink-0"
      style={{ WebkitAppRegion: "no-drag" } as any}
      onClick={onBack}
    >
      <span className="material-symbols-outlined" style={{fontSize:18,fontVariationSettings:"'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 18"}}>arrow_back</span>
    </button>
  ) : null;

  const searchTrigger = (
    <div
      className="flex items-center gap-2 h-[28px] px-3 rounded-lg bg-muted/50 border cursor-pointer transition-colors hover:bg-muted/80 min-w-[200px]"
      style={{ WebkitAppRegion: "no-drag" } as any}
      onClick={onOpenSpotlight}
    >
      <Search size={14} className="text-muted-foreground/35 shrink-0" />
      <span className="flex-1 text-xs text-muted-foreground/50">在此处搜索一切</span>
    </div>
  );

  // macOS: native TitleBarStyle::Overlay provides traffic lights and drag
  if (isMac) {
    return (
      <div className="h-[38px] shrink-0 flex items-center justify-center gap-3 relative" style={barStyle} data-tauri-drag-region>
        {showBack && <div className="absolute" style={{ left: 69 }}>{backBtn}</div>}
        {searchTrigger}
      </div>
    );
  }

  return (
      <div
        className="flex items-center justify-between h-[38px] select-none shrink-0"
        style={barStyle}
        data-tauri-drag-region
      >
        <div className="flex items-center h-full pl-3 gap-2">
          {showBack && backBtn}
          <span className="text-xs font-medium text-muted-foreground/60">Firefly Launcher</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          {searchTrigger}
        </div>
        <div className="flex items-center h-full">
          <WindowControls />
        </div>
      </div>
  );
}
