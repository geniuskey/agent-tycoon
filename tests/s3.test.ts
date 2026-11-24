import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { evaluate } from '../src/engine/evaluate';
import type { CarryState } from '../src/engine/types';
import { getScenario } from '../src/scenarios';
import { runUntil, sh, taskStatus, waitReply } from './helpers';

const scenario = getScenario('s3-data-foundation')!;
const base = scenario.campaign!.defaultCarry!;
const start = (seed = 1, carry: CarryState = base) => new Simulation(scenario, seed, carry);

function ask(sim: Simulation, person: string, ...topics: string[]) {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
}
const gateOf = (sim: Simulation, a: string) => sim.agents[a]?.gate?.gateId;
/** Agent가 gate에서 멈추면 고르고, 업무가 끝날 때까지 진행 */
function finish(sim: Simulation, agent: string, task: string, answers: Record<string, string> = {}) {
  for (let guard = 0; guard < 10 && taskStatus(sim, task) !== 'done'; guard++) {
    runUntil(sim, () => taskStatus(sim, task) === 'done' || !!gateOf(sim, agent) || sim.agents[agent].status === 'failed', 600);
    const g = gateOf(sim, agent);
    if (g) {
      if (!answers[g]) throw new Error(`unexpected gate ${g}`);
      sh(sim, `agent choose ${agent} ${answers[g]}`);
    } else if (sim.agents[agent].status === 'failed') return;
  }
}

function setup(sim: Simulation) {
  for (const r of ['data-engineer', 'quality']) sh(sim, `agent spawn ${r}`);
  sh(sim, 'do data-engineer model');
  finish(sim, 'data-engineer', 'model', { grain: '1', keys: '1' });
}

const GOOD_RULES = { rules: '1,2,4' };

