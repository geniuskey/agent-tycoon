import { c, padEnd } from './ansi';
import type { Simulation } from './engine';
import { formatSimTime, BUSY_STATUSES } from './engine';
import { handleNaturalLanguage } from './nlu';
import type { AgentStatus, PlayerCommand, TaskStatus } from './types';

/**
 * 가상 CLI. 실제 OS 명령/네트워크는 절대 실행하지 않는다.
 * 모든 출력은 'cli.output' 이벤트로 기록되어 새로고침/재생 시 그대로 복원된다.
 */

export const STATUS_COLOR: Record<AgentStatus | TaskStatus, (s: string) => string> = {
  idle: c.gray,
  planning: c.cyan,
  working: c.blue,
  waiting: c.yellow,
  blocked: c.red,
  reviewing: c.magenta,
  failed: c.red,
  completed: c.green,
  interrupted: c.magenta,
  locked: c.gray,
  ready: c.white,
  assigned: c.cyan,
  in_progress: c.blue,
  done: c.green,
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  planning: 'Planning',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Blocked',
  reviewing: 'Reviewing',
  failed: 'Failed',
  completed: 'Completed',
  interrupted: 'Interrupted',
};

const COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'brief', desc: '업무 브리핑 다시 보기' },
  { cmd: 'roles', desc: '생성 가능한 Agent 역할과 역량' },
  { cmd: 'task list', desc: 'Task 목록과 상태 (의존성 포함)' },
  { cmd: 'task show <task>', desc: 'Task 상세 (입력, 산출물, 필요 역량)' },
  { cmd: 'task graph', desc: 'Task 의존성 그래프(DAG)' },
  { cmd: 'agent spawn <role> [name]', desc: '새 Agent 생성 (독립 세션 패널 생성)' },
  { cmd: 'agent list', desc: 'Agent 목록과 상태' },
  { cmd: 'agent assign <agent> <task> [--force|--redo]', desc: 'Agent에게 Task 배정' },
  { cmd: 'agent status [agent]', desc: '진행 상황 요약' },
  { cmd: 'agent logs <agent> [n]', desc: '최근 로그 n줄' },
  { cmd: 'agent inspect <agent>', desc: '상태, 컨텍스트, 이력 상세' },
  { cmd: 'agent reply <agent> <번호|자연어>', desc: '의사결정 요청에 응답' },
  { cmd: 'agent interrupt <agent>', desc: '작업 중단' },
  { cmd: 'agent resume <agent>', desc: '중단된 작업 재개' },
  { cmd: 'agent retry <agent>', desc: '실패한 단계부터 재시도' },
  { cmd: 'agent restart <agent>', desc: '현재 작업을 처음부터 다시' },
  { cmd: 'agent handoff <from> <to>', desc: '작업 또는 결과를 다른 Agent에게 인계' },
  { cmd: 'agent kill <agent>', desc: 'Agent 제거 (진행 중 작업 손실)' },
  { cmd: 'ls [dir] / tree', desc: '가상 파일 시스템 탐색' },
  { cmd: 'cat <file>', desc: '파일 내용 보기 (검증)' },
  { cmd: 'diff <file>', desc: '파일의 직전 버전과 비교' },
  { cmd: 'open <file|url>', desc: '파일 미리보기 또는 가상 브라우저로 열기' },
  { cmd: 'pages', desc: '가상 브라우저에서 열 수 있는 화면 목록' },
  { cmd: 'hint', desc: '현재 상황에 맞는 힌트' },
  { cmd: 'submit [--force]', desc: '업무 제출 및 학습 피드백 받기' },
  { cmd: 'clear', desc: '화면 지우기' },
  { cmd: '@<agent> <지시>', desc: '특정 Agent에게 자연어로 지시' },
];

export function commandNames(): string[] {
  return ['agent', 'task', 'brief', 'roles', 'ls', 'tree', 'cat', 'diff', 'open', 'pages', 'hint', 'submit', 'clear', 'help'];
}

export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const READ_ONLY_AFTER_SUBMIT = new Set(['help', 'brief', 'roles', 'task', 'ls', 'tree', 'cat', 'diff', 'open', 'pages', 'clear', 'hint']);

