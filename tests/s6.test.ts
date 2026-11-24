import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { evaluate } from '../src/engine/evaluate';
import type { CarryState } from '../src/engine/types';
import { getScenario } from '../src/scenarios';
import { lastSaid, runUntil, sh, taskStatus, waitReply } from './helpers';

const scenario = getScenario('s6-agent-design')!;
const base = scenario.campaign!.defaultCarry!;
const start = (seed = 1, carry: CarryState = base) => new Simulation(scenario, seed, carry);

function ask(sim: Simulation, person: string, ...topics: string[]) {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
}
/** task가 끝날 때까지 진행하며, 판단 지점마다 answers의 번호로 답한다 */
function finish(sim: Simulation, agent: string, task: string, answers: Record<string, string> = {}) {
  for (let guard = 0; guard < 12; guard++) {
    runUntil(sim, () => taskStatus(sim, task) === 'done' || !!sim.agents[agent].gate, 800);
    const g = sim.agents[agent].gate?.gateId;
    if (!g) return;
    if (!answers[g]) throw new Error(`unexpected gate ${g}`);
    sh(sim, `agent choose ${agent} ${answers[g]}`);
  }
}
const GOOD_SPEC = { trigger: '1', tools: '1,2,3,4', human: '1', failure: '1' };
const ALL_SETS = { sets: '1,2,3,4', metrics: '1' };

function setup(sim: Simulation) {
  sh(sim, 'agent spawn assistant');
  sh(sim, 'agent spawn evaluator');
  sh(sim, 'agent spawn report-agent');
}
function select(sim: Simulation) {
  sh(sim, 'do assistant select');
  finish(sim, 'assistant', 'select', { pick: '3' });
  expect(sim.flags['select.weekly']).toBe(true);
}
function reviewer(sim: Simulation) {
  ask(sim, 'park', 'role');
}
function golive(sim: Simulation) {
  ask(sim, 'jung', 'golive');
}

