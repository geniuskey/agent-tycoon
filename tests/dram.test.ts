import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { newSim, runUntil, sh, status, taskStatus, to, lastOutput } from './helpers';

describe('DRAM retention — golden path', () => {
  it('완료까지 진행되고 모든 결과가 성공', () => {
    const sim = newSim('dram-retention');
    sh(sim, 'task graph');
    sh(sim, 'agent spawn analyst');
    sh(sim, 'agent spawn domain-expert');
    sh(sim, 'agent spawn reporter');
    to(sim, 'analyst', '데이터 검증할 때 tester별 단위도 확인해줘');
    to(sim, 'domain-expert', 'lot 공정 이력과 설비 경로를 정리해줘');
    expect(taskStatus(sim, 'validate-data')).not.toBe('ready');
    runUntil(sim, () => sim.tasks['validate-data'].status === 'done' && sim.tasks['map-process-history'].status === 'done');
    expect(sim.flags['units.ok']).toBe(true);
    expect(sim.metrics.parallelTicks).toBeGreaterThan(2);
    expect(sim.files.get('/work/retention_clean.csv')!.content).toContain('ret_time_ms');
    to(sim, 'analyst', '원인은 단정하지 말고 불량 패턴을 분석해줘');
    runUntil(sim, () => sim.tasks['analyze-pattern'].status === 'done', 200);
    expect(sim.flags['cause.claim']).toBe('hypothesis');
    sh(sim, 'open sim://dram/dashboard');
    to(sim, 'domain-expert', '분석 결과의 원인 가설을 교차 검증해줘');
    to(sim, 'reporter', '고객 정보는 제외하고 보고서 초안 작성해');
    runUntil(sim, () => sim.tasks['write-report'].status === 'done' && sim.tasks['cross-validate'].status === 'done', 300);
    // 보고서가 검증보다 먼저 끝났다면 revise 필요
    if (sim.tasks['revise-report'].visible) {
      to(sim, 'reporter', '검증 결과 반영해서 보고서 보완해');
      runUntil(sim, () => sim.tasks['revise-report'].status === 'done', 200);
    }
    sh(sim, 'open sim://dram/report');
    sh(sim, 'cat /work/review/cross_validation.md');
    sh(sim, 'submit');
    expect(sim.submitted).toBe(true);
    const fb = evaluate(sim);
    expect(fb.outcomes.every((o) => o.success)).toBe(true);
    const report = sim.files.get('/work/report/retention_rca_report.md')!.content;
    expect(report).toContain('DEP-02 가설 기각');
    expect(report).not.toContain('CUST-A');
    expect(report).not.toMatch(/\{\{/);
    const sec = fb.dimensions.find((d) => d.id === 'security')!;
    expect(sec.rating).toBe('good');
  });
});

describe('DRAM retention — failure & recovery', () => {
  it('단위 무시 → 교차 검증에서 발견 → 재작업 후 retry로 복구', () => {
    const sim = newSim('dram-retention', 7);
    sh(sim, 'agent spawn analyst');
    sh(sim, 'agent spawn domain-expert');
    sh(sim, 'agent assign analyst validate-data');
    sh(sim, 'agent assign domain-expert map-process-history');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    expect(sim.openGate(sim.agents['analyst'])!.id).toBe('units');
    to(sim, 'analyst', '그대로 진행해');
    expect(sim.flags['gate.units']).toBe('ignore');
    runUntil(sim, () => taskStatus(sim, 'validate-data') === 'done' && taskStatus(sim, 'map-process-history') === 'done');
    to(sim, 'analyst', '불량 패턴 분석해');
    runUntil(sim, () => taskStatus(sim, 'analyze-pattern') === 'done');
    expect(sim.flags['cause.claim']).toBe('lot04');
    to(sim, 'domain-expert', '교차 검증해줘');
    runUntil(sim, () => status(sim, 'domain-expert') === 'failed', 200);
    expect(sim.flags['review.units_issue']).toBe(true);
    expect(taskStatus(sim, 'validate-data')).toBe('ready');
    // 원인 해결 없이 재시도 → 다시 실패
    sh(sim, 'agent retry domain-expert');
    runUntil(sim, () => status(sim, 'domain-expert') === 'failed');
    // 원인 해결
    to(sim, 'analyst', '데이터 검증 다시 해줘');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    to(sim, 'analyst', '2');  // 제외? → index 1 = exclude
    expect(sim.flags['gate.units']).toBe('exclude');
    runUntil(sim, () => taskStatus(sim, 'validate-data') === 'done');
    to(sim, 'analyst', '불량 패턴 분석해');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    to(sim, 'analyst', '가설로 두고 교차 검증 필요하다고 써');
    runUntil(sim, () => taskStatus(sim, 'analyze-pattern') === 'done');
    sh(sim, 'agent retry domain-expert');
    runUntil(sim, () => taskStatus(sim, 'cross-validate') === 'done', 200);
    expect(sim.flags['cause.verified']).toBe(true);
    const fb = evaluate(sim);
    const dup = fb.dimensions.find((d) => d.id === 'duplication')!;
    expect(dup.findings.some((f) => f.text.includes('같은 실패'))).toBe(true);
    expect(lastOutput(sim)).toBeTruthy();
  });

  it('보안 데이터 우회 시 보안 결과 실패', () => {
    const sim = newSim('dram-retention', 3);
    for (const r of ['analyst', 'domain-expert', 'reporter']) sh(sim, `agent spawn ${r}`);
    to(sim, 'analyst', '데이터 품질 검증해');
    to(sim, 'domain-expert', '공정 이력 정리해');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    to(sim, 'analyst', 'ms로 변환해');
    runUntil(sim, () => taskStatus(sim, 'validate-data') === 'done' && taskStatus(sim, 'map-process-history') === 'done');
    to(sim, 'analyst', '불량 패턴 분석해');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    to(sim, 'analyst', 'ETCH-07 CH-B로 확정해');
    runUntil(sim, () => taskStatus(sim, 'analyze-pattern') === 'done');
    to(sim, 'reporter', '보고서 작성해');
    runUntil(sim, () => status(sim, 'reporter') === 'blocked');
    to(sim, 'reporter', '다른 경로로 가져와서 넣어');
    runUntil(sim, () => taskStatus(sim, 'write-report') === 'done');
    sh(sim, 'submit');
    const fb = evaluate(sim);
    const o = Object.fromEntries(fb.outcomes.map((x) => [x.id, x.success]));
    expect(o).toEqual({ cause: true, evidence: false, data: true, security: false });
    expect(fb.dimensions.find((d) => d.id === 'security')!.rating).not.toBe('good');
  });
});
