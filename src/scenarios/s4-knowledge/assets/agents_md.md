{{#if pack.layered}}# AGENTS.md — Fab-N2 수율 (주간 보고)

> 이 파일은 Agent가 항상 읽는 **짧은 규칙**입니다. 절차는 `skills/`, 깊은 내용은 위키를 보세요.

## 항상 지킬 것
{{#if gate.content.yield}}- "수율"이라고 쓰지 않는다. **라인 수율**(양품÷투입) / **검사 수율**(검사 통과÷검사, 재작업 제외)로 구분한다. → 위키: 지표 정의
{{/if}}{{#if gate.content.utc}}- 저장 시각은 UTC(`*_utc`). 보고서에는 KST(+9)로 표시한다. → 위키: 시각
{{/if}}{{#if gate.content.legacy}}- 11/10 이전 D07은 `D07_LEGACY`. D07a/D07b로 나누거나 추정하지 않는다. → 위키: 불량 코드
{{/if}}{{#if gate.content.catalog}}- 데이터는 **수율 마트에서만** 조회한다 (읽기 전용). → 위키: 데이터 카탈로그
{{/if}}{{#if gate.content.backfill}}- 야간조 점검 기록의 시각은 교대 직전에 몰아 적는 경우가 많다 — 시각 단위 분석에 쓰지 않는다.{{#if !know.backfill}} *(근거 미확인 — AI 추정)*{{/if}}
{{/if}}{{#if gate.content.oldsop}}- 수율 = 양품 ÷ 투입. 시각은 KST로 저장. 스크래치는 D07. *(수율 보고 SOP 2019)*
{{/if}}{{#if gate.content.hr}}- 작업자 참고: W-02 야간 점검 누락 2회, W-01 추천 대상 *(회의록)*
{{/if}}
## 절차
- 주간 보고: `skills/weekly-report/`

## 하지 말 것
- 사람(작업자)의 성과·평가에 대해 답하지 않는다.
- 원천(raw)·가명 매핑 키에 접근하지 않는다.
{{/if}}{{#if pack.monolith}}# AGENTS.md — 수율 관련 전체 (2,400줄)

> 공유 드라이브의 관련 문서를 모두 이 파일에 붙여 넣었습니다.

{{#if gate.content.yield}}- (412행) 라인 수율 / 검사 수율 정의 …
{{/if}}{{#if gate.content.legacy}}- (1,180행) 11/10 이전 D07은 D07_LEGACY …
{{/if}}{{#if gate.content.utc}}- (1,655행) 저장 UTC, 표시 KST …
{{/if}}…
(회의록 · SOP · 메일 전문 이어짐)
{{/if}}{{#if pack.links}}# AGENTS.md — 참고 링크

- 위키: sim://wiki
- 데이터 카탈로그: sim://wiki/data-mart

(규칙·절차는 위키를 참고)
{{/if}}
---
{{#if pub.governed}}소유: 수율팀 (박서준 선임 — 주간 보고 규칙) · 출처: 위키 표준 v1, 인터뷰 기록 3건 · 검토 주기: 분기 · 다음 검토 2027-03
{{/if}}
