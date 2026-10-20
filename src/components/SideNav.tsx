import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { moduleById, NAV_MODULES, type ModuleId } from '../lib/modules';

type Props = {
  active: ModuleId;
  onChange: (m: ModuleId) => void;
  badges: Partial<Record<ModuleId, { count: number; tone: 'bad' | 'good' | 'accent' }>>;
  collapsed: boolean;
  onToggle: () => void;
};

export function SideNav({ active, onChange, badges, collapsed, onToggle }: Props) {
  return (
    <nav className="sidenav" aria-label="Módulos">
      {NAV_MODULES.map(moduleById).map((m) => {
        const b = badges[m.id];
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            className={`nav-item ${active === m.id ? 'on' : ''}`}
            onClick={() => onChange(m.id)}
            aria-current={active === m.id ? 'page' : undefined}
            title={m.label}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span className="nav-label">{m.label}</span>
            <span className="nav-short">{m.short}</span>
            {b && b.count > 0 && <span className={`nav-badge ${b.tone}`}>{b.count > 99 ? '99+' : b.count}</span>}
          </button>
        );
      })}
      <button className="nav-toggle" onClick={onToggle} aria-expanded={!collapsed} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
        {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
        <span>Recolher menu</span>
      </button>
    </nav>
  );
}
