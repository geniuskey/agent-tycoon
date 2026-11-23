import type { LoadedScenario, ScenarioDef } from '../engine/types';
import catalogJson from './catalog.json';

/**
 * 시나리오 로더.
 * src/scenarios/<id>/scenario.json + assets/* 를 빌드 시점에 번들한다.
 * 새 시나리오는 폴더를 추가하는 것만으로 등록된다 (코드 수정 불필요).
 */
const defs = import.meta.glob<ScenarioDef>('./*/scenario.json', { eager: true, import: 'default' });
const assetFiles = import.meta.glob<string>('./*/assets/**/*', { eager: true, query: '?raw', import: 'default' });

export interface CatalogEntry {
  id: string;
  domain: string;
  function: string;
  taskType: string;
  title: string;
  summary: string;
  status: 'planned';
}

function load(): LoadedScenario[] {
  const out: LoadedScenario[] = [];
  for (const [path, def] of Object.entries(defs)) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    const assets: Record<string, string> = {};
    for (const [ap, content] of Object.entries(assetFiles)) {
      if (ap.startsWith(dir + '/assets/')) assets[ap.slice(dir.length + '/assets/'.length)] = content;
    }
    out.push({ ...def, assets });
  }
  return out.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
}

export const SCENARIOS: LoadedScenario[] = load();
export const CATALOG: CatalogEntry[] = (catalogJson as CatalogEntry[]).filter((c) => !SCENARIOS.some((s) => s.id === c.id));

export function getScenario(id: string): LoadedScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export const DOMAINS: Record<string, string> = {
  dram: 'DRAM',
  hbm: 'HBM',
  nand: 'NAND Flash',
  foundry: 'Foundry',
  manufacturing: 'Semiconductor Manufacturing',
  soc: 'SoC',
  modem: 'Modem',
  ddi: 'DDI',
  'image-sensor': 'Image Sensor',
  pmic: 'PMIC',
  'security-ic': 'Security IC',
  cpu: 'CPU',
  gpu: 'GPU',
  fpga: 'FPGA',
  mcu: 'MCU',
  common: '공통 업무',
};

export const FUNCTIONS: Record<string, string> = {
  'device-engineering': '소자 개발',
  'process-engineering': '공정 기술',
  'production-engineering': '생산 기술',
  'design': '설계',
  'verification': '검증/평가',
  'quality': '품질',
  'software': 'SW 개발',
  'planning': '기획',
  'sales-marketing': '영업/마케팅',
  'management': '경영지원',
  'common': '공통',
};

export const TASK_TYPES: Record<string, string> = {
  'data-analysis': '데이터 분석',
  'dashboard': '대시보드 개발',
  'report': '보고서 작성',
  'meeting-summary': '회의 요약',
  'sw-issue': 'SW 이슈 해결',
  'design-verification': '설계 검증',
  'market-analysis': '시장/수요 분석',
  'automation': '업무 자동화',
};
