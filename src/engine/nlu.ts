import { c } from './ansi';
import type { Simulation } from './engine';
import { statusText } from './cli';
import type { AgentRuntime, IntentDef, PlayerCommand } from './types';

/**
 * 규칙 기반 자연어 의도 분류기 (LLM 미사용).
 *
 * 처리 순서
 *  1. 대상 Agent 결정 (Agent 패널 / @mention / 문장 내 Agent 이름)
 *  2. 열린 의사결정(gate)·역량 확인 응답
 *  3. 시나리오 정의 intent (정규식 패턴)
 *  4. 공통 intent (상태, 중단, 재개, 재시도, 인계)
 *  5. Task 키워드 매칭
 *  6. 인식 실패 → 성공 처리하지 않고 지원되는 지시 예시 안내
 */

const GENERIC = {
  status: /(상태|진행\s*상황|진행상황|어디까지|뭐\s*하고|status|progress)/i,
  interrupt: /(중단|멈춰|멈춰줘|그만|중지|stop|pause|interrupt)/i,
  resume: /(재개|계속\s*(진행|해)|이어서|resume|continue)/i,
  retry: /(재시도|다시\s*시도|retry)/i,
  restart: /(처음부터|restart)/i,
  handoff: /(넘겨|인계|전달해|handoff|hand\s*off)/i,
};

const YES = /^(1|y|yes|ok|응|네|예|진행|그래|좋아|계속)|진행해|진행하세요|괜찮/i;
const NO = /^(2|n|no|아니|취소|하지\s*마)|취소해|하지마/i;