describe('6단계 Agent 설계', () => {
  it('좋은 설계 → 회귀 시험에서 지식 공백 발견·보완 → 시범 운영 무사고 → 운영 전환', () => {
    const sim = start(61);
    setup(sim);
    ask(sim, 'jung', 'criteria');
    select(sim);
    // 명세와 평가 기준은 동시에
    sh(sim, 'do assistant spec');
    sh(sim, 'do evaluator evalset');
    finish(sim, 'evaluator', 'evalset', ALL_SETS);
    finish(sim, 'assistant', 'spec', GOOD_SPEC);
    expect(sim.flags['tools.safe']).toBe(true);
    expect(sim.files.get('/agents/report-agent.md')!.content).toContain('tool|mart.query|read');
    // 기본 이월에는 '모르면 확인 필요' 규칙이 없다 → 13번 실패 (평가 Agent가 명세보다 먼저 끝났으면 12·14번도)
    expect(sim.flags['rq.13']).toBe(false);
    sim.observe('page', 'sim://work/regression');
    sh(sim, 'do assistant kb-fix');
    finish(sim, 'assistant', 'kb-fix');
    expect(sim.flags['kb.unknown_rule']).toBe(true);
    sh(sim, 'do evaluator regress');
    finish(sim, 'evaluator', 'regress');
    expect(sim.flags['regress.pass_all']).toBe(true);
    expect(sim.files.get('/eval/regression.txt')!.content).not.toContain('|fail|');

    reviewer(sim);
    sh(sim, 'do report-agent shadow');
    finish(sim, 'report-agent', 'shadow');
    expect(sim.flags['sh.clean']).toBe(true);
    expect(sim.flags['sh.et13_flagged']).toBe(true);
    expect(sim.flags['sh.inject_ignored']).toBe(true);
    expect(sim.tasks['incident'].visible).toBe(false);
    sim.observe('page', 'sim://agents/report-agent/runs');

    golive(sim);
    expect(sim.flags['golive.go']).toBe(true);
    runUntil(sim, () => taskStatus(sim, 'review') === 'done');
    sh(sim, 'submit');
    const fb = evaluate(sim);
    expect(fb.outcomes.filter((o) => !o.success).map((o) => o.id)).toEqual([]);
  });

  it('AI 추천(절약 시간 1위)을 고르면 반려되고 다시 고른다', () => {
    const sim = start(62);
    setup(sim);
    sh(sim, 'do assistant select');
    finish(sim, 'assistant', 'select', { pick: '1' });
    expect(sim.flags['select.weekly']).toBe(false);
    expect(sim.files.get('/design/candidates.md')!.content).toContain('반려: 불량 급증 알림');
    sh(sim, 'do assistant spec');
    expect(sim.tasks['spec'].assignee).toBeUndefined();
    sh(sim, 'do assistant select');
    finish(sim, 'assistant', 'select', { pick: '3' });
    expect(sim.flags['select.weekly']).toBe(true);
    const issues = evaluate(sim).dimensions.flatMap((d) => d.findings.filter((f) => f.kind === 'issue').map((f) => f.text));
    expect(issues.some((t) => t.includes('절약 시간'))).toBe(true);
  });

  it('위험한 도구가 남으면 시험에 걸리고, 데이터 속 지시문을 승인하면 전사 메일이 나간다', () => {
    const sim = start(63);
    setup(sim);
    select(sim);
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', { ...GOOD_SPEC, tools: '1,2,3,7' });
    sh(sim, 'do evaluator evalset');
    finish(sim, 'evaluator', 'evalset', ALL_SETS);
    expect(sim.flags['rq.14']).toBe(false);
    expect(sim.flags['tools.safe']).toBe(false);
    // 명세에서 mail.send를 빼고 다시 쓴다
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', GOOD_SPEC);
    expect(sim.flags['tool.mail']).toBe(false);

    // 별도 시뮬레이션: mail.send가 남은 채로 시범 운영까지 가면
    const s2 = start(64);
    setup(s2);
    select(s2);
    sh(s2, 'do assistant spec');
    finish(s2, 'assistant', 'spec', { ...GOOD_SPEC, tools: '1,2,3,7' });
    sh(s2, 'do evaluator evalset');
    finish(s2, 'evaluator', 'evalset', ALL_SETS);
    sh(s2, 'do report-agent shadow');
    finish(s2, 'report-agent', 'shadow', { mail: '2' });
    expect(s2.flags['sh.mail_sent']).toBe(true);
    expect(s2.flags['sh.incident']).toBe(true);
    expect(s2.tasks['incident'].visible).toBe(true);
    expect(s2.files.get('/agents/runs.txt')!.content).toContain('approved');
  });

  it('적재 전 고정 트리거 + 지난주 값 → 조용히 틀린 보고, 명세를 고쳐 재현 시험으로 사고 대응', () => {
    const sim = start(65);
    setup(sim);
    select(sim);
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', { ...GOOD_SPEC, trigger: '2', failure: '2' });
    sh(sim, 'do evaluator evalset');
    finish(sim, 'evaluator', 'evalset', ALL_SETS);
    reviewer(sim);
    sh(sim, 'do report-agent shadow');
    finish(sim, 'report-agent', 'shadow');
    expect(sim.flags['sh.stale']).toBe(true);
    expect(sim.flags['sh.et13_guess']).toBe(true);
    expect(taskStatus(sim, 'incident')).not.toBe('done');
    // 사고 대응: 로그를 보고 명세·지식을 고친 뒤 같은 데이터로 다시 실행
    sim.observe('page', 'sim://agents/report-agent/runs');
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', GOOD_SPEC);
    sh(sim, 'do assistant kb-fix');
    finish(sim, 'assistant', 'kb-fix');
    expect(sim.files.get('/knowledge/AGENTS.md')!.content).toContain('EQ-N2-ET13');
    sh(sim, 'do report-agent shadow');
    finish(sim, 'report-agent', 'shadow');
    expect(sim.flags['sh.clean']).toBe(true);
    runUntil(sim, () => taskStatus(sim, 'incident') === 'done');
    const pos = evaluate(sim).dimensions.flatMap((d) => d.findings.filter((f) => f.kind === 'positive').map((f) => f.text));
    expect(pos.some((t) => t.includes('같은 데이터로 다시 실행'))).toBe(true);
  });

  it('사고가 남은 채 운영 전환을 요청하면 팀장이 반대한다', () => {
    const sim = start(66);
    setup(sim);
    select(sim);
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', GOOD_SPEC);
    sh(sim, 'do evaluator evalset');
    finish(sim, 'evaluator', 'evalset', ALL_SETS);
    reviewer(sim);
    sh(sim, 'do report-agent shadow');
    finish(sim, 'report-agent', 'shadow');
    expect(sim.flags['sh.et13_guess']).toBe(true); // 기본 이월엔 '모르면 확인 필요' 규칙이 없다
    golive(sim);
    expect(sim.flags['golive.go']).toBeUndefined();
    expect(taskStatus(sim, 'review')).not.toBe('done');
    expect(lastSaid(sim, 'jung', 2)).toContain('사고');
  });

  it('신뢰가 낮으면 검토자가 응하지 않고, 걱정을 풀어 주면 응한다', () => {
    const sim = start(67, { ...base, trust: { ...base.trust, park: 55 } });
    setup(sim);
    select(sim);
    sh(sim, 'do assistant spec');
    finish(sim, 'assistant', 'spec', GOOD_SPEC);
    ask(sim, 'park', 'role');
    expect(sim.flags['park.agreed']).toBeUndefined();
    ask(sim, 'park', 'owner', 'role');
    expect(sim.flags['park.agreed']).toBe(true);
  });
});
