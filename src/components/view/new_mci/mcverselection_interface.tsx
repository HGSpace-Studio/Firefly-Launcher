import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCache, setCache } from "../../../utils/cache";
import "./mcverselection_interface.css";
import mcIcon from "../../../assets/imgs/mc_oringin.png";

export interface VersionInfo {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionInfo[];
}

interface McVersionSelectionProps {
  searchQuery?: string;
  onSelectVersion?: (id: string, type: string) => void;
}

const aprilFoolsPatterns = [
  "rv-pre",
  "shareware",
  "20w14∞",
  "20w14infinite",
  "oneblockatatime",
  "potato",
  "_or_b",
  "3d shareware",
];

function isAprilFools(id: string): boolean {
  const lower = id.toLowerCase();
  return aprilFoolsPatterns.some((p) => lower.includes(p));
}

export default function McVersionSelection({
  searchQuery = "",
  onSelectVersion,
}: McVersionSelectionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [activeTab, setActiveTab] = useState("release");

  const filteredVersions = useMemo(() => {
    if (!manifest) return [];
    const all = manifest.versions;
    let result: VersionInfo[];
    switch (activeTab) {
      case "release":
        result = all.filter((v) => v.type === "release" && !isAprilFools(v.id));
        break;
      case "snapshot":
        result = all.filter((v) => v.type === "snapshot" && !isAprilFools(v.id));
        break;
      case "old":
        result = all.filter(
          (v) =>
            v.type !== "release" &&
            v.type !== "snapshot" &&
            !isAprilFools(v.id)
        );
        break;
      case "april":
        result = all.filter((v) => isAprilFools(v.id));
        break;
      default:
        result = [];
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.id.toLowerCase().includes(q));
    }
    return result;
  }, [manifest, activeTab, searchQuery]);

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  useEffect(() => {
    const cached = getCache<VersionManifest>("mc_versions");
    if (cached) {
      setManifest(cached);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const m = await invoke<VersionManifest>("get_minecraft_versions");
        setCache("mc_versions", m);
        setManifest(m);
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mc-version-body">
      <nav className="version-nav">
        <button
          className={`version-nav-item ${activeTab === "release" ? "active" : ""}`}
          onClick={() => setActiveTab("release")}
        >
          <Box size={18} />
          <span>{t("app.mainwindow.versionnav.release")}</span>
        </button>
        <button
          className={`version-nav-item ${activeTab === "snapshot" ? "active" : ""}`}
          onClick={() => setActiveTab("snapshot")}
        >
          <Box size={18} />
          <span>{t("app.mainwindow.versionnav.snapshot")}</span>
        </button>
        <button
          className={`version-nav-item ${activeTab === "old" ? "active" : ""}`}
          onClick={() => setActiveTab("old")}
        >
          <Box size={18} />
          <span>{t("app.mainwindow.versionnav.old")}</span>
        </button>
        <div className="version-nav-divider"></div>
        <button
          className={`version-nav-item ${activeTab === "april" ? "active" : ""}`}
          onClick={() => setActiveTab("april")}
        >
          <Sparkles size={18} />
          <span>{t("app.mainwindow.versionnav.april")}</span>
        </button>
      </nav>
      <div className="version-content">
        {loading ? (
          <div className="version-loading">
            <md-circular-progress indeterminate />
            <span>{t("app.mainwindow.versionnav.loading")}</span>
          </div>
        ) : (
          <div className="version-list">
            {filteredVersions.map((v) => (
              <button
                key={v.id}
                className="version-card-item"
                onClick={() => onSelectVersion?.(v.id, v.type)}
              >
                <img src={mcIcon} className="version-card-icon" />
                <div className="version-card-info">
                  <span className="version-card-id">{v.id}</span>
                  <span className="version-card-date">
                    {formatDate(v.releaseTime)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
