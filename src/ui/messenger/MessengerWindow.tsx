import { useEffect, useRef, useState } from 'react';
import AppWindow, { WIN_BOTTOM, WIN_TOP, type Rect } from '../AppWindow';
import { stripAnsi } from '../../engine/ansi';
import { useSession } from '../../store/session';
import { useSim } from '../common';
import Messenger, { incomingKey } from './Messenger';

/**
 * 메신저는 실제처럼 따로 떠 있는 창이다 — 브라우저·파일을 보면서 대화할 수 있다.
 * 최소화하면 작업표시줄 버튼(안 읽은 수)만 남고, 새 메시지는 오른쪽 아래 알림으로 뜬다.
 */

function defaultRect(): Rect {
  const w = Math.min(560, window.innerWidth - 32);
  const h = Math.min(600, window.innerHeight - WIN_TOP - WIN_BOTTOM - 24);
  return { x: window.innerWidth - w - 16, y: window.innerHeight - WIN_BOTTOM - h - 12, w, h };
}

export function MessengerWindow() {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const { setMessengerOpen } = useSession.getState();
  if (!sim.scenario.people?.length) return null;
  return (
    <>
      {open && (
        <AppWindow id="messenger" title="메신저" subtitle="사내 메신저 (가상)" storageKey="at-messenger-rect" defaultRect={defaultRect} onMinimize={() => setMessengerOpen(false)}>
          <Messenger />
        </AppWindow>
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
      const k = incomingKey(e);
      if (!k) continue;
      if (e.type === 'group.said' && e.data?.system && !String(e.message).startsWith('● 회의 시작')) continue;
      if (open && chatWith === k) continue;
      const speaker = e.type === 'group.said' ? sim.personDef(e.data?.speaker as string)?.name : undefined;
      fresh.unshift({ seq: e.seq, personId: k, text: (speaker ? `${speaker}: ` : '') + stripAnsi(e.message) });
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
    <div className="fixed right-4 bottom-[72px] z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => {
        const gid = t.personId.startsWith('group:') ? t.personId.slice(6) : undefined;
        const def = gid ? { name: sim.scenario.groups?.find((g) => g.id === gid)?.name ?? gid } : sim.personDef(t.personId);
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
              {gid ? '⧉' : def?.name.slice(0, 1)}
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