export function executeCommand(sim: Simulation, cmd: PlayerCommand): void {
  const raw = cmd.text.trim();
  const pane = cmd.paneId;
  const say = (lines: string | string[]) => sim.out(pane, lines);
  if (!raw) return;
  const args = tokenize(raw);
  const head = args[0].toLowerCase();
  const isCommand = commandNames().includes(head) || head === '?' || head === 'status';

  if (sim.submitted && !(isCommand && READ_ONLY_AFTER_SUBMIT.has(head === '?' ? 'help' : head))) {
    say(c.yellow('세션이 제출되어 종료되었습니다. 조회 명령(ls, cat, open, task list ...)만 사용할 수 있습니다.'));
    return;
  }

  if (!isCommand) {
    handleNaturalLanguage(sim, cmd);
    return;
  }

  switch (head) {
    case 'help':
    case '?':
      return say(helpText());
    case 'brief':
      return say(briefText(sim));
    case 'roles':
      return say(rolesText(sim));
    case 'status':
      return say(statusText(sim, args[1]));
    case 'task':
      return taskCmd(sim, args.slice(1), say);
    case 'agent':
      return agentCmd(sim, args.slice(1), cmd, say);
    case 'ls':
      return say(lsText(sim, args[1] ?? '/'));
    case 'tree':
      return say(treeText(sim));
    case 'cat':
      return catCmd(sim, args[1], say);
    case 'diff':
      return diffCmd(sim, args[1], say);
    case 'open':
      return openCmd(sim, args[1], pane, say);
    case 'pages':
      return say(pagesText(sim));
    case 'hint':
      return say(hintText(sim));
    case 'submit': {
      const r = sim.submit(args.includes('--force'));
      if (!r.ok) return say(c.yellow(r.message));
      say([c.green('✔ 업무를 제출했습니다. 학습 피드백 화면을 확인하세요.')]);
      sim.emit('ui.request', 'feedback', { paneId: pane, data: { action: 'feedback' } });
      return;
    }
    case 'clear':
      sim.emit('ui.request', 'clear', { paneId: pane, data: { action: 'clear' } });
      return;
  }
}

function helpText(): string[] {
  const w = Math.max(...COMMANDS.map((x) => x.cmd.length)) + 2;
  return [
    c.bold('Agent Tycoon CLI') + c.dim('  — 시뮬레이션 환경 (실제 OS 명령/AI API는 실행되지 않습니다)'),
    '',
    ...COMMANDS.map((x) => `  ${c.cyan(x.cmd.padEnd(w))}${c.dim(x.desc)}`),
    '',
    c.bold('자연어 지시 예시'),
    c.dim('  Agent 패널에서 바로 입력하거나, 셸 패널에서 @agent 로 지정합니다.'),
    `  ${c.white('@analyst 데이터 품질부터 검증해줘')}`,
    `  ${c.white('@reporter 분석 결과로 보고서 초안 작성해')}`,
    `  ${c.white('진행 상황 알려줘')}  ${c.dim('/')}  ${c.white('작업 멈춰')}  ${c.dim('/')}  ${c.white('계속 진행해')}`,
    '',
    c.dim('  단축키: Tab 자동완성 · ↑/↓ 명령 이력 · Ctrl+L 지우기 · Ctrl+F 로그 검색 · Alt+1..9 패널 이동 · Alt+Enter 최대화'),
  ];
}

export function briefText(sim: Simulation): string[] {
  const s = sim.scenario;
  const b = s.briefing;
  return [
    c.bold(c.cyan(`■ ${b.title}`)) + c.dim(`  [${s.company.name} · ${s.company.org}]`),
    c.dim(`  요청자: ${b.requester.name} (${b.requester.role})`),
    '',
    `  ${b.background}`,
    '',
    c.bold('  목표') + `  ${b.goal}`,
    c.bold('  완료 조건'),
    ...b.completionCriteria.map((x) => `   • ${x}`),
    c.bold('  산출물'),
    ...b.deliverables.map((x) => `   • ${x}`),
    ...(b.constraints?.length ? [c.bold('  제약'), ...b.constraints.map((x) => `   • ${x}`)] : []),
    '',
    c.dim("  시작하기: 'roles' → 'agent spawn <role>' → 'task list' → Agent에게 지시"),
  ];
}

