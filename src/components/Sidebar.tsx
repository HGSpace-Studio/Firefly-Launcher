import { Gamepad2, MoreHorizontal } from "lucide-react";
import "./Sidebar.css";

interface SidebarItem {
  id: string;
  icon: any;
}

interface SidebarProps {
  navItems: SidebarItem[];
  visibleInstances: { name: string }[];
  overflowInstances: { name: string }[];
  activeNav: string;
  showingInstance: boolean;
  currentInstanceName: string | null;
  avatarUrl: string;
  onNavigate: (id: string) => void;
  onGoInst: (inst: any) => void;
  onToggleInstMenu: () => void;
}

export default function Sidebar({
  navItems,
  visibleInstances,
  overflowInstances,
  activeNav,
  showingInstance,
  currentInstanceName,
  avatarUrl,
  onNavigate,
  onGoInst,
  onToggleInstMenu,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        {navItems.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const isActive =
            activeNav === item.id &&
            !(item.id === "library" && showingInstance);
          return (
            <button
              key={item.id}
              className={`sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {Icon && <Icon size={23} />}
              <span className="nav-tooltip">
                {item.id === "home"
                  ? "首页"
                  : item.id === "resourcescenter"
                  ? "资源中心"
                  : item.id === "library"
                  ? "库"
                  : ""}
              </span>
            </button>
          );
        })}
        <div className="sidebar-divider"></div>
        {visibleInstances.map((inst) => {
          const isActive =
            activeNav === "library" && currentInstanceName === inst.name;
          return (
            <button
              key={inst.name}
              className={`sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onGoInst(inst)}
            >
              <Gamepad2 size={21} />
              <span className="nav-tooltip">{inst.name}</span>
            </button>
          );
        })}
        {overflowInstances.length > 0 && (
          <button
            className="sidebar-item"
            onClick={onToggleInstMenu}
          >
            <MoreHorizontal size={21} />
            <span className="nav-tooltip">更多实例...</span>
          </button>
        )}
        {navItems.slice(3, 4).map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {Icon && <Icon size={23} />}
              <span className="nav-tooltip">
                {item.id === "add-instance" ? "创建实例" : ""}
              </span>
            </button>
          );
        })}
        <div className="sidebar-spacer"></div>
        <button
          className="sidebar-avatar"
          onClick={() => onNavigate("account")}
        >
          <img src={avatarUrl} />
          <span className="nav-tooltip">账户</span>
        </button>
        {navItems.slice(4).map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {Icon && <Icon size={23} />}
              <span className="nav-tooltip">
                {item.id === "settings" ? "设置" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}