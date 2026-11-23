import { c } from './ansi';
import { evalCond, type CondContext } from './conditions';
import { Rng } from './rng';
import type {
  AgentRuntime,
  AgentStatus,
  Cond,
  Effect,
  FlagValue,
  GateDef,
  LoadedScenario,
  LogLine,
  Metrics,
  NotifyLevel,
  PlayerCommand,
  RoleDef,
  SimEvent,
  StepDef,
  TaskDef,
  TaskRuntime,
  TaskStatus,
  VFile,
} from './types';
import { executeCommand } from './cli';

/** 1 tick = 가상 업무 시간 1분 */
export const SIM_START_MINUTES = 9 * 60;
export const MISMATCH_FACTOR = 1.6;

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ok = (message = ''): ActionResult => ({ ok: true, message });
const err = (message: string): ActionResult => ({ ok: false, message });

export const BUSY_STATUSES: AgentStatus[] = ['planning', 'working', 'reviewing'];
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ['assigned', 'in_progress', 'waiting', 'blocked'];

export function formatSimTime(tick: number): string {
  const m = SIM_START_MINUTES + tick;
  const day = Math.floor(m / (24 * 60));
  const hh = Math.floor((m % (24 * 60)) / 60);
  const mm = m % 60;
  return `${day > 0 ? `D+${day} ` : ''}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * 상태 기반 이벤트 시뮬레이션 엔진.
 *
 *  - 모든 변화는 tick 단위 상태 전이로 발생하며 SimEvent로 기록된다.
 *  - 난수는 seed 기반 Rng만 사용한다.
 *  - (scenario, seed, commands[]) 가 같으면 결과가 항상 같다 → replay()
 */
export class Simulation {
  readonly scenario: LoadedScenario;
  readonly seed: number;
  tick = 0;
  agents: Record<string, AgentRuntime> = {};
  agentOrder: string[] = [];
  tasks: Record<string, TaskRuntime> = {};
  files = new Map<string, VFile>();
  flags: Record<string, FlagValue> = {};
  events: SimEvent[] = [];
  commands: PlayerCommand[] = [];
  metrics: Metrics = {
    maxConcurrent: 0,
    missedParallelTicks: 0,
    parallelTicks: 0,
    busyTicks: 0,
    unrecognized: 0,
    commands: 0,
    nlInstructions: 0,
  };
  submitted = false;
  /** 이벤트 발생 시 실시간 UI 요청(파일 열기 등)을 무시할지 (재생 중) */
  replaying = false;

  private rng: Rng;
  private seq = 0;
  private listeners = new Set<() => void>();
  private taskDefs: Record<string, TaskDef> = {};
  private roleDefs: Record<string, RoleDef> = {};
  readonly condCtx: CondContext;

  constructor(scenario: LoadedScenario, seed: number) {
    this.scenario = scenario;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.condCtx = {
      flags: this.flags,
      tasks: this.tasks,
      fileExists: (p) => this.files.has(p),
    };
    for (const r of scenario.roles) this.roleDefs[r.id] = r;
    for (const t of scenario.tasks) {
      this.taskDefs[t.id] = t;
      this.tasks[t.id] = {
        id: t.id,
        status: 'locked',
        visible: !t.hidden,
        stepIndex: 0,
        attempts: 0,
        assignHistory: [],
      };
    }
    Object.assign(this.flags, scenario.initialFlags ?? {});
    for (const [path, def] of Object.entries(scenario.files)) {
      const content = def.src !== undefined ? (scenario.assets[def.src] ?? '') : (def.content ?? '');
      this.files.set(path, {
        path,
        content,
        restricted: !!def.restricted,
        createdBy: 'scenario',
        versions: [{ content, tick: 0, by: 'scenario' }],
        description: def.description,
      });
    }
    this.refreshTasks();
    this.emit('session.start', `시나리오 시작: ${scenario.title} (seed ${this.seed})`, {
      data: { scenarioId: scenario.id, seed: this.seed },
    });
  }

  // ═════════════════════════════ Public API ═════════════════════════════

  /** 플레이어 입력(CLI 명령 또는 자연어). 명령 로그에 기록되어 재생 가능. */
  input(text: string, ctx: { paneId: string; agentId?: string }): void {
    const cmd: PlayerCommand = { tick: this.tick, kind: 'input', paneId: ctx.paneId, agentId: ctx.agentId, text };
    this.applyCommand(cmd);
    this.notify();
  }

  /** 플레이어가 파일/브라우저 화면을 확인한 행위 (검증 행동 평가에 사용) */
  observe(kind: 'file' | 'page', target: string): void {
    const last = [...this.commands].reverse().find((cm) => cm.kind === 'observe');
    if (last && last.text === `${kind}:${target}` && last.tick === this.tick) return;
    this.applyCommand({ tick: this.tick, kind: 'observe', paneId: 'ui', text: `${kind}:${target}` });
    this.notify();
  }

  applyCommand(cmd: PlayerCommand): void {
    this.commands.push(cmd);
    if (cmd.kind === 'observe') {
      const [kind, ...rest] = cmd.text.split(':');
      const target = rest.join(':');
      this.recordObservation(kind as 'file' | 'page', target);
      return;
    }
    this.metrics.commands++;
    this.emit('command', cmd.text, { paneId: cmd.paneId, agentId: cmd.agentId });
    executeCommand(this, cmd);
  }

  recordObservation(kind: 'file' | 'page', target: string): void {
    const f = kind === 'file' ? this.files.get(target) : undefined;
    if (f?.restricted) {
      this.emit('security.denied', `접근 거부: ${target} (player)`, { data: { path: target, by: 'player' } });
      return;
    }
    this.emit('observe', `${kind === 'file' ? '파일 확인' : '화면 확인'}: ${target}`, { data: { kind, target } });
  }

  /** 시뮬레이션 1 tick 진행 */
  step(): void {
    this.tick++;
    let busy = 0;
    for (const id of this.agentOrder) {
      const a = this.agents[id];
      if (!a) continue;
      this.advanceAgent(a);
      if (BUSY_STATUSES.includes(a.status)) {
        busy++;
        a.busyTicks++;
      }
    }
    this.metrics.busyTicks += busy;
    if (busy > this.metrics.maxConcurrent) this.metrics.maxConcurrent = busy;
    if (busy >= 2) this.metrics.parallelTicks++;
    if (busy >= 1 && !this.submitted) {
      const readyUnassigned = Object.values(this.tasks).some(
        (t) => t.visible && t.status === 'ready' && !t.assignee && !this.taskDefs[t.id].optional,
      );
      if (readyUnassigned) this.metrics.missedParallelTicks++;
    }
    this.notify();
  }

  advance(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    for (const fn of this.listeners) fn();
  }

  // ═════════════════════════════ Accessors ═════════════════════════════

  taskDef(id: string): TaskDef | undefined {
    return this.taskDefs[id];
  }
  roleDef(id: string): RoleDef | undefined {
    return this.roleDefs[id];
  }
  visibleTasks(): TaskRuntime[] {
    return this.scenario.tasks.map((t) => this.tasks[t.id]).filter((t) => t.visible);
  }
  agentList(): AgentRuntime[] {
    return this.agentOrder.map((id) => this.agents[id]).filter(Boolean);
  }
  cond(c: Cond | undefined): boolean {
    return evalCond(c, this.condCtx);
  }
  currentStep(a: AgentRuntime): StepDef | undefined {
    if (!a.taskId) return undefined;
    return this.taskDefs[a.taskId]?.steps[this.tasks[a.taskId].stepIndex];
  }
  openGate(a: AgentRuntime): GateDef | undefined {
    if (!a.gate) return undefined;
    const step = this.taskDefs[a.gate.taskId]?.steps.find((s) => s.id === a.gate!.stepId);
    return step?.gate;
  }
  /** 0..1 */
  taskProgress(taskId: string): number {
    const t = this.tasks[taskId];
    const def = this.taskDefs[taskId];
    if (t.status === 'done') return 1;
    const total = def.steps.length || 1;
    let p = t.stepIndex / total;
    const a = t.assignee ? this.agents[t.assignee] : undefined;
    if (a && a.phase === 'step' && a.stepTicks > 0) p += Math.min(1, a.stepTick / a.stepTicks) / total;
    return Math.min(1, p);
  }
  resolveAgent(name: string | undefined): AgentRuntime | undefined {
    if (!name) return undefined;
    const n = name.replace(/^@/, '').toLowerCase();
    if (this.agents[n]) return this.agents[n];
    // role 이름으로 지정하면 해당 role의 첫 Agent
    return this.agentList().find((a) => a.role === n);
  }
  missingSkills(agent: AgentRuntime, taskId: string): string[] {
    const role = this.roleDefs[agent.role];
    const def = this.taskDefs[taskId];
    return def.skills.filter((s) => !role.skills.includes(s));
  }
  requiredTasksDone(): boolean {
    return this.scenario.tasks.every((t) => t.optional || !this.tasks[t.id].visible || this.tasks[t.id].status === 'done');
  }

  // ═════════════════════════════ Events / Output ═════════════════════════════

  emit(
    type: SimEvent['type'],
    message: string,
    extra: { agentId?: string; taskId?: string; paneId?: string; data?: Record<string, unknown> } = {},
  ): SimEvent {
    const ev: SimEvent = { seq: ++this.seq, tick: this.tick, type, message, ...extra };
    this.events.push(ev);
    return ev;
  }

  out(paneId: string, lines: string | string[]): void {
    const arr = Array.isArray(lines) ? lines : [lines];
    this.emit('cli.output', arr.join('\n'), { paneId, data: { lines: arr } });
  }

  notifyPlayer(level: NotifyLevel, message: string, extra: { agentId?: string; taskId?: string } = {}): void {
    this.emit('notify', message, { ...extra, data: { level } });
  }

  agentLog(a: AgentRuntime, text: string): void {
    this.emit('agent.log', text, { agentId: a.id, taskId: a.taskId });
  }

  /**
   * 템플릿 확장
   *  {{agent}} {{role}} {{task}} {{time}} {{flag:name}}
   *  {{#if expr}} ... {{else}} ... {{/if}}   expr: flag | !flag | flag=value, '&&' '||' 조합
   */
  expand(text: string, a?: AgentRuntime): string {
    const IF = /\{\{#if ([^}]+)\}\}((?:(?!\{\{#if )[\s\S])*?)\{\{\/if\}\}/;
    let guard = 0;
    let m: RegExpExecArray | null;
    while ((m = IF.exec(text)) && guard++ < 500) {
      const [whole, expr, body] = m;
      const [yes, no = ''] = body.split('{{else}}');
      text = text.slice(0, m.index) + (this.templateCond(expr.trim()) ? yes : no) + text.slice(m.index + whole.length);
    }
    return text
      .replace(/\{\{agent\}\}/g, a?.id ?? '')
      .replace(/\{\{role\}\}/g, a ? (this.roleDefs[a.role]?.name ?? a.role) : '')
      .replace(/\{\{task\}\}/g, a?.taskId ? this.taskDefs[a.taskId].title : '')
      .replace(/\{\{time\}\}/g, formatSimTime(this.tick))
      .replace(/\{\{flag:([\w.-]+)\}\}/g, (_, f) => String(this.flags[f] ?? ''));
  }

  templateCond(expr: string): boolean {
    return expr.split('||').some((orPart) =>
      orPart.split('&&').every((term) => {
        const t = term.trim();
        if (t.startsWith('!')) return !this.flags[t.slice(1)];
        const eq = t.indexOf('=');
        if (eq > 0) return String(this.flags[t.slice(0, eq).trim()] ?? '') === t.slice(eq + 1).trim();
        return !!this.flags[t];
      }),
    );
  }

  resolveLines(lines: LogLine[] | undefined, a?: AgentRuntime): string[] {
    if (!lines) return [];
    const res: string[] = [];
    for (const l of lines) {
      if (typeof l === 'string') res.push(this.expand(l, a));
      else if (this.cond(l.when)) res.push(this.expand(l.text, a));
    }
    return res;
  }

  private setStatus(a: AgentRuntime, status: AgentStatus, reason = ''): void {
    if (a.status === status) return;
    const from = a.status;
    a.status = status;
    a.lastActiveTick = this.tick;
    this.emit('agent.status', `${a.id}: ${from} → ${status}${reason ? ` (${reason})` : ''}`, {
      agentId: a.id,
      taskId: a.taskId,
      data: { from, to: status, reason },
    });
  }

  private setTaskStatus(t: TaskRuntime, status: TaskStatus, reason = ''): void {
    if (t.status === status) return;
    const from = t.status;
    t.status = status;
    this.emit('task.status', `${t.id}: ${from} → ${status}${reason ? ` (${reason})` : ''}`, {
      taskId: t.id,
      agentId: t.assignee,
      data: { from, to: status },
    });
  }

  /** 선행 task 상태에 따라 ready/locked 재계산 */
  refreshTasks(): void {
    for (const def of this.scenario.tasks) {
      const t = this.tasks[def.id];
      if (!t.visible || t.assignee) continue;
      if (t.status !== 'locked' && t.status !== 'ready') continue;
      const depsDone = (def.dependsOn ?? []).every((d) => this.tasks[d]?.status === 'done');
      this.setTaskStatus(t, depsDone ? 'ready' : 'locked');
    }
  }

  depsDone(taskId: string): boolean {
    return (this.taskDefs[taskId].dependsOn ?? []).every((d) => this.tasks[d]?.status === 'done');
  }

  // ═════════════════════════════ Effects ═════════════════════════════

  applyEffects(effects: Effect[] | undefined, by: string, a?: AgentRuntime): void {
    for (const e of effects ?? []) this.applyEffect(e, by, a);
  }

  applyEffect(e: Effect, by: string, a?: AgentRuntime): void {
    if (!this.cond(e.when)) return;
    switch (e.type) {
      case 'writeFile': {
        let content = e.content;
        let src = e.src;
        const v = e.variants?.find((vv) => this.cond(vv.when));
        if (v) {
          content = v.content;
          src = v.src;
        }
        const text = src !== undefined ? (this.scenario.assets[src] ?? `<<missing asset ${src}>>`) : (content ?? '');
        this.writeFile(e.path, this.expand(text, a), by);
        break;
      }
      case 'deleteFile':
        this.deleteFile(e.path, by);
        break;
      case 'setFlag':
        this.setFlag(e.flag, e.value === undefined ? true : e.value, by);
        break;
      case 'notify':
        this.notifyPlayer(e.level ?? 'info', this.expand(e.message, a), { agentId: a?.id });
        break;
      case 'activateTask': {
        const t = this.tasks[e.task];
        if (!t) break;
        if (!t.visible) {
          t.visible = true;
          this.emit('task.activated', `새 Task 추가: ${e.task} — ${this.taskDefs[e.task].title}`, { taskId: e.task });
        } else if (t.status === 'done' || t.status === 'failed') {
          this.resetTask(t);
          this.emit('task.activated', `Task 재활성화: ${e.task}`, { taskId: e.task });
        }
        this.refreshTasks();
        break;
      }
      case 'reopenTask': {
        const t = this.tasks[e.task];
        if (!t) break;
        this.resetTask(t);
        t.visible = true;
        this.emit('task.activated', `Task 재작업 필요: ${e.task}`, { taskId: e.task });
        this.refreshTasks();
        break;
      }
    }
  }

  private resetTask(t: TaskRuntime): void {
    if (t.assignee) {
      const a = this.agents[t.assignee];
      if (a && a.taskId === t.id) this.detachAgent(a, 'idle');
    }
    t.assignee = undefined;
    t.stepIndex = 0;
    t.status = 'locked';
    this.emit('task.status', `${t.id}: → reopened`, { taskId: t.id, data: { from: 'done', to: 'locked' } });
  }

  setFlag(flag: string, value: FlagValue, by: string): void {
    if (this.flags[flag] === value) return;
    this.flags[flag] = value;
    this.emit('flag.set', `${flag} = ${JSON.stringify(value)}`, { data: { flag, value, by } });
  }

  writeFile(path: string, content: string, by: string): void {
    const f = this.files.get(path);
    if (f) {
      if (f.content === content) return;
      f.content = content;
      f.versions.push({ content, tick: this.tick, by });
      this.emit('file.updated', `${path} 수정 (by ${by})`, { data: { path, by, version: f.versions.length } });
    } else {
      this.files.set(path, { path, content, restricted: false, createdBy: by, versions: [{ content, tick: this.tick, by }] });
      this.emit('file.created', `${path} 생성 (by ${by})`, { data: { path, by, version: 1 } });
    }
  }

  deleteFile(path: string, by: string): void {
    if (!this.files.delete(path)) return;
    this.emit('file.deleted', `${path} 삭제 (by ${by})`, { data: { path, by } });
  }

  // ═════════════════════════════ Agent actions ═════════════════════════════

  spawnAgent(roleId: string, name?: string): ActionResult {
    const role = this.roleDefs[roleId];
    if (!role) {
      return err(
        `알 수 없는 role '${roleId}'. 사용 가능한 role: ${this.scenario.roles.map((r) => r.id).join(', ')}`,
      );
    }
    let id = (name ?? roleId).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!id) id = roleId;
    if (this.agents[id]) {
      if (name) return err(`이미 '${id}' Agent가 있습니다.`);
      let i = 2;
      while (this.agents[`${roleId}-${i}`]) i++;
      id = `${roleId}-${i}`;
    }
    const a: AgentRuntime = {
      id,
      role: roleId,
      status: 'idle',
      phase: 'none',
      stepTick: 0,
      stepTicks: 0,
      pending: [],
      context: [],
      completedTasks: [],
      mismatch: false,
      spawnedAt: this.tick,
      lastActiveTick: this.tick,
      busyTicks: 0,
    };
    this.agents[id] = a;
    this.agentOrder.push(id);
    this.emit('agent.spawned', `Agent 생성: ${id} (${role.name})`, { agentId: id, data: { role: roleId } });
    this.agentLog(a, c.dim(`[${formatSimTime(this.tick)}] `) + c.bold(`${role.name}`) + c.dim(` 세션 시작 — ${role.title}`));
    this.agentLog(a, c.dim(`  역량: ${role.skills.join(', ')}`));
    this.agentLog(a, c.dim(`  대기 중. 업무를 지시하거나 'agent assign ${id} <task>' 를 사용하세요.`));
    return ok(id);
  }

  killAgent(id: string): ActionResult {
    const a = this.agents[id];
    if (!a) return err(`Agent '${id}' 없음`);
    if (a.taskId) {
      const t = this.tasks[a.taskId];
      if (t.status !== 'done') {
        t.assignee = undefined;
        t.stepIndex = 0;
        this.setTaskStatus(t, 'locked', `${id} 제거로 진행 내용 손실`);
        this.refreshTasks();
      }
    }
    delete this.agents[id];
    this.agentOrder = this.agentOrder.filter((x) => x !== id);
    this.emit('agent.removed', `Agent 제거: ${id}`, { agentId: id });
    return ok();
  }

  assign(agentId: string, taskId: string, opts: { force?: boolean; redo?: boolean; via?: string } = {}): ActionResult {
    const a = this.agents[agentId];
    if (!a) return err(`Agent '${agentId}' 없음. 'agent list'로 확인하거나 'agent spawn <role>'로 생성하세요.`);
    const def = this.taskDefs[taskId];
    const t = this.tasks[taskId];
    if (!def || !t || !t.visible) return err(`Task '${taskId}' 없음. 'task list'로 확인하세요.`);
    if (a.taskId && a.taskId !== taskId && ['interrupted', 'failed'].includes(a.status)) {
      // 중단/실패 상태의 Agent에게 새 작업을 주면 기존 작업은 반환된다 (진행 내용 손실)
      const old = this.tasks[a.taskId];
      if (old.status !== 'done') {
        old.assignee = undefined;
        old.stepIndex = 0;
        old.status = 'locked';
        this.emit('task.status', `${old.id}: 배정 해제 (${a.id} 재지시)`, { taskId: old.id, data: { to: 'locked' } });
      }
      this.agentLog(a, c.dim(`  '${old.id}' 작업을 내려놓고 새 지시를 받습니다.`));
      this.detachAgent(a, 'idle');
      this.refreshTasks();
    }
    if (a.taskId && a.taskId !== taskId && !['completed', 'idle'].includes(a.status)) {
      return err(
        `${a.id}는 이미 '${a.taskId}' 작업 중(${a.status})입니다. 다른 Agent를 생성하거나 'agent interrupt'/'agent handoff'를 사용하세요.`,
      );
    }
    if (t.assignee && t.assignee !== agentId && this.agents[t.assignee]) {
      this.emit('task.assigned', `중복 배정 시도: ${taskId} (이미 ${t.assignee})`, {
        agentId,
        taskId,
        data: { duplicate: true },
      });
      return err(
        `'${taskId}'는 이미 ${t.assignee}에게 배정되어 있습니다. 중복 작업 대신 'agent handoff ${t.assignee} ${agentId}' 로 인계할 수 있습니다.`,
      );
    }
    if (t.status === 'done') {
      if (!opts.redo) return err(`'${taskId}'는 이미 완료되었습니다. 다시 수행하려면 --redo 옵션을 사용하세요.`);
      this.emit('task.assigned', `재수행: ${taskId}`, { agentId, taskId, data: { redo: true } });
      t.stepIndex = 0;
    }
    if (a.taskId === taskId && ACTIVE_TASK_STATUSES.includes(t.status)) return err(`${a.id}는 이미 '${taskId}'를 수행 중입니다.`);

    const missing = this.missingSkills(a, taskId);
    a.taskId = taskId;
    a.mismatch = missing.length > 0;
    a.error = undefined;
    t.assignee = a.id;
    t.attempts++;
    t.assignHistory.push(a.id);
    this.setTaskStatus(t, 'assigned');
    this.emit('task.assigned', `${taskId} → ${a.id}`, {
      agentId: a.id,
      taskId,
      data: { missing, via: opts.via ?? 'cli' },
    });

    if (missing.length && !opts.force) {
      a.phase = 'confirm-mismatch';
      this.setStatus(a, 'waiting', '역량 확인 필요');
      this.agentLog(a, '');
      this.agentLog(a, c.yellow(`⚠ '${def.title}' 작업에는 [${missing.join(', ')}] 역량이 필요하지만 제 역할(${this.roleDefs[a.role].name})에는 없습니다.`));
      this.agentLog(a, c.yellow(`  진행하면 품질이 낮아지고 시간이 더 걸릴 수 있습니다. 그래도 진행할까요?`));
      this.agentLog(a, c.cyan(`  [1] 진행  [2] 취소   (이 패널에 입력하거나 'agent reply ${a.id} 1')`));
      this.notifyPlayer('warn', `${a.id}: '${taskId}' 역량 부족 확인 요청`, { agentId: a.id, taskId });
      return ok(`${taskId} → ${a.id} (역량 확인 대기)`);
    }
    if (missing.length) this.setFlag(`quality.${taskId}.low`, true, a.id);
    this.beginTask(a);
    return ok(`${taskId} → ${a.id}`);
  }

  /** 배정 직후: 선행 작업 대기 또는 planning 시작 */
  private beginTask(a: AgentRuntime): void {
    const taskId = a.taskId!;
    const def = this.taskDefs[taskId];
    if (!this.depsDone(taskId)) {
      a.phase = 'waiting-deps';
      const pending = (def.dependsOn ?? []).filter((d) => this.tasks[d].status !== 'done');
      this.setStatus(a, 'waiting', `선행 작업 대기: ${pending.join(', ')}`);
      this.agentLog(a, '');
      this.agentLog(a, c.yellow(`⏳ '${def.title}' 배정됨 — 선행 작업 [${pending.join(', ')}] 완료를 기다립니다.`));
      return;
    }
    this.startPlanning(a);
  }

  private startPlanning(a: AgentRuntime, handoff = false): void {
    const def = this.taskDefs[a.taskId!];
    const t = this.tasks[a.taskId!];
    a.phase = 'planning';
    a.stepTick = 0;
    a.stepTicks = this.rng.int(2, 3);
    this.setStatus(a, 'planning');
    this.setTaskStatus(t, 'in_progress');
    if (t.startedAt === undefined) t.startedAt = this.tick;
    const remaining = def.steps.slice(t.stepIndex).map((s) => s.event);
    const lines = [
      '',
      c.bold(c.cyan(`● ${handoff ? '인계받은 작업 검토' : '작업 수신'}: ${def.id}`)) + c.white(` — ${def.title}`),
      c.dim(`  ⎿ ${def.description}`),
      c.dim(`  ⎿ 계획: ${remaining.join(' → ')}`),
    ];
    if (a.mismatch) lines.push(c.yellow(`  ⎿ 주의: 역량 부족 상태로 진행 (속도 ×${MISMATCH_FACTOR})`));
    this.schedule(a, lines);
  }

  private schedule(a: AgentRuntime, lines: string[]): void {
    const n = lines.length;
    const span = Math.max(1, a.stepTicks - 1);
    a.pending = lines.map((text, i) => ({ at: n <= 1 ? 0 : Math.floor((i * span) / n), text }));
    this.flushLogs(a);
  }

  private flushLogs(a: AgentRuntime, all = false): void {
    while (a.pending.length && (all || a.pending[0].at <= a.stepTick)) {
      this.agentLog(a, a.pending.shift()!.text);
    }
  }

  private startStep(a: AgentRuntime): void {
    const t = this.tasks[a.taskId!];
    const def = this.taskDefs[t.id];
    // when 조건이 거짓인 step은 건너뜀
    while (t.stepIndex < def.steps.length && !this.cond(def.steps[t.stepIndex].when)) t.stepIndex++;
    const step = def.steps[t.stepIndex];
    if (!step) {
      this.completeTask(a);
      return;
    }
    const base = step.ticks ?? [3, 6];
    let ticks = Array.isArray(base) ? this.rng.int(base[0], base[1]) : base;
    if (a.mismatch) ticks = Math.ceil(ticks * MISMATCH_FACTOR);
    a.phase = 'step';
    a.stepTick = 0;
    a.stepTicks = Math.max(1, ticks);
    this.setStatus(a, def.review ? 'reviewing' : 'working');
    if (t.status !== 'in_progress') this.setTaskStatus(t, 'in_progress');
    this.emit('step.started', `${a.id}: ${step.event}`, { agentId: a.id, taskId: t.id, data: { step: step.id } });
    const lines = [c.blue(`● ${step.event}`), ...this.resolveLines(step.log, a).map((l) => `  ${l}`)];
    this.schedule(a, lines);
  }

  private finishStep(a: AgentRuntime): void {
    this.flushLogs(a, true);
    const t = this.tasks[a.taskId!];
    const def = this.taskDefs[t.id];
    const step = def.steps[t.stepIndex];
    if (step.fail && this.cond(step.fail.when)) {
      for (const l of this.resolveLines(step.fail.log, a)) this.agentLog(a, `  ${l}`);
      this.agentLog(a, c.red(`✗ 실패: ${this.expand(step.fail.message, a)}`));
      if (step.fail.hint) this.agentLog(a, c.dim(`  힌트: ${step.fail.hint}`));
      a.error = step.fail.message;
      a.phase = 'none';
      this.setStatus(a, 'failed', step.fail.message);
      this.setTaskStatus(t, 'failed', step.fail.message);
      this.notifyPlayer('error', `${a.id}: ${def.id} 실패 — ${this.expand(step.fail.message, a)}`, { agentId: a.id, taskId: t.id });
      return;
    }
    for (const r of step.reads ?? []) if (!a.context.includes(r)) a.context.push(r);
    this.applyEffects(step.effects, a.id, a);
    this.emit('step.completed', `${a.id}: ${step.event} ✓`, { agentId: a.id, taskId: t.id, data: { step: step.id } });
    if (step.gate && this.cond(step.gate.when)) {
      this.raiseGate(a, step, step.gate);
      return;
    }
    t.stepIndex++;
    this.startStep(a);
  }

  private raiseGate(a: AgentRuntime, step: StepDef, gate: GateDef): void {
    const t = this.tasks[a.taskId!];
    a.gate = { taskId: t.id, stepId: step.id, gateId: gate.id };
    a.phase = 'gate';
    this.setStatus(a, gate.kind, gate.title);
    this.setTaskStatus(t, gate.kind === 'blocked' ? 'blocked' : 'waiting');
    const icon = gate.kind === 'blocked' ? c.red('⛔ 진행 불가') : c.yellow('⏸ 의사결정 필요');
    this.agentLog(a, '');
    this.agentLog(a, `${icon}: ${c.bold(gate.title)}`);
    for (const l of this.resolveLines(gate.prompt, a)) this.agentLog(a, `  ${l}`);
    gate.options.forEach((o, i) => this.agentLog(a, c.cyan(`  [${i + 1}] ${o.label}`)));
    this.agentLog(a, c.dim(`  → 번호 또는 자연어로 답하세요. (예: agent reply ${a.id} 1)`));
    this.emit('gate.opened', `${a.id}: ${gate.title}`, { agentId: a.id, taskId: t.id, data: { gate: gate.id, kind: gate.kind } });
    this.notifyPlayer(gate.kind === 'blocked' ? 'error' : 'warn', `${a.id}: ${gate.title} — 개입 필요`, { agentId: a.id, taskId: t.id });
  }

  /** 열린 gate 또는 역량 확인에 응답 */
  resolveGate(agentId: string, optionIndex: number, via = 'cli'): ActionResult {
    const a = this.agents[agentId];
    if (!a) return err(`Agent '${agentId}' 없음`);
    if (a.phase === 'confirm-mismatch') {
      if (optionIndex === 0) {
        this.agentLog(a, c.dim('  → 진행합니다.'));
        this.setFlag(`quality.${a.taskId}.low`, true, a.id);
        this.beginTask(a);
        return ok('역량 부족 상태로 진행');
      }
      const t = this.tasks[a.taskId!];
      t.assignee = undefined;
      this.setTaskStatus(t, 'locked');
      this.agentLog(a, c.dim('  → 배정을 취소했습니다. 적합한 Agent에게 배정하세요.'));
      a.taskId = undefined;
      a.mismatch = false;
      a.phase = 'none';
      this.setStatus(a, 'idle', '배정 취소');
      this.refreshTasks();
      return ok('배정 취소');
    }
    const gate = this.openGate(a);
    if (!gate || !a.gate) return err(`${agentId}는 응답을 기다리고 있지 않습니다.`);
    const opt = gate.options[optionIndex];
    if (!opt) return err(`선택지 번호는 1~${gate.options.length} 입니다.`);
    const t = this.tasks[a.gate.taskId];
    this.setFlag(`gate.${gate.id}`, opt.id, 'player');
    this.emit('gate.resolved', `${a.id}: ${gate.title} → ${opt.label}`, {
      agentId: a.id,
      taskId: t.id,
      data: { gate: gate.id, option: opt.id, quality: opt.quality ?? 'neutral', via },
    });
    this.agentLog(a, c.green(`  ✓ 지시 확인: ${opt.label}`));
    for (const l of this.resolveLines(opt.log, a)) this.agentLog(a, `  ${l}`);
    this.applyEffects(opt.effects, a.id, a);
    a.gate = undefined;
    // 효과로 task가 재설정되었을 수 있음
    if (a.taskId !== t.id || t.assignee !== a.id) return ok(opt.label);
    t.stepIndex++;
    this.startStep(a);
    return ok(opt.label);
  }

  private completeTask(a: AgentRuntime): void {
    const t = this.tasks[a.taskId!];
    const def = this.taskDefs[t.id];
    t.completedAt = this.tick;
    this.setTaskStatus(t, 'done');
    a.completedTasks.push(t.id);
    this.agentLog(a, c.green(`✔ 완료: ${def.title}`) + c.dim(` (${t.completedAt - (t.startedAt ?? t.completedAt)}분)`));
    if (def.outputs?.length) this.agentLog(a, c.dim(`  산출물: ${def.outputs.join(', ')}`));
    this.applyEffects(def.onComplete, a.id, a);
    this.notifyPlayer('success', `${a.id}: ${def.id} 완료`, { agentId: a.id, taskId: t.id });
    a.phase = 'none';
    a.mismatch = false;
    this.setStatus(a, 'completed');
    this.refreshTasks();
  }

  /** agent를 task에서 분리 */
  private detachAgent(a: AgentRuntime, status: AgentStatus): void {
    a.taskId = undefined;
    a.gate = undefined;
    a.phase = 'none';
    a.pending = [];
    a.mismatch = false;
    this.setStatus(a, status);
  }

  interrupt(id: string): ActionResult {
    const a = this.agents[id];
    if (!a) return err(`Agent '${id}' 없음`);
    if (!a.taskId || ['idle', 'completed', 'failed', 'interrupted'].includes(a.status)) {
      return err(`${id}는 중단할 작업이 없습니다 (상태: ${a.status}).`);
    }
    this.flushLogs(a, true);
    a.prevStatus = a.status;
    this.setStatus(a, 'interrupted', '사용자 중단');
    this.agentLog(a, c.magenta(`■ 사용자에 의해 중단됨. 'agent resume ${id}'로 재개하거나 새 지시를 내리세요.`));
    return ok(`${id} 중단`);
  }

  resume(id: string): ActionResult {
    const a = this.agents[id];
    if (!a) return err(`Agent '${id}' 없음`);
    if (a.status !== 'interrupted') return err(`${id}는 중단 상태가 아닙니다 (상태: ${a.status}).`);
    this.agentLog(a, c.green('▶ 작업 재개'));
    const prev = a.prevStatus ?? 'working';
    a.prevStatus = undefined;
    this.setStatus(a, prev, '재개');
    return ok(`${id} 재개`);
  }

  /** 현재 task를 처음부터 다시 */
  restart(id: string): ActionResult {
    const a = this.agents[id];
    if (!a) return err(`Agent '${id}' 없음`);
    if (!a.taskId) return err(`${id}는 진행 중인 작업이 없습니다.`);
    const t = this.tasks[a.taskId];
    if (t.status === 'done') return err(`'${t.id}'는 이미 완료되었습니다.`);
    t.stepIndex = 0;
    t.attempts++;
    a.gate = undefined;
    a.error = undefined;
    this.emit('task.assigned', `재시작: ${t.id}`, { agentId: a.id, taskId: t.id, data: { restart: true } });
    this.agentLog(a, c.magenta('↻ 작업을 처음부터 다시 시작합니다.'));
    this.beginTask(a);
    return ok(`${id} 재시작`);
  }

  /** 실패한 step부터 재시도 */
  retry(id: string): ActionResult {
    const a = this.agents[id];
    if (!a) return err(`Agent '${id}' 없음`);
    if (a.status !== 'failed' || !a.taskId) return err(`${id}는 실패 상태가 아닙니다 (상태: ${a.status}).`);
    const t = this.tasks[a.taskId];
    t.attempts++;
    a.error = undefined;
    this.emit('task.assigned', `재시도: ${t.id}`, { agentId: a.id, taskId: t.id, data: { retry: true } });
    this.agentLog(a, c.magenta(`↻ 실패한 단계부터 재시도합니다.`));
    this.startStep(a);
    return ok(`${id} 재시도`);
  }

  handoff(fromId: string, toId: string): ActionResult {
    const from = this.agents[fromId];
    const to = this.agents[toId];
    if (!from) return err(`Agent '${fromId}' 없음`);
    if (!to) return err(`Agent '${toId}' 없음`);
    if (from === to) return err('같은 Agent에게는 인계할 수 없습니다.');
    if (to.taskId && !['idle', 'completed'].includes(to.status)) return err(`${toId}는 작업 중(${to.status})입니다.`);

    // 진행 중 작업이 없으면: 산출물/컨텍스트 공유
    if (!from.taskId || from.status === 'completed' || this.tasks[from.taskId]?.status === 'done') {
      if (!from.completedTasks.length) return err(`${fromId}는 인계할 작업이나 결과가 없습니다.`);
      for (const ctx of from.context) if (!to.context.includes(ctx)) to.context.push(ctx);
      for (const tid of from.completedTasks) {
        for (const o of this.taskDefs[tid].outputs ?? []) if (!to.context.includes(o)) to.context.push(o);
      }
      this.setFlag(`handoff.${from.role}.${to.role}`, true, 'player');
      this.emit('agent.message', `${fromId} → ${toId}: 결과 및 컨텍스트 공유`, { agentId: toId, data: { from: fromId } });
      this.agentLog(to, c.cyan(`⇄ ${fromId}로부터 결과 인계: ${from.completedTasks.join(', ')} (컨텍스트 ${to.context.length}개)`));
      this.agentLog(from, c.dim(`⇄ ${toId}에게 결과와 컨텍스트를 공유했습니다.`));
      return ok(`${fromId}의 결과를 ${toId}에게 공유`);
    }

    const t = this.tasks[from.taskId];
    const gate = from.gate;
    const missing = this.missingSkills(to, t.id);
    this.flushLogs(from, true);
    this.agentLog(from, c.dim(`⇄ '${t.id}' 작업을 ${toId}에게 인계했습니다.`));
    from.taskId = undefined;
    from.gate = undefined;
    from.phase = 'none';
    from.pending = [];
    from.mismatch = false;
    this.setStatus(from, 'idle', '인계 완료');

    for (const ctx of from.context) if (!to.context.includes(ctx)) to.context.push(ctx);
    to.taskId = t.id;
    to.mismatch = missing.length > 0;
    to.error = undefined;
    t.assignee = to.id;
    t.assignHistory.push(to.id);
    this.setFlag(`handoff.${from.role}.${to.role}`, true, 'player');
    if (missing.length) this.setFlag(`quality.${t.id}.low`, true, to.id);
    this.emit('task.assigned', `인계: ${t.id} ${fromId} → ${toId}`, {
      agentId: to.id,
      taskId: t.id,
      data: { handoff: fromId, missing },
    });
    this.agentLog(to, c.cyan(`⇄ ${fromId}로부터 '${t.id}' 인계받음 (진행: ${t.stepIndex}/${this.taskDefs[t.id].steps.length} 단계)`));
    if (missing.length) this.agentLog(to, c.yellow(`  ⚠ 필요 역량 [${missing.join(', ')}] 부족 — 품질 저하 가능`));
    if (gate) {
      to.gate = gate;
      const step = this.taskDefs[t.id].steps.find((s) => s.id === gate.stepId)!;
      this.raiseGate(to, step, step.gate!);
    } else if (!this.depsDone(t.id)) {
      this.beginTask(to);
    } else {
      this.startPlanning(to, true);
    }
    return ok(`${t.id}: ${fromId} → ${toId} 인계`);
  }

  submit(force: boolean): ActionResult {
    if (this.submitted) return err('이미 제출되었습니다.');
    if (!this.requiredTasksDone() && !force) {
      const pending = this.visibleTasks()
        .filter((t) => t.status !== 'done' && !this.taskDefs[t.id].optional)
        .map((t) => t.id);
      return err(`아직 완료되지 않은 필수 Task가 있습니다: ${pending.join(', ')}\n  그래도 제출하려면 'submit --force'`);
    }
    for (const a of this.agentList()) {
      if (BUSY_STATUSES.includes(a.status) || a.status === 'waiting' || a.status === 'blocked') {
        this.flushLogs(a, true);
        a.prevStatus = a.status;
        this.setStatus(a, 'interrupted', '세션 종료');
      }
    }
    this.submitted = true;
    this.emit('session.submitted', `업무 제출 (${formatSimTime(this.tick)})`, { data: { force } });
    return ok('제출 완료');
  }

  // ═════════════════════════════ Tick ═════════════════════════════

  private advanceAgent(a: AgentRuntime): void {
    if (a.status === 'interrupted') return;
    if (a.phase === 'waiting-deps') {
      if (this.depsDone(a.taskId!)) {
        this.agentLog(a, c.green('▶ 선행 작업 완료 확인 — 작업을 시작합니다.'));
        this.startPlanning(a);
      }
      return;
    }
    if (!BUSY_STATUSES.includes(a.status)) return;
    a.stepTick++;
    this.flushLogs(a);
    if (a.stepTick < a.stepTicks) return;
    if (a.phase === 'planning') {
      this.flushLogs(a, true);
      this.startStep(a);
    } else if (a.phase === 'step') {
      this.finishStep(a);
    }
  }
}

/** 결정적 재생: 동일 (scenario, seed, commands) → 동일 상태 */
export function replay(
  scenario: LoadedScenario,
  seed: number,
  commands: PlayerCommand[],
  untilTick: number,
): Simulation {
  const sim = new Simulation(scenario, seed);
  sim.replaying = true;
  let i = 0;
  while (true) {
    while (i < commands.length && commands[i].tick === sim.tick) sim.applyCommand(commands[i++]);
    if (sim.tick >= untilTick) break;
    sim.step();
  }
  sim.replaying = false;
  return sim;
}
