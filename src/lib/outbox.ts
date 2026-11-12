"use client";

import { useSyncExternalStore } from "react";
import { addTransaction, addTransfer } from "@/app/actions/transactions";
import { notifyDataChanged } from "@/lib/data-events";
import type { NewTransaction } from "@/lib/data";

/**
 * Offline quick add (owner, Nov 11 2026). An entry that can't reach the server
 * waits here, on the phone, and syncs when the connection is back. Each entry
 * carries a clientId so a retried sync can't save it twice.
 */
type TransferInput = { fromId: string; toId: string; cents: number; date: string; note?: string; clientId: string };
export type OutboxItem = {
  id: string;
  /** "Coffee · Scene+ Visa", for the waiting list. */
  label: string;
  /** Signed, for display (negative = money out). */
  cents: number;
  createdAt: number;
  /** Set when the server refused it (e.g. a category since deleted): needs you. */
  error?: string;
} & ({ kind: "tx"; input: NewTransaction & { clientId: string } } | { kind: "transfer"; input: TransferInput });

const KEY = "kp:outbox";
const EVENT = "kp:outbox-changed";
const EMPTY: OutboxItem[] = [];
let cache: { raw: string | null; items: OutboxItem[] } = { raw: null, items: EMPTY };

function read(): OutboxItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.items;
  let items = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    /* unreadable: treat as empty */
  }
  cache = { raw, items };
  return items;
}

function write(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const newClientId = () => crypto.randomUUID();

export function enqueue(item: Omit<OutboxItem, "createdAt">) {
  write([...read().filter((i) => i.id !== item.id), { ...item, createdAt: Date.now() } as OutboxItem]);
}

export function discard(id: string) {
  write(read().filter((i) => i.id !== id));
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn); // other tabs
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useOutbox() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/**
 * A failed fetch (no signal, server unreachable) as opposed to the server
 * answering "no". Server Actions surface it as a TypeError from fetch
 * ("Failed to fetch" in Chrome, "Load failed" in Safari).
 */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) return true;
  return e instanceof Error && /fetch|network|load failed|connection/i.test(e.message);
}

let draining: Promise<number> | null = null;

/** Sends waiting entries oldest first. Stops at the first network failure. Returns how many synced. */
export function drainOutbox(): Promise<number> {
  draining ??= (async () => {
    let synced = 0;
    try {
      for (const item of read()) {
        if (item.error) continue;
        let res: { ok: true } | { ok: false; error: string };
        try {
          res = item.kind === "tx" ? await addTransaction(item.input) : await addTransfer(item.input);
        } catch (e) {
          if (isNetworkError(e)) break;
          res = { ok: false, error: e instanceof Error ? e.message : "Couldn't save." };
        }
        if (res.ok) {
          discard(item.id);
          synced++;
        } else {
          write(read().map((i) => (i.id === item.id ? { ...i, error: res.error } : i)));
        }
      }
    } finally {
      draining = null;
    }
    if (synced) notifyDataChanged();
    return synced;
  })();
  return draining;
}

/** Try a refused entry again (after fixing what was wrong elsewhere). */
export function retry(id: string) {
  write(read().map((i) => (i.id === id ? { ...i, error: undefined } : i)));
  return drainOutbox();
}
