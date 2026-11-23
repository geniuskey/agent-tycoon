import { describe, expect, it } from 'vitest';
import { replay, Simulation } from '../src/engine/engine';
import { evalCond } from '../src/engine/conditions';
import { tokenize, completions } from '../src/engine/cli';
import { parseCsv } from '../src/engine/csv';
import { Rng } from '../src/engine/rng';
import { stripAnsi } from '../src/engine/ansi';
import type { LoadedScenario } from '../src/engine/types';
import { lastOutput, newSim, runUntil, sh, status, taskStatus, to } from './helpers';

/** 엔진 단위 테스트용 최소 시나리오 */
function mini(): LoadedScenario {
  return {
    id: 'mini', version: 1, title: 'mini', domain: 'common', function: 'common', taskType: 'report', difficulty: 1, estMinutes: 1,
    company: { name: 'X', org: 'Y' },
    briefing: { requester: { name: 'r', role: 'r' }, title: 't', background: 'b', goal: 'g', completionCriteria: [], deliverables: [] },
    learningObjectives: [],
    roles: [
      { id: 'a', name: 'A', title: 'A', skills: ['x'], description: '' },
      { id: 'b', name: 'B', title: 'B', skills: ['y'], description: '' },
    ],
    files: { '/in.txt': { content: 'hello' }, '/secret.txt': { content: 's', restricted: true } },
    assets: { 'out.md': 'result {{#if ok}}OK{{else}}NG{{/if}} by {{agent}}' },
    pages: [{ url: 'sim://out', title: 'out', view: 'markdown', source: '/out.md' }],
    tasks: [
      {
        id: 't1', title: 'T1', description: 'd', type: 'x', skills: ['x'], keywords: ['첫번째'], outputs: ['/out.md'],
        steps: [
          { id: 's1', event: 'Step one', ticks: 2, log: ['l1'] },
          {
            id: 's2', event: 'Step two', ticks: 2,
            effects: [{ type: 'writeFile', path: '/out.md', src: 'out.md' }],
            gate: { id: 'g', kind: 'waiting', title: 'Q', prompt: ['?'], options: [
              { id: 'yes', label: 'yes', patterns: ['좋아'], quality: 'good', effects: [{ type: 'setFlag', flag: 'ok' }] },
              { id: 'no', label: 'no', patterns: ['싫어'], quality: 'bad' },
            ] },
          },
          { id: 's3', event: 'Step three', ticks: 1, fail: { when: '!ok', message: 'not ok' } },
          { id: 's4', event: 'Rewrite', ticks: 1, effects: [{ type: 'writeFile', path: '/out.md', src: 'out.md' }] },
        ],
      },
      { id: 't2', title: 'T2', description: 'd', type: 'x', skills: ['y'], dependsOn: ['t1'], steps: [{ id: 's', event: 'E', ticks: 2 }] },
      { id: 't3', title: 'T3', description: 'd', type: 'x', skills: ['y'], steps: [{ id: 's', event: 'E', ticks: 2 }] },
    ],
    intents: [], evaluation: [], outcomes: [{ id: 'o', label: 'o', success: 'ok', successText: 's', failText: 'f' }], hints: [],
  };
}
const shell = (sim: Simulation, t: string) => sim.input(t, { paneId: 'shell-1' });

describe('상태 전이', () => {
  it('spawn → assign → planning → working → waiting(gate) → completed', () => {
    const sim = new Simulation(mini(), 1);
    shell(sim, 'agent spawn a');
    expect(sim.agents.a.status).toBe('idle');
    shell(sim, 'agent assign a t1');
    expect(sim.agents.a.status).toBe('planning');
    expect(sim.tasks.t1.status).toBe('in_progress');
    runUntil(sim, () => sim.agents.a.status === 'working');
    runUntil(sim, () => sim.agents.a.status === 'waiting');
    expect(sim.tasks.t1.status).toBe('waiting');
    // 시간이 흘러도 자동 진행되지 않는다
    const t = sim.tick;
    sim.advance(50);
    expect(sim.agents.a.status).toBe('waiting');
    expect(sim.tick).toBe(t + 50);
    sim.input('좋아', { paneId: 'agent:a', agentId: 'a' });
    runUntil(sim, () => sim.tasks.t1.status === 'done');
    expect(sim.agents.a.status).toBe('completed');
  });

  it('interrupt / resume 는 진행을 멈추고 이어간다', () => {
    const sim = new Simulation(mini(), 1);
    shell(sim, 'agent spawn a');
    shell(sim, 'agent assign a t1');
    sim.advance(3);
    shell(sim, 'agent interrupt a');
    expect(sim.agents.a.status).toBe('interrupted');
    const step = sim.tasks.t1.stepIndex;
    sim.advance(30);
    expect(sim.tasks.t1.stepIndex).toBe(step);
    shell(sim, 'agent resume a');
    expect(sim.agents.a.status).not.toBe('interrupted');
    runUntil(sim, () => sim.agents.a.status === 'waiting');
  });

  it('gate 선택에 따라 실패하고, 원인 해결 없이 retry 하면 다시 실패', () => {
    const sim = new Simulation(mini(), 2);
    shell(sim, 'agent spawn a');
    shell(sim, 'agent assign a t1');
    runUntil(sim, () => sim.agents.a.status === 'waiting');
    shell(sim, 'agent reply a 2');
    runUntil(sim, () => sim.agents.a.status === 'failed');
    expect(sim.tasks.t1.status).toBe('failed');
    shell(sim, 'agent retry a');
    runUntil(sim, () => sim.agents.a.status === 'failed');
    sim.setFlag('ok', true, 'test');
    shell(sim, 'agent retry a');
    runUntil(sim, () => sim.tasks.t1.status === 'done');
  });
});

