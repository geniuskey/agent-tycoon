import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { carriedTrust, exportCarry, replay, Simulation } from '../src/engine/engine';
import { getScenario, missionsOf } from '../src/scenarios';
import { lastSaid, runUntil, sh, status, talk, taskStatus, to, trust } from './helpers';

const outcomes = (sim: Simulation) => Object.fromEntries(evaluate(sim).outcomes.map((o) => [o.id, o.success]));

function playS0Good(seed = 21) {
  const sim = new Simulation(getScenario('s0-data-discovery')!, seed);
  sh(sim, 'talk jung');
  talk(sim, 'jung', '이번 과제에서 기대하시는 결과가 뭔가요?');
  talk(sim, 'jung', '누구를 만나보면 될까요?');
  talk(sim, 'park', '주간보고는 어떻게 만드세요?');
  talk(sim, 'park', '가장 시간이 많이 드는 부분이 뭐예요?');
  talk(sim, 'park', '반복 작업을 줄여서 분석에 집중하실 수 있게 하려는 거예요');
  talk(sim, 'park', '그 외에 참고하는 자료가 또 있나요?');
  talk(sim, 'park', '선임님 엑셀에서 따로 처리하는 규칙이 있나요?');
  talk(sim, 'lee', '불량분류표 엑셀은 어떻게 관리돼요?');
  talk(sim, 'lee', '개정 전 D07 데이터는 어떻게 다뤄야 하나요?');
  talk(sim, 'choi', '현장에서 기록할 때 불편한 점이 있으세요?');
  talk(sim, 'choi', '현장 기록 방식은 그대로 두고 부담을 늘리지 않을게요');
  talk(sim, 'choi', '체크시트에 쓰는 기호나 약어가 있나요?');
  talk(sim, 'choi', '점검 기록은 보통 언제 적으세요?');
  talk(sim, 'han', 'MES 데이터를 가져다 쓰려면 어떤 절차가 필요해요?');
  talk(sim, 'han', '체크시트에 작업자 이름이 있으면 개인정보 어떻게 해야 하나요?');
  sh(sim, 'agent spawn assistant');
  to(sim, 'assistant', '인터뷰 내용으로 데이터 인벤토리 정리해줘');
  runUntil(sim, () => taskStatus(sim, 'inventory') === 'done');
  to(sim, 'assistant', '인벤토리 바탕으로 디지털화 계획 세워줘');
  runUntil(sim, () => status(sim, 'assistant') === 'waiting');
  to(sim, 'assistant', '수작업이 가장 많은 체크시트부터, 현장 양식은 유지');
  runUntil(sim, () => status(sim, 'assistant') === 'waiting');
  sh(sim, 'agent choose assistant 1,2,3,4');
  runUntil(sim, () => taskStatus(sim, 'prioritize') === 'done');
  talk(sim, 'jung', '계획 검토 부탁드립니다');
  sh(sim, 'open sim://work/plan');
  return sim;
}

describe('캠페인 구성', () => {
  it('0·1단계 미션과 7단계 자유 플레이가 연결된다', () => {
    expect(missionsOf('fab-yield-ai', 0).map((s) => s.id)).toEqual(['s0-data-discovery']);
    expect(missionsOf('fab-yield-ai', 1).map((s) => s.id)).toEqual(['s1-digitization']);
    expect(missionsOf('fab-yield-ai', 7).map((s) => s.id)).toContain('dram-retention');
  });
});

