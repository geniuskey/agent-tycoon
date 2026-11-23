import { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { formatSimTime } from '../../engine/engine';
import type { Simulation } from '../../engine/engine';
import { presence, topicChoices } from '../../engine/people';
import type { SimEvent } from '../../engine/types';
import { useSession } from '../../store/session';
import { TrustMeter } from '../terminal/TerminalPane';
import { useSim } from '../common';

/**
 * 사내 메신저 — 사람과의 대화는 터미널이 아니라 여기서 한다.
 * 메시지는 비동기: 상대가 읽어야(읽는 시간·회의 일정) 답이 온다.
 * 엔진의 person.said / person.trust 이벤트를 투영한다.
 */

const isIncoming = (e: SimEvent) => e.type === 'person.said' && !e.data?.system && e.data?.from !== 'player';

function personEvents(sim: Simulation, id: string) {
  return sim.events.filter((e) => e.personId === id && (e.type === 'person.said' || e.type === 'person.trust'));
}

export function unreadCount(sim: Simulation, readSeq: Record<string, number>, id: string): number {
  const after = readSeq[id] ?? 0;
  let n = 0;
  for (let i = sim.events.length - 1; i >= 0 && sim.events[i].seq > after; i--) {
    const e = sim.events[i];
    if (e.personId === id && isIncoming(e)) n++;
  }
  return n;
}

export function totalUnread(sim: Simulation, readSeq: Record<string, number>): number {
  return Object.keys(sim.people).reduce((a, id) => a + unreadCount(sim, readSeq, id), 0);
}

function PresenceDot({ sim, id, className = '' }: { sim: Simulation; id: string; className?: string }) {
  const pr = presence(sim, id);
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-paper ${pr.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'} ${className}`}
      title={pr.label}
    />
  );
}

function Avatar({ sim, id, size = 30 }: { sim: Simulation; id: string; size?: number }) {
  const def = sim.personDef(id);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full bg-amber-500/20 font-semibold text-amber-200"
        style={{ fontSize: size * 0.4 }}
      >
        {def?.name.slice(0, 1)}
      </span>
      <PresenceDot sim={sim} id={id} className="absolute -right-0.5 -bottom-0.5" />
    </span>
  );
}

