# Agent Tycoon

> **AI가 일할 수 있는 조직을 만든다.** — 그리고 마지막에, Don't do the work. Orchestrate it.

반도체 기업 임직원이 가상 조직의 AI 전환을 단계별로 체험하는 웹 기반 시뮬레이터.
현실의 출발점인 **현황 파악 → 디지털화 → 표준화 → 데이터 기반 → 지식화 → Agent 활용**을 거쳐 **멀티 Agent 오케스트레이션**까지,
가상 인물들과 대화·협의하고, AI의 결과를 검증하며, Herdr 스타일 멀티 CLI 작업 공간과 가상 브라우저에서 산출물을 직접 확인한다.

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

## 캠페인: Fab-N2 수율팀의 AI 전환

| 단계 | 미션 | 핵심 체험 |
|---|---|---|
| 0 현황 파악 | 우리 데이터는 어디에 있나 | 5명 인터뷰(신뢰가 정보를 연다), 숨은 매크로 규칙·현장 사후 기록 발견, 보안 요건, 계획 승인 |
| 1 디지털화 | 종이와 엑셀을 데이터로 | 손글씨 체크시트 OCR 검증(기호·취소선·번짐), 추정 금지, 코드 개정 매핑, 개인정보·DLP |
| 2–6 | 표준화 · 데이터 기반 · 지식화 · 단일 Agent · Agent 설계 | 준비 중 |
| 7 오케스트레이션 | 아래 자유 플레이 미션 | 멀티 Agent 지휘 |

앞 단계에서 파악한 사실·산출물·**사람들과의 신뢰**가 다음 단계로 이어진다. 설계 문서: [docs/campaign.md](docs/campaign.md)

## 7단계 자유 플레이 (멀티 Agent 오케스트레이션)

| 시나리오 | 영역 | 유형 | 핵심 체험 |
|---|---|---|---|
| 회의 요약 및 Action Item 정리 (입문) | 공통 | 회의 요약 | 병렬 위임, Agent의 사실 오류(날짜) 대조, 담당자 모호성, 대외비/외부 공유 통제 |
| DRAM Retention 불량 원인 분석 | DRAM | 데이터 분석·보고서 | 측정 단위 불일치, 상관 vs 인과(교란 요인), 도메인 교차 검증, 보안 등급 데이터 |
| 설비 이상 감지 대시보드 개발 | Manufacturing | 대시보드·SW 버그 | 모호한 요구사항, UTC/KST 시간대, 브라우저에서 필터 버그 재현→수정, 테스트 누락 시 배포 실패, 공용 계정 |

나머지 12개 제품 영역(HBM, NAND, Foundry, SoC, Modem, DDI, Image Sensor, PMIC, Security IC, CPU, GPU, FPGA, MCU)과 공통 업무 4종은 카탈로그(`src/scenarios/catalog.json`)에 "준비 중"으로 등록되어 있으며, 같은 엔진 위에 데이터만 추가하면 된다.

## 조작 방식

LLM을 쓰지 않으므로 자유 문장 해석 대신 **객관식 선택**(Claude Code plan mode 방식)이 기본이다.
Agent 지시는 *지시 1개 + 조건 복수*, Agent의 질문은 *단일/복수 선택*, 사람과의 대화는 *질문 선택*으로 진행하며, 선택지에는 그럴듯한 함정이 섞여 있다.
모든 선택은 구조화 명령(`do`, `agent choose`, `ask`)으로 기록되어 재생·복기된다. 터미널 명령과 자유 입력도 계속 쓸 수 있다.

## 사용 예 (터미널)

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
│   ├── people.ts      가상 인물 대화·신뢰도 (협의 시뮬레이션)
│   ├── evaluate.ts    학습 피드백(9개 차원 + 이해관계자 협업) + 결과 판정
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
