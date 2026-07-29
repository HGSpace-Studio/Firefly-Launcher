import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search, Package, Puzzle, Palette, ArrowRight, Loader2,
  Gamepad2, Settings, FolderOpen, Play, Trash2,
  ChevronDown, Globe, Server, Layers, Plus, Check,
} from "lucide-react";
import "./SpotlightSearch.css";

type SearchScope = "global" | "instances" | "modrinth";

interface ModrinthHit {
  slug: string;
  title: string;
  description: string;
  project_type: string;
  downloads: number;
  icon_url: string | null;
}

interface McVersion {
  id: string;
  type: string;
}

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
}

interface SpotlightSearchProps {
  defaultScope?: SearchScope;
  selectMode?: boolean;
  onClose: () => void;
}

const scopeOptions: { value: SearchScope; label: string; icon: any }[] = [
  { value: "global", label: "全局", icon: Globe },
  { value: "instances", label: "我的实例", icon: Server },
  { value: "modrinth", label: "在线资源", icon: Layers },
];

const projectTypeIcons: Record<string, any> = {
  mod: Puzzle,
  modpack: Package,
  shader: Palette,
  resourcepack: Palette,
};

const projectTypeLabels: Record<string, string> = {
  mod: "模组",
  modpack: "整合包",
  shader: "光影",
  resourcepack: "资源包",
};

const loaderMap: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

