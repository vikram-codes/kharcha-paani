/**
 * Unlocking with no signal (owner, Nov 11 2026). After each successful online
 * unlock, a salted PBKDF2 hash of the PIN is kept on the phone so the app lock
 * can still open offline (to add a purchase in the subway). Like the lock
 * itself, it's a privacy screen for the phone in your hand: 5 wrong tries
 * offline and it waits for a connection.
 */
const KEY = "kp:pin-local";
const TRIES = "kp:pin-local-tries";
export const MAX_OFFLINE_TRIES = 5;
const ITERATIONS = 150_000;

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: offline unlock just isn't available */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export async function rememberPin(pin: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  store.set(KEY, JSON.stringify({ salt, hash: await hashPin(pin, salt) }));
  store.del(TRIES);
}

export function forgetLocalPin() {
  store.del(KEY);
  store.del(TRIES);
}

export async function checkLocalPin(pin: string): Promise<"ok" | "wrong" | "too-many" | "unavailable"> {
  let saved: { salt: string; hash: string } | null = null;
  try {
    saved = JSON.parse(store.get(KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved?.salt || !saved.hash) return "unavailable";
  const tries = Number(store.get(TRIES) ?? 0);
  if (tries >= MAX_OFFLINE_TRIES) return "too-many";
  if ((await hashPin(pin, saved.salt)) === saved.hash) {
    store.del(TRIES);
    return "ok";
  }
  store.set(TRIES, String(tries + 1));
  return tries + 1 >= MAX_OFFLINE_TRIES ? "too-many" : "wrong";
}
