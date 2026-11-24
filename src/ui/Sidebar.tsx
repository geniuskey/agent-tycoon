import { useState } from 'react';
import { useSession } from '../store/session';
import { BOARD_URL } from '../engine/cli';
import { AgentAvatar, Btn, Progress, SectionTitle, StatusBadge, agentColor, useSim } from './common';

export default function Sidebar() {
  const sim = useSim()!;
  const { input, openAgentPane, focusedPane, navigate } = useSession.getState();
  const [roleOpen, setRoleOpen] = useState(false);
  const run = (cmd: string) => input(focusedPane.startsWith('shell') ? focusedPane : 'shell-1', cmd);
  const tasks = sim.visibleTasks();
  const agents = sim.agentList();
  const done = tasks.filter((t) => t.status === 'done').length;
  const attentionTasks = tasks.filter((t) => ['waiting', 'blocked', 'failed'].includes(t.status));
  const readyFree = tasks.filter((t) => t.status === 'ready' && !t.assignee);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-panel">
      <SectionTitle count={`${done}/${tasks.length}`} right={<Progress value={tasks.length ? done / tasks.length : 0} className="w-16" />}>
        업무
      </SectionTitle>
      {sim.has('multiAgent') ? (
        <div className="px-2 pt-1.5 pb-2">
          <button
            onClick={() => navigate(BOARD_URL)}
            className="block w-full rounded-md border border-line2 px-2.5 py-2 text-left hover:border-sky-700 hover:bg-panel2"
            title="업무 보드 열기 (sim://board)"
          >
            <div className="flex items-center gap-2 text-[11.5px]">
              {(
                [
                  ['할 일', tasks.filter((t) => t.status === 'ready' || t.status === 'locked').length, 'text-dim'],
                  ['진행', tasks.filter((t) => t.status === 'assigned' || t.status === 'in_progress').length, 'text-sky-300'],
                  ['확인', attentionTasks.length, attentionTasks.length ? 'text-amber-300 font-semibold' : 'text-dim'],
                  ['완료', done, 'text-emerald-300'],
                ] as const
              ).map(([label, n, cls]) => (
                <span key={label} className="flex items-baseline gap-1">
                  <span className="text-faint">{label}</span>
                  <span className={`font-mono ${cls}`}>{n}</span>
                </span>
              ))}
            </div>
            {attentionTasks.map((t) => (
              <div key={t.id} className="mt-1 truncate text-[11px] text-amber-200">
                ⏸ {sim.taskDef(t.id)?.title}
              </div>
            ))}
            {readyFree.length > 0 && (
              <div className="mt-1 truncate text-[11px] text-sky-200">시작 가능·미배정 {readyFree.length}건</div>
            )}
            <div className="mt-1 text-[10.5px] text-faint">업무 보드 열기 ↗</div>
          </button>
        </div>
      ) : (
        <TaskChecklist />
      )}

      {sim.has('terminal') && (
        <>
          <SectionTitle
            count={agents.length}
            right={
              <Btn onClick={() => setRoleOpen((v) => !v)} title="Agent 세션 열기 (agent spawn)">
                ＋ 새 세션
              </Btn>
            }
          >
            Agents
          </SectionTitle>
          {roleOpen && (
            <div className="mx-2 mt-1.5 mb-2 rounded border border-line2 bg-panel2 p-1">
              {sim.scenario.roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    run(`agent spawn ${r.id}`);
                    setRoleOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-line"
                >
                  <span className="flex items-center gap-1.5">
                    <AgentAvatar sim={sim} id={r.id} size={15} />
                    <span className="font-mono text-xs font-semibold" style={{ color: agentColor(sim, r.id) }}>{r.id}</span>
                    <span className="text-xs text-fg">{r.name}</span>
                  </span>
                  <div className="text-[10.5px] text-faint">{r.skills.join(' · ')}</div>
                </button>
              ))}
            </div>
          )}
          <div className="px-2 pt-1.5 pb-3">
            {!agents.length && <div className="px-2 py-2 text-[11.5px] text-faint">Agent 세션이 없습니다. ＋ 새 세션 또는 `agent spawn &lt;role&gt;`</div>}
            {agents.map((a) => {
              const gate = sim.openGate(a);
              const needs = a.status === 'waiting' || a.status === 'blocked' || a.status === 'failed';
              return (
                <button
                  key={a.id}
                  onClick={() => openAgentPane(a.id)}
                  className={`mb-1 block w-full rounded-md border px-2 py-1.5 text-left ${
                    needs
                      ? a.status === 'waiting'
                        ? 'attn border-amber-500/70 bg-amber-500/[0.09] hover:bg-amber-500/15'
                        : 'border-red-500/70 bg-red-500/[0.09] hover:bg-red-500/15'
                      : 'border-transparent hover:border-line2 hover:bg-panel2'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <AgentAvatar sim={sim} id={a.id} />
                    <span className="font-mono text-[12.5px] font-semibold" style={{ color: agentColor(sim, a.id) }}>
                      {a.id}
                    </span>
                    <span className="ml-auto">
                      <StatusBadge status={a.status} />
                    </span>
                  </div>
                  <div className="truncate pl-[24px] text-[11px] text-dim">
                    {a.taskId ? [a.taskId, sim.currentStep(a)?.event].filter(Boolean).join(' · ') : sim.roleDef(a.role)?.name}
                  </div>
                  {needs && (
                    <div className={`mt-1 truncate pl-[24px] text-[11.5px] font-medium ${a.status === 'waiting' ? 'text-amber-200' : 'text-red-200'}`}>
                      {gate ? `⏸ ${gate.title}` : a.phase === 'confirm-mismatch' ? '⏸ 역량 확인 요청' : a.phase === 'plan-approval' ? '⏸ 계획 승인 요청' : a.phase === 'waiting-deps' ? '⏳ 선행 작업 대기' : a.error ?? ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** 업무 보드가 열리기 전(초기 단계)의 체크리스트 — 무엇을 하면 끝나는지만 보여 준다 */
function TaskChecklist() {
  const sim = useSim()!;
  return (
    <ul className="space-y-1 px-3 pt-1.5 pb-3">
      {sim.visibleTasks().map((t) => {
        const def = sim.taskDef(t.id)!;
        const done = t.status === 'done';
        const locked = t.status === 'locked';
        return (
          <li key={t.id} className="flex gap-2 px-1 py-1" title={def.description}>
            <span
              className={`mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[10px] leading-none ${
                done ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-line2'
              }`}
            >
              {done ? '✓' : ''}
            </span>
            <span className="min-w-0">
              <span className={`block text-[12.5px] ${done ? 'text-dim line-through' : locked ? 'text-faint' : 'text-fg'}`}>{def.title}</span>
              {!done && !locked && <span className="block text-[11px] leading-snug text-faint">{def.description}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
