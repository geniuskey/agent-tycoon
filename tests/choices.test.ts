import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/engine';
import { agentChoices } from '../src/engine/choices';
import { presence, topicChoices } from '../src/engine/people';
import { evaluate } from '../src/engine/evaluate';
import { getScenario } from '../src/scenarios';
import { lastOutput, lastSaid, runUntil, sh, status, taskStatus, waitReply } from './helpers';

describe('객관식 지시 (do)', () => {
  it('지시는 단일 선택, 조건은 복수 선택으로 적용된다', () => {
    const sim = new Simulation(getScenario('dram-retention')!, 5);
    sh(sim, 'agent spawn analyst');
    const ch = agentChoices(sim, 'analyst')!;
    expect(ch.mode).toBe('instruct');
    if (ch.mode !== 'instruct') return;
    expect(ch.instructions.map((i) => i.id)).toContain('validate');
    expect(ch.modifiers.map((m) => m.id)).toEqual(expect.arrayContaining(['preinstruct-units', 'cautious', 'rush']));
    // 역할과 맞지 않는 지시에는 역량 경고 메모
    expect(ch.instructions.find((i) => i.id === 'write-report')?.note).toContain('역량 부족');
    sh(sim, 'do analyst validate +preinstruct-units +cautious');
    expect(sim.flags['units.preinstructed']).toBe(true);
    expect(sim.flags['cause.cautious']).toBe(true);
    expect(sim.tasks['validate-data'].assignee).toBe('analyst');
    // 작업 중에는 중단/상태 액션만
    expect(agentChoices(sim, 'analyst')!.mode).toBe('busy');
  });

  it('직접 본 화면에 대해서만 버그 지적 선택지가 나타난다 (observed)', () => {
    const sim = new Simulation(getScenario('fab-equipment-dashboard')!, 6);
    for (const r of ['pm', 'data-engineer', 'developer']) sh(sim, `agent spawn ${r}`);
    sh(sim, 'do pm requirements +rule-pre');
    sh(sim, 'do data-engineer pipeline +no-shared +tz-pre');
    runUntil(sim, () => taskStatus(sim, 'requirements') === 'done' && taskStatus(sim, 'pipeline') === 'done');
    sh(sim, 'do developer build');
    runUntil(sim, () => taskStatus(sim, 'build-dashboard') === 'done');
    const ids = () => {
      const ch = agentChoices(sim, 'developer')!;
      return ch.mode === 'instruct' ? ch.instructions.map((i) => i.id) : [];
    };
    expect(ids()).not.toContain('fix-filter');
    sim.observe('page', 'sim://fab/monitor');
    expect(ids()).toContain('fix-filter');
  });
});

describe('Agent 질문 응답 (choose)', () => {
  it('단일 선택 질문에 복수 선택은 거부, 복수 선택은 min/max 검증', () => {
    const sc = getScenario('s3-data-foundation')!;
    const sim = new Simulation(sc, 7, sc.campaign!.defaultCarry);
    sh(sim, 'agent spawn data-engineer');
    sh(sim, 'do data-engineer model');
    runUntil(sim, () => status(sim, 'data-engineer') === 'waiting');
    const g = agentChoices(sim, 'data-engineer')!;
    expect(g.mode === 'gate' && !g.multi).toBe(true);
    sh(sim, 'agent choose data-engineer 1,2');
    expect(lastOutput(sim, 1)).toContain('하나만');
    sh(sim, 'agent choose data-engineer 1');
    runUntil(sim, () => status(sim, 'data-engineer') === 'waiting');
    sh(sim, 'agent choose data-engineer 1');
    runUntil(sim, () => taskStatus(sim, 'model') === 'done');
    sh(sim, 'agent spawn quality');
    sh(sim, 'do quality rules');
    runUntil(sim, () => status(sim, 'quality') === 'waiting');
    const m = agentChoices(sim, 'quality')!;
    expect(m.mode === 'gate' && m.multi).toBe(true);
    sh(sim, 'agent choose quality 1');
    expect(status(sim, 'quality')).toBe('waiting'); // min 2
    sh(sim, 'agent choose quality 1,5');
    runUntil(sim, () => taskStatus(sim, 'rules') === 'done');
    expect(sim.flags['gate.rules.key-integrity']).toBe(true);
    expect(sim.flags['gate.rules.no-null']).toBe(true);
    expect(sim.flags['gate.rules.duplicate']).toBe(false);
    // 고르지 않은 좋은 선택지는 '빠뜨림'으로 피드백
    expect(evaluate(sim).dimensions.some((d) => d.findings.some((f) => f.text.includes('빠뜨렸습니다')))).toBe(true);
  });
});

