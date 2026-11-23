import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { newSim, runUntil, sh, status, taskStatus, to } from './helpers';

const outcomes = (sim: ReturnType<typeof newSim>) => Object.fromEntries(evaluate(sim).outcomes.map((o) => [o.id, o.success]));

describe('Fab 설비 대시보드', () => {
  it('사전 지시로 함정을 피하면 필터 버그만 남고, 브라우저 재현 → 수정 → QA → 배포', () => {
    const sim = newSim('fab-equipment-dashboard', 11);
    for (const r of ['pm', 'data-engineer', 'developer', 'qa']) sh(sim, `agent spawn ${r}`);
    to(sim, 'pm', '회의록 참고해서 요구사항 분석해줘');
    to(sim, 'data-engineer', '공용 계정은 쓰지 말고, 시간대 확인해서 센서 데이터 정제해줘');
    runUntil(sim, () => taskStatus(sim, 'requirements') === 'done' && taskStatus(sim, 'pipeline') === 'done');
    expect(sim.flags['rule']).toBe('spc');
    expect(sim.flags['tz.ok']).toBe(true);
    to(sim, 'developer', '명세대로 대시보드 구현해줘');
    runUntil(sim, () => taskStatus(sim, 'build-dashboard') === 'done');
    // 버그 재현 가능한 상태: filter.bound=false
    const dash = JSON.parse(sim.files.get('/app/fab-monitor/dashboard.json')!.content);
    expect(dash.filters[0].bound).toBe(false);
    sim.observe('page', 'sim://fab/monitor');
    to(sim, 'developer', '설비 필터를 바꿔도 차트가 안 바뀌어. 고쳐줘');
    runUntil(sim, () => taskStatus(sim, 'fix-filter') === 'done');
    expect(JSON.parse(sim.files.get('/app/fab-monitor/dashboard.json')!.content).filters[0].bound).toBe(true);
    to(sim, 'qa', '대시보드 기능 테스트해줘');
    runUntil(sim, () => taskStatus(sim, 'qa-test') === 'done');
    expect(sim.flags['qa.passed']).toBe(true);
    to(sim, 'developer', '배포해줘');
    runUntil(sim, () => taskStatus(sim, 'release') === 'done');
    sh(sim, 'open sim://fab/release');
    sh(sim, 'submit');
    expect(Object.values(outcomes(sim)).every(Boolean)).toBe(true);
  });

  it('테스트 누락 → 배포 실패 → QA가 결함 발견 → 수정 → 재테스트 → retry 배포', () => {
    const sim = newSim('fab-equipment-dashboard', 12);
    for (const r of ['pm', 'data-engineer', 'developer', 'qa']) sh(sim, `agent spawn ${r}`);
    to(sim, 'pm', '요구사항 분석해');
    to(sim, 'data-engineer', '센서 데이터 정제해');
    runUntil(sim, () => status(sim, 'pm') === 'waiting' && status(sim, 'data-engineer') === 'blocked');
    to(sim, 'pm', '알아서 판단해');
    to(sim, 'data-engineer', '제공된 export 파일만 사용해');
    runUntil(sim, () => taskStatus(sim, 'requirements') === 'done' && taskStatus(sim, 'pipeline') === 'done');
    expect(sim.flags['rule']).toBe('fixed');
    expect(sim.flags['tz.ok']).toBeFalsy();
    to(sim, 'developer', '대시보드 만들어');
    runUntil(sim, () => taskStatus(sim, 'build-dashboard') === 'done');
    to(sim, 'developer', '배포해');
    runUntil(sim, () => status(sim, 'developer') === 'failed');
    expect(sim.agents['developer'].error).toContain('테스트 누락');
    to(sim, 'qa', '테스트해');
    runUntil(sim, () => taskStatus(sim, 'qa-test') === 'done');
    expect(sim.flags['qa.passed']).toBe(false);
    for (const t of ['fix-filter', 'fix-timezone', 'fix-rule']) expect(sim.tasks[t].visible, t).toBe(true);
    sh(sim, 'agent assign developer fix-filter');
    to(sim, 'data-engineer', 'ETCH 시각이 9시간 어긋나. KST로 변환해줘');
    runUntil(sim, () => taskStatus(sim, 'fix-filter') === 'done' && taskStatus(sim, 'fix-timezone') === 'done');
    to(sim, 'developer', '알람 기준을 회의 결론대로 3σ로 바꿔줘');
    runUntil(sim, () => taskStatus(sim, 'fix-rule') === 'done');
    to(sim, 'qa', '다시 테스트해');
    runUntil(sim, () => taskStatus(sim, 'qa-test') === 'done' && sim.flags['qa.passed'] === true);
    to(sim, 'developer', '배포해');
    runUntil(sim, () => taskStatus(sim, 'release') === 'done');
    sh(sim, 'submit');
    const o = outcomes(sim);
    expect(o).toMatchObject({ released: true, rule: true, timezone: true, filter: true, security: true });
    const fb = evaluate(sim);
    expect(fb.dimensions.find((d) => d.id === 'decomposition')!.findings.some((f) => f.kind === 'issue' && f.text.includes('알람 기준'))).toBe(true);
  });

  it('공용 계정 사용 시 보안 결과 실패', () => {
    const sim = newSim('fab-equipment-dashboard', 13);
    sh(sim, 'agent spawn data-engineer');
    to(sim, 'data-engineer', '센서 데이터 정제해');
    runUntil(sim, () => status(sim, 'data-engineer') === 'blocked');
    to(sim, 'data-engineer', '공용 계정으로 접속해');
    expect(sim.flags['security.shared_account']).toBe(true);
    sh(sim, 'submit --force');
    expect(outcomes(sim).security).toBe(false);
  });
});
