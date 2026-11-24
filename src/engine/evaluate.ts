import type { Simulation } from './engine';
import type { DimensionId } from './types';

export type Rating = 'good' | 'fair' | 'poor' | 'na';

export interface Finding {
  kind: 'positive' | 'issue';
  text: string;
}

export interface DimensionResult {
  id: DimensionId;
  title: string;
  question: string;
  rating: Rating;
  findings: Finding[];
  suggestions: string[];
}

export interface OutcomeResult {
  id: string;
  label: string;
  success: boolean;
  text: string;
}

export interface Feedback {
  outcomes: OutcomeResult[];
  dimensions: DimensionResult[];
  stats: {
    simMinutes: number;
    agentsSpawned: number;
    tasksDone: number;
    tasksTotal: number;
    commands: number;
    nlInstructions: number;
    unrecognized: number;
    maxConcurrent: number;
    gatesOpened: number;
    failures: number;
    observations: number;
  };
  headline: string;
}

export const DIMENSIONS: { id: DimensionId; title: string; question: string }[] = [
  { id: 'decomposition', title: '업무 분해', question: '업무를 적절하게 분해했는가?' },
  { id: 'assignment', title: 'Agent 배정', question: '적합한 Agent에 업무를 배정했는가?' },
  { id: 'parallelism', title: '병렬 처리', question: '병렬로 처리할 수 있는 업무를 구분했는가?' },
  { id: 'verification', title: '결과 검증', question: 'Agent의 결과를 검증했는가?' },
  { id: 'recovery', title: '오류 대응', question: '오류나 실패에 적절하게 대응했는가?' },
  { id: 'duplication', title: '중복 최소화', question: '불필요한 중복 작업을 줄였는가?' },
  { id: 'domain', title: '도메인 고려', question: '도메인 특성을 고려했는가?' },
  { id: 'evidence', title: '근거 확인', question: '데이터와 분석 근거를 확인했는가?' },
  { id: 'security', title: '정보 보안', question: '정보 보안과 접근 권한을 고려했는가?' },
  { id: 'collaboration', title: '이해관계자 협업', question: '사람들과 신뢰를 쌓고 필요한 정보와 협조를 얻었는가?' },
];

