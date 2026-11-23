import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { useSession } from '../../store/session';
import { useSim } from '../common';
import Messenger, { totalUnread } from './Messenger';

/**
 * 메신저는 실제처럼 따로 떠 있는 창이다 — 브라우저·파일을 보면서 대화할 수 있다.
 * 최소화하면 상단바 버튼(안 읽은 수)만 남고, 새 메시지는 오른쪽 아래 알림으로 뜬다.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const KEY = 'at-messenger-rect';
const MIN_W = 440;
const MIN_H = 320;
const TOP = 44; // 상단바 높이 — 창이 그 위로 올라가지 않게

function defaultRect(): Rect {
  const w = Math.min(560, window.innerWidth - 32);
  const h = Math.min(600, window.innerHeight - TOP - 32);
  return { x: window.innerWidth - w - 16, y: window.innerHeight - h - 16, w, h };
}

function clamp(r: Rect): Rect {
  const w = Math.max(MIN_W, Math.min(r.w, window.innerWidth - 16));
  const h = Math.max(MIN_H, Math.min(r.h, window.innerHeight - TOP - 8));
  return {
    w,
    h,
    x: Math.max(0, Math.min(r.x, window.innerWidth - w)),
    y: Math.max(TOP, Math.min(r.y, window.innerHeight - h)),
  };
}

function loadRect(): Rect {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number')) return clamp(v);
  } catch {
    /* 저장소 없음 — 기본 위치 */
  }
  return defaultRect();
}

function saveRect(r: Rect) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* 무시 */
  }
}

export function MessengerButton() {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const readSeq = useSession((s) => s.readSeq);
  const { setMessengerOpen } = useSession.getState();
  if (!sim.scenario.people?.length) return null;
  const unread = totalUnread(sim, readSeq);
  return (
    <button
      onClick={() => setMessengerOpen(!open)}
      title={open ? '메신저 최소화' : '메신저 열기'}
      className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11.5px] ${
        open ? 'border-sky-700 bg-sky-500/15 text-sky-100' : 'border-line2 text-dim hover:text-fg'
      }`}
    >
      메신저
      {unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">{unread}</span>}
    </button>
  );
}

export function MessengerWindow() {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const { setMessengerOpen } = useSession.getState();
  const [rect, setRect] = useState<Rect>(loadRect);
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; start: Rect } | null>(null);

  useEffect(() => {
    const onResize = () => setRect((r) => clamp(r));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!sim.scenario.people?.length) return null;

  const begin = (mode: 'move' | 'resize') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: rect };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setRect(
      clamp(d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }),
    );
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setRect((r) => {
      saveRect(r);
      return r;
    });
  };

  return (
    <>
      {open && (
        <div
          className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-line2 bg-paper shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        >
          <div
            onPointerDown={begin('move')}
            onPointerMove={onMove}
            onPointerUp={end}
            onDoubleClick={() => {
              const r = defaultRect();
              setRect(r);
              saveRect(r);
            }}
            className="flex h-8 shrink-0 cursor-move items-center gap-2 border-b border-line bg-panel2 px-3 select-none"
            title="끌어서 옮기기 · 더블클릭하면 기본 위치로"
          >
            <span className="text-[12px] font-semibold text-strong">메신저</span>
            <span className="text-[10.5px] text-faint">사내 메신저 (가상)</span>
            <button
              onClick={() => setMessengerOpen(false)}
              title="최소화 — 상단바의 '메신저'로 다시 엽니다"
              className="ml-auto rounded px-2 text-[13px] leading-5 text-dim hover:bg-line hover:text-fg"
            >
              —
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Messenger />
          </div>
          <div
            onPointerDown={begin('resize')}
            onPointerMove={onMove}
            onPointerUp={end}
            className="absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize"
            style={{ background: 'linear-gradient(135deg, transparent 50%, var(--color-line2) 50%)' }}
            title="크기 조절"
          />
        </div>
      )}
      <Toasts />
    </>
  );
}

interface Toast {
  seq: number;
  personId: string;
  text: string;
}

/** 새 메시지 알림 — 메신저가 닫혀 있거나 다른 사람과 대화 중일 때 */
function Toasts() {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const chatWith = useSession((s) => s.chatWith);
  const { openPersonPane } = useSession.getState();
  const seen = useRef(sim.events[sim.events.length - 1]?.seq ?? 0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fresh: Toast[] = [];
    for (let i = sim.events.length - 1; i >= 0 && sim.events[i].seq > seen.current; i--) {
      const e = sim.events[i];
      if (e.type !== 'person.said' || !e.personId || e.data?.system || e.data?.from === 'player') continue;
      if (open && chatWith === e.personId) continue;
      fresh.unshift({ seq: e.seq, personId: e.personId, text: stripAnsi(e.message) });
    }
    seen.current = sim.events[sim.events.length - 1]?.seq ?? seen.current;
    if (!fresh.length) return;
    // 같은 사람의 연속 메시지는 하나로 (최신 문장)
    setToasts((ts) => {
      const next = [...ts];
      for (const f of fresh) {
        const i = next.findIndex((t) => t.personId === f.personId);
        if (i >= 0) next.splice(i, 1);
        next.push(f);
      }
      return next.slice(-3);
    });
  }, [sim.events.length, open, chatWith]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toasts.length) return;
    const h = setTimeout(() => setToasts((ts) => ts.slice(1)), 6000);
    return () => clearTimeout(h);
  }, [toasts]);

  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => {
        const def = sim.personDef(t.personId);
        return (
          <button
            key={t.seq}
            onClick={() => {
              openPersonPane(t.personId);
              setToasts((ts) => ts.filter((x) => x.personId !== t.personId));
            }}
            className="flex items-start gap-2 rounded-lg border border-line2 bg-panel2 px-3 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:border-sky-700"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-200">
              {def?.name.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-strong">{def?.name}</span>
              <span className="line-clamp-2 text-[11.5px] leading-snug text-dim">{t.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
