import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { evaluate } from '../src/engine/evaluate';
import type { CarryState } from '../src/engine/types';
import { getScenario } from '../src/scenarios';
import { lastSaid, runUntil, sh, taskStatus, waitReply } from './helpers';

const scenario = getScenario('s4-knowledge')!;
const base = scenario.campaign!.defaultCarry!;
const start = (seed = 1, carry: CarryState = base) => new Simulation(scenario, seed, carry);

function ask(sim: Simulation, person: string, ...topics: string[]) {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
}
const gateOf = (sim: Simulation, a: string) => sim.agents[a]?.gate?.gateId;
function finish(sim: Simulation, agent: string, task: string, answers: Record<string, string> = {}) {
  for (let guard = 0; guard < 10; guard++) {
    runUntil(sim, () => taskStatus(sim, task) === 'done' || !!gateOf(sim, agent), 600);
    const g = gateOf(sim, agent);
    if (!g) return;
    if (!answers[g]) throw new Error(`unexpected gate ${g}`);
    sh(sim, `agent choose ${agent} ${answers[g]}`);
  }
}
const ALL_GOOD = '1,2,3,4,5,6,7';

function interviews(sim: Simulation) {
  ask(sim, 'park', 'worry', 'reassure', 'macro');
  ask(sim, 'choi', 'backfill');
  ask(sim, 'lee', 'heuristic', 'guide');
}

describe('4단계 지식화', () => {
  it('인터뷰 → 나눈 구조 → 시험 통과 → 배포', () => {
    const sim = start(31);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'agent spawn evaluator');
    sh(sim, 'do assistant inventory +curated-pre');
    interviews(sim);
    expect(taskStatus(sim, 'interview')).toBe('done');
    finish(sim, 'assistant', 'inventory');
    sh(sim, 'do assistant draft +layered-pre');
    finish(sim, 'assistant', 'draft', { content: ALL_GOOD });
    expect(sim.files.has('/knowledge/skills/weekly-report/SKILL.md')).toBe(true);
    expect(sim.files.get('/knowledge/skills/weekly-report/SKILL.md')!.content).toContain('테스트 웨이퍼');
    sh(sim, 'do evaluator eval');
    finish(sim, 'evaluator', 'eval');
    expect(sim.flags['eval.pass_all']).toBe(true);
    expect(sim.files.get('/work/knowledge/eval.txt')!.content.match(/\|pass\|/g)?.length).toBe(8);
    sh(sim, 'do assistant publish');
    finish(sim, 'assistant', 'publish');
    expect(sim.files.get('/knowledge/AGENTS.md')!.content).toContain('검토 주기');
    sh(sim, 'submit');
    expect(evaluate(sim).outcomes.filter((o) => !o.success).map((o) => o.id)).toEqual([]);
  });

  it('전부 넣고 추측으로 채우면 시험에서 틀리고, 원인을 고쳐 재시험하면 통과한다', () => {
    const sim = start(32);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'agent spawn evaluator');
    sh(sim, 'do assistant inventory');
    finish(sim, 'assistant', 'inventory', { sources: '2' }); // 312건 전부
    sh(sim, 'do assistant draft');
    finish(sim, 'assistant', 'draft', { structure: '2', content: ALL_GOOD }); // 한 파일에 몰아넣기, 인터뷰 없이
    expect(sim.flags['pack.macro_guess']).toBe(true);
    sh(sim, 'do evaluator eval');
    finish(sim, 'evaluator', 'eval');
    const fails = (n: number) => sim.flags[`eval.q${n}`] === false;
    expect([1, 2, 3, 4, 5, 6, 7].every(fails)).toBe(true); // 충돌·묻힘·추측·인사 메모
    expect(sim.flags['eval.q8']).toBe(true);
    expect(sim.files.get('/work/knowledge/eval.txt')!.content).toContain('반대로 답함');

    // 원인별로 고친다: 인터뷰 → 구조 변경 → 구 문서·회의록 제외
    interviews(sim);
    sh(sim, 'do assistant inventory +curated-pre');
    finish(sim, 'assistant', 'inventory');
    expect(sim.flags['src.all']).toBe(false); // 다시 조사하면 이전 선택을 덮어쓴다
    sh(sim, 'do assistant draft +layered-pre');
    finish(sim, 'assistant', 'draft', { content: ALL_GOOD });
    sh(sim, 'do evaluator eval');
    finish(sim, 'evaluator', 'eval');
    expect(sim.flags['eval.pass_all']).toBe(true);
  });

  it('박서준 선임은 걱정을 풀어 주기 전에는 숨은 규칙을 말하지 않는다', () => {
    const sim = start(33);
    ask(sim, 'park', 'macro');
    expect(sim.flags['know.macro']).toBeUndefined();
    expect(lastSaid(sim, 'park', 1)).toContain('별거 없어요');
  });

  it('시험에 실패한 채 배포하면 평가에 남는다', () => {
    const sim = start(34);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'agent spawn evaluator');
    sh(sim, 'do assistant inventory +curated-pre');
    finish(sim, 'assistant', 'inventory');
    sh(sim, 'do assistant draft +layered-pre');
    finish(sim, 'assistant', 'draft', { content: '1,2,3,7' });
    sh(sim, 'do evaluator eval');
    finish(sim, 'evaluator', 'eval');
    expect(sim.flags['eval.pass_all']).toBe(false);
    sh(sim, 'do assistant publish');
    finish(sim, 'assistant', 'publish');
    expect(sim.flags['pub.with_fail']).toBe(true);
    expect(evaluate(sim).dimensions.flatMap((d) => d.findings).some((f) => f.text.includes('실패한 문항이 남은'))).toBe(true);
  });

  it('0단계에서 들은 규칙은 인터뷰 기록으로 이어진다', () => {
    const carry: CarryState = { ...base, flags: { ...base.flags, 'found.macro': true, 'found.backfill': true } };
    const sim = start(35, carry);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'do assistant inventory +curated-pre');
    finish(sim, 'assistant', 'inventory');
    expect(sim.flags['know.macro']).toBe(true);
    expect(sim.flags['know.backfill']).toBe(true);
  });
});
