import { c } from './ansi';
import type { Simulation } from './engine';
import { BUSY_STATUSES } from './engine';
import { intentLabel, runIntent } from './nlu';
import type { GateDef } from './types';

/**
 * 객관식 상호작용 (Claude Code plan mode 방식).
 * 현재 상태에서 고를 수 있는 선택지를 계산하고, 선택 결과는 구조화 명령으로 기록된다.
 *   do <agent> <intentId> [+modifierId ...] [--plan]   프롬프트: 지시 (단일) + 조건 (복수), plan mode
 *   agent choose <agent> <n[,n...]>            Agent 질문에 답하기 (단일/복수)
 *   ask <person> <topicId>                     사람에게 질문
 */

export interface Choice {
  id: string;
  label: string;
  note?: string;
}

export type AgentChoices =
  | { mode: 'gate'; gate: GateDef; options: Choice[]; multi: boolean; min: number; max: number }
  | { mode: 'confirm'; title: string; options: Choice[] }
  | { mode: 'instruct'; instructions: Choice[]; modifiers: Choice[]; actions: { label: string; command: string }[] }
  | { mode: 'busy'; actions: { label: string; command: string }[] };

export function agentChoices(sim: Simulation, agentId: string): AgentChoices | null {
  const a = sim.agents[agentId];
  if (!a) return null;
  if (a.phase === 'plan-approval' && a.status !== 'interrupted') {
    return {
      mode: 'confirm',
      title: `'${sim.taskDef(a.taskId!)?.title}' — 이 계획대로 진행할까요?`,
      options: [
        { id: 'approve', label: '예, 계획대로 진행' },
        { id: 'reject', label: '아니요 — 지시나 조건을 바꿔 다시 보내기' },
      ],
    };
  }
  if (a.phase === 'confirm-mismatch') {
    return {
      mode: 'confirm',
      title: `'${sim.taskDef(a.taskId!)?.title}'에 필요한 역량이 부족합니다. 그래도 진행할까요?`,
      options: [
        { id: 'go', label: '그래도 진행 (품질 저하·시간 증가 감수)' },
        { id: 'cancel', label: '배정 취소 — 적합한 Agent에게 맡기기' },
      ],
    };
  }
  const gate = sim.openGate(a);
  if (gate && a.status !== 'interrupted') {
    return {
      mode: 'gate',
      gate,
      options: gate.options.map((o) => ({ id: o.id, label: o.label })),
      multi: !!gate.multi,
      min: gate.min ?? 1,
      max: gate.max ?? (gate.multi ? gate.options.length : 1),
    };
  }
  const actions: { label: string; command: string }[] = [{ label: '상세 정보', command: `agent inspect ${a.id}` }];
  if (BUSY_STATUSES.includes(a.status) || a.phase === 'waiting-deps') {
    actions.unshift({ label: '작업 중단', command: `agent interrupt ${a.id}` }, { label: '진행 상황', command: `agent status ${a.id}` });
    return { mode: 'busy', actions };
  }
  if (a.status === 'interrupted') actions.unshift({ label: '재개', command: `agent resume ${a.id}` }, { label: '처음부터 다시', command: `agent restart ${a.id}` });
  if (a.status === 'failed') actions.unshift({ label: '실패한 단계 재시도', command: `agent retry ${a.id}` });

  const instructions: Choice[] = [];
  const modifiers: Choice[] = [];
  for (const i of sim.scenario.intents) {
    if (i.hiddenChoice || !sim.cond(i.requires)) continue;
    if (i.modifier) {
      if (i.roles && !i.roles.includes(a.role)) continue;
      modifiers.push({ id: i.id, label: intentLabel(i) });
      continue;
    }
    if (i.assign) {
      const t = sim.tasks[i.assign];
      if (!t) continue;
      if (t.visible && t.status === 'done' && !i.redo) continue;
      if (a.taskId === i.assign && t.status !== 'done' && !['failed', 'interrupted'].includes(a.status)) continue;
      const def = sim.taskDef(i.assign)!;
      const busyBy = t.assignee && t.assignee !== a.id && sim.agents[t.assignee] && t.status !== 'done' ? t.assignee : undefined;
      const missing = sim.missingSkills(a, i.assign);
      const notes = [
        busyBy ? `${busyBy} 작업 중` : '',
        !sim.depsDone(i.assign) && t.status !== 'done' ? `선행: ${(def.dependsOn ?? []).filter((d) => sim.tasks[d].status !== 'done').join(', ')}` : '',
        missing.length ? `역량 부족: ${missing.join(', ')}` : '',
      ].filter(Boolean);
      instructions.push({ id: i.id, label: intentLabel(i), note: notes.join(' · ') || undefined });
    } else if (i.label || i.example) {
      instructions.push({ id: i.id, label: intentLabel(i) });
    }
  }
  return { mode: 'instruct', instructions, modifiers, actions };
}

/** 지시 + 조건을 하나의 프롬프트 문장으로 */
export function composePrompt(instruction: string, conditions: string[]): string {
  return [instruction, ...conditions].join('. ').replace(/\.\./g, '.');
}

/** do <agent> <intentId> [+mod ...] [--plan] */
export function doInstruct(sim: Simulation, pane: string, agentId: string, intentId: string, mods: string[], plan = false): void {
  const a = sim.resolveAgent(agentId);
  if (!a) return sim.out(pane, c.red(`✗ Agent '${agentId}' 없음`));
  const intent = sim.scenario.intents.find((i) => i.id === intentId && !i.modifier);
  if (!intent) return sim.out(pane, c.red(`✗ 지시 '${intentId}' 없음`));
  const modDefs = mods.map((m) => sim.scenario.intents.find((i) => i.id === m && i.modifier)).filter((x) => !!x);
  const text = composePrompt(intentLabel(intent), modDefs.map((m) => intentLabel(m)));
  sim.metrics.nlInstructions++;
  sim.emit('agent.message', text, { agentId: a.id, paneId: pane, data: { from: 'player', intent: intentId, mods, plan } });
  sim.agentLog(a, '');
  sim.agentLog(a, c.white(c.bold('> ')) + c.white(text));
  if (plan) sim.agentLog(a, c.cyan('  ⏸ plan mode'));
  a.planMode = plan;
  for (const m of modDefs) runIntent(sim, m, a, pane);
  runIntent(sim, intent, a, pane);
  // 새 작업을 계획하지 않았다면(대답만 했거나 거절) plan mode는 해제
  if (!['planning', 'waiting-deps', 'confirm-mismatch'].includes(a.phase)) a.planMode = false;
}
