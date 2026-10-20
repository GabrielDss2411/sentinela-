import {
  Brain,
  Car,
  FileText,
  HeartPulse,
  Map,
  Megaphone,
  Radar,
  Route,
  Settings,
  Siren,
  UserSearch,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'overview'
  | 'incidents'
  | 'routes'
  | 'areas'
  | 'health'
  | 'monitor'
  | 'vehicles'
  | 'people'
  | 'intel'
  | 'comms'
  | 'docs'
  | 'settings';

export type ModuleDef = {
  id: ModuleId;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  /** Planned modules show in the menu with an "em breve" tag and a placeholder panel. */
  soon?: string;
};

export const MODULES: ModuleDef[] = [
  { id: 'overview', label: 'Mapa', short: 'Mapa', icon: Map },
  { id: 'incidents', label: 'Ocorrências', short: 'Ocorr.', icon: Siren },
  { id: 'routes', label: 'Rotas e Trajetos', short: 'Rotas', icon: Route },
  { id: 'areas', label: 'Comunidades', short: 'Áreas', icon: Users },
  { id: 'health', label: 'Saúde', short: 'Saúde', icon: HeartPulse },
  { id: 'monitor', label: 'Alerta de Proximidade', short: 'Alerta', icon: Radar },
  { id: 'vehicles', label: 'Viaturas', short: 'Viaturas', icon: Car, soon: 'Posição e status das viaturas em tempo real, com despacho para ocorrências.' },
  { id: 'people', label: 'Pessoas e Mandados', short: 'Pessoas', icon: UserSearch, soon: 'Consulta de mandados em aberto, pessoas procuradas e veículos com restrição.' },
  { id: 'intel', label: 'Inteligência', short: 'Intel', icon: Brain, soon: 'Análises de padrão, manchas criminais e relatórios por região e período.' },
  { id: 'comms', label: 'Comunicações', short: 'Comms', icon: Megaphone, soon: 'Mensagens entre equipes, avisos gerais e registro de chamados.' },
  { id: 'docs', label: 'Documentos', short: 'Docs', icon: FileText, soon: 'Boletins, relatórios de ocorrência e documentos operacionais.' },
  { id: 'settings', label: 'Configurações', short: 'Config.', icon: Settings },
];

/** Modules listed in the side menu. The others open from inside the app (e.g. a hospital's "Rota" opens the route planner). */
export const NAV_MODULES: ModuleId[] = ['overview', 'incidents', 'health'];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;
