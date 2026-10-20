// Bot state, persisted as one JSON file in DATA_DIR (a Docker volume in production).
import fs from 'node:fs';
import path from 'node:path';

export type Place = { name: string; lat: number; lng: number };
export type Mode = 'todas' | 'perto';

export type ChatPrefs = {
  places: Place[];
  radiusKm: number;
  /** "todas": every RJ occurrence (silent unless near a place); "perto": only near ones. */
  mode: Mode;
  paused: boolean;
  /** A location sent without a name yet; the next plain text names it. */
  pendingPlace?: { lat: number; lng: number };
};

export type State = {
  /** Occurrence id → when it was first seen (ms), to avoid repeats. */
  seen: Record<string, number>;
  chats: Record<string, ChatPrefs>;
  /** Next Telegram update_id to ask for. */
  updateOffset: number;
  /** False until the first fetch, which only records what already exists. */
  primed: boolean;
};

const DATA_DIR = process.env.DATA_DIR ?? '.bot-data';
const FILE = path.join(DATA_DIR, 'state.json');
const SEEN_TTL_MS = 3 * 24 * 3600_000;

export const DEFAULT_PREFS: ChatPrefs = { places: [], radiusKm: 3, mode: 'todas', paused: false };

export function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as State;
  } catch {
    return { seen: {}, chats: {}, updateOffset: 0, primed: false };
  }
}

/** Atomic write: a crash mid-save never leaves a truncated file. */
export function saveState(state: State) {
  const now = Date.now();
  for (const [id, at] of Object.entries(state.seen)) if (now - at > SEEN_TTL_MS) delete state.seen[id];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

export function prefsFor(state: State, chatId: number | string): ChatPrefs {
  const key = String(chatId);
  state.chats[key] ??= structuredClone(DEFAULT_PREFS);
  return state.chats[key];
}

/** Touched every loop; the Docker healthcheck reads its age. */
export function heartbeat() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'heartbeat'), String(Date.now()));
}
