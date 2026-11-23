import { useMemo, useState } from 'react';
import type { Simulation } from '../engine/engine';
import { formatSimTime } from '../engine/engine';
import { stripAnsi } from '../engine/ansi';
import type { AgentStatus, SimEvent } from '../engine/types';

const STATUS_FILL: Record<AgentStatus, string> = {
  idle: 'transparent',
  completed: 'transparent',
  planning: '#22d3ee',
  working: '#3987e5',
  reviewing: '#9085e9',
  waiting: '#c98500',
  blocked: '#e66767',
  failed: '#e66767',
  interrupted: '#d55181',
};

interface Seg {
  from: number;
  to: number;
  status: AgentStatus;
  task?: string;
}

/** Agent별 상태 구간 (Gantt) — 병렬성/대기 시간을 한눈에 */
export function Gantt({ sim, uptoTick, onPick }: { sim: Simulation; uptoTick?: number; onPick?: (tick: number) => void }) {
  const end = uptoTick ?? sim.tick;
  const lanes = useMemo(() => {
    const m = new Map<string, { segs: Seg[]; start: number }>();
    for (const e of sim.events) {
      if (e.tick > end) break;
      if (e.type === 'agent.spawned') m.set(e.agentId!, { segs: [{ from: e.tick, to: end, status: 'idle' }], start: e.tick });
      if (e.type === 'agent.status' && m.has(e.agentId!)) {
        const l = m.get(e.agentId!)!;
        const last = l.segs[l.segs.length - 1];
        last.to = e.tick;
        l.segs.push({ from: e.tick, to: end, status: e.data!.to as AgentStatus, task: e.taskId });
      }
      if (e.type === 'agent.removed' && m.has(e.agentId!)) {
        const l = m.get(e.agentId!)!;
        l.segs[l.segs.length - 1].to = e.tick;
        l.segs.push({ from: e.tick, to: e.tick, status: 'idle' });
      }
    }
    return [...m.entries()];
  }, [sim.events.length, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = Math.max(30, end);
  if (!lanes.length) return <div className="p-4 text-xs text-faint">Agent를 생성하면 작업 타임라인이 표시됩니다.</div>;
  return (
    <div className="px-3 py-2">
      {lanes.map(([id, l]) => (
        <div key={id} className="mb-1 flex items-center gap-2">
          <span className="w-28 shrink-0 truncate font-mono text-[11px] text-fuchsia-300">{id}</span>
          <div
            className="relative h-4 flex-1 rounded-sm bg-line/50"
            onClick={(e) => {
              if (!onPick) return;
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              onPick(Math.round(((e.clientX - r.left) / r.width) * span));
            }}
          >
            {l.segs
              .filter((s) => s.to > s.from && STATUS_FILL[s.status] !== 'transparent')
              .map((s, i) => (
                <div
                  key={i}
                  title={`${s.status}${s.task ? ' · ' + s.task : ''}  ${formatSimTime(s.from)}–${formatSimTime(s.to)}`}
                  className="absolute top-0 h-full rounded-[2px] border-r-2 border-[#0b0f17]"
                  style={{ left: `${(s.from / span) * 100}%`, width: `${((s.to - s.from) / span) * 100}%`, background: STATUS_FILL[s.status] }}
                />
              ))}
          </div>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-3 pl-30 text-[10.5px] text-faint">
        {(['working', 'reviewing', 'planning', 'waiting', 'blocked', 'interrupted'] as AgentStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: STATUS_FILL[s] }} />
            {s}
          </span>
        ))}
        <span className="ml-auto font-mono">0 — {formatSimTime(span)}</span>
      </div>
    </div>
  );
}

const TYPE_LABEL: Partial<Record<SimEvent['type'], string>> = {
  command: '명령',
  observe: '확인',
  'agent.spawned': 'Agent',
  'agent.removed': 'Agent',
  'agent.status': '상태',
  'agent.message': '지시',
  'task.status': 'Task',
  'task.assigned': '배정',
  'task.activated': 'Task',
  'step.completed': '단계',
  'gate.opened': '개입요청',
  'gate.resolved': '결정',
  'file.created': '파일',
  'file.updated': '파일',
  'file.deleted': '파일',
  'flag.set': '상태값',
  notify: '알림',
  'intent.matched': '의도',
  'intent.unrecognized': '미인식',
  'security.denied': '보안',
  'session.submitted': '제출',
  'session.start': '시작',
};

const TYPE_CLS: Partial<Record<SimEvent['type'], string>> = {
  'gate.opened': 'text-amber-300',
  'gate.resolved': 'text-emerald-300',
  'security.denied': 'text-red-300',
  'intent.unrecognized': 'text-red-300',
  command: 'text-sky-300',
  'agent.message': 'text-sky-300',
  'file.created': 'text-violet-300',
  'file.updated': 'text-violet-300',
};

export function EventLog({ sim, uptoTick, compact }: { sim: Simulation; uptoTick?: number; compact?: boolean }) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const evs = useMemo(() => {
    const hidden = new Set<SimEvent['type']>(['agent.log', 'cli.output', 'ui.request', 'step.started']);
    if (!showAll) {
      hidden.add('flag.set');
      hidden.add('task.status');
      hidden.add('agent.status');
    }
    return sim.events.filter(
      (e) => !hidden.has(e.type) && (uptoTick === undefined || e.tick <= uptoTick) && (!q || stripAnsi(e.message).toLowerCase().includes(q.toLowerCase())),
    );
  }, [sim.events.length, q, showAll, uptoTick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이벤트 검색…"
          className="w-56 rounded border border-line2 bg-bg px-2 py-0.5 text-xs outline-none focus:border-sky-700"
        />
        <label className="flex items-center gap-1 text-[11px] text-faint">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 상태 전이 포함
        </label>
        <span className="ml-auto text-[11px] text-faint">{evs.length}건 · 전체 {sim.events.length}</span>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[11px] ${compact ? '' : ''}`}>
        {[...evs].reverse().slice(0, 600).map((e) => (
          <div key={e.seq} className="flex gap-2 py-px hover:bg-panel2">
            <span className="w-12 shrink-0 text-faint">{formatSimTime(e.tick)}</span>
            <span className={`w-14 shrink-0 ${TYPE_CLS[e.type] ?? 'text-dim'}`}>{TYPE_LABEL[e.type] ?? e.type}</span>
            {e.agentId && <span className="shrink-0 text-fuchsia-300/80">{e.agentId}</span>}
            <span className="truncate text-fg/90">{stripAnsi(e.message)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Notifications({ sim }: { sim: Simulation }) {
  const evs = sim.events.filter((e) => e.type === 'notify' || e.type === 'task.activated').slice(-80).reverse();
  return (
    <div className="h-full overflow-auto px-3 py-1 text-xs">
      {!evs.length && <div className="py-3 text-faint">알림이 없습니다.</div>}
      {evs.map((e) => {
        const lvl = (e.data?.level as string) ?? 'info';
        const cls = lvl === 'error' ? 'text-red-300' : lvl === 'warn' ? 'text-amber-300' : lvl === 'success' ? 'text-emerald-300' : 'text-fg';
        const icon = lvl === 'error' ? '✗' : lvl === 'warn' ? '⏸' : lvl === 'success' ? '✔' : e.type === 'task.activated' ? '＋' : 'ℹ';
        return (
          <div key={e.seq} className="flex gap-2 py-0.5">
            <span className="w-12 shrink-0 font-mono text-faint">{formatSimTime(e.tick)}</span>
            <span className={cls}>
              {icon} {stripAnsi(e.message)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
