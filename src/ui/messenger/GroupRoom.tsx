import { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { formatSimTime } from '../../engine/engine';
import type { Simulation } from '../../engine/engine';
import { groupDef, meetingState } from '../../engine/groups';
import { useSession } from '../../store/session';
import { useSim } from '../common';
import { unreadCount } from './Messenger';

/**
 * 그룹 대화방 (합의 회의). 회의를 소집하면 정해진 시간에 열리고,
 * 회의 중에만 안건마다 제안을 올릴 수 있다. 참석자는 각자의 이해관계에 따라 동의/반대한다.
 */

const key = (gid: string) => `group:${gid}`;

function stateLabel(sim: Simulation, gid: string): { text: string; cls: string } {
  const g = sim.groups[gid];
  if (g.signed) return { text: '합의 완료', cls: 'text-emerald-300' };
  const st = meetingState(sim, gid);
  if (st === 'live') return { text: '회의 중', cls: 'text-red-300' };
  if (st === 'scheduled') return { text: `${formatSimTime(g.start!)} 시작`, cls: 'text-amber-300' };
  return { text: '', cls: '' };
}

function GroupAvatar({ size = 30, live }: { size?: number; live?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg font-semibold ${live ? 'bg-red-500/20 text-red-200 ring-1 ring-red-400/60' : 'bg-sky-500/15 text-sky-200'}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      ⧉
    </span>
  );
}

export function GroupRow({ gid, active }: { gid: string; active: boolean }) {
  const sim = useSim()!;
  const readSeq = useSession((s) => s.readSeq);
  const { openPersonPane } = useSession.getState();
  const def = groupDef(sim, gid)!;
  const unread = unreadCount(sim, readSeq, key(gid));
  const st = stateLabel(sim, gid);
  const agreed = def.agenda.filter((a) => sim.groups[gid].agenda[a.id].status === 'agreed').length;
  return (
    <button
      onClick={() => openPersonPane(key(gid))}
      title={def.description}
      className={`flex w-full items-center gap-2 border-b border-line px-2.5 py-2 text-left ${active ? 'bg-panel2' : 'hover:bg-panel2/60'}`}
    >
      <GroupAvatar live={meetingState(sim, gid) === 'live'} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={`truncate text-[12.5px] ${unread ? 'font-semibold text-strong' : 'font-medium text-fg'}`}>{def.name}</span>
        </span>
        <span className="block truncate text-[11px] text-faint">
          {st.text ? <span className={st.cls}>{st.text}</span> : `안건 ${agreed}/${def.agenda.length} 합의`}
        </span>
      </span>
      {unread > 0 && <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">{unread}</span>}
    </button>
  );
}

export default function GroupRoom({ gid }: { gid: string }) {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const { markRead } = useSession.getState();
  const def = groupDef(sim, gid)!;
  const g = sim.groups[gid];
  const st = meetingState(sim, gid);
  const evs = useMemo(
    () => sim.events.filter((e) => e.type === 'group.said' && e.data?.group === gid),
    [sim.events.length, gid], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [agendaSel, setAgendaSel] = useState<string | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [evs.length]);
  useEffect(() => {
    if (open) markRead(key(gid));
  }, [evs.length, open, gid, markRead]);

  const run = (cmd: string) => sim.input(cmd, { paneId: key(gid) });
  const sel = def.agenda.find((a) => a.id === agendaSel && g.agenda[a.id].status !== 'agreed') ?? def.agenda.find((a) => g.agenda[a.id].status !== 'agreed');
  const typing = g.pending.length > 0;
  const lbl = stateLabel(sim, gid);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-line">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <GroupAvatar size={26} live={st === 'live'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-strong">{def.name}</div>
          <div className="truncate text-[10.5px] text-faint">{def.members.map((m) => sim.personDef(m)?.name ?? m).join(' · ')}</div>
        </div>
        {lbl.text && <span className={`shrink-0 text-[11px] ${lbl.cls}`}>{lbl.text}</span>}
      </div>

      {/* 안건 현황 */}
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-line bg-panel/60 px-3 py-1.5">
        {def.agenda.map((a) => {
          const ar = g.agenda[a.id];
          const cls =
            ar.status === 'agreed' ? 'border-emerald-700 text-emerald-200' : ar.status === 'held' ? 'border-amber-600 text-amber-200' : 'border-line2 text-dim';
          return (
            <span key={a.id} className={`rounded border px-1.5 py-px text-[10.5px] ${cls}`} title={ar.proposal ? a.proposals.find((p) => p.id === ar.proposal)?.label : undefined}>
              {ar.status === 'agreed' ? '✔' : ar.status === 'held' ? '⏸' : '○'} {a.title}
            </span>
          );
        })}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {!evs.length && <div className="py-6 text-center text-xs leading-relaxed text-faint">{def.description}</div>}
        {evs.map((e) => {
          const msg = stripAnsi(e.message);
          if (e.data?.system) return <div key={e.seq} className="py-0.5 text-center text-[11px] text-faint">{msg}</div>;
          if (e.data?.from === 'player') {
            return (
              <div key={e.seq} className="flex items-end justify-end gap-1.5">
                <div className="shrink-0 text-[10px] text-faint">{formatSimTime(e.tick)}</div>
                <div className="max-w-[80%] rounded-lg rounded-br-sm bg-sky-600/25 px-3 py-1.5 text-[13px] leading-relaxed text-sky-50">{msg}</div>
              </div>
            );
          }
          const who = sim.personDef(e.data?.speaker as string);
          return (
            <div key={e.seq} className="flex items-start gap-1.5">
              <span className="mt-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-200">
                {who?.name.slice(0, 1)}
              </span>
              <div className="min-w-0 max-w-[80%]">
                <div className="text-[10.5px] text-dim">{who?.name}</div>
                <div className="rounded-lg rounded-tl-sm bg-panel2 px-3 py-1.5 text-[13px] leading-relaxed text-fg">{msg}</div>
              </div>
              <div className="mt-auto shrink-0 text-[10px] text-faint">{formatSimTime(e.tick)}</div>
            </div>
          );
        })}
        {typing && <div className="text-xs text-faint">참석자가 발언 중…</div>}
      </div>

      {!sim.submitted && (
        <div className="max-h-[50%] shrink-0 overflow-y-auto border-t border-line bg-panel px-2 pt-1.5 pb-1.5">
          {g.signed ? (
            <div className="px-2 py-1 text-[12px] text-emerald-200">✔ 모든 안건이 합의되어 참석자 전원이 서명했습니다.</div>
          ) : st === 'none' ? (
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-faint">
                {sim.cond(def.requires)
                  ? `회의를 소집하면 ${def.notice ?? 15}분 뒤 시작합니다. 회의 중에는 참석자가 1:1 메시지를 보지 않습니다. 남은 안건을 모두 한 번씩 다루면 회의가 끝납니다.`
                  : (def.requiresText ?? '아직 회의를 소집할 수 없습니다.')}
              </div>
              <button
                disabled={!sim.cond(def.requires)}
                onClick={() => run(`meeting ${gid} call`)}
                className="shrink-0 rounded bg-sky-500/90 px-3 py-1 text-[12px] font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-30"
              >
                {g.meetings ? '다시 소집' : '회의 소집'}
              </button>
            </div>
          ) : st === 'scheduled' ? (
            <div className="px-2 py-1 text-[11.5px] text-amber-200">
              {formatSimTime(g.start!)}에 시작합니다. 그 전까지는 참석자에게 1:1로 메시지를 보낼 수 있습니다.
            </div>
          ) : (
            sel && (
              <>
                <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
                  <span className="mr-1 text-[11.5px] font-semibold text-dim">안건</span>
                  <button
                    onClick={() => run(`meeting ${gid} end`)}
                    disabled={g.closing}
                    className="order-last ml-auto rounded border border-line2 px-2 py-px text-[11px] text-dim hover:text-fg disabled:opacity-40"
                    title="남은 안건은 다음 회의로 미룹니다"
                  >
                    회의 마치기
                  </button>
                  {def.agenda
                    .filter((a) => g.agenda[a.id].status !== 'agreed')
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAgendaSel(a.id)}
                        className={`rounded px-1.5 py-px text-[11px] ${sel.id === a.id ? 'bg-sky-500/20 text-sky-100' : 'text-dim hover:text-fg'}`}
                      >
                        {g.discussed.includes(a.id) && <span className="mr-0.5 text-amber-300">⏸</span>}
                        {a.title}
                      </button>
                    ))}
                </div>
                {sel.explain && <div className="px-2 pb-1 text-[11px] leading-snug text-faint">{sel.explain}</div>}
                {sel.proposals
                  .filter((p) => sim.cond(p.requires))
                  .map((p, i) => (
                    <button
                      key={p.id}
                      disabled={typing || g.closing || g.discussed.includes(sel.id)}
                      onClick={() => run(`propose ${gid} ${sel.id} ${p.id}`)}
                      className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-[12.5px] text-dim hover:bg-panel2 hover:text-fg disabled:opacity-40"
                    >
                      <span className="w-4 shrink-0 font-mono text-[11px] text-faint">{i + 1}</span>
                      <span className="leading-snug">{p.label}</span>
                    </button>
                  ))}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
