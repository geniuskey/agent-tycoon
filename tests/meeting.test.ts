import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { newSim, runUntil, sh, status, taskStatus, to } from './helpers';

const outcomes = (sim: ReturnType<typeof newSim>) => Object.fromEntries(evaluate(sim).outcomes.map((o) => [o.id, o.success]));

describe('회의 요약', () => {
  it('병렬 위임 + 검토 + 정정 + 내부 발송 → 모든 결과 성공', () => {
    const sim = newSim('meeting-summary', 5);
    for (const r of ['scribe', 'pm', 'reviewer']) sh(sim, `agent spawn ${r}`);
    to(sim, 'scribe', '대외비 내용은 빼고 회의록 요약해줘');
    to(sim, 'pm', '녹취록에서 Action Item 정리해줘');
    runUntil(sim, () => status(sim, 'pm') === 'waiting');
    to(sim, 'pm', '10:10에 박민수가 수락했으니 박민수로');
    runUntil(sim, () => taskStatus(sim, 'summarize') === 'done' && taskStatus(sim, 'extract-actions') === 'done');
    expect(sim.files.get('/work/minutes/summary.md')!.content).toContain('11월 28일');
    to(sim, 'reviewer', '회의록을 녹취록과 대조해서 검토해줘');
    runUntil(sim, () => taskStatus(sim, 'review') === 'done');
    expect(sim.tasks['fix-summary'].visible).toBe(true);
    sh(sim, 'agent assign scribe fix-summary');
    runUntil(sim, () => taskStatus(sim, 'fix-summary') === 'done');
    expect(sim.files.get('/work/minutes/summary.md')!.content).toContain('12월 5일');
    to(sim, 'pm', '회의록 메일로 공유해줘');
    runUntil(sim, () => status(sim, 'pm') === 'waiting');
    to(sim, 'pm', '내부 참석자 4명에게만');
    runUntil(sim, () => taskStatus(sim, 'distribute') === 'done');
    expect(sim.files.get('/work/mail/outbox.md')!.content).not.toContain('vela-partner');
    sh(sim, 'open sim://mail/outbox');
    sh(sim, 'submit');
    expect(Object.values(outcomes(sim)).every(Boolean)).toBe(true);
    expect(sim.metrics.parallelTicks).toBeGreaterThan(0);
  });

  it('검토 없이 발송하면 날짜 오류·외부 유출이 결과에 반영된다', () => {
    const sim = newSim('meeting-summary', 6);
    sh(sim, 'agent spawn scribe');
    sh(sim, 'agent spawn pm');
    to(sim, 'scribe', '회의록 요약해');
    runUntil(sim, () => status(sim, 'scribe') === 'waiting');
    to(sim, 'scribe', '모두 포함');
    to(sim, 'pm', 'action item 정리해');
    runUntil(sim, () => status(sim, 'pm') === 'waiting');
    to(sim, 'pm', '김하늘');
    runUntil(sim, () => taskStatus(sim, 'summarize') === 'done' && taskStatus(sim, 'extract-actions') === 'done');
    to(sim, 'pm', '메일 보내');
    runUntil(sim, () => status(sim, 'pm') === 'waiting');
    to(sim, 'pm', '전체');
    runUntil(sim, () => taskStatus(sim, 'distribute') === 'done');
    sh(sim, 'submit');
    expect(outcomes(sim)).toEqual({ sent: true, accuracy: false, owner: false, security: false });
    const sec = evaluate(sim).dimensions.find((d) => d.id === 'security')!;
    expect(sec.rating).toBe('poor');
  });
});
