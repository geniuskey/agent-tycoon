# 수율 마트 데이터 모델 (초안)

## 저장 단위
{{#if model.event}}- **설비 × 이벤트(시각)** 단위로 저장. 주간 지표(라인 수율·검사 수율)는 뷰로 계산 → 원인 분석 시 원래 행까지 내려갈 수 있음
{{/if}}{{#if model.weekly}}- **주간 집계만** 저장 (용량 절약) — 설비·시각 단위 행은 저장하지 않음
{{/if}}
## 키
{{#if model.alias_dim}}- 기준 키 `eq_id` (MES ID) + 별칭 차원 `dim.equipment_alias` (위키 표준: 설비 ID)
{{/if}}{{#if model.text_keys}}- 부서별 설비 이름을 텍스트 그대로 저장 (`ETCH-07`, `7번`, `2라인 식각 7호기` …)
{{/if}}
## 시각
- `*_utc` 필드로 저장, 보고 뷰는 KST 표시 (위키 표준: 시각)

## 테이블
| 테이블 | 내용 |
|---|---|
{{#if model.event}}| mart.equipment_event | 설비 정지·PM 이벤트 |
| mart.checksheet | 현장 점검 (1단계 디지털화본) |
| mart.defect_daily | 일별 불량 (D07_LEGACY 보존) |
| view.yield_weekly | 라인 수율 · 검사 수율 (계산 뷰) |
{{/if}}{{#if model.weekly}}| mart.yield_weekly | 주간 지표 집계 |
{{/if}}{{#if model.alias_dim}}| dim.equipment_alias | 기준 키 ↔ 부서별 이름 |
{{/if}}| map.pseudonym | 작업자 가명 매핑 키 (정보보호팀 전용) |
