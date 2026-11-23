import { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { formatSimTime } from '../../engine/engine';
import { topicChoices } from '../../engine/people';
import { useSession } from '../../store/session';
import { useSim } from '../common';

/**
 * 인물 대화 패널 — 채팅 형태 (person.said / person.trust 이벤트의 투영).
 * 터미널보다 긴 한국어 대화를 읽기 쉽다.
 */
export default function ChatBody({ paneId, personId, focused }: { paneId: string; personId: string; focused: boolean }) {
  const sim = useSim()!;
  const { input, focusPane } = useSession.getState();
  const [text, setText] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const def = sim.personDef(personId);
  const evs = useMemo(
    () => sim.events.filter((e) => e.personId === personId && (e.type === 'person.said' || e.type === 'person.trust')),
    [sim.events.length, personId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const typing = (sim.people[personId]?.pending.length ?? 0) > 0;
  const choices = topicChoices(sim, personId);
  const away = (sim.people[personId]?.awayUntil ?? 0) > sim.tick;
  const [freeText, setFreeText] = useState(false);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [evs.length, typing]);
  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    input(paneId, v);
    setHist((h) => [v, ...h].slice(0, 50));
    setHi(-1);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onMouseDown={() => focusPane(paneId)}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!evs.length && <div className="py-6 text-center text-xs text-faint">{def?.description}</div>}
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
          if (e.data?.system) return <div key={e.seq} className="text-center text-[10.5px] text-faint">{msg.replace(/^─+\s*|\s*─+$/g, '')}</div>;
          if (e.data?.from === 'player') {
            return (
              <div key={e.seq} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-br-sm bg-sky-600/25 px-3 py-1.5 text-[13px] leading-relaxed text-sky-50">{msg.replace(/^나 ▸ /, '')}</div>
              </div>
            );
          }
          return (
            <div key={e.seq} className="flex items-end gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-300">
                {def?.name.slice(0, 1)}
              </div>
              <div className="max-w-[80%]">
                <div className="rounded-lg rounded-bl-sm bg-panel2 px-3 py-1.5 text-[13px] leading-relaxed text-fg">{msg}</div>
                <div className="mt-0.5 text-[10px] text-faint">{formatSimTime(e.tick)}</div>
              </div>
            </div>
          );
        })}
        {typing && <div className="pl-9 text-xs text-faint">{def?.name} 님이 답하는 중…</div>}
      </div>
      {!sim.submitted && (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            const n = Number(e.key);
            if (n >= 1 && n <= Math.min(9, choices.length)) {
              e.preventDefault();
              input(paneId, `ask ${personId} ${choices[n - 1].id}`);
            } else if (e.key === 'ArrowDown') setCur((c) => Math.min(choices.length - 1, c + 1));
            else if (e.key === 'ArrowUp') setCur((c) => Math.max(0, c - 1));
            else if (e.key === 'Enter' && choices[cur]) input(paneId, `ask ${personId} ${choices[cur].id}`);
          }}
          className="max-h-[50%] shrink-0 overflow-y-auto border-t-2 border-amber-800/60 bg-panel px-2 pt-1.5 pb-1 outline-none focus:bg-[#141b29]"
        >
          <div className="flex items-center px-1 pb-1">
            <span className="text-[11.5px] font-semibold text-amber-200">무엇을 물어볼까요?</span>
            <span className="ml-2 text-[10.5px] text-faint">{away ? '지금은 자리에 없습니다' : '1–9 · ⏎'}</span>
            <button onClick={() => setFreeText((v) => !v)} className="ml-auto text-[11px] text-faint hover:text-fg">
              {freeText ? '선택지로' : '직접 입력 ⌨'}
            </button>
          </div>
          {!freeText &&
            choices.map((t, i) => (
              <button
                key={t.id}
                disabled={away}
                onMouseEnter={() => setCur(i)}
                onClick={() => input(paneId, `ask ${personId} ${t.id}`)}
                className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left text-[12.5px] text-dim hover:bg-panel2 hover:text-fg disabled:opacity-40 ${cur === i ? 'bg-panel2/60' : ''}`}
              >
                <span className="w-4 shrink-0 font-mono text-[11px] text-faint">{i + 1 <= 9 ? i + 1 : ''}</span>
                <span className="leading-snug">“{t.label}”</span>
              </button>
            ))}
          {!freeText && !choices.length && <div className="px-3 py-1 text-[11.5px] text-faint">지금은 더 물어볼 것이 없습니다.</div>}
        </div>
      )}
      {freeText && (
        <form
          className="flex gap-2 border-t border-line bg-panel px-2 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <input
            ref={inputRef}
            autoFocus
            value={text}
            disabled={sim.submitted}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => focusPane(paneId)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowUp' && hist.length) {
                e.preventDefault();
                const n = Math.min(hist.length - 1, hi + 1);
                setHi(n);
                setText(hist[n]);
              } else if (e.key === 'ArrowDown' && hi >= 0) {
                e.preventDefault();
                const n = hi - 1;
                setHi(n);
                setText(n < 0 ? '' : hist[n]);
              }
            }}
            placeholder={`${def?.name ?? ''}에게 직접 말하기 (자유 입력은 인식되지 않을 수 있음)`}
            className="flex-1 rounded border border-line2 bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-amber-600"
          />
        </form>
      )}
    </div>
  );
}
