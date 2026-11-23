import { useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import type { Simulation } from '../../engine/engine';
import { formatSimTime } from '../../engine/engine';
import type { SimEvent, TaskRuntime, TaskStatus } from '../../engine/types';
import { useSession } from '../../store/session';
import { AgentAvatar, Progress, TASK_STATUS, agentColor } from '../common';

/**
 * 업무 보드 (sim://board) — 사내 이슈 트래커처럼 Task를 칸반과 의존 관계로 보여준다.
 * 시나리오 파일이 아니라 엔진의 Task 상태를 그대로 투영한다 (읽기 전용 — 지시는 Agent 세션에서).
 */

const COLUMNS: { id: string; label: string; statuses: TaskStatus[]; hint: string }[] = [
  { id: 'todo', label: '할 일', statuses: ['ready', 'locked'], hint: '시작 가능 · 선행 작업 대기' },
  { id: 'doing', label: '진행 중', statuses: ['assigned', 'in_progress'], hint: 'Agent가 작업 중' },
  { id: 'attention', label: '확인 필요', statuses: ['waiting', 'blocked', 'failed'], hint: '내 판단·조치를 기다림' },
  { id: 'done', label: '완료', statuses: ['done'], hint: '' },
];

const ACTIVITY = new Set(['task.activated', 'task.assigned', 'task.status', 'gate.opened', 'gate.resolved', 'plan.presented', 'plan.resolved', 'step.completed']);

function attentionNote(sim: Simulation, t: TaskRuntime): string | undefined {
  const a = t.assignee ? sim.agents[t.assignee] : undefined;
  if (t.status === 'failed') return a?.error ? `실패: ${a.error}` : '실패';
  if (!a) return undefined;
  const gate = sim.openGate(a);
  if (gate) return `${gate.kind === 'blocked' ? '⛔' : '⏸'} ${gate.title}`;
  if (a.phase === 'plan-approval') return '⏸ 계획 승인 요청';
  if (a.phase === 'confirm-mismatch') return '⏸ 역량 확인 요청';
  if (a.phase === 'waiting-deps') return '⏳ 선행 작업 대기';
  return undefined;
}

function activityText(e: SimEvent): string {
  const d = e.data ?? {};
  if (e.type === 'task.status' && d.to) {
    const label = (s: unknown) => TASK_STATUS[s as TaskStatus]?.label ?? String(s);
    return d.from ? `상태: ${label(d.from)} → ${label(d.to)}` : `상태: ${label(d.to)}`;
  }
  if (e.type === 'task.assigned' && e.agentId && !d.duplicate) {
    if (d.handoff) return `인계: ${String(d.handoff)} → ${e.agentId}`;
    if (d.retry) return `재시도: ${e.agentId}`;
    if (d.restart) return `처음부터 다시: ${e.agentId}`;
    return `담당: ${e.agentId}`;
  }
  return stripAnsi(e.message);
}

export default function BoardView({ sim }: { sim: Simulation }) {
  const [view, setView] = useState<'board' | 'deps'>('board');
  const [open, setOpen] = useState<string | null>(null);
  const tasks = sim.visibleTasks();
  const done = tasks.filter((t) => t.status === 'done').length;

  if (open && sim.tasks[open]) return <TaskDetail sim={sim} id={open} onBack={() => setOpen(null)} onOpen={setOpen} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-faint">업무 보드 · {sim.scenario.company.org}</div>
          <div className="truncate text-[15px] font-semibold text-strong">{sim.scenario.title}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-dim">
            {done}/{tasks.length} 완료
          </span>
          <Progress value={tasks.length ? done / tasks.length : 0} className="w-16" />
          <div className="flex rounded border border-line2">
            {(
              [
                ['board', '보드'],
                ['deps', '의존 관계'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-2.5 py-0.5 text-[11.5px] ${view === id ? 'bg-sky-500/20 text-sky-100' : 'text-dim hover:text-fg'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {view === 'board' ? <Kanban sim={sim} tasks={tasks} onOpen={setOpen} /> : <Deps sim={sim} tasks={tasks} onOpen={setOpen} />}
      </div>
    </div>
  );
}

function Kanban({ sim, tasks, onOpen }: { sim: Simulation; tasks: TaskRuntime[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-[repeat(4,minmax(118px,1fr))] gap-1.5">
      {COLUMNS.map((col) => {
        const items = tasks
          .filter((t) => col.statuses.includes(t.status))
          // 할 일: 시작 가능한 것을 위로
          .sort((a, b) => (col.id === 'todo' ? Number(a.status === 'locked') - Number(b.status === 'locked') : 0));
        const hot = col.id === 'attention' && items.length > 0;
        return (
          <div key={col.id} className={`flex min-h-[220px] flex-col rounded-md p-1.5 ${hot ? 'bg-amber-500/[0.07] ring-1 ring-amber-500/40' : 'bg-panel'}`}>
            <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1.5">
              <span className={`text-[11.5px] font-semibold ${hot ? 'text-amber-200' : 'text-dim'}`}>{col.label}</span>
              <span className="text-[11px] text-faint">{items.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {items.map((t) => (
                <Card key={t.id} sim={sim} t={t} onOpen={onOpen} />
              ))}
              {!items.length && col.hint && <div className="px-1 py-2 text-[10.5px] text-faint">{col.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ sim, t, onOpen, compact }: { sim: Simulation; t: TaskRuntime; onOpen: (id: string) => void; compact?: boolean }) {
  const def = sim.taskDef(t.id)!;
  const st = TASK_STATUS[t.status];
  const note = attentionNote(sim, t);
  const pending = t.status === 'locked' ? (def.dependsOn ?? []).filter((d) => sim.tasks[d]?.status !== 'done') : [];
  return (
    <button
      onClick={() => onOpen(t.id)}
      className={`relative w-full overflow-hidden rounded border border-line bg-paper2 py-1.5 pr-2 pl-2.5 text-left hover:border-sky-700 ${t.status === 'done' ? 'opacity-70' : ''}`}
    >
      <span className={`absolute top-0 bottom-0 left-0 w-[3px] ${st.rail}`} />
      <div className={`text-[12px] leading-snug ${t.status === 'done' ? 'text-dim' : 'font-medium text-strong'}`}>{def.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="font-mono text-faint">{t.id}</span>
        {compact && <span className={`rounded px-1 ${st.pill}`}>{st.label}</span>}
        {def.optional && <span className="rounded border border-line2 px-1 text-faint">선택</span>}
        {def.review && <span className="rounded border border-violet-700/70 px-1 text-violet-300">검증</span>}
        {t.status === 'ready' && !compact && <span className="rounded bg-sky-500/15 px-1 text-sky-200">시작 가능</span>}
        {def.owner === 'player' && <span className="rounded bg-amber-500/15 px-1 text-amber-200">담당: 나</span>}
      </div>
      {pending.length > 0 && <div className="mt-1 truncate text-[10.5px] text-faint">← {pending.join(', ')} 완료 후</div>}
      {note && <div className="mt-1 text-[10.5px] leading-snug text-amber-200">{note}</div>}
      {t.assignee && t.status !== 'done' && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <AgentAvatar sim={sim} id={t.assignee} size={14} />
          <span className="font-mono text-[10.5px]" style={{ color: agentColor(sim, t.assignee) }}>
            {t.assignee}
          </span>
          <Progress value={sim.taskProgress(t.id)} className="flex-1" />
        </div>
      )}
      {t.status === 'done' && t.assignHistory.length > 0 && (
        <div className="mt-1 font-mono text-[10px] text-faint">
          {t.assignHistory[t.assignHistory.length - 1]} · {formatSimTime(t.completedAt ?? 0)}
        </div>
      )}
    </button>
  );
}

function Deps({ sim, tasks, onOpen }: { sim: Simulation; tasks: TaskRuntime[]; onOpen: (id: string) => void }) {
  const level = sim.taskLevels();
  const max = Math.max(0, ...Object.values(level));
  return (
    <div>
      <div className="mb-2 px-1 text-[11px] text-faint">같은 단계의 업무는 서로 기다리지 않으므로 여러 Agent에게 동시에 맡길 수 있습니다.</div>
      <div className="flex min-w-max gap-2">
        {Array.from({ length: max + 1 }, (_, i) => (
          <div key={i} className="flex w-[160px] shrink-0 flex-col gap-1.5 rounded-md bg-panel p-1.5">
            <div className="px-1 pt-0.5 text-[11px] font-semibold text-dim">
              단계 {i + 1}
              {i < max && <span className="ml-1 font-normal text-faint">→</span>}
            </div>
            {tasks
              .filter((t) => level[t.id] === i)
              .map((t) => (
                <Card key={t.id} sim={sim} t={t} onOpen={onOpen} compact />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskDetail({ sim, id, onBack, onOpen }: { sim: Simulation; id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { openFile } = useSession.getState();
  const t = sim.tasks[id];
  const def = sim.taskDef(id)!;
  const st = TASK_STATUS[t.status];
  const note = attentionNote(sim, t);
  const dependents = sim.visibleTasks().filter((x) => sim.taskDef(x.id)?.dependsOn?.includes(id));
  const activity = sim.events.filter((e) => e.taskId === id && ACTIVITY.has(e.type)).slice(-14);

  const fileLink = (p: string) =>
    sim.files.has(p) ? (
      <button key={p} onClick={() => openFile(p)} className="block font-mono text-[11.5px] text-sky-300 hover:underline">
        {p}
      </button>
    ) : (
      <span key={p} className="block font-mono text-[11.5px] text-faint">
        {p} <span className="font-sans">(아직 없음)</span>
      </span>
    );
  const taskLink = (x: string) => (
    <button key={x} onClick={() => onOpen(x)} className="mr-1.5 rounded border border-line2 px-1.5 font-mono text-[11px] text-dim hover:border-sky-700 hover:text-fg">
      {x} <span className="font-sans">{TASK_STATUS[sim.tasks[x]?.status ?? 'locked'].label}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-3">
      <button onClick={onBack} className="mb-2 text-[11.5px] text-dim hover:text-fg">
        ← 보드
      </button>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-faint">{id}</div>
          <h2 className="text-[16px] font-semibold text-strong">{def.title}</h2>
        </div>
        <span className={`mt-1 shrink-0 rounded px-1.5 py-px text-[11px] ${st.pill}`}>{st.label}</span>
      </div>
      {note && <div className="mt-2 rounded border border-amber-600/50 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-100">{note}</div>}
      <p className="mt-2 text-[12.5px] leading-relaxed text-fg">{def.description}</p>

      <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12px]">
        <dt className="text-faint">담당</dt>
        <dd>
          {def.owner === 'player' ? (
            <span className="text-amber-200">나 — 사람이 직접 하는 업무 (메신저로 진행)</span>
          ) : t.assignee ? (
            <span className="flex items-center gap-1.5">
              <AgentAvatar sim={sim} id={t.assignee} size={14} />
              <span className="font-mono" style={{ color: agentColor(sim, t.assignee) }}>
                {t.assignee}
              </span>
              {t.status !== 'done' && <Progress value={sim.taskProgress(id)} className="w-24" />}
            </span>
          ) : (
            <span className="text-faint">없음 — Agent 세션에서 프롬프트로 맡기세요</span>
          )}
        </dd>
        <dt className="text-faint">필요 역량</dt>
        <dd className="text-dim">{def.skills.join(', ') || '—'}</dd>
        <dt className="text-faint">선행 업무</dt>
        <dd>{def.dependsOn?.length ? def.dependsOn.filter((d) => sim.tasks[d]?.visible).map(taskLink) : <span className="text-faint">없음</span>}</dd>
        <dt className="text-faint">후속 업무</dt>
        <dd>{dependents.length ? dependents.map((x) => taskLink(x.id)) : <span className="text-faint">없음</span>}</dd>
        {!!def.inputs?.length && (
          <>
            <dt className="text-faint">입력 자료</dt>
            <dd>{def.inputs.map(fileLink)}</dd>
          </>
        )}
        {!!def.outputs?.length && (
          <>
            <dt className="text-faint">산출물</dt>
            <dd>{def.outputs.map(fileLink)}</dd>
          </>
        )}
        <dt className="text-faint">이력</dt>
        <dd className="text-dim">
          시도 {t.attempts}회
          {t.assignHistory.length > 0 && ` · 담당 ${[...new Set(t.assignHistory)].join(' → ')}`}
          {t.startedAt !== undefined && ` · 시작 ${formatSimTime(t.startedAt)}`}
          {t.completedAt !== undefined && ` · 완료 ${formatSimTime(t.completedAt)}`}
        </dd>
      </dl>

      <div className="mt-4 mb-1 text-[11.5px] font-semibold text-dim">활동</div>
      {!activity.length && <div className="text-[11.5px] text-faint">아직 활동이 없습니다.</div>}
      <ol className="space-y-0.5">
        {activity.map((e) => (
          <li key={e.seq} className="flex gap-2 text-[11.5px]">
            <span className="shrink-0 font-mono text-faint">{formatSimTime(e.tick)}</span>
            <span className="text-dim">{activityText(e)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
