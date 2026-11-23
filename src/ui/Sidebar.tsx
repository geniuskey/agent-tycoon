import { useState } from 'react';
import { useSession } from '../store/session';
import { TrustMeter } from './terminal/TerminalPane';
import { AgentAvatar, Btn, Progress, SectionTitle, StatusBadge, TASK_STATUS, agentColor, useSim } from './common';

export default function Sidebar() {
  const sim = useSim()!;
  const { input, openAgentPane, focusedPane } = useSession.getState();
  const [roleOpen, setRoleOpen] = useState(false);
  const run = (cmd: string) => input(focusedPane.startsWith('shell') ? focusedPane : 'shell-1', cmd);
  const tasks = sim.visibleTasks();
  const agents = sim.agentList();
  const done = tasks.filter((t) => t.status === 'done').length;

  const people = sim.scenario.people ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-panel">
      {people.length > 0 && (
        <>
          <SectionTitle count={`${people.filter((p) => sim.people[p.id].met).length}/${people.length}`} right={<span className="text-[10.5px] text-faint">만남</span>}>
            사람들
          </SectionTitle>
          <div className="px-2 pt-1.5 pb-2">
            {people.map((p) => {
              const rt = sim.people[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => run(`talk ${p.id}`)}
                  title={p.description}
                  className="mb-1 block w-full rounded border border-transparent px-2 py-1.5 text-left hover:border-line2 hover:bg-panel2"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                        rt.met ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/50' : 'bg-line text-faint'
                      }`}
                    >
                      {p.name.slice(0, 1)}
                    </span>
                    <span className={`text-[12.5px] font-medium ${rt.met ? 'text-strong' : 'text-dim'}`}>{p.name}</span>
                    <span className="ml-auto">
                      <TrustMeter value={rt.trust} />
                    </span>
                  </div>
                  <div className="truncate pl-[24px] text-[11px] text-faint">{p.title}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <SectionTitle count={`${done}/${tasks.length}`} right={<Progress value={tasks.length ? done / tasks.length : 0} className="w-16" />}>
        Tasks
      </SectionTitle>
      <div className="px-2 pt-1.5 pb-2">
        {tasks.map((t) => {
          const def = sim.taskDef(t.id)!;
          const st = TASK_STATUS[t.status];
          const isDone = t.status === 'done';
          const muted = isDone || t.status === 'locked';
          return (
            <div
              key={t.id}
              className={`group relative mb-1 overflow-hidden rounded-md py-1.5 pr-2 pl-3 hover:bg-panel2 ${
                t.status === 'waiting' || t.status === 'blocked' ? 'bg-amber-500/[0.07]' : ''
              }`}
              title={def.description}
            >
              <span className={`absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full ${st.rail}`} />
              <div className="flex items-start gap-2">
                <span className={`min-w-0 flex-1 text-[12.5px] leading-snug ${isDone ? 'text-dim line-through decoration-faint/60' : muted ? 'text-dim' : 'font-medium text-strong'}`}>
                  {def.title}
                </span>
                <span className={`mt-px shrink-0 rounded px-1.5 py-px text-[10px] ${st.pill}`}>{st.label}</span>
              </div>
              {!isDone && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                  <span className="font-mono">{t.id}</span>
                  {def.optional && <span className="rounded border border-line2 px-1 leading-tight">선택</span>}
                  {def.review && <span className="rounded border border-violet-700/70 px-1 leading-tight text-violet-300">검증</span>}
                  {def.dependsOn?.length && t.status === 'locked' ? <span className="truncate">← {def.dependsOn.join(', ')}</span> : null}
                </div>
              )}
              {t.assignee && !isDone && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1 font-mono text-[10.5px]" style={{ color: agentColor(sim, t.assignee) }}>
                    <AgentAvatar sim={sim} id={t.assignee} size={13} />
                    {t.assignee}
                  </span>
                  <Progress value={sim.taskProgress(t.id)} className="flex-1" />
                </div>
              )}
              <div className="mt-1 hidden gap-1 group-hover:flex">
                <Btn variant="outline" onClick={() => run(`task show ${t.id}`)}>
                  상세
                </Btn>
              </div>
            </div>
          );
        })}
      </div>

      <SectionTitle
        count={agents.length}
        right={
          <Btn onClick={() => setRoleOpen((v) => !v)} title="Agent 생성">
            ＋ 생성
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
        {!agents.length && <div className="px-2 py-2 text-[11.5px] text-faint">Agent가 없습니다. ＋ 생성 또는 `agent spawn &lt;role&gt;`</div>}
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
                  {gate ? `⏸ ${gate.title}` : a.phase === 'confirm-mismatch' ? '⏸ 역량 확인 요청' : a.phase === 'waiting-deps' ? '⏳ 선행 작업 대기' : a.error ?? ''}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
