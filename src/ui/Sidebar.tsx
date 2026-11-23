import { useState } from 'react';
import { useSession } from '../store/session';
import { AGENT_STATUS, Btn, Progress, SectionTitle, StatusBadge, TASK_STATUS, useSim } from './common';

export default function Sidebar() {
  const sim = useSim()!;
  const { input, openAgentPane, focusedPane } = useSession.getState();
  const [roleOpen, setRoleOpen] = useState(false);
  const run = (cmd: string) => input(focusedPane.startsWith('shell') ? focusedPane : 'shell-1', cmd);
  const tasks = sim.visibleTasks();
  const agents = sim.agentList();
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-panel">
      <SectionTitle right={<span className="text-[11px] text-faint">{done}/{tasks.length}</span>}>Tasks</SectionTitle>
      <div className="px-2">
        {tasks.map((t) => {
          const def = sim.taskDef(t.id)!;
          const st = TASK_STATUS[t.status];
          return (
            <div key={t.id} className="group mb-1 rounded border border-transparent px-2 py-1.5 hover:border-line2 hover:bg-panel2" title={def.description}>
              <div className="flex items-center gap-1.5">
                <span className={`font-mono text-[11.5px] ${t.status === 'done' ? 'text-emerald-300' : 'text-fg'}`}>{t.id}</span>
                {def.optional && <span className="text-[10px] text-faint">선택</span>}
                {def.review && <span className="text-[10px] text-violet-300">검증</span>}
                <span className={`ml-auto text-[10.5px] ${st.cls}`}>{st.label}</span>
              </div>
              <div className="truncate text-[11px] text-dim">{def.title}</div>
              {def.dependsOn?.length ? (
                <div className="truncate text-[10.5px] text-faint">← {def.dependsOn.join(', ')}</div>
              ) : null}
              {t.assignee && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[10.5px] text-fuchsia-300">@{t.assignee}</span>
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
        right={
          <Btn onClick={() => setRoleOpen((v) => !v)} title="Agent 생성">
            ＋ 생성
          </Btn>
        }
      >
        Agents
      </SectionTitle>
      {roleOpen && (
        <div className="mx-2 mb-2 rounded border border-line2 bg-panel2 p-1">
          {sim.scenario.roles.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                run(`agent spawn ${r.id}`);
                setRoleOpen(false);
              }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-line"
            >
              <span className="font-mono text-xs text-sky-300">{r.id}</span> <span className="text-xs text-fg">{r.name}</span>
              <div className="text-[10.5px] text-faint">{r.skills.join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
      <div className="px-2 pb-3">
        {!agents.length && <div className="px-2 py-2 text-[11.5px] text-faint">Agent가 없습니다. ＋ 생성 또는 `agent spawn &lt;role&gt;`</div>}
        {agents.map((a) => {
          const gate = sim.openGate(a);
          const needs = a.status === 'waiting' || a.status === 'blocked' || a.status === 'failed';
          return (
            <button
              key={a.id}
              onClick={() => openAgentPane(a.id)}
              className={`mb-1 block w-full rounded border px-2 py-1.5 text-left hover:bg-panel2 ${needs ? AGENT_STATUS[a.status].cls.split(' ').find((c) => c.startsWith('border')) : 'border-transparent hover:border-line2'}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-fuchsia-300">{a.id}</span>
                <span className="ml-auto">
                  <StatusBadge status={a.status} />
                </span>
              </div>
              <div className="truncate text-[11px] text-dim">
                {a.taskId ? [a.taskId, sim.currentStep(a)?.event].filter(Boolean).join(' · ') : sim.roleDef(a.role)?.name}
              </div>
              {needs && (
                <div className="mt-0.5 truncate text-[11px] text-amber-300">
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