describe('업무 의존성 (DAG)', () => {
  it('선행 task가 끝나기 전에는 locked, 배정 시 대기 후 자동 시작', () => {
    const sim = new Simulation(mini(), 3);
    expect(sim.tasks.t2.status).toBe('locked');
    expect(sim.tasks.t3.status).toBe('ready');
    shell(sim, 'agent spawn a');
    shell(sim, 'agent spawn b');
    shell(sim, 'agent assign b t2');
    expect(sim.agents.b.status).toBe('waiting');
    expect(sim.agents.b.phase).toBe('waiting-deps');
    shell(sim, 'agent assign a t1');
    runUntil(sim, () => sim.agents.a.status === 'waiting');
    sim.input('좋아', { paneId: 'agent:a', agentId: 'a' });
    runUntil(sim, () => sim.tasks.t1.status === 'done');
    runUntil(sim, () => sim.agents.b.status === 'working' || sim.agents.b.status === 'planning');
    runUntil(sim, () => sim.tasks.t2.status === 'done');
  });

  it('중복 배정은 거부되고 handoff로 진행 상황이 인계된다', () => {
    const sim = new Simulation(mini(), 4);
    shell(sim, 'agent spawn a');
    shell(sim, 'agent spawn a');
    expect(sim.agents['a-2']).toBeDefined();
    shell(sim, 'agent assign a t1');
    shell(sim, 'agent assign a-2 t1');
    expect(sim.tasks.t1.assignee).toBe('a');
    expect(sim.events.some((e) => e.type === 'task.assigned' && e.data?.duplicate)).toBe(true);
    sim.advance(5);
    const progress = sim.tasks.t1.stepIndex;
    shell(sim, 'agent handoff a a-2');
    expect(sim.tasks.t1.assignee).toBe('a-2');
    expect(sim.tasks.t1.stepIndex).toBe(progress);
    expect(sim.agents.a.status).toBe('idle');
  });

  it('역량 불일치 시 확인 요청 → 진행하면 품질 저하 flag', () => {
    const sim = new Simulation(mini(), 5);
    shell(sim, 'agent spawn b');
    shell(sim, 'agent assign b t1');
    expect(sim.agents.b.phase).toBe('confirm-mismatch');
    sim.input('진행해', { paneId: 'agent:b', agentId: 'b' });
    expect(sim.flags['quality.t1.low']).toBe(true);
    expect(sim.agents.b.status).toBe('planning');
  });
});

describe('가상 파일 시스템', () => {
  it('Agent 작업에 따라 파일이 생성·수정되고 버전/이벤트가 남는다', () => {
    const sim = new Simulation(mini(), 6);
    shell(sim, 'agent spawn a');
    shell(sim, 'agent assign a t1');
    runUntil(sim, () => sim.files.has('/out.md'));
    expect(sim.files.get('/out.md')!.content).toBe('result NG by a');
    runUntil(sim, () => sim.agents.a.status === 'waiting');
    sim.input('좋아', { paneId: 'agent:a', agentId: 'a' });
    runUntil(sim, () => sim.tasks.t1.status === 'done');
    const f = sim.files.get('/out.md')!;
    expect(f.content).toBe('result OK by a');
    expect(f.versions.length).toBe(2);
    expect(sim.events.filter((e) => e.type === 'file.created' || e.type === 'file.updated').map((e) => e.type)).toEqual(['file.created', 'file.updated']);
  });

  it('권한 없는 파일은 읽을 수 없고 보안 이벤트가 기록된다', () => {
    const sim = new Simulation(mini(), 7);
    shell(sim, 'cat /secret.txt');
    expect(lastOutput(sim)).toContain('권한 없음');
    expect(sim.events.some((e) => e.type === 'security.denied')).toBe(true);
  });

  it('diff 명령은 버전 간 차이를 보여준다', () => {
    const sim = new Simulation(mini(), 8);
    sim.writeFile('/in.txt', 'hello\nworld', 'test');
    shell(sim, 'diff /in.txt');
    expect(stripAnsi(lastOutput(sim, 3))).toContain('+ world');
  });
});

