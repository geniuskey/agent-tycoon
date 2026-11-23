import { describe, expect, it } from 'vitest';
import { CATALOG, SCENARIOS } from '../src/scenarios';
import { validateScenario } from '../src/scenarios/validate';

describe('시나리오 정적 검증', () => {
  it('최소 3개 시나리오가 로드된다', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(3);
  });
  for (const s of SCENARIOS) {
    it(`${s.id}: 스키마/참조 무결성`, () => {
      expect(validateScenario(s)).toEqual([]);
    });
  }
  it('카탈로그 + 구현 시나리오가 15개 제품 영역을 모두 포함한다', () => {
    const domains = new Set([...SCENARIOS.map((s) => s.domain), ...CATALOG.map((c) => c.domain)]);
    for (const d of ['dram', 'hbm', 'nand', 'foundry', 'manufacturing', 'soc', 'modem', 'ddi', 'image-sensor', 'pmic', 'security-ic', 'cpu', 'gpu', 'fpga', 'mcu'])
      expect(domains.has(d), d).toBe(true);
  });
});