describe('0단계 · 현황 파악', () => {
  it('신뢰를 쌓는 인터뷰 → 인벤토리 → 계획 승인 → 모든 결과 성공', () => {
    const sim = playS0Good();
    expect(sim.flags['found.macro']).toBe(true);
    expect(sim.files.has('/shared/report/macro_rules.md')).toBe(true);
    expect(sim.flags['plan.approved']).toBe(true);
    const inv = sim.files.get('/work/inventory.md')!.content;
    expect(inv).toContain('사후 일괄 기록');
    expect(inv).not.toContain('{{');
    sh(sim, 'submit');
    expect(Object.values(outcomes(sim)).every(Boolean)).toBe(true);
    const collab = evaluate(sim).dimensions.find((d) => d.id === 'collaboration')!;
    expect(collab.rating).toBe('good');
  });

  it('신뢰가 낮으면 숨은 정보를 털어놓지 않는다 (minTrust)', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 22);
    talk(sim, 'park', '엑셀에서 따로 처리하는 규칙 있어요?');
    expect(sim.flags['found.macro']).toBeUndefined();
    expect(lastSaid(sim, 'park')).toContain('별거 없어요');
    talk(sim, 'choi', '태블릿으로 직접 입력해 주세요');
    expect(trust(sim, 'choi')).toBe(15);
    talk(sim, 'choi', '기호 뜻이 뭐예요?');
    expect(sim.flags['found.legend']).toBeUndefined();
  });

  it('무례한 요청은 신뢰를 깎고, 알 수 없는 질문은 성공 처리하지 않는다', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 23);
    talk(sim, 'park', '자료 당장 내놔요');
    expect(trust(sim, 'park')).toBe(30);
    talk(sim, 'park', '오늘 점심 뭐 먹어요?');
    expect(sim.metrics.unrecognized).toBe(1);
    expect(lastSaid(sim, 'park', 2)).toContain('질문 예');
  });

  it('보안 검토 없이 계획 승인 요청 → 보류, 빅뱅 계획 → 반려 후 재작업', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 24);
    talk(sim, 'park', '주간보고는 어떻게 만드세요?');
    sh(sim, 'agent spawn assistant');
    to(sim, 'assistant', '인벤토리 정리해');
    runUntil(sim, () => taskStatus(sim, 'inventory') === 'done');
    to(sim, 'assistant', '계획 세워');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', '3');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    sh(sim, 'agent choose assistant 1,2');
    runUntil(sim, () => taskStatus(sim, 'prioritize') === 'done');
    talk(sim, 'jung', '계획 검토해 주세요');
    expect(sim.tasks['prioritize'].status).not.toBe('done');
    expect(sim.flags['plan.approved']).toBeUndefined();
    to(sim, 'assistant', '계획 다시 세워');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', '1');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    sh(sim, 'agent choose assistant 1,2');
    runUntil(sim, () => taskStatus(sim, 'prioritize') === 'done');
    talk(sim, 'jung', '계획 검토해 주세요');
    expect(lastSaid(sim, 'jung', 2)).toContain('보안');
    talk(sim, 'han', '반출 승인 절차가 어떻게 돼요?');
    talk(sim, 'han', '개인정보 마스킹은요?');
    talk(sim, 'jung', '다시 계획 검토 부탁드려요');
    expect(sim.flags['plan.approved']).toBe(true);
  });
});

describe('0 → 1단계 이월', () => {
  it('0단계의 발견·신뢰가 1단계 시작 상태가 된다', () => {
    const s0 = playS0Good(31);
    sh(s0, 'submit');
    const carry = exportCarry(s0);
    expect(carry.flags['found.legend']).toBe(true);
    expect(carry.trust['choi']).toBeGreaterThanOrEqual(50);
    expect(carry.files['/work/inventory.md']).toBeTruthy();
    const s1 = new Simulation(getScenario('s1-digitization')!, 32, carry);
    // 쌓은 신뢰는 절반만 이어진다
    expect(s1.people['choi'].trust).toBe(carriedTrust(s1.personDef('choi')!.trust, carry.trust['choi']));
    expect(s1.people['choi'].trust).toBeLessThan(carry.trust['choi']);
    expect(s1.files.get('/work/inventory.md')?.createdBy).toBe('carry');
    // 재생도 이월 상태로 결정적
    sh(s1, 'agent spawn assistant');
    s1.advance(5);
    const r = replay(s1.scenario, s1.seed, s1.commands, s1.tick, carry);
    expect(r.events.length).toBe(s1.events.length);
  });

  it('이월된 기호 규칙 덕에 OCR이 X=NG·취소선을 바로 해석한다', () => {
    const s0 = playS0Good(33);
    const s1 = new Simulation(getScenario('s1-digitization')!, 34, exportCarry(s0));
    sh(s1, 'agent spawn assistant');
    to(s1, 'assistant', '작업자 사번은 가명 처리하고 체크시트 디지털화해줘');
    runUntil(s1, () => status(s1, 'assistant') === 'waiting');
    expect(s1.flags['ocr.legend']).toBe(true);
    expect(s1.flags['ocr.crossout']).toBe(true);
    talk(s1, 'choi', '번져서 안 읽히는 칸 몇 개만 확인해 주실 수 있어요?');
    expect(s1.flags['ocr.confirmed']).toBe(true);
    to(s1, 'assistant', '빈값으로 두고 표시해');
    runUntil(s1, () => taskStatus(s1, 'ocr-checksheet') === 'done');
    const csv = s1.files.get('/work/digitized/checksheet_W46.csv')!.content;
    expect(csv).toContain('14,NG,W-02');
    expect(csv).toContain(',174,');
    expect(csv).not.toContain('김민수');
  });
});