describe('객관식 대화 (ask)', () => {
  it('선택지는 아직 묻지 않은 질문만, 함정 질문 포함', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 8);
    const before = topicChoices(sim, 'choi').map((t) => t.id);
    expect(before).toEqual(expect.arrayContaining(['tablet', 'blame', 'pain', 'legend']));
    sh(sim, 'ask choi pain');
    waitReply(sim, 'choi');
    expect(topicChoices(sim, 'choi').map((t) => t.id)).not.toContain('pain');
    expect(sim.people['choi'].trust).toBe(45);
    sh(sim, 'ask choi blame');
    waitReply(sim, 'choi');
    expect(sim.people['choi'].trust).toBe(30);
  });

  it('한 번에 너무 많이 물으면 회의에 들어가고, 남은 메시지는 회의 후에 답한다 (인내심)', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 9);
    // 답을 기다리지 않고 질문을 연달아 보낸다
    for (const t of ['process', 'pain', 'other', 'reassure', 'macro', 'rush']) sh(sim, `ask park ${t}`);
    runUntil(sim, () => presence(sim, 'park').status === 'meeting' && !sim.people['park'].pending.length);
    expect(lastSaid(sim, 'park', 1)).toContain('회의 들어가야');
    expect(sim.people['park'].asked).not.toContain('rush');
    // 회의 중에는 읽지 않는다
    sim.advance(10);
    expect(sim.people['park'].inbox.length).toBe(1);
    // 회의가 끝나면 늦게 보고 답한다
    runUntil(sim, () => sim.people['park'].asked.includes('rush'));
    waitReply(sim, 'park');
    expect(lastSaid(sim, 'park', 6)).toContain('늦게 봤네요');
  });

  it('메시지는 바로 답이 오지 않는다 — 읽는 시간과 회의 일정', () => {
    const sim = new Simulation(getScenario('s0-data-discovery')!, 10);
    sh(sim, 'ask choi pain');
    sim.advance(2);
    expect(sim.people['choi'].asked).not.toContain('pain'); // 현장 근무자는 메신저를 늦게 본다
    runUntil(sim, () => sim.people['choi'].asked.includes('pain'));
  });
});

describe('plan mode', () => {
  it('--plan이면 계획만 보여주고 승인 전에는 실행하지 않는다', () => {
    const sim = new Simulation(getScenario('s1-digitization')!, 31);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'do assistant ocr --plan');
    runUntil(sim, () => sim.agents['assistant'].phase === 'plan-approval');
    expect(status(sim, 'assistant')).toBe('waiting');
    const ch = agentChoices(sim, 'assistant')!;
    expect(ch.mode).toBe('confirm');
    sim.advance(20);
    expect(sim.tasks['ocr-checksheet'].stepIndex).toBe(0); // 아직 아무 단계도 실행 안 함
    sh(sim, 'agent choose assistant 1');
    expect(sim.agents['assistant'].planMode).toBe(false);
    runUntil(sim, () => taskStatus(sim, 'ocr-checksheet') === 'done' || status(sim, 'assistant') === 'waiting');
    expect(sim.events.some((e) => e.type === 'plan.resolved' && e.data?.approved)).toBe(true);
  });

  it('계획을 반려하면 작업이 풀리고 다시 지시할 수 있다', () => {
    const sim = new Simulation(getScenario('s1-digitization')!, 32);
    sh(sim, 'agent spawn assistant');
    sh(sim, 'do assistant ocr --plan');
    runUntil(sim, () => sim.agents['assistant'].phase === 'plan-approval');
    sh(sim, 'agent choose assistant 2');
    expect(status(sim, 'assistant')).toBe('idle');
    expect(sim.tasks['ocr-checksheet'].assignee).toBeUndefined();
    sh(sim, 'do assistant ocr');
    runUntil(sim, () => status(sim, 'assistant') === 'working' || status(sim, 'assistant') === 'waiting');
    expect(sim.agents['assistant'].phase).not.toBe('plan-approval');
  });
});