function rolesText(sim: Simulation): string[] {
  return [
    c.bold('생성 가능한 Agent 역할'),
    ...sim.scenario.roles.flatMap((r) => [
      `  ${c.cyan(padEnd(r.id, 16))}${c.bold(r.name)} ${c.dim('— ' + r.title)}`,
      `  ${' '.repeat(16)}${c.dim('역량: ' + r.skills.join(', '))}`,
    ]),
    '',
    c.dim('  예: agent spawn ' + sim.scenario.roles[0].id),
  ];
}

export function statusText(sim: Simulation, only?: string): string[] {
  const agents = sim.agentList().filter((a) => !only || a.id === only);
  if (!agents.length) return [c.dim(only ? `Agent '${only}' 없음` : "생성된 Agent가 없습니다. 'roles' 확인 후 'agent spawn <role>'")];
  const lines = [c.bold(`Agent 상태  ${c.dim(formatSimTime(sim.tick))}`)];
  for (const a of agents) {
    const st = STATUS_COLOR[a.status](padEnd(STATUS_LABEL[a.status], 12));
    let detail = '';
    if (a.taskId) {
      const p = Math.round(sim.taskProgress(a.taskId) * 100);
      const step = sim.currentStep(a);
      detail = `${a.taskId} ${bar(p)} ${p}%`;
      if (a.status === 'waiting' || a.status === 'blocked') {
        const g = sim.openGate(a);
        detail += c.yellow(g ? `  ⏸ ${g.title}` : a.phase === 'confirm-mismatch' ? '  ⏸ 역량 확인' : '  ⏳ 선행 작업 대기');
      } else if (step && BUSY_STATUSES.includes(a.status)) detail += c.dim(`  · ${step.event}`);
      if (a.status === 'failed') detail += c.red(`  ✗ ${a.error ?? ''}`);
    }
    lines.push(`  ${padEnd(c.bold(a.id), 16)}${st}${detail}`);
  }
  return lines;
}

function bar(p: number): string {
  const n = Math.round(p / 10);
  return c.green('█'.repeat(n)) + c.gray('░'.repeat(10 - n));
}

function taskListText(sim: Simulation): string[] {
  const lines = [c.bold('Task 목록')];
  for (const t of sim.visibleTasks()) {
    const def = sim.taskDef(t.id)!;
    const st = STATUS_COLOR[t.status](padEnd(t.status, 12));
    const who = t.assignee ? c.cyan(`@${t.assignee}`) : '';
    const deps = def.dependsOn?.length ? c.dim(` ← ${def.dependsOn.join(', ')}`) : '';
    const opt = def.optional ? c.dim(' (선택)') : '';
    lines.push(`  ${padEnd(c.bold(t.id), 22)}${st}${padEnd(def.title, 30)} ${who}${deps}${opt}`);
  }
  lines.push(c.dim("  상세: task show <task> · 배정: agent assign <agent> <task> 또는 Agent에게 자연어 지시"));
  return lines;
}

