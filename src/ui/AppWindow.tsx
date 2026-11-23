import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useSession, type AppWindowId } from '../store/session';

/**
 * 가상 사내 PC의 앱 창 — 끌어서 옮기고, 오른쪽 아래로 크기를 바꾸고, 최소화하면 작업표시줄 버튼만 남는다.
 * 누른 창이 맨 앞으로 온다(frontWindow). 위치·크기는 창마다 브라우저에 기억한다.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WIN_TOP = 40; // IDE 상단바 — 창이 그 위로 올라가지 않게
export const WIN_BOTTOM = 60; // IDE 상태바 + 작업표시줄 — 창이 그 아래로 내려가지 않게

function clamp(r: Rect, minW: number, minH: number): Rect {
  const w = Math.max(minW, Math.min(r.w, window.innerWidth - 16));
  const h = Math.max(minH, Math.min(r.h, window.innerHeight - WIN_TOP - WIN_BOTTOM - 8));
  return {
    w,
    h,
    x: Math.max(0, Math.min(r.x, window.innerWidth - w)),
    y: Math.max(WIN_TOP, Math.min(r.y, window.innerHeight - WIN_BOTTOM - h)),
  };
}

function load(key: string, fallback: () => Rect, minW: number, minH: number): Rect {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number')) return clamp(v, minW, minH);
  } catch {
    /* 저장소 없음 — 기본 위치 */
  }
  return clamp(fallback(), minW, minH);
}

function save(key: string, r: Rect) {
  try {
    localStorage.setItem(key, JSON.stringify(r));
  } catch {
    /* 무시 */
  }
}

export default function AppWindow({
  id,
  title,
  subtitle,
  storageKey,
  defaultRect,
  minW = 440,
  minH = 320,
  onMinimize,
  children,
}: {
  id: AppWindowId;
  title: string;
  subtitle?: string;
  storageKey: string;
  defaultRect: () => Rect;
  minW?: number;
  minH?: number;
  onMinimize: () => void;
  children: ReactNode;
}) {
  const front = useSession((s) => s.frontWindow === id);
  const { raiseWindow } = useSession.getState();
  const [rect, setRect] = useState<Rect>(() => load(storageKey, defaultRect, minW, minH));
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; start: Rect } | null>(null);

  useEffect(() => {
    const onResize = () => setRect((r) => clamp(r, minW, minH));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minW, minH]);

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
      clamp(d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }, minW, minH),
    );
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setRect((r) => {
      save(storageKey, r);
      return r;
    });
  };

  return (
    <div
      onPointerDownCapture={() => raiseWindow(id)}
      className={`fixed flex flex-col overflow-hidden rounded-lg border bg-paper shadow-[0_12px_40px_rgba(0,0,0,0.55)] ${front ? 'z-[45] border-line2' : 'z-40 border-line'}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        onPointerDown={begin('move')}
        onPointerMove={onMove}
        onPointerUp={end}
        onDoubleClick={() => {
          const r = clamp(defaultRect(), minW, minH);
          setRect(r);
          save(storageKey, r);
        }}
        className={`flex h-8 shrink-0 cursor-move items-center gap-2 border-b border-line pl-3 select-none ${front ? 'bg-panel2' : 'bg-panel'}`}
        title="끌어서 옮기기 · 더블클릭하면 기본 위치로"
      >
        <span className={`text-[12px] font-semibold ${front ? 'text-strong' : 'text-dim'}`}>{title}</span>
        {subtitle && <span className="text-[10.5px] text-faint">{subtitle}</span>}
        <button
          onClick={onMinimize}
          title="최소화 — 작업표시줄에서 다시 엽니다"
          className="ml-auto h-full px-3.5 text-[13px] text-dim hover:bg-white/10 hover:text-fg"
        >
          —
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div
        onPointerDown={begin('resize')}
        onPointerMove={onMove}
        onPointerUp={end}
        className="absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, var(--color-line2) 50%)' }}
        title="크기 조절"
      />
    </div>
  );
}
