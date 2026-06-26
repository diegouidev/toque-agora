// Persistência do estado do player no localStorage (retomar após F5).
import type { Track } from "./api";

const KEY = "ta_player_state";
const VERSION = 1;

export interface SavedPlayerState {
  v: number;
  queue: Track[];
  currentIndex: number | null;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  currentTime: number;
  savedAt: number;
}

export function savePlayerState(state: Omit<SavedPlayerState, "v" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SavedPlayerState = { ...state, v: VERSION, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota/serialização — ignora */
  }
}

export function loadPlayerState(): SavedPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedPlayerState;
    if (data.v !== VERSION || !Array.isArray(data.queue)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPlayerState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