function taskCmd(sim: Simulation, args: string[], say: (l: string | string[]) => void): void {
  const sub = (args[0] ?? 'list').toLowerCase();
  if (sub === 'list' || sub === 'ls') return say(taskListText(sim));
  if (sub === 'graph') return say(taskGraphText(sim));
  if (sub === 'show') {
    const id = args[1];
    const def = id ? sim.taskDef(id) : undefined;
    if (!def || !sim.tasks[def.id].visible) return say(c.red(`Task '${id ?? ''}' 없음. 'task list' 참고`));
    const t = sim.tasks[def.id];
    const matching = sim.scenario.roles.filter((r) => def.skills.every((s) => r.skills.includes(s))).map((r) => r.id);
    return say([
      c.bold(c.cyan(`${def.id}`)) + ` — ${def.title}  ${STATUS_COLOR[t.status](t.status)}`,
      `  ${def.description}`,
      `  ${c.dim('유형')}      ${def.type}${def.review ? ' (검증/리뷰)' : ''}${def.optional ? ' (선택)' : ''}`,
      `  ${c.dim('필요 역량')}  ${def.skills.join(', ')}  ${c.dim('→ 적합 role: ' + (matching.join(', ') || '없음'))}`,
      `  ${c.dim('선행 Task')}  ${def.dependsOn?.join(', ') || '없음'}`,
      `  ${c.dim('입력')}      ${def.inputs?.join(', ') || '-'}`,
      `  ${c.dim('산출물')}    ${def.outputs?.join(', ') || '-'}`,
      `  ${c.dim('단계')}      ${def.steps.map((s) => s.event).join(' → ')}`,
      `  ${c.dim('진행')}      ${Math.round(sim.taskProgress(def.id) * 100)}%  ${t.assignee ? '@' + t.assignee : ''}  시도 ${t.attempts}회`,
    ]);
  }
  say(c.yellow(`알 수 없는 task 하위 명령 '${sub}'. 사용: task list | task show <id> | task graph`));
}