describe('1단계 · 디지털화 (기본 이월 상태, 실패와 복구)', () => {
  it('기호 오해석 → 검증 → 현장 미확인으로 수정 실패 → 반장에게 확인 → retry → 게시', () => {
    const sc = getScenario('s1-digitization')!;
    const sim = new Simulation(sc, 41, sc.campaign!.defaultCarry);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'agent spawn assistant');
    to(sim, 'assistant', '체크시트 스캔본 디지털화해줘');
    to(sim, 'assistant-2', '불량분류표 엑셀을 하나의 표로 통합해줘');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting' && status(sim, 'assistant-2') === 'waiting');
    expect(sim.flags['ocr.legend']).toBeUndefined();
    to(sim, 'assistant', '앞뒤 값으로 추정해서 채워');
    to(sim, 'assistant-2', 'W46 비율로 나눠서 추정');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', '가명 ID로');
    runUntil(sim, () => taskStatus(sim, 'ocr-checksheet') === 'done' && taskStatus(sim, 'normalize-defects') === 'done');
    expect(sim.files.get('/work/digitized/checksheet_W46.csv')!.content).toContain('14,OK');
    to(sim, 'assistant', '디지털화 결과를 원본과 대조해서 검증해줘');
    runUntil(sim, () => taskStatus(sim, 'verify') === 'done');
    expect(sim.flags['verify.clean']).toBe(false);
    expect(sim.tasks['fix-digitized'].visible).toBe(true);
    sh(sim, 'agent assign assistant fix-digitized');
    runUntil(sim, () => status(sim, 'assistant') === 'failed');
    expect(sim.agents['assistant'].error).toContain('기호');
    // 현장 신뢰 쌓고 기호 확인
    talk(sim, 'choi', '현장 기록 방식은 그대로 두고 부담을 늘리지 않을게요');
    talk(sim, 'choi', '체크시트의 X는 무슨 뜻이에요?');
    expect(sim.flags['found.legend']).toBe(true);
    sh(sim, 'agent retry assistant');
    runUntil(sim, () => status(sim, 'assistant') === 'failed' || taskStatus(sim, 'fix-digitized') === 'done');
    // 코드 매핑 기준이 없어 다시 실패
    expect(sim.agents['assistant'].error).toContain('D07');
    talk(sim, 'lee', '개정 전 D07 데이터는 어떻게 다뤄야 하나요?');
    sh(sim, 'agent retry assistant');
    runUntil(sim, () => taskStatus(sim, 'fix-digitized') === 'done');
    const csv = sim.files.get('/work/digitized/checksheet_W46.csv')!.content;
    expect(csv).toContain('14,NG');
    expect(csv).toContain('7,NG'.replace('7,NG', '173,7,NG'));
    expect(csv).toContain('LOW_CONFIDENCE');
    to(sim, 'assistant', '공용 저장소에 게시해줘');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    sh(sim, 'agent choose assistant 1,2,3,4');
    runUntil(sim, () => taskStatus(sim, 'publish') === 'done');
    sh(sim, 'open sim://data/note');
    sh(sim, 'submit');
    expect(outcomes(sim)).toEqual({ published: true, accuracy: true, honest: true, codes: true, pii: true, field: true, note: true });
  });

  it('개인정보를 그대로 두면 공용 저장소 DLP가 막는다', () => {
    const sc = getScenario('s1-digitization')!;
    const sim = new Simulation(sc, 42, sc.campaign!.defaultCarry);
    sh(sim, 'agent spawn assistant');
    to(sim, 'assistant', '체크시트 디지털화해');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', '빈값으로 표시');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', '원본 그대로 유지');
    runUntil(sim, () => taskStatus(sim, 'ocr-checksheet') === 'done');
    to(sim, 'assistant', '불량분류표 통합해');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    to(sim, 'assistant', 'legacy로 유지');
    runUntil(sim, () => taskStatus(sim, 'normalize-defects') === 'done');
    to(sim, 'assistant', '게시해');
    runUntil(sim, () => status(sim, 'assistant') === 'blocked');
    to(sim, 'assistant', '가명으로 바꿔');
    runUntil(sim, () => status(sim, 'assistant') === 'waiting');
    sh(sim, 'agent choose assistant 1,6');
    runUntil(sim, () => taskStatus(sim, 'publish') === 'done');
    expect(outcomes(sim).note).toBe(false);
    expect(sim.files.get('/data/curated/checksheet_L2_W46.csv')!.content).not.toContain('22103');
  });
});
