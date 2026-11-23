import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { evaluate } from '../src/engine/evaluate';
import { meetingState } from '../src/engine/groups';
import { presence } from '../src/engine/people';
import { getScenario } from '../src/scenarios';
import { runUntil, sh, status, taskStatus, waitReply } from './helpers';

const scenario = getScenario('s2-standardization')!;
const start = (seed = 1) => new Simulation(scenario, seed, scenario.campaign!.defaultCarry);

/** 메신저 객관식 질문을 차례로 보내고 답을 기다린다 */
function ask(sim: Simulation, person: string, ...topics: string[]) {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
}

function prepare(sim: Simulation) {
  ask(sim, 'oh', 'history', 'interest', 'alias');
  ask(sim, 'seo', 'storage', 'interest', 'kst-display');
  ask(sim, 'kang', 'yield', 'interest', 'split');
  ask(sim, 'choi', 'call', 'interest', 'print');
  ask(sim, 'lee', 'formal');
  ask(sim, 'han', 'wiki');
}

function toDraft(sim: Simulation, careful = true) {
  sh(sim, 'agent spawn assistant');
  sh(sim, `do assistant match${careful ? ' +careful-pre' : ''}`);
}

function finishMatch(sim: Simulation, tz = 1) {
  runUntil(sim, () => taskStatus(sim, 'match') === 'done' || sim.agents['assistant'].gate?.gateId === 'tz', 600);
  if (taskStatus(sim, 'match') !== 'done') {
    sh(sim, `agent choose assistant ${tz}`);
    runUntil(sim, () => taskStatus(sim, 'match') === 'done');
  }
  sh(sim, 'do assistant draft +current-pre');
  runUntil(sim, () => taskStatus(sim, 'draft') === 'done');
}

function meet(sim: Simulation) {
  sh(sim, 'meeting std-meeting call');
  runUntil(sim, () => meetingState(sim, 'std-meeting') === 'live');
}

