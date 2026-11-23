import type { PlayerCommand } from '../engine/types';

/**
 * 로컬 저장소 (IndexedDB, 실패 시 localStorage).
 * 세션은 (scenarioId, seed, commands, tick)만 저장하고 상태는 결정적 재생으로 복원한다.
 */
import type { CarryState } from '../engine/types';

export interface PaneLayout {
  id: string;
  agentId?: string;
  personId?: string;
}

export interface SessionRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  seed: number;
  commands: PlayerCommand[];
  tick: number;
  createdAt: number;
  updatedAt: number;
  submitted: boolean;
  panes: PaneLayout[];
  /** 캠페인: 이 미션을 시작할 때 이어받은 회사 상태 */
  carry?: CarryState;
  /** 캠페인: 제출 시 다음 미션으로 넘긴 회사 상태 */
  exportCarry?: CarryState;
}

const DB = 'agent-tycoon';
const STORE = 'sessions';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const LS_KEY = 'agent-tycoon.sessions';
function lsAll(): SessionRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function lsWrite(list: SessionRecord[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* quota or disabled */
  }
}

export async function saveSession(rec: SessionRecord): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  lsWrite([rec, ...lsAll().filter((r) => r.id !== rec.id)]);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const db = await openDb();
  let list: SessionRecord[];
  if (db) {
    list = await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SessionRecord[]);
      req.onerror = () => resolve([]);
    });
  } else list = lsAll();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  lsWrite(lsAll().filter((r) => r.id !== id));
}

const ACTIVE_KEY = 'agent-tycoon.active';
export function setActiveSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** 세션 기록 내보내기 (복기/공유용 JSON) */
export function exportSession(rec: SessionRecord): string {
  return JSON.stringify({ format: 'agent-tycoon-session', version: 1, ...rec }, null, 2);
}