describe('3단계 데이터 기반', () => {
  it('병렬 구축 → 적재 → 최소 권한: 모든 결과 달성', () => {
    const sim = start(21);
    sh(sim, 'agent spawn data-engineer');
    sh(sim, 'do data-engineer model');
    finish(sim, 'data-engineer', 'model', { grain: '1', keys: '1' });
    sh(sim, 'agent spawn quality');
    // 파이프라인과 품질 규칙은 동시에
    sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
    sh(sim, 'do quality rules');
    finish(sim, 'quality', 'rules', GOOD_RULES);
    finish(sim, 'data-engineer', 'pipeline');
    expect(sim.metrics.parallelTicks).toBeGreaterThan(0);
    sh(sim, 'do data-engineer load');
    finish(sim, 'data-engineer', 'load');
    expect(sim.flags['mart.checks_pass']).toBe(true);
    expect(sim.files.get('/db/console.db')!.content).toContain('table|mart.equipment_event|mart|1,240');
    sim.observe('page', 'sim://db');
    sh(sim, 'do data-engineer access +min-pre');
    finish(sim, 'data-engineer', 'access');
    expect(sim.files.get('/wiki/data/mart.md')!.content).not.toContain('W-01');
    expect(sim.files.has('/wiki/data/quality.md')).toBe(true);
    sh(sim, 'submit');
    const fb = evaluate(sim);
    expect(fb.outcomes.filter((o) => !o.success).map((o) => o.id)).toEqual([]);
  });

  it('2단계 실수(자동 매칭·시각 덮어쓰기·별칭 미합의)가 첫 적재에서 터지고, 오너 확인으로 고친다', () => {
    const carry: CarryState = { ...base, flags: { ...base.flags, 'agenda.equip-id': false, 'match.auto': true, 'match.fixed': false, 'time.overwrite': true } };
    const sim = start(22, carry);
    setup(sim);
    sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
    sh(sim, 'do quality rules');
    finish(sim, 'quality', 'rules', GOOD_RULES);
    finish(sim, 'data-engineer', 'pipeline');
    sh(sim, 'do data-engineer load');
    finish(sim, 'data-engineer', 'load', { 'load-review': '1' });
    expect(sim.flags['load.join_fail']).toBe(true);
    expect(sim.flags['detect.wrong_line']).toBe(true);
    expect(sim.flags['detect.dup']).toBe(true);
    expect(sim.files.get('/db/console.db')!.content).toContain('quarantine|mart.equipment_event|412');
    // 오너 확인 없이 재적재 → 실패
    sh(sim, 'do data-engineer fix-load');
    finish(sim, 'data-engineer', 'fix-load');
    expect(sim.agents['data-engineer'].status).toBe('failed');
    ask(sim, 'oh', 'alias-again', 'line-check');
    ask(sim, 'seo', 'dup-check');
    sh(sim, 'agent retry data-engineer');
    runUntil(sim, () => taskStatus(sim, 'fix-load') === 'done');
    expect(sim.flags['mart.clean']).toBe(true);
    expect(sim.flags['mart.checks_pass']).toBe(true);
  });

  it('키 무결성 규칙이 없으면 오연결이 조용히 마트에 남는다', () => {
    const carry: CarryState = { ...base, flags: { ...base.flags, 'match.auto': true, 'match.fixed': false } };
    const sim = start(23, carry);
    setup(sim);
    sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
    sh(sim, 'do quality rules');
    finish(sim, 'quality', 'rules', { rules: '2,4' });
    finish(sim, 'data-engineer', 'pipeline');
    sh(sim, 'do data-engineer load');
    finish(sim, 'data-engineer', 'load');
    expect(sim.flags['mart.checks_pass']).toBe(true); // 검사는 통과하지만
    expect(sim.flags['mart.clean']).toBe(false); // 데이터는 틀렸다
    const issues = evaluate(sim).dimensions.flatMap((d) => d.findings).map((f) => f.text);
    expect(issues.some((t) => t.includes('키 무결성 규칙이 없어'))).toBe(true);
  });

  it('운영 DB 직접 조회는 차단되고, export로 바꿔 재시도한다', () => {
    const sim = start(24);
    setup(sim);
    sh(sim, 'do data-engineer pipeline');
    finish(sim, 'data-engineer', 'pipeline', { source: '2', 'fail-mode': '1' });
    expect(sim.agents['data-engineer'].status).toBe('failed');
    sh(sim, 'do data-engineer export-fix');
    expect(sim.flags['pipe.export']).toBe(true);
    sh(sim, 'agent retry data-engineer');
    finish(sim, 'data-engineer', 'pipeline', { 'fail-mode': '1' });
    expect(taskStatus(sim, 'pipeline')).toBe('done');
  });

  it('결측 0% 규칙은 정직한 표시를 버리고, 규칙을 고쳐 재적재한다', () => {
    const sim = start(25);
    setup(sim);
    sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
    sh(sim, 'do quality rules');
    finish(sim, 'quality', 'rules', { rules: '1,2,5' });
    finish(sim, 'data-engineer', 'pipeline');
    sh(sim, 'do data-engineer load');
    finish(sim, 'data-engineer', 'load', { 'load-review': '1' });
    expect(sim.flags['load.dropped_uncertain']).toBe(true);
    sh(sim, 'do quality allow-fix');
    sh(sim, 'do data-engineer fix-load');
    finish(sim, 'data-engineer', 'fix-load');
    expect(sim.flags['mart.checks_pass']).toBe(true);
  });

  it('AI에게 전체 권한을 주면 권한 결과가 실패하고 보안 평가에 남는다', () => {
    const sim = start(26);
    setup(sim);
    sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
    sh(sim, 'do quality rules');
    finish(sim, 'quality', 'rules', GOOD_RULES);
    finish(sim, 'data-engineer', 'pipeline');
    sh(sim, 'do data-engineer load');
    finish(sim, 'data-engineer', 'load');
    sh(sim, 'do data-engineer access');
    finish(sim, 'data-engineer', 'access', { 'ai-grant': '2' });
    expect(taskStatus(sim, 'access')).toBe('done');
    const fb = evaluate(sim);
    expect(fb.outcomes.find((o) => o.id === 'access')!.success).toBe(false);
    expect(fb.dimensions.find((d) => d.id === 'security')!.findings.some((f) => f.kind === 'issue')).toBe(true);
  });
});