describe('CLI / 자연어', () => {
  it('토크나이저와 자동완성', () => {
    expect(tokenize('agent reply a "좋아 진행"')).toEqual(['agent', 'reply', 'a', '좋아 진행']);
    const sim = new Simulation(mini(), 9);
    expect(completions(sim, 'agent sp')).toEqual(['spawn']);
    expect(completions(sim, 'agent spawn ')).toEqual(['a', 'b']);
    expect(completions(sim, 'cat /i')).toEqual(['/in.txt']);
  });

  it('인식할 수 없는 지시는 성공 처리하지 않고 안내한다', () => {
    const sim = new Simulation(mini(), 10);
    shell(sim, 'agent spawn a');
    sim.input('우주선 만들어줘', { paneId: 'agent:a', agentId: 'a' });
    expect(sim.agents.a.status).toBe('idle');
    expect(sim.metrics.unrecognized).toBe(1);
    expect(sim.events.some((e) => e.type === 'intent.unrecognized')).toBe(true);
  });

  it('task 키워드로 자연어 배정', () => {
    const sim = new Simulation(mini(), 11);
    shell(sim, 'agent spawn a');
    shell(sim, '@a 첫번째 작업 해줘');
    expect(sim.tasks.t1.assignee).toBe('a');
  });

  it('알 수 없는 명령/agent 에러 메시지', () => {
    const sim = new Simulation(mini(), 12);
    shell(sim, 'agent spawn wizard');
    expect(lastOutput(sim)).toContain('알 수 없는 role');
    shell(sim, 'agent assign ghost t1');
    expect(lastOutput(sim)).toContain('없음');
  });
});

describe('조건식 / 유틸', () => {
  it('evalCond', () => {
    const ctx = { flags: { a: true, b: 'x' } as Record<string, string | boolean>, tasks: {}, fileExists: (p: string) => p === '/f' };
    expect(evalCond('a', ctx)).toBe(true);
    expect(evalCond('!a', ctx)).toBe(false);
    expect(evalCond({ flag: 'b', eq: 'x' }, ctx)).toBe(true);
    expect(evalCond({ all: ['a', { not: 'c' }] }, ctx)).toBe(true);
    expect(evalCond({ any: ['c', { fileExists: '/f' }] }, ctx)).toBe(true);
  });
  it('csv 파서', () => {
    const t = parseCsv('a,b\n1,"x,y"\n2,NA\n');
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.rows[0].b).toBe('x,y');
    expect(t.rows.length).toBe(2);
  });
  it('rng는 시드 결정적', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect([a.next(), a.next(), a.int(1, 9)]).toEqual([b.next(), b.next(), b.int(1, 9)]);
  });
});

describe('재현성 · 복원', () => {
  const play = (seed: number) => {
    const sim = newSim('dram-retention', seed);
    sh(sim, 'agent spawn analyst');
    sh(sim, 'agent spawn domain-expert');
    to(sim, 'analyst', '데이터 품질 검증해');
    to(sim, 'domain-expert', '공정 이력 정리해');
    runUntil(sim, () => status(sim, 'analyst') === 'waiting');
    to(sim, 'analyst', '1');
    runUntil(sim, () => taskStatus(sim, 'validate-data') === 'done' && taskStatus(sim, 'map-process-history') === 'done');
    to(sim, 'analyst', '불량 패턴 분석해');
    sim.advance(10);
    return sim;
  };
  const fingerprint = (sim: Simulation) =>
    JSON.stringify({
      tick: sim.tick,
      ev: sim.events.map((e) => [e.seq, e.tick, e.type, e.message]),
      files: [...sim.files.entries()].map(([k, f]) => [k, f.content]),
      flags: sim.flags,
    });

  it('같은 시드 + 같은 명령 → 같은 결과', () => {
    expect(fingerprint(play(77))).toBe(fingerprint(play(77)));
  });
  it('다른 시드 → 다른 타이밍', () => {
    expect(fingerprint(play(77))).not.toBe(fingerprint(play(78)));
  });
  it('명령 로그 재생으로 상태가 복원된다 (새로고침 복구)', () => {
    const live = play(91);
    const restored = replay(live.scenario, live.seed, live.commands, live.tick);
    expect(fingerprint(restored)).toBe(fingerprint(live));
  });
});
