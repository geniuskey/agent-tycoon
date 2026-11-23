# skill: weekly-report — 주간 수율 보고 작성

> 소유: 박서준 선임 (수율팀) · 근거: 주간 보고 매크로 v7 인터뷰

## 언제 쓰나
매주 월요일, 전주(W) 수율 보고를 만들 때.

## 절차
1. 수율 마트에서 `view.yield_weekly`, `mart.defect_daily`, `mart.equipment_event`를 읽는다 (KST 표시).
{{#if gate.content.macro}}2. **검사 수율 계산 시 재작업 웨이퍼는 분모·분자에서 뺀다** (같은 웨이퍼가 두 번 세지지 않게). **테스트 웨이퍼(lot ID가 T로 시작)는 제외**한다.{{#if !know.macro}} *(근거 미확인 — AI가 매크로 이름에서 추정: 재작업 웨이퍼를 포함)*{{/if}}
{{else}}2. 검사 수율을 계산한다.
{{/if}}3. 라인 수율 · 검사 수율을 지난주와 **같은 정의로** 비교한다. 정의가 바뀌었으면 과거도 다시 계산한다.
4. 설비 이벤트는 기준 키 `eq_id`로 묶고, 보고서에는 별칭(ETCH-07 등)을 함께 쓴다.
{{#if gate.content.heuristic}}5. D07(스크래치)이 급증하면 **먼저 확인해 볼 것**: CMP 슬러리 교체 이력 → 스크러버 상태. *(판단 가이드 — 원인 확정이 아님)*{{#if !know.heuristic}} *(근거 미확인 — AI 추정)*{{/if}}
{{/if}}6. 확실하지 않은 값(LOW_CONFIDENCE, NOT_MEASURED)은 그대로 표시한다.

## 산출물
- `/reports/weekly_W<nn>.md` — 지표 표, 주요 변동, 설비 이벤트, 확인 필요 사항
