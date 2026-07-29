import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Rocket } from "lucide-react";
import "./HomePage.css";

interface NewsImage {
  title: string;
  url: string;
}

interface NewsEntry {
  title: string;
  date: string;
  text: string;
  playPageImage: NewsImage;
  newsPageImage: NewsImage;
  readMoreLink: string;
}

interface InstanceEntry {
  name: string;
  version: string;
  version_type: string;
  loader: { type: string; version: string } | null;
  icon: string | null;
  installed: boolean;
}

export default function HomePage() {
  const { t } = useTranslation();

  const [accountName, setAccountName] = useState("");

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 0 && h <= 10) return "上午好";
    if (h >= 11 && h <= 17) return "下午好";
    return "晚上好";
  }, []);

  const baseUrl = "https://launchercontent.mojang.com";
  const [allNews, setAllNews] = useState<NewsEntry[]>([]);
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentNews = useMemo(
    () => allNews[currentNewsIndex],
    [allNews, currentNewsIndex]
  );

  const [quickInstance, setQuickInstance] = useState<InstanceEntry | null>(null);
  const [quickLaunching, setQuickLaunching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const acc = await invoke<{ name: string }>("get_current_account");
        setAccountName(acc.name);
      } catch {
        setAccountName("");
      }
      fetchNews();
      fetchQuickInstance();
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, []);

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  async function fetchNews() {
    try {
      const res = await fetch(`${baseUrl}/v2/news.json`);
      if (!res.ok) return;
      const data = await res.json();
      let entries: NewsEntry[] =
        data.entries?.filter(
          (e: any) => e.category === "Minecraft: Java Edition"
        ) || [];
      if (entries.length === 0) entries = data.entries || [];
      if (entries.length > 0) {
        setAllNews(entries);
        setCurrentNewsIndex(Math.floor(Math.random() * entries.length));
        rotationTimerRef.current = setInterval(() => {
          setCurrentNewsIndex((prev) => (prev + 1) % allNews.length);
        }, 6000);
      }
    } catch {
      /* silent */
    }
  }

  async function fetchQuickInstance() {
    try {
      const list = await invoke<InstanceEntry[]>("get_instances_list");
      const installed = list.filter((i) => i.installed);
      if (installed.length > 0) setQuickInstance(installed[0]);
    } catch {
      /* silent */
    }
  }

  async function launchQuick() {
    if (!quickInstance || quickLaunching) return;
    setQuickLaunching(true);
    try {
      const inst = quickInstance;
      const acc = await invoke<{ name: string }>("get_current_account");
      const oobe = await invoke<{ accountName: string; javaPath: string }>(
        "get_oobe_settings"
      );
      const mcDir = await invoke<string>("get_minecraft_dir_string");
      await invoke("launch_minecraft", {
        args: {
          version: inst.version,
          username: acc.name || oobe.accountName || "Player",
          game_dir: mcDir,
          min_mem: "1024",
          max_mem: "2048",
          loader_type: inst.loader?.type || null,
          loader_build: inst.loader?.version || null,
          instance: inst.name,
          download_only: false,
          java_path: null,
          download_concurrency: null,
          verify_concurrency: null,
        },
      });
    } catch {
      /* silent */
    }
    setQuickLaunching(false);
  }

  return (
    <div className="home-page">
      <div className="home-header">
        <span className="home-header-sub">
          {t("app.mainwindow.home.title")}
        </span>
        <span className="home-header-main">
          {greeting}，{accountName}
        </span>
      </div>
      <div className="home-area">
        <div className="home-row">
          {currentNews && (
            <a
              href={currentNews.readMoreLink}
              target="_blank"
              className="news-hero"
              style={{
                backgroundImage: `url(${baseUrl}${currentNews.newsPageImage?.url || currentNews.playPageImage?.url})`,
              }}
            >
              <div className="news-hero-overlay"></div>
              <div className="news-hero-content">
                <span className="news-hero-date">
                  {formatDate(currentNews.date)}
                </span>
                <span className="news-hero-title">{currentNews.title}</span>
                <p className="news-hero-desc">{currentNews.text}</p>
              </div>
              <div className="news-dots">
                {allNews.map((_, i) => (
                  <span
                    key={i}
                    className={`news-dot${i === currentNewsIndex ? " active" : ""}`}
                  ></span>
                ))}
              </div>
            </a>
          )}
          {quickInstance && (
            <div className="quick-launch">
              <span className="quick-launch-label">快速启动</span>
              <div className="quick-launch-body">
                <span className="quick-launch-name">{quickInstance.name}</span>
                <span className="quick-launch-version">
                  {quickInstance.version}
                </span>
              </div>
              <button
                className="quick-launch-btn"
                disabled={quickLaunching}
                onClick={launchQuick}
              >
                <Rocket size={16} />
                <span>
                  {quickLaunching ? "启动中..." : "启动"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}