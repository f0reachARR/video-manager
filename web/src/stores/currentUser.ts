import { useSyncExternalStore } from "react";

import { setCurrentUserIdProvider } from "../lib/api/client";

const STORAGE_KEY = "video-manager.currentUserId";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function emit() {
  for (const l of listeners) l();
}

setCurrentUserIdProvider(read);

export function setCurrentUserId(id: string | null) {
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

export function useCurrentUserId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
