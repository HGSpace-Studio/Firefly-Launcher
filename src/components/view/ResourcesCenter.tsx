import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Puzzle,
  Box,
  Sun,
  Grip,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getCache, setCache } from "../../utils/cache";
import "./ResourcesCenter.css";

interface ModrinthProject {
  project_id: string;
  title: string;
  description: string;
  icon_url: string;
  slug: string;
  project_type: string;
  downloads: number;
  date_modified: string;
  latest_version: string;
  versions: string[];
  game_versions: string[];
  loaders: string[];
}

interface ModrinthSearchHit {
  project_id: string;
  title: string;
  description: string;
  icon_url: string;
  slug: string;
  project_type: string;
  downloads: number;
  date_modified: string;
  latest_version: string;
  versions: string[];
  game_versions: string[];
  loaders: string[];
}

interface ModrinthSearchResult {
  hits: ModrinthSearchHit[];
  total_hits: number;
}

const projectTypeMap: Record<string, string> = {
  mods: "mod",
  modpack: "modpack",
  shader: "shader",
  resourcepack: "resourcepack",
};

const tabs = [
  { id: "mods", label: "模组", icon: Puzzle },
  { id: "modpack", label: "整合包", icon: Box },
  { id: "shader", label: "光影包", icon: Sun },
  { id: "resourcepack", label: "资源包", icon: Grip },
];

export default function ResourcesCenter() {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState("mods");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ModrinthProject[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const pageSize = 16;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalHits / pageSize)),
    [totalHits]
  );

  const fetchProjects = useCallback(async () => {
    const type = projectTypeMap[activeTab];
    const page = currentPage;
    const limit = pageSize;
    const offset = (page - 1) * limit;
    const cacheKey = "modrinth_" + type + "_p" + page + "_l" + limit;
    const cached = getCache<{ projects: ModrinthProject[]; total: number }>(
      cacheKey
    );
    if (cached) {
      setProjects(cached.projects);
      setTotalHits(cached.total);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.modrinth.com/v2/search?facets=[["project_type:${type}"]]&limit=${limit}&offset=${offset}&index=downloads`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ModrinthSearchResult = await res.json();
      const newProjects = data.hits.map((h) => ({
        project_id: h.project_id,
        title: h.title,
        description: h.description,
        icon_url: h.icon_url,
        slug: h.slug,
        project_type: h.project_type,
        downloads: h.downloads,
        date_modified: h.date_modified,
        latest_version: h.latest_version,
        versions: h.versions || [],
        game_versions: h.game_versions || [],
        loaders: h.loaders || [],
      }));
      setTotalHits(data.total_hits);
      setProjects(newProjects);
      setCache(cacheKey, { projects: newProjects, total: data.total_hits });
    } catch {
      setProjects([]);
      setTotalHits(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    fetchProjects();
  }, [activeTab]);

  useEffect(() => {
    fetchProjects();
  }, []);

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

  return (
    <div className="resources-page">
      <div className="resources-header">
        <span className="resources-header-sub">
          {t("app.mainwindow.resourcescenter.title")}
        </span>
        <div className="resources-header-row">
          <span className="resources-header-main">
            {t("app.mainwindow.resourcescenter.mainTitle")}
          </span>
          <div className="resources-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`resources-tab${activeTab === tab.id ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {Icon && <Icon size={16} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={currentPage <= 1}
                onClick={() => {
                  setCurrentPage((prev) => prev - 1);
                  fetchProjects();
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="page-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setCurrentPage((prev) => prev + 1);
                  fetchProjects();
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="resources-area">
        {loading ? (
          <div className="resources-loading">
            <RefreshCw size={20} className="spinner" />
            <span>正在获取资源列表...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="resources-empty">暂无资源</div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <a
                key={project.project_id}
                href={`https://modrinth.com/${project.project_type}/${project.slug}`}
                target="_blank"
                className="project-card"
              >
                <div className="project-card-inner">
                  <img
                    src={project.icon_url}
                    className="project-card-icon"
                  />
                  <div className="project-card-body">
                    <span className="project-card-title">
                      {project.title}
                    </span>
                    <span className="project-card-meta">
                      更新于 {formatDate(project.date_modified)}
                    </span>
                    <div className="project-card-tags">
                      {project.loaders.length > 0 && (
                        <span className="project-tag">
                          {project.loaders.slice(0, 3).join(", ")}
                        </span>
                      )}
                      {project.game_versions.length > 0 && (
                        <span className="project-tag">
                          {project.game_versions.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}