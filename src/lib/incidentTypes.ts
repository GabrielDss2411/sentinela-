/** Shape served by /api/fogo-cruzado (see api/fogo-cruzado.ts). */
export type Incident = {
  id: string;
  /** ISO timestamp with offset. */
  date: string;
  coord: [number, number];
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  policeAction: boolean;
  agentPresence: boolean;
  dead: number;
  wounded: number;
  reason: string | null;
  massacre: boolean;
  /** Fogo Cruzado's sequential record number (the "id" column of its CSV export). */
  number: number | null;
  /** Favela or community, when the record names one. */
  locality: string | null;
  policeUnit: string | null;
  complementaryReasons: string[];
  /** People hit, split the same way as the Fogo Cruzado CSV export. */
  victims: VictimBreakdown;
};

export type VictimGroup = 'civilians' | 'agents' | 'men' | 'women' | 'kids' | 'teenagers' | 'elderly';
export type VictimBreakdown = Record<VictimGroup, { dead: number; wounded: number }>;

export type IncidentsResponse = {
  incidents: Incident[];
  /** When the source last changed (X-Last-Update header), if provided. */
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  /** True when served from the built-in demo set instead of the real API. */
  demo: boolean;
};

export type IncidentsError = { error: string; configured: boolean };