export default function Messenger() {
  const sim = useSim()!;
  const chatWith = useSession((s) => s.chatWith);
  const people = sim.scenario.people ?? [];
  const active = chatWith && sim.people[chatWith] ? chatWith : null;

  if (!people.length) {
    return <div className="p-6 text-center text-xs text-faint">이 미션에는 연락할 사람이 없습니다.</div>;
  }
  return (
    <div className="flex h-full min-h-0">
      <ContactList active={active} />
      {active ? <Conversation key={active} id={active} /> : <EmptyState />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 border-l border-line px-6 text-center">
      <div className="text-[13px] text-dim">대화할 사람을 고르세요</div>
      <div className="text-[11.5px] leading-relaxed text-faint">
        메시지는 상대가 읽어야 답이 옵니다.
        <br />
        회의 중인 사람은 회의가 끝난 뒤에 확인합니다.
      </div>
    </div>
  );
}

function ContactList({ active }: { active: string | null }) {
  const sim = useSim()!;
  const readSeq = useSession((s) => s.readSeq);
  const { openPersonPane } = useSession.getState();
  const people = sim.scenario.people ?? [];
  return (
    <div className={`flex shrink-0 flex-col overflow-y-auto bg-panel ${'w-[168px]'}`}>
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold text-dim">
        대화 상대 <span className="ml-1.5 font-normal text-faint">{people.length}</span>
      </div>
      {people.map((d) => {
        const unread = unreadCount(sim, readSeq, d.id);
        const pr = presence(sim, d.id);
        const last = [...personEvents(sim, d.id)].reverse().find((e) => e.type === 'person.said' && !e.data?.system);
        const preview = last ? stripAnsi(last.message).replace(/^나 ▸ /, last.data?.from === 'player' ? '나: ' : '') : d.title;
        return (
          <button
            key={d.id}
            onClick={() => openPersonPane(d.id)}
            title={d.description}
            className={`flex w-full items-center gap-2 px-2.5 py-2 text-left ${active === d.id ? 'bg-panel2' : 'hover:bg-panel2/60'}`}
          >
            <Avatar sim={sim} id={d.id} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className={`truncate text-[12.5px] ${unread ? 'font-semibold text-strong' : 'font-medium text-fg'}`}>{d.name}</span>
                {pr.status !== 'online' && <span className="shrink-0 text-[10px] text-red-300">{pr.label}</span>}
              </span>
              <span className={`block truncate text-[11px] ${unread ? 'text-fg' : 'text-faint'}`}>{preview}</span>
            </span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">{unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Conversation({ id }: { id: string }) {
  const sim = useSim()!;
  const rightTab = useSession((s) => s.rightTab);
  const { sendMessage, markRead } = useSession.getState();
  const def = sim.personDef(id)!;
  const p = sim.people[id];
  const pr = presence(sim, id);
  const evs = useMemo(() => personEvents(sim, id), [sim.events.length, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const scroller = useRef<HTMLDivElement>(null);
  const typing = p.pending.length > 0;
  const choices = topicChoices(sim, id);
  const [freeText, setFreeText] = useState(false);
  const [text, setText] = useState('');
  const [cur, setCur] = useState(0);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [evs.length, typing]);
  useEffect(() => {
    if (rightTab === 'messenger') markRead(id);
  }, [evs.length, rightTab, id, markRead]);

  // 아직 읽지 않은 내 메시지 (상대 inbox에 남은 수만큼, 뒤에서부터)
  const playerSeqs = evs.filter((e) => e.data?.from === 'player').map((e) => e.seq);
  const unreadMine = new Set(playerSeqs.slice(playerSeqs.length - p.inbox.length));

  const send = (msg: { topic?: string; text?: string }) => {
    sendMessage(id, msg);
    setText('');
    setCur(0);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-line">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <Avatar sim={sim} id={id} size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-strong">{def.name}</div>
          <div className="truncate text-[10.5px] text-faint">
            {def.title} · {def.org}
          </div>
        </div>
        <TrustMeter value={p.trust} />
      </div>
      {pr.status !== 'online' && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-500/[0.07] px-3 py-1 text-[11px] text-red-200">
          {pr.label}
          {pr.until !== undefined && ` · ${formatSimTime(pr.until)}까지`} — 보낸 메시지는 끝난 뒤에 확인합니다
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!evs.length && <div className="py-6 text-center text-xs leading-relaxed text-faint">{def.description}</div>}
        {evs.map((e) => {
          const msg = stripAnsi(e.message);
          if (e.type === 'person.trust') {
            const d = e.data!.delta as number;
            return (
              <div key={e.seq} className="text-center text-[10.5px] text-faint">
                신뢰 {String(e.data!.from)} → {String(e.data!.to)}{' '}
                <span className={d > 0 ? 'text-emerald-400' : 'text-red-400'}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>
              </div>
            );
          }
          if (e.data?.system) {
            if (/^──.*──$/.test(msg.trim())) return null; // 첫 인사 구분선 — 대화 헤더에 이미 있다
            return <div key={e.seq} className="text-center text-[10.5px] text-faint">{msg}</div>;
          }
          if (e.data?.from === 'player') {
            return (
              <div key={e.seq} className="flex items-end justify-end gap-1.5">
                <div className="shrink-0 text-right text-[10px] leading-tight">
                  {unreadMine.has(e.seq) && <div className="font-semibold text-amber-300" title="아직 읽지 않음">1</div>}
                  <div className="text-faint">{formatSimTime(e.tick)}</div>
                </div>
                <div className="max-w-[78%] rounded-lg rounded-br-sm bg-sky-600/25 px-3 py-1.5 text-[13px] leading-relaxed text-sky-50">
                  {msg.replace(/^나 ▸ /, '')}
                </div>
              </div>
            );
          }
          return (
            <div key={e.seq} className="flex items-end gap-1.5">
              <div className="max-w-[78%] rounded-lg rounded-bl-sm bg-panel2 px-3 py-1.5 text-[13px] leading-relaxed text-fg">{msg}</div>
              <div className="shrink-0 text-[10px] text-faint">{formatSimTime(e.tick)}</div>
            </div>
          );
        })}
        {typing && <div className="text-xs text-faint">{def.name} 님이 입력 중…</div>}
      </div>

      {!sim.submitted && (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (freeText) return;
            const n = Number(e.key);
            if (n >= 1 && n <= Math.min(9, choices.length)) {
              e.preventDefault();
              send({ topic: choices[n - 1].id });
            } else if (e.key === 'ArrowDown') setCur((c) => Math.min(choices.length - 1, c + 1));
            else if (e.key === 'ArrowUp') setCur((c) => Math.max(0, c - 1));
            else if (e.key === 'Enter' && choices[cur]) send({ topic: choices[cur].id });
          }}
          className="max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-panel px-2 pt-1.5 pb-1.5 outline-none focus:bg-[#141b29]"
        >
          <div className="flex items-center px-1 pb-1">
            <span className="text-[11.5px] font-semibold text-dim">보낼 메시지</span>
            <span className="ml-2 text-[10.5px] text-faint">1–9 · ⏎</span>
            <button onClick={() => setFreeText((v) => !v)} className="ml-auto text-[11px] text-faint hover:text-fg">
              {freeText ? '선택지로' : '직접 입력 ⌨'}
            </button>
          </div>
          {freeText ? (
            <form
              className="flex gap-2 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                send({ text });
              }}
            >
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`${def.name}에게 메시지 (자유 입력은 인식되지 않을 수 있음)`}
                className="flex-1 rounded border border-line2 bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-sky-600"
              />
            </form>
          ) : (
            <>
              {choices.map((t, i) => (
                <button
                  key={t.id}
                  onMouseEnter={() => setCur(i)}
                  onClick={() => send({ topic: t.id })}
                  className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left text-[12.5px] text-dim hover:bg-panel2 hover:text-fg ${cur === i ? 'bg-panel2/60' : ''}`}
                >
                  <span className="w-4 shrink-0 font-mono text-[11px] text-faint">{i + 1 <= 9 ? i + 1 : ''}</span>
                  <span className="leading-snug">{t.label}</span>
                </button>
              ))}
              {!choices.length && <div className="px-3 py-1 text-[11.5px] text-faint">지금은 더 보낼 메시지가 없습니다.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
