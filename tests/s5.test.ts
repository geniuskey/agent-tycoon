import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { evaluate } from '../src/engine/evaluate';
import { agentChoices } from '../src/engine/choices';
import type { CarryState } from '../src/engine/types';
import { getScenario } from '../src/scenarios';
import { runUntil, sh, taskStatus, waitReply } from './helpers';

const scenario = getScenario('s5-single-agent')!;
const base = scenario.campaign!.defaultCarry!;
const start = (seed = 1, carry: CarryState = base) => new Simulation(scenario, seed, carry);
const A = 'report-agent';

function ask(sim: Simulation, person: string, ...topics: string[]) {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
}
function finish(sim: Simulation, task: string, answers: Record<string, string> = {}) {
  for (let guard = 0; guard < 10; guard++) {
    runUntil(sim, () => taskStatus(sim, task) === 'done' || !!sim.agents[A].gate || sim.agents[A].phase === 'plan-approval', 600);
    if (sim.agents[A].phase === 'plan-approval') {
      sh(sim, `agent choose ${A} 1`);
      continue;
    }
    const g = sim.agents[A].gate?.gateId;
    if (!g) return;
    if (!answers[g]) throw new Error(`unexpected gate ${g}`);
    sh(sim, `agent choose ${A} ${answers[g]}`);
  }
}
const BRIEF = '+b-skill +b-unknown +b-cite +b-hypo +b-draft';
const modIds = (sim: Simulation) => {
  const ch = agentChoices(sim, A);
  return ch?.mode === 'instruct' ? ch.modifiers.map((m) => m.id) : [];
};

describe('5단계 단일 Agent', () => {
  it('좋은 브리프 → 검토·수정 → 지식 반영 → W52 깨끗 → 운영 루프', () => {
    const sim = start(41);
    sh(sim, `agent spawn ${A}`);
    sh(sim, `do ${A} w51 ${BRIEF} --plan`);
    finish(sim, 'w51');
    expect(sim.flags['plan.w51']).toBe(true);
    expect(sim.flags['w51.flag.et12']).toBe(true); // 추측 대신 '확인 필요'
    expect(sim.flags['w51.issue.et12']).toBe(false);
    expect(sim.flags['w51.clean']).toBe(true);
    // 검토: 화면을 열기 전에는 수정 선택지가 없다
    expect(modIds(sim)).not.toContain('fix-w51-et12');
    sim.observe('page', 'sim://reports/w51');
    sim.observe('page', 'sim://mart/yield');
    ask(sim, 'oh', 'et12');
    expect(modIds(sim)).toContain('fix-w51-et12');
    sh(sim, `do ${A} revise-w51 +fix-w51-et12`);
    finish(sim, 'revise-w51');
    expect(sim.files.get('/reports/weekly_W51.md')!.content).toContain('ETCH-12');
    expect(taskStatus(sim, 'review-w51')).toBe('done');
    sh(sim, `do ${A} kb-update`);
    finish(sim, 'kb-update');
    expect(sim.files.get('/knowledge/AGENTS.md')!.content).toContain('EQ-N2-ET12 = ETCH-12');
    sh(sim, `do ${A} publish-w51`);
    finish(sim, 'publish-w51');
    // W52: 브리프 없이도 지식에 반영된 것은 지켜진다
    sh(sim, `do ${A} w52 +b-draft`);
    finish(sim, 'w52');
    expect(sim.flags['w52.ok.et12']).toBe(true);
    expect(sim.flags['w52.issue.cause']).toBe(false); // kb.hypo_rule
    expect(sim.flags['w52.recur']).toBeFalsy();
    sim.observe('page', 'sim://reports/w52');
    sh(sim, `do ${A} publish-w52`);
    finish(sim, 'publish-w52');
    ask(sim, 'jung', 'op-loop');
    expect(taskStatus(sim, 'operate')).toBe('done');
    sh(sim, 'submit');
    expect(evaluate(sim).outcomes.filter((o) => !o.success).map((o) => o.id)).toEqual([]);
  });

  it('보고서만 고치고 지식에 반영하지 않으면 W52에 같은 오류가 다시 나온다', () => {
    const sim = start(42);
    sh(sim, `agent spawn ${A}`);
    sh(sim, `do ${A} w51 +b-skill +b-draft`); // '확인 필요'·'가설' 조건 없음
    finish(sim, 'w51');
    expect(sim.flags['w51.issue.et12']).toBe(true); // ET12를 추측 매핑
    expect(sim.flags['w51.issue.cause']).toBe(true); // 원인 단정
    expect(sim.files.get('/reports/weekly_W51.md')!.content).toContain('ETCH-01 (EQ-N2-ET01) 파티클 상승');
    sim.observe('page', 'sim://reports/w51');
    ask(sim, 'oh', 'et12');
    ask(sim, 'lee', 'cause');
    sh(sim, `do ${A} revise-w51 +fix-w51-et12 +fix-w51-cause`);
    finish(sim, 'revise-w51');
    expect(sim.flags['w51.clean']).toBe(true);
    sh(sim, `do ${A} publish-w51`);
    finish(sim, 'publish-w51');
    sh(sim, `do ${A} w52 +b-skill +b-draft`);
    finish(sim, 'w52');
    expect(sim.flags['w52.issue.et12']).toBe(true);
    expect(sim.flags['w52.recur']).toBe(true);
    const fb = evaluate(sim);
    expect(fb.dimensions.flatMap((d) => d.findings).some((f) => f.text.includes('W52에 다시'))).toBe(true);
  });

  it('검토 전 게시 요청을 승인하면 틀린 초안이 팀에 퍼진다', () => {
    const sim = start(43);
    sh(sim, `agent spawn ${A}`);
    sh(sim, `do ${A} w51 +b-skill`);
    finish(sim, 'w51', { 'post-w51': '2' });
    expect(sim.flags['w51.posted_unreviewed']).toBe(true);
    expect(sim.people['jung'].trust).toBeLessThan(65);
  });

  it('4단계 시험에서 놓친 문항은 보고서 오류로 나타나고, 마트와 대조해야 잡힌다', () => {
    const carry: CarryState = { ...base, flags: { ...base.flags, 'eval.q4': false, 'eval.q7': false, 'eval.pass_all': false } };
    const sim = start(44, carry);
    sh(sim, `agent spawn ${A}`);
    sh(sim, `do ${A} w51 ${BRIEF}`);
    finish(sim, 'w51');
    expect(sim.flags['w51.issue.yield']).toBe(true);
    expect(sim.flags['w51.issue.hr']).toBe(true);
    sim.observe('page', 'sim://reports/w51');
    expect(modIds(sim)).toContain('fix-w51-hr');
    expect(modIds(sim)).not.toContain('fix-w51-yield'); // 마트와 대조하기 전에는 모른다
    sim.observe('page', 'sim://mart/yield');
    expect(modIds(sim)).toContain('fix-w51-yield');
  });
});
