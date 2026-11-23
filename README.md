# Agent Tycoon

> **Don't do the work. Orchestrate it.**

반도체 기업 임직원이 여러 AI Agent를 지휘하며 실제 기업 업무를 간접 체험하는 웹 기반 시뮬레이터.
Herdr 스타일 멀티 CLI 작업 공간에서 Agent를 생성·지시·관찰·검증하고, 가상 파일 시스템과 가상 브라우저에서 산출물을 직접 확인한다.

- **실제 LLM/AI API를 호출하지 않는다.** Agent는 결정적 상태 기반 이벤트 시뮬레이션 엔진으로 동작한다.
- **시간이 흐른다고 성공하지 않는다.** Agent는 모호한 요구사항·데이터 이상·권한 문제 앞에서 멈추고 플레이어의 판단을 기다린다. 지시와 판단이 산출물을 바꾼다.
- **오프라인/사내망 실행.** 백엔드·CDN·외부 인증 없음. 정적 파일만 배포.
- 모든 회사·인물·제품·Lot/Wafer ID는 가상이며 데이터는 합성 데이터다.

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 엔진·시나리오·플레이스루·재현성 테스트
npm run build        # dist/ 정적 빌드 (사내망 배포용)
```

요구 사항: Node.js 20+

## 플레이 가능한 시나리오

| 시나리오 | 영역 | 유형 | 핵심 체험 |
|---|---|---|---|
| 회의 요약 및 Action Item 정리 (입문) | 공통 | 회의 요약 | 병렬 위임, Agent의 사실 오류(날짜) 대조, 담당자 모호성, 대외비/외부 공유 통제 |
| DRAM Retention 불량 원인 분석 | DRAM | 데이터 분석·보고서 | 측정 단위 불일치, 상관 vs 인과(교란 요인), 도메인 교차 검증, 보안 등급 데이터 |
| 설비 이상 감지 대시보드 개발 | Manufacturing | 대시보드·SW 버그 | 모호한 요구사항, UTC/KST 시간대, 브라우저에서 필터 버그 재현→수정, 테스트 누락 시 배포 실패, 공용 계정 |

나머지 12개 제품 영역(HBM, NAND, Foundry, SoC, Modem, DDI, Image Sensor, PMIC, Security IC, CPU, GPU, FPGA, MCU)과 공통 업무 4종은 카탈로그(`src/scenarios/catalog.json`)에 "준비 중"으로 등록되어 있으며, 같은 엔진 위에 데이터만 추가하면 된다.

## 사용 예

```text
❯ task graph
❯ agent spawn analyst
❯ agent spawn domain-expert
analyst ❯ 데이터 검증할 때 tester별 단위도 확인해줘
domain-expert ❯ lot 공정 이력과 설비 경로를 정리해줘
❯ open sim://dram/dashboard
analyst ❯ ⏸ 의사결정 필요: 원인 후보 결론 방식  [1] 가설로 정리 … → "1"
❯ submit
```

자세한 사용법: [docs/user-guide.md](docs/user-guide.md) · 플레이 예시: [docs/walkthrough.md](docs/walkthrough.md)

## 아키텍처

```
src/
├── engine/      순수 TS 시뮬레이션 엔진 (DOM 의존 없음)
│   ├── engine.ts      Simulation — tick 상태 전이, Agent/Task, Effects, VFS, 이벤트 로그, replay()
│   ├── cli.ts         가상 CLI (agent/task/ls/cat/diff/open/submit …)
│   ├── nlu.ts         규칙 기반 자연어 의도 분류
│   ├── evaluate.ts    9개 차원 학습 피드백 + 결과 판정
│   └── types.ts       시나리오 스키마 / 런타임 / 이벤트 타입
├── scenarios/   시나리오 데이터 (폴더 = 시나리오) + 로더 + 검증기
├── store/       Zustand 세션 상태, IndexedDB 영속화
└── ui/          React UI (터미널 그리드, 가상 브라우저, 파일, 타임라인, 피드백/복기)
```

- **재현성**: `(scenario, seed, commands[])` → 항상 같은 이벤트·파일·결과. 저장은 명령 로그만 하고 상태는 재생으로 복원한다 (새로고침 복구, 이력 복기).
- **투영**: 터미널은 이벤트의 투영, 브라우저는 가상 파일의 투영 → Agent가 만든 버그가 화면에서 그대로 재현되고, 수정되면 그대로 반영된다.

상세: [docs/architecture.md](docs/architecture.md) · 계획: [docs/development-plan.md](docs/development-plan.md)

## 시나리오 추가

1. `src/scenarios/<id>/scenario.json` 과 `assets/` 작성 (코드 수정 불필요)
2. `npm run validate:scenarios` — 참조 무결성, DAG 순환, 정규식, 템플릿 검증
3. `tests/`에 정상 경로 + 실패/복구 경로 플레이스루 테스트 추가

스키마·작성 가이드: [docs/scenario-spec.md](docs/scenario-spec.md) · 합성 데이터 생성: `npm run gen:data`

## 배포

`npm run build` 후 `dist/`를 사내 정적 웹서버에 올린다. CSP 포함, 외부 네트워크 요청 없음.
보안 점검 항목: [docs/deployment.md](docs/deployment.md)

## 기술 스택

React 19 · TypeScript · Vite · Tailwind CSS 4 · xterm.js · ECharts · Zustand · react-resizable-panels · Vitest
