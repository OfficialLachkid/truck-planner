import { OFFLINE_SEED_DATA } from "./offlineSeedData.js";

const OFFLINE_STORE_KEY = "truck-planner/offline-store";
const OFFLINE_STORE_VERSION = 1;

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizePlanning(planning = {}) {
  return {
    days: toArray(planning.days),
    trucks: toArray(planning.trucks),
    trips: toArray(planning.trips),
    slots: toArray(planning.slots),
  };
}

function buildSeedStore() {
  return {
    version: OFFLINE_STORE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orders: clone(toArray(OFFLINE_SEED_DATA.orders)),
    planning: clone(normalizePlanning(OFFLINE_SEED_DATA.planning)),
  };
}

function normalizeStore(store) {
  if (!store || typeof store !== "object") return null;
  if (!("orders" in store) || !("planning" in store)) return null;

  return {
    version:
      typeof store.version === "number"
        ? store.version
        : OFFLINE_STORE_VERSION,
    createdAt: store.createdAt || new Date().toISOString(),
    updatedAt: store.updatedAt || new Date().toISOString(),
    orders: toArray(store.orders),
    planning: normalizePlanning(store.planning),
  };
}

export function saveOfflineStore(store) {
  const normalized = normalizeStore(store) || buildSeedStore();
  normalized.version = OFFLINE_STORE_VERSION;
  normalized.updatedAt = new Date().toISOString();
  window.localStorage.setItem(OFFLINE_STORE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadOfflineStore() {
  try {
    const raw = window.localStorage.getItem(OFFLINE_STORE_KEY);
    if (!raw) {
      return saveOfflineStore(buildSeedStore());
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeStore(parsed);
    if (!normalized) {
      return saveOfflineStore(buildSeedStore());
    }

    if (normalized.version !== OFFLINE_STORE_VERSION) {
      normalized.version = OFFLINE_STORE_VERSION;
      return saveOfflineStore(normalized);
    }

    return normalized;
  } catch (error) {
    console.warn(
      "Offline store was invalid, reinitializing from backup seed.",
      error
    );
    return saveOfflineStore(buildSeedStore());
  }
}

export function createOfflineId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