function taskGraphText(sim: Simulation): string[] {
  const tasks = sim.visibleTasks();
  const level: Record<string, number> = {};
  const lv = (id: string, seen = new Set<string>()): number => {
    if (level[id] !== undefined) return level[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = (sim.taskDef(id)?.dependsOn ?? []).filter((d) => sim.tasks[d]?.visible);
    return (level[id] = deps.length ? Math.max(...deps.map((d) => lv(d, seen))) + 1 : 0);
  };
  tasks.forEach((t) => lv(t.id));
  const max = Math.max(0, ...Object.values(level));
  const lines = [c.bold('Task 의존성 (같은 단계는 병렬 수행 가능)')];
  for (let i = 0; i <= max; i++) {
    const row = tasks.filter((t) => level[t.id] === i);
    lines.push(
      `  ${c.dim(`단계 ${i + 1}`)}  ` +
        row.map((t) => STATUS_COLOR[t.status](`[${t.id}]`)).join(c.dim('  ‖  ')),
    );
    if (i < max) lines.push(`  ${' '.repeat(7)}${c.dim('│')}`);
  }
  return lines;
}

function agentCmd(sim: Simulation, args: string[], cmd: PlayerCommand, say: (l: string | string[]) => void): void {
  const sub = (args[0] ?? 'list').toLowerCase();
  const res = (r: { ok: boolean; message: string }, okText?: string) =>
    say(r.ok ? c.green(`✓ ${okText ?? r.message}`) : c.red(`✗ ${r.message}`));
  const needAgent = (name: string | undefined) => {
    const a = sim.resolveAgent(name ?? cmd.agentId);
    if (!a) say(c.red(`✗ Agent '${name ?? ''}' 없음. 'agent list'로 확인하세요.`));
    return a;
  };
  switch (sub) {
    case 'list':
    case 'ls':
    case 'status':
      return say(statusText(sim, sub === 'status' ? sim.resolveAgent(args[1])?.id ?? args[1] : undefined));
    case 'spawn':
    case 'new':
    case 'create': {
      if (!args[1]) return say(c.yellow(`사용: agent spawn <role> [name]\n  role: ${sim.scenario.roles.map((r) => r.id).join(', ')}`));
      const r = sim.spawnAgent(args[1].toLowerCase(), args[2]);
      if (!r.ok) return res(r);
      say(c.green(`✓ Agent '${r.message}' 생성됨 (${sim.roleDef(args[1].toLowerCase())!.name}). 전용 패널이 열립니다.`));
      sim.emit('ui.request', 'open-agent-pane', { agentId: r.message, paneId: cmd.paneId, data: { action: 'agent-pane' } });
      return;
    }
    case 'assign': {
      const a = needAgent(args[1]);
      if (!a) return;
      if (!args[2]) return say(c.yellow('사용: agent assign <agent> <task>'));
      const r = sim.assign(a.id, args[2], { force: args.includes('--force'), redo: args.includes('--redo') });
      return res(r);
    }
    case 'logs': {
      const a = needAgent(args[1]);
      if (!a) return;
      const n = Number(args[2] ?? 20) || 20;
      const logs = sim.events.filter((e) => e.type === 'agent.log' && e.agentId === a.id).slice(-n);
      return say([c.bold(`── ${a.id} 최근 로그 ${logs.length}줄 ──`), ...logs.map((e) => e.message)]);
    }
    case 'inspect': {
      const a = needAgent(args[1]);
      if (!a) return;
      const role = sim.roleDef(a.role)!;
      const gate = sim.openGate(a);
      return say([
        c.bold(c.cyan(a.id)) + ` — ${role.name} ${c.dim('(' + role.title + ')')}`,
        `  ${c.dim('상태')}       ${STATUS_COLOR[a.status](STATUS_LABEL[a.status])}${a.error ? c.red('  ' + a.error) : ''}`,
        `  ${c.dim('역량')}       ${role.skills.join(', ')}`,
        `  ${c.dim('현재 작업')}  ${a.taskId ? `${a.taskId} (${Math.round(sim.taskProgress(a.taskId) * 100)}%) · ${sim.currentStep(a)?.event ?? ''}` : '-'}`,
        ...(gate ? [`  ${c.dim('대기 사유')}  ${c.yellow(gate.title)}`] : []),
        `  ${c.dim('완료 작업')}  ${a.completedTasks.join(', ') || '-'}`,
        `  ${c.dim('컨텍스트')}   ${a.context.length ? a.context.join(', ') : '-'}`,
        `  ${c.dim('가동 시간')}  ${a.busyTicks}분 · 생성 ${formatSimTime(a.spawnedAt)}`,
      ]);
    }
    case 'interrupt':
    case 'stop':
    case 'pause': {
      const a = needAgent(args[1]);
      if (a) res(sim.interrupt(a.id));
      return;
    }
    case 'resume': {
      const a = needAgent(args[1]);
      if (a) res(sim.resume(a.id));
      return;
    }
    case 'retry': {
      const a = needAgent(args[1]);
      if (a) res(sim.retry(a.id));
      return;
    }
    case 'restart': {
      const a = needAgent(args[1]);
      if (a) res(sim.restart(a.id));
      return;
    }
    case 'kill':
    case 'remove':
    case 'rm': {
      const a = needAgent(args[1]);
      if (!a) return;
      const r = sim.killAgent(a.id);
      res(r, `${a.id} 제거됨`);
      return;
    }
    case 'handoff': {
      const from = needAgent(args[1]);
      const to = from && needAgent(args[2]);
      if (from && to) res(sim.handoff(from.id, to.id));
      return;
    }
    case 'reply': {
      const a = needAgent(args[1]);
      if (!a) return;
      const text = args.slice(2).join(' ');
      if (!text) return say(c.yellow('사용: agent reply <agent> <번호|자연어>'));
      handleNaturalLanguage(sim, { ...cmd, agentId: a.id, text }, true);
      return;
    }
    default:
      say(c.yellow(`알 수 없는 agent 하위 명령 '${sub}'. 'help' 참고`));
  }
}

// ───────────── Virtual FS commands ─────────────

function normPath(p: string): string {
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '') || '/';
}

export function listDir(sim: Simulation, dir: string): { dirs: string[]; files: string[] } {
  const d = normPath(dir);
  const prefix = d === '/' ? '/' : d + '/';
  const dirs = new Set<string>();
  const files: string[] = [];
  for (const p of [...sim.files.keys()].sort()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const i = rest.indexOf('/');
    if (i >= 0) dirs.add(rest.slice(0, i));
    else files.push(rest);
  }
  return { dirs: [...dirs].sort(), files };
}