describe('2단계 표준화', () => {
  it('사전 조율 → 회의 합의 → 위키 → 적용 → 승인: 모든 결과 달성', () => {
    const sim = start(11);
    toDraft(sim);
    prepare(sim); // Agent가 일하는 동안 사람 업무
    expect(taskStatus(sim, 'align')).toBe('done');
    finishMatch(sim);
    expect(sim.flags['match.fixed']).toBe(true);
    expect(sim.files.get('/work/std/match.md')!.content).toContain('EQ-N2-ET01');

    meet(sim);
    expect(presence(sim, 'oh').status).toBe('meeting'); // 회의 중에는 1:1 메시지를 보지 않는다
    sh(sim, 'propose std-meeting equip-id mes-alias');
    sh(sim, 'propose std-meeting time utc-kst');
    sh(sim, 'propose std-meeting defect-code legacy');
    sh(sim, 'propose std-meeting yield split');
    expect(sim.flags['meeting.signed']).toBe(true);
    expect(sim.flags['meeting.prepared']).toBe(true);
    runUntil(sim, () => taskStatus(sim, 'meeting') === 'done');

    sh(sim, 'do assistant wiki +safe-pre');
    runUntil(sim, () => taskStatus(sim, 'wiki') === 'done');
    expect(sim.files.get('/wiki/standards/equipment-id.md')!.content).not.toContain('fab_shared');
    sh(sim, 'do assistant apply +backfill-pre');
    runUntil(sim, () => taskStatus(sim, 'apply') === 'done');
    expect(sim.files.get('/work/std/apply_report.md')!.content).toContain('+0.1%p');

    ask(sim, 'jung', 'approve');
    expect(sim.flags['std.approved']).toBe(true);
    expect(taskStatus(sim, 'approve')).toBe('done');
    sh(sim, 'submit');
    const fb = evaluate(sim);
    expect(fb.outcomes.filter((o) => !o.success).map((o) => o.id)).toEqual([]);
    const collab = fb.dimensions.find((d) => d.id === 'collaboration')!;
    expect(collab.findings.some((f) => f.text.includes('1:1로 먼저'))).toBe(true);
  });

  it('사전 조율 없이 회의하면 반대로 보류된다', () => {
    const sim = start(12);
    toDraft(sim);
    finishMatch(sim);
    meet(sim);
    sh(sim, 'propose std-meeting equip-id mes-alias');
    sh(sim, 'propose std-meeting yield split');
    sh(sim, 'propose std-meeting defect-code legacy');
    expect(sim.groups['std-meeting'].agenda['equip-id'].status).toBe('held');
    expect(sim.groups['std-meeting'].agenda['yield'].status).toBe('held');
    expect(sim.groups['std-meeting'].agenda['defect-code'].status).toBe('agreed');
    expect(sim.flags['meeting.unprepared']).toBe(true);
    // 같은 회의에서 같은 안건을 다시 올릴 수는 없다
    sh(sim, 'propose std-meeting equip-id mes-alias');
    expect(sim.groups['std-meeting'].agenda['equip-id'].attempts).toBe(1);
    // 회의를 마치고 1:1로 조율한 뒤 다시 소집
    sh(sim, 'meeting std-meeting end');
    runUntil(sim, () => meetingState(sim, 'std-meeting') === 'none');
    ask(sim, 'oh', 'history', 'interest');
    meet(sim);
    sh(sim, 'propose std-meeting equip-id mes-alias');
    expect(sim.groups['std-meeting'].agenda['equip-id'].status).toBe(sim.cond({ any: ['interest.choi', { trust: 'choi', gte: 60 }] }) ? 'agreed' : 'held');
    const collab = evaluate(sim).dimensions.find((d) => d.id === 'collaboration')!;
    expect(collab.findings.some((f) => f.text.includes('확인하지 않은 채'))).toBe(true);
  });

  it('AI 추천안(빈도 기반 통일)은 회의에서 합의되지 않는다', () => {
    const sim = start(13);
    toDraft(sim);
    prepare(sim);
    finishMatch(sim);
    meet(sim);
    sh(sim, 'propose std-meeting equip-id etch07');
    sh(sim, 'propose std-meeting yield yield-team');
    expect(sim.groups['std-meeting'].agenda['equip-id'].status).toBe('held');
    expect(sim.groups['std-meeting'].agenda['yield'].status).toBe('held');
    // 남은 안건을 모두 다루면 회의가 끝난다
    sh(sim, 'propose std-meeting time utc-kst');
    sh(sim, 'propose std-meeting defect-code legacy');
    runUntil(sim, () => meetingState(sim, 'std-meeting') === 'none');
    expect(sim.flags['meeting.signed']).toBeUndefined();
    const issues = evaluate(sim).dimensions.flatMap((d) => d.findings.filter((f) => f.kind === 'issue').map((f) => f.text));
    expect(issues.some((t) => t.includes('ETCH-07 체계로 전 부서 통일'))).toBe(true);
  });

  it('자동 매칭을 그대로 확정하면 오매칭이 위키 별칭 표까지 간다', () => {
    const sim = start(14);
    toDraft(sim, false);
    runUntil(sim, () => sim.agents['assistant'].gate?.gateId === 'automatch');
    sh(sim, 'agent choose assistant 2');
    expect(sim.flags['match.auto']).toBe(true);
    finishMatch(sim);
    expect(sim.files.get('/work/std/match.md')!.content).toContain('EQ-N2-ET10');
  });

  it('정의 변경을 개선으로 보고하면 팀장이 반려하고 재작업 후 승인한다', () => {
    const sim = start(15);
    toDraft(sim);
    prepare(sim);
    finishMatch(sim);
    meet(sim);
    for (const [a, p] of [['equip-id', 'mes-alias'], ['time', 'utc-kst'], ['defect-code', 'legacy'], ['yield', 'split']]) sh(sim, `propose std-meeting ${a} ${p}`);
    runUntil(sim, () => taskStatus(sim, 'meeting') === 'done');
    sh(sim, 'do assistant wiki');
    runUntil(sim, () => sim.agents['assistant'].gate?.gateId === 'publish-scope');
    sh(sim, 'agent choose assistant 1');
    runUntil(sim, () => taskStatus(sim, 'wiki') === 'done');
    sh(sim, 'do assistant apply');
    runUntil(sim, () => sim.agents['assistant'].gate?.gateId === 'report');
    sh(sim, 'agent choose assistant 2'); // 개선으로 보고
    runUntil(sim, () => taskStatus(sim, 'apply') === 'done');
    ask(sim, 'jung', 'approve');
    expect(sim.flags['std.approved']).toBeUndefined();
    expect(taskStatus(sim, 'apply')).not.toBe('done');
    sh(sim, 'do assistant apply');
    runUntil(sim, () => sim.agents['assistant'].gate?.gateId === 'report');
    sh(sim, 'agent choose assistant 1');
    runUntil(sim, () => taskStatus(sim, 'apply') === 'done');
    ask(sim, 'jung', 'approve-again');
    expect(sim.flags['std.approved']).toBe(true);
    expect(status(sim, 'assistant')).toBe('completed');
  });

  it('사람 업무는 Agent에게 배정할 수 없다', () => {
    const sim = start(16);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'agent assign assistant align');
    expect(sim.tasks['align'].assignee).toBeUndefined();
  });
});