function rx(p: string): RegExp {
  try {
    return new RegExp(p, 'i');
  } catch {
    return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

export function findMention(sim: Simulation, text: string, exclude?: string): AgentRuntime | undefined {
  const lower = text.toLowerCase();
  const agents = sim.agentList().filter((a) => a.id !== exclude);
  const byLen = [...agents].sort((a, b) => b.id.length - a.id.length);
  for (const a of byLen) {
    const re = new RegExp(`(^|[^a-z0-9-])@?${a.id.replace(/-/g, '\\-')}(?![a-z0-9-])`, 'i');
    if (re.test(lower)) return a;
  }
  for (const a of agents) {
    const name = sim.roleDef(a.role)?.name;
    if (name && text.includes(name)) return a;
  }
  return undefined;
}

function pickAgent(sim: Simulation, taskId: string, roles?: string[]): AgentRuntime | undefined {
  const free = sim.agentList().filter((a) => a.status === 'idle' || a.status === 'completed');
  const fit = free.filter((a) => sim.missingSkills(a, taskId).length === 0);
  return fit.find((a) => !roles || roles.includes(a.role)) ?? fit[0];
}

function bestRoleFor(sim: Simulation, taskId: string): string | undefined {
  const def = sim.taskDef(taskId)!;
  return sim.scenario.roles.find((r) => def.skills.every((s) => r.skills.includes(s)))?.id;
}

export function handleNaturalLanguage(sim: Simulation, cmd: PlayerCommand, isReply = false): void {
  const pane = cmd.paneId;
  const say = (lines: string | string[]) => sim.out(pane, lines);
  let text = cmd.text.trim();
  let target = cmd.agentId ? sim.agents[cmd.agentId] : undefined;
  sim.metrics.nlInstructions++;

  const m = text.match(/^@([\w-]+)[\s,:]*([\s\S]*)$/);
  if (m) {
    const a = sim.resolveAgent(m[1]);
    if (!a) {
      say(c.red(`✗ Agent '${m[1]}' 없음.`) + c.dim(` 'agent spawn <role>'로 먼저 생성하세요. (role: ${sim.scenario.roles.map((r) => r.id).join(', ')})`));
      return;
    }
    target = a;
    text = m[2].trim();
    if (!text) {
      say(c.yellow(`@${a.id} 뒤에 지시 내용을 입력하세요.`));
      return;
    }
  } else if (!target) {
    target = findMention(sim, text);
  }

  const norm = text.toLowerCase();
  if (target) {
    sim.emit('agent.message', text, { agentId: target.id, paneId: pane, data: { from: 'player' } });
    sim.agentLog(target, c.white(c.bold('▸ 지시: ')) + c.white(text));
  }
  const reply = (lines: string[]) => {
    if (target) for (const l of lines) sim.agentLog(target, `  ${l}`);
    if (!target || pane !== `agent:${target.id}`) say(lines.map((l) => (target ? c.dim(`[${target.id}] `) : '') + l));
  };

  // ── 2. 의사결정 응답 ──
  if (target && target.phase === 'confirm-mismatch') {
    const yes = YES.test(norm);
    const no = NO.test(norm);
    if (yes || no) {
      const r = sim.resolveGate(target.id, yes && !no ? 0 : 1, 'nl');
      if (pane !== `agent:${target.id}`) say(c.green(`✓ ${target.id}: ${r.message}`));
      return;
    }
  }
  if (target && target.phase === 'gate') {
    const gate = sim.openGate(target)!;
    let idx = -1;
    const num = norm.match(/^\s*\[?(\d)\]?\s*(번|번째)?\s*($|[.)\s])/);
    if (num) idx = Number(num[1]) - 1;
    if (idx < 0) idx = gate.options.findIndex((o) => o.patterns.some((p) => rx(p).test(text)));
    if (idx >= 0 && idx < gate.options.length) {
      const r = sim.resolveGate(target.id, idx, isReply ? 'cli' : 'nl');
      if (pane !== `agent:${target.id}`) say(r.ok ? c.green(`✓ ${target.id}: ${r.message}`) : c.red(`✗ ${r.message}`));
      return;
    }
    if (!GENERIC.status.test(norm)) {
      sim.metrics.unrecognized++;
      sim.emit('intent.unrecognized', text, { agentId: target.id, paneId: pane, data: { gate: gate.id } });
      reply([
        c.yellow(`응답을 해석하지 못했습니다. '${gate.title}'에 대해 다음 중 하나로 답해주세요:`),
        ...gate.options.map((o, i) => c.cyan(`[${i + 1}] ${o.label}`)),
      ]);
      return;
    }
  }
  if (isReply) {
    say(c.yellow(`${target?.id ?? ''}는 응답을 기다리고 있지 않습니다.`));
    return;
  }

  // ── 3. 시나리오 intent ──
  let wrongRole: IntentDef | undefined;
  let modifiers = 0;
  for (const intent of sim.scenario.intents) {
    if (!intent.patterns.some((p) => rx(p).test(text))) continue;
    if (intent.roles && target && !intent.assign && !intent.roles.includes(target.role)) {
      wrongRole ??= intent;
      continue;
    }
    if (intent.modifier) {
      if (!sim.cond(intent.requires)) continue;
      executeIntent(sim, intent, target, pane, say, reply);
      modifiers++;
      continue;
    }
    executeIntent(sim, intent, target, pane, say, reply);
    return;
  }
  if (modifiers) return;
  if (wrongRole && target) {
    const names = wrongRole.roles!.map((r) => sim.roleDef(r)?.name ?? r).join(', ');
    sim.emit('intent.matched', `역할 불일치: ${wrongRole.id}`, { agentId: target.id, data: { intent: wrongRole.id, wrongRole: true } });
    reply([c.yellow(`이 지시는 제 역할(${sim.roleDef(target.role)?.name})보다 [${names}] 역할에 적합합니다. 해당 Agent에게 지시해 주세요.`)]);
    return;
  }

  // ── 4. 공통 intent ──
  if (GENERIC.status.test(norm)) {
    say(statusText(sim, target?.id));
    return;
  }
  if (GENERIC.handoff.test(norm) && target) {
    const other = findMention(sim, text, target.id);
    if (other) {
      const r = sim.handoff(target.id, other.id);
      say(r.ok ? c.green(`✓ ${r.message}`) : c.red(`✗ ${r.message}`));
      return;
    }
  }
  if (GENERIC.interrupt.test(norm) && target) {
    const r = sim.interrupt(target.id);
    say(r.ok ? c.green(`✓ ${r.message}`) : c.yellow(r.message));
    return;
  }
  if (GENERIC.retry.test(norm) && target) {
    const r = target.status === 'failed' ? sim.retry(target.id) : sim.restart(target.id);
    say(r.ok ? c.green(`✓ ${r.message}`) : c.yellow(r.message));
    return;
  }
  if (GENERIC.restart.test(norm) && target) {
    const r = sim.restart(target.id);
    say(r.ok ? c.green(`✓ ${r.message}`) : c.yellow(r.message));
    return;
  }
  if (GENERIC.resume.test(norm) && target && target.status === 'interrupted') {
    const r = sim.resume(target.id);
    say(r.ok ? c.green(`✓ ${r.message}`) : c.yellow(r.message));
    return;
  }

  // ── 5. Task 키워드 매칭 ──
  const scored = sim
    .visibleTasks()
    .map((t) => {
      const def = sim.taskDef(t.id)!;
      const kws = [...(def.keywords ?? []), t.id];
      const score = kws.reduce((s, k) => s + (norm.includes(k.toLowerCase()) ? 1 : 0), 0);
      return { t, def, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const notDone = scored.filter((x) => x.t.status !== 'done');
  const best = notDone[0] ?? scored[0];
  if (best) {
    if (best.t.status === 'done' && !notDone.length) {
      reply([c.dim(`'${best.def.title}'(${best.t.id})는 이미 완료되었습니다. 산출물: ${best.def.outputs?.join(', ') || '-'}`)]);
      sim.emit('intent.matched', `완료된 task 언급: ${best.t.id}`, { agentId: target?.id, data: { task: best.t.id } });
      return;
    }
    const agent = target ?? pickAgent(sim, best.t.id);
    if (!agent) {
      const role = bestRoleFor(sim, best.t.id);
      say([
        c.yellow(`'${best.def.title}' 업무로 이해했지만 맡길 수 있는 Agent가 없습니다.`),
        c.dim(`  적합 역할: ${role ?? '-'} → 'agent spawn ${role ?? '<role>'}' 후 '@${role ?? '<agent>'} ${text}'`),
      ]);
      return;
    }
    const r = sim.assign(agent.id, best.t.id, { via: 'nl' });
    sim.emit('intent.matched', `task 지시: ${best.t.id} → ${agent.id}`, { agentId: agent.id, data: { task: best.t.id, via: 'keyword' } });
    if (!r.ok) {
      say(c.red(`✗ ${r.message}`));
      return;
    }
    if (!target) say(c.green(`✓ '${best.def.title}' → ${agent.id}에게 배정`));
    else if (pane !== `agent:${agent.id}`) say(c.green(`✓ ${r.message}`));
    return;
  }

  // ── 6. 인식 실패 ──
  sim.metrics.unrecognized++;
  sim.emit('intent.unrecognized', text, { agentId: target?.id, paneId: pane });
  const examples = sim.scenario.intents
    .filter((i) => i.example && sim.cond(i.requires))
    .slice(0, 4)
    .map((i) => i.example!);
  const ready = sim.visibleTasks().filter((t) => t.status === 'ready' && !t.assignee);
  const lines = [
    c.yellow('요청을 이해하지 못했습니다.') + c.dim(' (이 시뮬레이터는 시나리오에 정의된 업무 지시만 인식하며, 임의로 성공 처리하지 않습니다)'),
    ...(!target && !sim.agentList().length ? [c.dim("  먼저 Agent를 생성하세요: 'roles' → 'agent spawn <role>'")] : []),
    ...(ready.length ? [c.dim(`  시작 가능한 Task: ${ready.map((t) => `${t.id}(${sim.taskDef(t.id)!.title})`).join(', ')}`)] : []),
    ...(examples.length ? [c.dim('  지시 예시:'), ...examples.map((e) => `    ${c.white(e)}`)] : []),
    c.dim("  명령 목록: 'help' · 상황별 힌트: 'hint'"),
  ];
  if (target && pane === `agent:${target.id}`) for (const l of lines) sim.agentLog(target, `  ${l}`);
  else say(lines);
}

/** 객관식 지시 실행용: say/reply를 구성해 intent 실행 */
export function runIntent(sim: Simulation, intent: IntentDef, target: AgentRuntime | undefined, pane: string): void {
  const say = (lines: string | string[]) => sim.out(pane, lines);
  const reply = (lines: string[]) => {
    if (target) for (const l of lines) sim.agentLog(target, `  ${l}`);
    if (!target || pane !== `agent:${target.id}`) say(lines.map((l) => (target ? c.dim(`[${target.id}] `) : '') + l));
  };
  if (intent.roles && target && !intent.assign && !intent.roles.includes(target.role)) {
    const names = intent.roles.map((r) => sim.roleDef(r)?.name ?? r).join(', ');
    sim.emit('intent.matched', `역할 불일치: ${intent.id}`, { agentId: target.id, data: { intent: intent.id, wrongRole: true } });
    reply([c.yellow(`이 지시는 제 역할(${sim.roleDef(target.role)?.name})보다 [${names}] 역할에 적합합니다.`)]);
    return;
  }
  executeIntent(sim, intent, target, pane, say, reply);
}

export function intentLabel(intent: IntentDef): string {
  if (intent.label) return intent.label;
  if (intent.example) return intent.example.replace(/^@[\w-]+\s*/, '');
  return intent.id;
}

function executeIntent(
  sim: Simulation,
  intent: IntentDef,
  target: AgentRuntime | undefined,
  pane: string,
  say: (l: string | string[]) => void,
  reply: (l: string[]) => void,
): void {
  if (!sim.cond(intent.requires)) {
    sim.emit('intent.matched', `조건 미충족: ${intent.id}`, { agentId: target?.id, data: { intent: intent.id, denied: true } });
    reply((intent.deniedReply ?? ['아직 그 작업을 할 수 있는 단계가 아닙니다.']).map((l) => c.yellow(l)));
    return;
  }
  let agent = target;
  if (intent.assign) {
    agent = target ?? pickAgent(sim, intent.assign, intent.roles);
    if (!agent) {
      const role = intent.roles?.[0] ?? bestRoleFor(sim, intent.assign);
      say([
        c.yellow(`이 지시를 수행할 수 있는 대기 중인 Agent가 없습니다.`),
        c.dim(`  'agent spawn ${role ?? '<role>'}' 후 다시 지시하거나 '@<agent> ...'로 대상을 지정하세요.`),
      ]);
      return;
    }
  }
  // 지시에 담긴 조건(flag)을 먼저 반영한 뒤 배정한다 (예: '단위도 확인해' + 검증 배정)
  sim.applyEffects(intent.effects, 'player', agent);
  if (intent.assign && agent) {
    const already = agent.taskId === intent.assign && sim.tasks[intent.assign].status !== 'done';
    if (!already) {
      const r = sim.assign(agent.id, intent.assign, { via: 'nl', redo: intent.redo });
      if (!r.ok) {
        say(c.red(`✗ ${r.message}`));
        return;
      }
    }
  }
  sim.emit('intent.matched', `지시 인식: ${intent.id}${agent ? ` → ${agent.id}` : ''}`, {
    agentId: agent?.id,
    data: { intent: intent.id, quality: intent.quality ?? 'neutral' },
  });
  const lines = sim.resolveLines(intent.reply, agent);
  if (agent && agent !== target) {
    for (const l of lines) sim.agentLog(agent, `  ${l}`);
    say(c.green(`✓ ${agent.id}에게 지시 전달${intent.assign ? `: ${intent.assign}` : ''}`));
  } else if (lines.length) reply(lines);
  else if (!target) say(c.green('✓ 지시를 반영했습니다.'));
  if (agent && pane !== `agent:${agent.id}` && agent === target && !lines.length) say(c.green(`✓ ${agent.id}에게 지시 전달`));
}