function lsText(sim: Simulation, dir: string): string[] {
  const { dirs, files } = listDir(sim, dir);
  if (!dirs.length && !files.length) return [c.yellow(`ls: ${dir}: 디렉터리가 비어있거나 없습니다`)];
  const d = normPath(dir);
  return [
    ...dirs.map((x) => c.blue(c.bold(x + '/'))),
    ...files.map((x) => {
      const f = sim.files.get((d === '/' ? '' : d) + '/' + x)!;
      const meta = c.dim(`  ${f.content.length.toLocaleString()}B  v${f.versions.length}  ${f.createdBy}`);
      return (f.restricted ? c.red(x + ' 🔒') : x) + meta;
    }),
  ];
}

function treeText(sim: Simulation): string[] {
  const lines: string[] = [c.bold('/')];
  const walk = (dir: string, indent: string) => {
    const { dirs, files } = listDir(sim, dir);
    const entries = [...dirs.map((d) => ({ d: true, n: d })), ...files.map((f) => ({ d: false, n: f }))];
    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      const path = (dir === '/' ? '' : dir) + '/' + e.n;
      const f = !e.d ? sim.files.get(path) : undefined;
      const label = e.d ? c.blue(e.n + '/') : f?.restricted ? c.red(e.n + ' 🔒') : e.n;
      lines.push(`${indent}${last ? '└─ ' : '├─ '}${label}`);
      if (e.d) walk(path, indent + (last ? '   ' : '│  '));
    });
  };
  walk('/', '');
  return lines;
}

function catCmd(sim: Simulation, path: string | undefined, say: (l: string | string[]) => void): void {
  if (!path) return say(c.yellow('사용: cat <file>'));
  const p = normPath(path);
  const f = sim.files.get(p);
  if (!f) return say(c.red(`cat: ${p}: 파일 없음`));
  if (f.restricted) {
    sim.emit('security.denied', `접근 거부: ${p} (player)`, { data: { path: p, by: 'player' } });
    return say(c.red(`cat: ${p}: 권한 없음 (보안 등급 데이터 — 접근 권한 신청 필요)`));
  }
  sim.recordObservation('file', p);
  const lines = f.content.split('\n');
  const MAX = 60;
  say([
    c.dim(`── ${p} (v${f.versions.length}, ${f.createdBy}) ──`),
    ...lines.slice(0, MAX),
    ...(lines.length > MAX ? [c.dim(`… ${lines.length - MAX}줄 더 있음. 'open ${p}'로 전체 보기`)] : []),
  ]);
}

function diffCmd(sim: Simulation, path: string | undefined, say: (l: string | string[]) => void): void {
  if (!path) return say(c.yellow('사용: diff <file>'));
  const p = normPath(path);
  const f = sim.files.get(p);
  if (!f) return say(c.red(`diff: ${p}: 파일 없음`));
  if (f.restricted) return say(c.red(`diff: ${p}: 권한 없음`));
  if (f.versions.length < 2) return say(c.dim(`${p}: 변경 이력 없음 (v1)`));
  sim.recordObservation('file', p);
  const a = f.versions[f.versions.length - 2];
  const b = f.versions[f.versions.length - 1];
  return say([c.dim(`── ${p}: v${f.versions.length - 1} (${a.by}) → v${f.versions.length} (${b.by}) ──`), ...lineDiff(a.content, b.content)]);
}

export function lineDiff(a: string, b: string): string[] {
  const A = a.split('\n');
  const B = b.split('\n');
  // LCS 기반 간단 diff
  const n = A.length;
  const m = B.length;
  if (n * m > 400000) return [c.dim('(파일이 커서 diff 생략)')];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) out.push(c.green('+ ' + B[j++]));
    else out.push(c.red('- ' + A[i++]));
  }
  return out.length ? out : [c.dim('(변경 없음)')];
}

