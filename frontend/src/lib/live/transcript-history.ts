import type { TranscriptTurn } from "./tutor-session";

const STORAGE_KEY = "lumen.liveTranscripts.v1";
const MAX_TURNS = 12;

type TranscriptHistory = Record<string, TranscriptTurn[]>;

function isTranscriptTurn(value: unknown): value is TranscriptTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Partial<TranscriptTurn>;
  return (
    typeof turn.id === "string" &&
    (turn.from === "tutor" || turn.from === "you") &&
    typeof turn.text === "string" &&
    typeof turn.final === "boolean"
  );
}

function readHistory(): TranscriptHistory {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const history: TranscriptHistory = {};
    for (const [moduleId, turns] of Object.entries(parsed)) {
      if (!Array.isArray(turns)) continue;
      history[moduleId] = turns.filter(isTranscriptTurn).slice(-MAX_TURNS);
    }
    return history;
  } catch {
    return {};
  }
}

export function loadTranscriptHistory(moduleId: string): TranscriptTurn[] {
  return [...(readHistory()[moduleId] ?? [])];
}

export function saveTranscriptHistory(moduleId: string, turns: TranscriptTurn[]): void {
  if (typeof window === "undefined" || !moduleId) return;
  try {
    const history = readHistory();
    history[moduleId] = turns.slice(-MAX_TURNS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage can be disabled or full; in-memory history still survives a close/reopen.
  }
}

export const __transcriptHistoryTest = { STORAGE_KEY, MAX_TURNS };