export function evaluate(sim: Simulation): Feedback {
  const ev = sim.events;
  const findings: Record<DimensionId, Finding[]> = Object.fromEntries(DIMENSIONS.map((d) => [d.id, []])) as never;
  const suggestions: Record<DimensionId, string[]> = Object.fromEntries(DIMENSIONS.map((d) => [d.id, []])) as never;
  const add = (d: DimensionId, kind: Finding['kind'], text: string, suggestion?: string) => {
    findings[d].push({ kind, text });
    if (suggestion) suggestions[d].push(suggestion);
  };

  const visible = sim.visibleTasks();
  const done = visible.filter((t) => t.status === 'done');
  const spawned = ev.filter((e) => e.type === 'agent.spawned');
  const assigned = ev.filter((e) => e.type === 'task.assigned');
  const real = assigned.filter((e) => !e.data?.duplicate && !e.data?.restart && !e.data?.retry && !e.data?.redo);
  const doers = new Map<string, number>();
  for (const t of done.filter((x) => sim.taskDef(x.id)?.owner !== 'player')) {
    const who = t.assignee ?? '?';
    doers.set(who, (doers.get(who) ?? 0) + 1);
  }

  // ── 1. 업무 분해 ──
  const taskCmds = ev.filter((e) => e.type === 'command' && /^task\s+(list|show|graph)|^task$/.test(e.message.trim()));
  const multiRole = sim.scenario.roles.length > 1;
  if (taskCmds.length) add('decomposition', 'positive', `Task 구조를 확인했습니다 (task list/show/graph ${taskCmds.length}회).`);
  else if (multiRole)
    add(
      'decomposition',
      'issue',
      'Task 목록이나 의존성 그래프를 확인하지 않고 업무를 진행했습니다.',
      "시작 전에 'task graph'로 업무 구조와 선행 관계를 파악하면 위임 계획을 세우기 쉽습니다.",
    );
  if (done.length >= 3) {
    const top = [...doers.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / done.length >= 0.75 && sim.scenario.roles.length > 1)
      add(
        'decomposition',
        'issue',
        `완료된 Task ${done.length}개 중 ${top[1]}개를 ${top[0]} 한 Agent가 처리했습니다.`,
        '역할별 전문 Agent에게 업무를 나누면 품질과 속도가 함께 올라갑니다.',
      );
    else
      add(
        'decomposition',
        'positive',
        doers.size > 1 ? `${doers.size}개 Agent가 업무를 나누어 수행했습니다.` : `업무를 ${done.length}개 Task로 나누어 단계별로 맡겼습니다.`,
      );
  }
  if (sim.metrics.unrecognized >= 4)
    add(
      'decomposition',
      'issue',
      `인식되지 않은 지시가 ${sim.metrics.unrecognized}회 있었습니다.`,
      '지시는 "무엇을(대상 데이터/산출물) + 어떻게(기준)" 형태로 구체적으로 작성하세요.',
    );

  // ── 2. 배정 ──
  const mismatches = Object.keys(sim.flags).filter((f) => /^quality\..+\.low$/.test(f) && sim.flags[f]);
  if (mismatches.length)
    add(
      'assignment',
      'issue',
      `역량이 맞지 않는 Agent가 수행한 Task: ${mismatches.map((f) => f.split('.')[1]).join(', ')}`,
      "'task show <task>'의 '적합 role'을 확인하고 해당 역할의 Agent를 생성해 배정하세요.",
    );
  const cancelled = ev.filter((e) => e.type === 'agent.status' && (e.data?.reason as string) === '배정 취소').length;
  if (cancelled) add('assignment', 'positive', `역량 부족 경고를 보고 배정을 ${cancelled}회 취소·재조정했습니다.`);
  const wrongRole = ev.filter((e) => e.type === 'intent.matched' && e.data?.wrongRole).length;
  if (wrongRole)
    add('assignment', 'issue', `역할에 맞지 않는 Agent에게 지시한 경우가 ${wrongRole}회 있었습니다.`, '지시 대상 Agent의 역할과 역량을 먼저 확인하세요.');
  if (!mismatches.length && real.length) add('assignment', 'positive', '모든 Task를 필요한 역량을 갖춘 Agent에게 배정했습니다.');

  // ── 3. 병렬 ──
  const hasParallelOpportunity = hasParallel(sim);
  if (hasParallelOpportunity) {
    if (sim.metrics.parallelTicks >= 3)
      add('parallelism', 'positive', `최대 ${sim.metrics.maxConcurrent}개 Agent를 동시에 운용했습니다 (병렬 작업 ${sim.metrics.parallelTicks}분).`);
    else
      add(
        'parallelism',
        'issue',
        '서로 독립적인 Task가 있었지만 한 번에 한 Agent만 일했습니다.',
        "'task graph'에서 같은 단계의 Task는 서로 다른 Agent에게 동시에 맡길 수 있습니다.",
      );
    if (sim.metrics.missedParallelTicks > 25)
      add(
        'parallelism',
        'issue',
        `시작 가능한 Task가 배정되지 않은 채 대기한 시간이 ${sim.metrics.missedParallelTicks}분입니다.`,
        "Agent가 일하는 동안 'hint'나 'task list'로 다음에 시작할 수 있는 Task를 확인하세요.",
      );
  }

  // ── 4. 검증 ──
  const observations = ev.filter((e) => e.type === 'observe');
  const outputsOf = done.flatMap((t) =>
    (sim.taskDef(t.id)!.outputs ?? []).map((o) => ({ task: t.id, out: o, after: t.completedAt ?? 0 })),
  );
  const checked = outputsOf.filter((o) =>
    observations.some((e) => {
      const target = e.data?.target as string;
      if (e.tick < o.after) return false;
      if (target === o.out) return true;
      const page = sim.scenario.pages.find((p) => p.url === target);
      return page?.source === o.out;
    }),
  );
  if (outputsOf.length) {
    const ratio = checked.length / outputsOf.length;
    if (ratio >= 0.6) add('verification', 'positive', `Agent 산출물 ${outputsOf.length}개 중 ${checked.length}개를 직접 열어 확인했습니다.`);
    else
      add(
        'verification',
        'issue',
        `Agent 산출물 ${outputsOf.length}개 중 ${checked.length}개만 직접 확인했습니다.`,
        "Agent가 '완료'라고 해도 산출물을 'cat'/'open' 또는 가상 브라우저로 직접 확인하세요.",
      );
  }
  const reviewTasks = sim.scenario.tasks.filter((t) => t.review && sim.tasks[t.id].visible);
  const reviewDone = reviewTasks.filter((t) => sim.tasks[t.id].status === 'done');
  if (reviewTasks.length) {
    if (reviewDone.length === reviewTasks.length) add('verification', 'positive', `검증/리뷰 Task(${reviewDone.map((t) => t.id).join(', ')})를 수행했습니다.`);
    else
      add(
        'verification',
        'issue',
        `검증/리뷰 Task를 건너뛰었습니다: ${reviewTasks.filter((t) => sim.tasks[t.id].status !== 'done').map((t) => t.id).join(', ')}`,
        '한 Agent의 결과를 다른 관점의 Agent가 교차 검증하게 하세요.',
      );
  }

  // ── 5. 오류 대응 ──
  const gatesOpened = ev.filter((e) => e.type === 'gate.opened');
  const resolved = ev.filter((e) => e.type === 'gate.resolved');
  for (const r of resolved) {
    const gate = findGate(sim, r.data?.gate as string);
    if (!gate) continue;
    const chosen = ((r.data?.options as string[]) ?? [r.data?.option as string]).map((id) => gate.options.find((o) => o.id === id)).filter(Boolean);
    for (const opt of chosen) {
      if (!opt || !opt.quality || opt.quality === 'neutral') continue;
      const dim = opt.dimension ?? 'recovery';
      if (opt.quality === 'good') add(dim, 'positive', `'${gate.title}' → '${opt.label}' 로 적절히 판단했습니다.`);
      else add(dim, 'issue', `'${gate.title}'에서 '${opt.label}'를 선택했습니다.`, opt.feedback);
    }
    for (const id of (r.data?.missed as string[]) ?? []) {
      const opt = gate.options.find((o) => o.id === id);
      if (opt) add(opt.dimension ?? 'recovery', 'issue', `'${gate.title}'에서 '${opt.label}'를 빠뜨렸습니다.`, opt.feedback);
    }
  }
  const good = resolved.filter((e) => e.data?.quality === 'good');
  if (good.length >= 2) add('recovery', 'positive', `Agent의 질문/경고 ${good.length}건에 적절하게 응답했습니다.`);
  const unresolved = gatesOpened.length - resolved.length;
  if (unresolved > 0 && sim.submitted)
    add('recovery', 'issue', `응답하지 않은 의사결정 요청이 ${unresolved}건 남아 있습니다.`, 'Waiting/Blocked 상태 Agent는 플레이어의 판단 없이는 진행하지 못합니다.');
  const waits = resolved.map((r) => {
    const o = [...gatesOpened].reverse().find((g) => g.agentId === r.agentId && g.data?.gate === r.data?.gate && g.tick <= r.tick);
    return o ? r.tick - o.tick : 0;
  });
  if (waits.length) {
    const avg = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
    if (avg > 20) add('recovery', 'issue', `의사결정 요청에 평균 ${avg}분 뒤 응답했습니다.`, '알림 패널의 ⏸ 표시를 주시하면 Agent 대기 시간을 줄일 수 있습니다.');
  }
  const failures = ev.filter((e) => e.type === 'task.status' && e.data?.to === 'failed');
  if (failures.length) {
    const recovered = failures.filter((f) => sim.tasks[f.taskId!]?.status === 'done');
    if (recovered.length === failures.length) add('recovery', 'positive', `실패 ${failures.length}건을 모두 원인 해결 후 복구했습니다.`);
    else add('recovery', 'issue', `실패한 Task가 복구되지 않았습니다: ${failures.filter((f) => sim.tasks[f.taskId!]?.status !== 'done').map((f) => f.taskId).join(', ')}`);
  }

  // ── 6. 중복 ──
  const dup = assigned.filter((e) => e.data?.duplicate).length;
  const redo = assigned.filter((e) => e.data?.redo).length;
  const restarts = assigned.filter((e) => e.data?.restart).length;
  const repeatFails = Math.max(0, failures.length - new Set(failures.map((f) => f.taskId)).size);
  const unused = spawned.filter((s) => !assigned.some((a) => a.agentId === s.agentId)).map((s) => s.agentId);
  if (dup) add('duplication', 'issue', `이미 다른 Agent가 맡은 Task를 중복 배정하려 한 경우가 ${dup}회 있었습니다.`, "진행 중인 작업을 옮길 때는 'agent handoff'를 사용하세요.");
  if (redo + restarts > 1) add('duplication', 'issue', `작업을 처음부터 다시 수행한 경우가 ${redo + restarts}회 있었습니다.`, '재수행 전 원인을 먼저 파악하고 지시를 수정하세요.');
  if (repeatFails) add('duplication', 'issue', `원인을 해결하지 않고 재시도해 같은 실패가 ${repeatFails}회 반복되었습니다.`, '실패 로그의 원인을 해결하는 지시를 먼저 내린 뒤 재시도하세요.');
  if (unused.length) add('duplication', 'issue', `생성 후 한 번도 사용하지 않은 Agent: ${unused.join(', ')}`, '필요한 역할만 생성하면 비용(토큰)과 관리 부담이 줄어듭니다.');
  if (!dup && redo + restarts <= 1 && !repeatFails && !unused.length && real.length)
    add('duplication', 'positive', '중복 배정이나 불필요한 재작업 없이 진행했습니다.');

  // ── 사내 공통 지침 (7단계: 캠페인 결과를 이어 받은 미션) ──
  for (const r of sim.scenario.foundation ?? []) {
    if (!sim.flags[`org.${r.id}`]) continue;
    if (sim.flags[`org.ignored.${r.id}`] && !sim.flags[`org.followed.${r.id}`])
      add('domain', 'issue', `사내 지침이 추천한 원칙을 따르지 않았습니다: ${r.text}`, '지침은 앞 단계에서 같은 실수를 겪고 만든 규칙입니다. 다르게 판단했다면 근거를 남기세요.');
    else if (sim.flags[`org.followed.${r.id}`]) add('domain', 'positive', `사내 지침을 활용했습니다: ${r.text}`);
  }

  // ── 10. 이해관계자 협업 (인물이 있는 미션) ──
  const people = sim.scenario.people ?? [];
  if (people.length) {
    const met = people.filter((p) => sim.people[p.id]?.met);
    const unmet = people.filter((p) => !sim.people[p.id]?.met && !(p.optional === true || (p.optional !== undefined && sim.cond(p.optional))));
    if (met.length) add('collaboration', 'positive', `${met.length}/${people.length}명과 대화했습니다 (${met.map((p) => p.name).join(', ')}).`);
    if (unmet.length)
      add('collaboration', 'issue', `만나지 않은 관계자: ${unmet.map((p) => `${p.name}(${p.title})`).join(', ')}`, '데이터를 만드는 사람, 쓰는 사람, 지키는 사람을 모두 만나야 전체 그림이 보입니다.');
    const rude = ev.filter((e) => e.type === 'intent.matched' && e.data?.rude).length;
    if (rude) add('collaboration', 'issue', `압박하거나 무례하게 들릴 수 있는 요청이 ${rude}회 있었습니다.`, '상대도 자기 일이 있습니다. 요청 전에 상대의 상황과 부담을 먼저 물어보세요.');
    const deflected = ev.filter((e) => e.type === 'intent.matched' && e.data?.deflected).length;
    if (deflected) add('collaboration', 'issue', `신뢰가 부족해 상대가 대답을 피한 경우가 ${deflected}회 있었습니다.`, '중요한 정보일수록 신뢰가 먼저입니다. 같은 질문을 반복하기보다 관계를 먼저 쌓으세요.');
    const gains = ev.filter((e) => e.type === 'person.trust' && (e.data?.delta as number) > 0);
    const losses = ev.filter((e) => e.type === 'person.trust' && (e.data?.delta as number) < 0);
    if (gains.length >= 3 && !losses.length) add('collaboration', 'positive', '대화를 통해 신뢰를 꾸준히 쌓았습니다.');
    if (losses.length) add('collaboration', 'issue', `신뢰를 잃은 순간이 ${losses.length}번 있었습니다: ${[...new Set(losses.map((e) => sim.personDef(e.personId!)?.name))].join(', ')}`);
  }

  // ── 회의 안건 ──
  for (const g of sim.scenario.groups ?? []) {
    for (const e of ev.filter((x) => x.type === 'group.agenda' && x.data?.group === g.id)) {
      const agenda = g.agenda.find((a) => a.id === e.data?.agenda);
      const prop = agenda?.proposals.find((p) => p.id === e.data?.proposal);
      if (!agenda || !prop || !prop.quality || prop.quality === 'neutral') continue;
      const dim = prop.dimension ?? 'collaboration';
      if (prop.quality === 'good') add(dim, 'positive', `회의 '${agenda.title}' → '${prop.label}' 제안${e.data?.agreed ? '으로 합의했습니다' : '을 올렸습니다'}.`);
      else add(dim, 'issue', `회의 '${agenda.title}'에 '${prop.label}'를 제안했습니다.`, prop.feedback);
    }
    const n = sim.groups[g.id]?.meetings ?? 0;
    if (n > 2) add('collaboration', 'issue', `${g.name}을(를) ${n}번 소집했습니다.`, '회의 전에 1:1로 이해관계를 조율하면 한 번에 합의할 수 있습니다.');
  }

  // ── 9. 보안 (공통) ──
  const denied = ev.filter((e) => e.type === 'security.denied' && e.data?.by === 'player');
  if (denied.length) add('security', 'issue', `권한이 없는 파일에 직접 접근을 ${denied.length}회 시도했습니다.`, '보안 등급 데이터는 업무 필요성이 확인된 경우에만 정식 절차로 접근하세요.');

  // ── 시나리오 규칙 ──
  for (const r of sim.scenario.evaluation) {
    if (sim.cond(r.when)) add(r.dimension, r.kind, sim.expand(r.text), r.suggestion);
  }

  const dims = DIMENSIONS.filter((d) => d.id !== 'collaboration' || people.length);
  const dimensions: DimensionResult[] = dims.map((d) => {
    const f = findings[d.id];
    const issues = f.filter((x) => x.kind === 'issue').length;
    const pos = f.filter((x) => x.kind === 'positive').length;
    const rating: Rating = !f.length ? 'na' : issues === 0 ? 'good' : issues === 1 && pos > 0 ? 'fair' : issues >= 2 || pos === 0 ? 'poor' : 'fair';
    return { ...d, rating, findings: f, suggestions: [...new Set(suggestions[d.id])] };
  });

  const outcomes: OutcomeResult[] = sim.scenario.outcomes.map((o) => {
    const success = sim.cond(o.success);
    return { id: o.id, label: o.label, success, text: success ? o.successText : o.failText };
  });

  const okCount = outcomes.filter((o) => o.success).length;
  const headline =
    okCount === outcomes.length
      ? '요청자가 결과물을 그대로 채택했습니다.'
      : okCount >= outcomes.length / 2
        ? '결과물이 일부 보완 요청과 함께 접수되었습니다.'
        : '결과물이 재작업 요청을 받았습니다.';

  return {
    outcomes,
    dimensions,
    headline,
    stats: {
      simMinutes: sim.tick,
      agentsSpawned: spawned.length,
      tasksDone: done.length,
      tasksTotal: visible.length,
      commands: sim.metrics.commands,
      nlInstructions: sim.metrics.nlInstructions,
      unrecognized: sim.metrics.unrecognized,
      maxConcurrent: sim.metrics.maxConcurrent,
      gatesOpened: gatesOpened.length,
      failures: failures.length,
      observations: observations.length,
    },
  };
}

function findGate(sim: Simulation, id: string) {
  for (const t of sim.scenario.tasks) for (const s of t.steps) if (s.gate?.id === id) return s.gate;
  return undefined;
}

/** DAG에 동시에 수행 가능한 (서로 의존하지 않는) 필수 Task 쌍이 있는지 */
function hasParallel(sim: Simulation): boolean {
  const tasks = sim.scenario.tasks.filter((t) => !t.hidden && !t.optional && t.owner !== 'player');
  const ancestors = (id: string, acc = new Set<string>()): Set<string> => {
    for (const d of sim.taskDef(id)?.dependsOn ?? []) {
      if (!acc.has(d)) {
        acc.add(d);
        ancestors(d, acc);
      }
    }
    return acc;
  };
  for (let i = 0; i < tasks.length; i++)
    for (let j = i + 1; j < tasks.length; j++) {
      if (!ancestors(tasks[i].id).has(tasks[j].id) && !ancestors(tasks[j].id).has(tasks[i].id)) return true;
    }
  return false;
}