export default function SpotlightSearch({ defaultScope, selectMode, onClose }: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>(defaultScope || "global");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [modrinthResults, setModrinthResults] = useState<ModrinthHit[]>([]);
  const [popularProjects, setPopularProjects] = useState<ModrinthHit[]>([]);
  const [mcVersions, setMcVersions] = useState<McVersion[]>([]);
  const [instances, setInstances] = useState<InstanceEntry[]>([]);
  const [modrinthLoading, setModrinthLoading] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentScopeOption = useMemo(() => scopeOptions.find((o) => o.value === scope)!, [scope]);

  const filteredMcVersions = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return mcVersions.filter((v) => v.id.toLowerCase().includes(q)).slice(0, 8);
  }, [query, mcVersions]);

  const filteredInstances = useMemo(() => {
    if (!query) return instances;
    const q = query.toLowerCase();
    return instances.filter((i) => i.name.toLowerCase().includes(q));
  }, [query, instances]);

  const hasResults = modrinthResults.length > 0 || filteredMcVersions.length > 0 || filteredInstances.length > 0;
  const showEmpty = query.length > 0 && !modrinthLoading && !hasResults;

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  useEffect(() => {
    searchTimer = null;
    if (!query || scope === "instances") {
      setModrinthResults([]);
      return;
    }
    if (scope === "global" || scope === "modrinth") {
      searchTimer = setTimeout(() => searchModrinth(query), 300);
    }
    return () => { if (searchTimer) clearTimeout(searchTimer); };
  }, [query]);

  useEffect(() => {
    if (query && (scope === "global" || scope === "modrinth")) {
      searchModrinth(query);
    } else {
      setModrinthResults([]);
    }
  }, [scope]);

  async function searchModrinth(q: string) {
    setModrinthLoading(true);
    try {
      const res = await fetch(
        `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=6&index=relevance`
      );
      const data = await res.json();
      setModrinthResults((data.hits || []).map((h: any) => ({
        slug: h.slug,
        title: h.title,
        description: h.description,
        project_type: h.project_type,
        downloads: h.downloads,
        icon_url: h.icon_url,
      })));
    } catch {
      setModrinthResults([]);
    } finally {
      setModrinthLoading(false);
    }
  }

  function formatDownloads(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  function openModrinth(slug: string, type: string) {
    window.open(`https://modrinth.com/${type}/${slug}`, "_blank");
    onClose();
  }

  function selectVersion(id: string) {
    window.dispatchEvent(new CustomEvent("spotlight-select-version", { detail: id }));
    onClose();
  }

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && filteredMcVersions.length > 0) {
        selectVersion(filteredMcVersions[0].id);
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [filteredMcVersions]);

  async function loadVersions() {
    if (versionsLoaded) return;
    try {
      const manifest = await invoke<{ versions: McVersion[] }>("get_minecraft_versions");
      setMcVersions(manifest.versions.map((v) => ({ id: v.id, type: v.type })));
      setVersionsLoaded(true);
    } catch { /* silent */ }
  }

  function getLoaderLabel(inst: InstanceEntry): string {
    if (!inst.loader) return "原版";
    return `${loaderMap[inst.loader.type] || inst.loader.type} ${inst.loader.version}`;
  }

  async function loadInstances() {
    try {
      const list = await invoke<InstanceEntry[]>("get_instances_list");
      setInstances(list);
    } catch { /* silent */ }
  }

  async function loadPopular() {
    try {
      const res = await fetch(`https://api.modrinth.com/v2/search?limit=6&index=downloads`);
      const data = await res.json();
      setPopularProjects((data.hits || []).map((h: any) => ({
        slug: h.slug,
        title: h.title,
        description: h.description,
        project_type: h.project_type,
        downloads: h.downloads,
        icon_url: h.icon_url,
      })));
    } catch { /* silent */ }
  }

  function goSettings(name: string) {
    window.dispatchEvent(new CustomEvent("spotlight-inst-settings", { detail: name }));
    onClose();
  }

  function goResources(name: string) {
    window.dispatchEvent(new CustomEvent("spotlight-inst-resources", { detail: name }));
    onClose();
  }

  function launchInstance(name: string) {
    window.dispatchEvent(new CustomEvent("spotlight-launch", { detail: name }));
    onClose();
  }

  function deleteInstance(name: string) {
    window.dispatchEvent(new CustomEvent("spotlight-delete", { detail: name }));
    onClose();
  }

  function createNewInstance() {
    window.dispatchEvent(new CustomEvent("spotlight-new-instance"));
    onClose();
  }

  function selectInstance(name: string) {
    window.dispatchEvent(new CustomEvent("spotlight-select-inst", { detail: name }));
    onClose();
  }

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    loadVersions();
    loadInstances();
    loadPopular();
  }, []);

  return (
    <div className="spotlight-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="spotlight-modal">
        <div className="spotlight-search-row">
          <Search size={18} className="spotlight-search-icon" />
          <div className="spotlight-scope" onClick={(e) => { e.stopPropagation(); setScopeOpen(!scopeOpen); }}>
            {currentScopeOption.icon && <currentScopeOption.icon size={13} />}
            <span className="spotlight-scope-label">{currentScopeOption.label}</span>
            <ChevronDown size={12} className={`spotlight-scope-arrow${scopeOpen ? " open" : ""}`} />
            {scopeOpen && (
              <div className="spotlight-scope-dropdown">
                {scopeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    className={`spotlight-scope-option${scope === opt.value ? " active" : ""}`}
                    onClick={(e) => { e.stopPropagation(); setScope(opt.value); setScopeOpen(false); }}
                  >
                    {opt.icon && <opt.icon size={13} />}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="spotlight-modal-input"
            type="text"
            placeholder={
              scope === "instances" ? "搜索实例名称..." :
              scope === "modrinth" ? "搜索 Modrinth 资源..." :
              "搜索版本、资源、实例..."
            }
            spellCheck={false}
            autoComplete="off"
          />
          {modrinthLoading && <Loader2 size={16} className="spotlight-spinner" />}
        </div>
        <div className="spotlight-divider"></div>
        <div className="spotlight-results">
          {query ? (
            <>
              {scope !== "modrinth" && filteredMcVersions.length > 0 && (
                <>
                  <div className="spotlight-section-label">Minecraft 版本</div>
                  {filteredMcVersions.map((v) => (
                    <button key={v.id} className="spotlight-result-item" onClick={() => selectVersion(v.id)}>
                      <div className="spotlight-result-icon-wrap mc-icon"><Gamepad2 size={16} /></div>
                      <div className="spotlight-result-info">
                        <span className="spotlight-result-title">Minecraft {v.id}</span>
                        <span className="spotlight-result-desc">{v.type === "release" ? "正式版" : v.type === "snapshot" ? "快照版" : v.type}</span>
                      </div>
                      <ArrowRight size={14} className="spotlight-result-arrow" />
                    </button>
                  ))}
                </>
              )}
              {scope !== "instances" && modrinthResults.length > 0 && (
                <>
                  <div className="spotlight-section-label">Modrinth 资源</div>
                  {modrinthResults.map((h) => (
                    <button key={h.slug} className="spotlight-result-item" onClick={() => openModrinth(h.slug, h.project_type)}>
                      <div className="spotlight-result-icon-wrap">
                        {h.icon_url ? <img src={h.icon_url} className="spotlight-result-icon-img" /> : (() => { const Icon = projectTypeIcons[h.project_type] || Package; return <Icon size={16} />; })()}
                      </div>
                      <div className="spotlight-result-info">
                        <span className="spotlight-result-title">{h.title}</span>
                        <span className="spotlight-result-desc">
                          {(projectTypeLabels[h.project_type] || h.project_type)} · {formatDownloads(h.downloads)} 下载
                        </span>
                      </div>
                      <ArrowRight size={14} className="spotlight-result-arrow" />
                    </button>
                  ))}
                </>
              )}
              {scope !== "modrinth" && filteredInstances.length > 0 && (
                <>
                  <div className="spotlight-section-label">实例</div>
                  {filteredInstances.map((inst) => (
                    <div key={inst.name} className="spotlight-result-item spotlight-inst-row">
                      {selectMode && (
                        <button className="spotlight-inst-select-btn spotlight-inst-select-highlight" title="选择此实例" onClick={() => selectInstance(inst.name)}>
                          <Check size={14} />
                        </button>
                      )}
                      <div className="spotlight-inst-row-left" onClick={() => launchInstance(inst.name)}>
                        <div className="spotlight-result-icon-wrap mc-icon"><Gamepad2 size={16} /></div>
                        <div className="spotlight-result-info">
                          <span className="spotlight-result-title">{inst.name}</span>
                          <span className="spotlight-result-desc">Minecraft {inst.version} · {getLoaderLabel(inst)}</span>
                        </div>
                        <ArrowRight size={14} className="spotlight-result-arrow" />
                      </div>
                    </div>
                  ))}
                </>
              )}
              {showEmpty && <div className="spotlight-empty"><span>没有找到 "{query}" 相关的结果</span></div>}
            </>
          ) : (
            <>
              {(scope === "instances" || scope === "global") && (
                <>
                  <div className="spotlight-section-label">已安装实例</div>
                  {instances.length === 0 && <div className="spotlight-empty"><span>暂无已安装实例</span></div>}
                  {filteredInstances.map((inst) => (
                    <div key={inst.name} className="spotlight-inst-card">
                      {selectMode && (
                        <button className="spotlight-inst-select-btn spotlight-inst-select-highlight" title="选择此实例" onClick={() => selectInstance(inst.name)}>
                          <Check size={15} />
                        </button>
                      )}
                      <div className="spotlight-inst-left">
                        <div className="spotlight-inst-icon"><Gamepad2 size={20} /></div>
                        <div className="spotlight-inst-info">
                          <span className="spotlight-inst-name">{inst.name}</span>
                          <span className="spotlight-inst-meta">Minecraft {inst.version} · {getLoaderLabel(inst)}</span>
                        </div>
                      </div>
                      <div className="spotlight-inst-actions">
                        <button className="spotlight-inst-btn" title="版本设置" onClick={() => goSettings(inst.name)}><Settings size={14} /></button>
                        <button className="spotlight-inst-btn" title="资源管理" onClick={() => goResources(inst.name)}><FolderOpen size={14} /></button>
                        <button className="spotlight-inst-btn spotlight-inst-btn-launch" title="启动" onClick={() => launchInstance(inst.name)}><Play size={14} /></button>
                        <button className="spotlight-inst-btn spotlight-inst-btn-delete" title="删除" onClick={() => deleteInstance(inst.name)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {scope === "instances" && (
                    <button className="spotlight-new-inst-btn" onClick={createNewInstance}>
                      <Plus size={15} /><span>新建实例</span>
                    </button>
                  )}
                </>
              )}
              {scope === "global" && popularProjects.length > 0 && (
                <>
                  <div className="spotlight-divider" style={{ margin: "4px 10px" }}></div>
                  <div className="spotlight-section-label">推荐资源</div>
                  {popularProjects.map((h) => (
                    <button key={h.slug} className="spotlight-result-item" onClick={() => openModrinth(h.slug, h.project_type)}>
                      <div className="spotlight-result-icon-wrap">
                        {h.icon_url ? <img src={h.icon_url} className="spotlight-result-icon-img" /> : (() => { const Icon = projectTypeIcons[h.project_type] || Package; return <Icon size={16} />; })()}
                      </div>
                      <div className="spotlight-result-info">
                        <span className="spotlight-result-title">{h.title}</span>
                        <span className="spotlight-result-desc">
                          {(projectTypeLabels[h.project_type] || h.project_type)} · {formatDownloads(h.downloads)} 下载
                        </span>
                      </div>
                      <ArrowRight size={14} className="spotlight-result-arrow" />
                    </button>
                  ))}
                </>
              )}
              {scope === "modrinth" && popularProjects.length > 0 && (
                <>
                  <div className="spotlight-section-label">热门资源</div>
                  {popularProjects.map((h) => (
                    <button key={h.slug} className="spotlight-result-item" onClick={() => openModrinth(h.slug, h.project_type)}>
                      <div className="spotlight-result-icon-wrap">
                        {h.icon_url ? <img src={h.icon_url} className="spotlight-result-icon-img" /> : (() => { const Icon = projectTypeIcons[h.project_type] || Package; return <Icon size={16} />; })()}
                      </div>
                      <div className="spotlight-result-info">
                        <span className="spotlight-result-title">{h.title}</span>
                        <span className="spotlight-result-desc">
                          {(projectTypeLabels[h.project_type] || h.project_type)} · {formatDownloads(h.downloads)} 下载
                        </span>
                      </div>
                      <ArrowRight size={14} className="spotlight-result-arrow" />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}