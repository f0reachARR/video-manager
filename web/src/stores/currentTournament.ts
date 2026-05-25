import { useSyncExternalStore } from "react";

const STORAGE_KEY = "soiree.currentTournamentId";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function emit() {
  for (const l of listeners) l();
}

export function setCurrentTournamentId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    window.localStorage.setItem(STORAGE_KEY, id);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCurrentTournamentId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function getCurrentTournamentId(): string | null {
  return read();
}