function openCmd(sim: Simulation, target: string | undefined, pane: string, say: (l: string | string[]) => void): void {
  if (!target) return say(c.yellow('사용: open <file|url>'));
  if (target.startsWith('sim://')) {
    const page = sim.scenario.pages.find((p) => p.url === target);
    if (!page) return say(c.red(`open: ${target}: 페이지 없음. 'pages' 참고`));
    if (!sim.files.has(page.source)) return say(c.yellow(`${target}: 아직 생성되지 않은 화면입니다 (${page.source} 없음).`));
    sim.recordObservation('page', target);
    sim.emit('ui.request', 'open-page', { paneId: pane, data: { action: 'open-page', url: target } });
    return say(c.green(`↗ 가상 브라우저에서 ${target} 열기`));
  }
  const p = normPath(target);
  const f = sim.files.get(p);
  if (!f) return say(c.red(`open: ${p}: 파일 없음`));
  if (f.restricted) {
    sim.emit('security.denied', `접근 거부: ${p} (player)`, { data: { path: p, by: 'player' } });
    return say(c.red(`open: ${p}: 권한 없음`));
  }
  sim.recordObservation('file', p);
  sim.emit('ui.request', 'open-file', { paneId: pane, data: { action: 'open-file', path: p } });
  say(c.green(`↗ 미리보기에서 ${p} 열기`));
}

function pagesText(sim: Simulation): string[] {
  return [
    c.bold('가상 브라우저 화면'),
    ...sim.scenario.pages.map((p) => {
      const ready = sim.files.has(p.source);
      return `  ${ready ? c.green('●') : c.gray('○')} ${padEnd(c.cyan(p.url), 34)}${p.title}${ready ? '' : c.dim(' (아직 없음)')}`;
    }),
  ];
}

function hintText(sim: Simulation): string[] {
  const hints = sim.scenario.hints.filter((h) => sim.cond(h.when));
  const generic: string[] = [];
  const agents = sim.agentList();
  if (!agents.length) generic.push("먼저 'roles'로 역할을 보고 'agent spawn <role>'로 Agent를 만드세요.");
  const waiting = agents.filter((a) => a.status === 'waiting' || a.status === 'blocked');
  if (waiting.length) generic.push(`응답을 기다리는 Agent가 있습니다: ${waiting.map((a) => a.id).join(', ')}`);
  const failed = agents.filter((a) => a.status === 'failed');
  if (failed.length) generic.push(`실패한 Agent: ${failed.map((a) => a.id).join(', ')} — 원인을 해결한 뒤 'agent retry'`);
  const ready = sim.visibleTasks().filter((t) => t.status === 'ready' && !t.assignee);
  if (ready.length) generic.push(`바로 시작 가능한 Task: ${ready.map((t) => t.id).join(', ')}`);
  return [c.bold('💡 힌트'), ...[...generic, ...hints.slice(-3).map((h) => h.text)].map((h) => `  • ${h}`)];
}

/** 탭 자동완성 후보 */
export function completions(sim: Simulation, line: string): string[] {
  const parts = line.split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const prev = parts.slice(0, -1);
  let cands: string[] = [];
  if (prev.length === 0) cands = [...commandNames(), ...sim.agentList().map((a) => '@' + a.id)];
  else if (prev[0] === 'agent' && prev.length === 1)
    cands = ['spawn', 'list', 'assign', 'status', 'logs', 'inspect', 'reply', 'interrupt', 'resume', 'retry', 'restart', 'handoff', 'kill'];
  else if (prev[0] === 'agent' && prev[1] === 'spawn' && prev.length === 2) cands = sim.scenario.roles.map((r) => r.id);
  else if (prev[0] === 'agent' && prev[1] === 'assign' && prev.length === 3) cands = sim.visibleTasks().map((t) => t.id);
  else if (prev[0] === 'agent' && (prev.length === 2 || (prev[1] === 'handoff' && prev.length === 3)))
    cands = sim.agentList().map((a) => a.id);
  else if (prev[0] === 'task' && prev.length === 1) cands = ['list', 'show', 'graph'];
  else if (prev[0] === 'task' && prev[1] === 'show') cands = sim.visibleTasks().map((t) => t.id);
  else if (['cat', 'open', 'diff'].includes(prev[0])) {
    cands = [...sim.files.keys()];
    if (prev[0] === 'open') cands.push(...sim.scenario.pages.map((p) => p.url));
  } else if (prev[0] === 'ls') cands = [...new Set([...sim.files.keys()].map((p) => p.slice(0, p.lastIndexOf('/')) || '/'))];
  return cands.filter((x) => x.startsWith(last)).sort();
}
