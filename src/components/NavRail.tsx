import "./NavRail.css";

export interface NavRailItem {
  id: string;
  label: string;
  icon: string;
}

interface NavRailProps {
  topItems: NavRailItem[];
  bottomItems: NavRailItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}

export function NavRail({ topItems, bottomItems, activeId, onNavigate }: NavRailProps) {
  return (
    <aside className="navrail">
      <div className="navrail-section">
        {topItems.map((item) => (
          <md-navigation-tab
            key={item.id}
            label={item.label}
            active={activeId === item.id}
            onClick={() => onNavigate(item.id)}
          >
            <span slot="inactive-icon" className="material-symbols-outlined">{item.icon}</span>
            <span slot="active-icon" className="material-symbols-outlined">{item.icon}</span>
          </md-navigation-tab>
        ))}
      </div>
      <div className="navrail-spacer" />
      <div className="navrail-section">
        {bottomItems.map((item) => (
          <md-navigation-tab
            key={item.id}
            label={item.label}
            active={activeId === item.id}
            onClick={() => onNavigate(item.id)}
          >
            <span slot="inactive-icon" className="material-symbols-outlined">{item.icon}</span>
            <span slot="active-icon" className="material-symbols-outlined">{item.icon}</span>
          </md-navigation-tab>
        ))}
      </div>
    </aside>
  );
}
