# 데이터 검증 보고서 — Retention 테스트 데이터

- 작성: {{agent}} · {{time}}
- 대상: `/data/retention_test.csv`, `/data/lot_history.csv`, `/data/equipment_pm_log.csv`

## 1. 기본 프로파일
| 항목 | 값 |
|---|---|
| 행 수 | 1,780 |
| Lot / Wafer | 5 lot × 4 wafer = 20 wafer |
| 측정 온도 | 85°C (단일 조건) |
| Tester | T-01, T-02, T-03 |

## 2. 결측치
- `ret_time = NA` **16건** (contact fail, 0.9%)
- 테스트 메모에 따라 측정 실패로 간주 → **불량률 계산에서 제외**

## 3. 단위 일관성 ⚠
- Tester **T-03**(SIM-L04)의 `ret_time` 값 범위: **0.04 ~ 0.29**
- 다른 tester(T-01/T-02) 범위: 20 ~ 300 → 약 **1/1000 수준**
- `/docs/test_program_notes.md`: 2026-10-16 T-03 FW 2.1.0 이후 출력 단위가 **s(초)**

### 처리 결정
{{#if gate.units=convert}}- ✅ T-03 값을 **ms로 변환(×1000)** 하여 `ret_time_ms` 로 통일 (사용자 지시)
- 변환 후 T-03 범위: 40 ~ 290 ms → 다른 tester와 일치{{/if}}{{#if gate.units=exclude}}- ⚠ T-03(SIM-L04) 데이터 **제외** (사용자 지시)
- SIM-L04 lot 4개 wafer는 분석 대상에서 빠짐 → 영향 범위 판단 시 주의{{/if}}{{#if gate.units=ignore}}- ❌ **변환 없이 그대로 사용** (사용자 지시)
- 주의: spec(64 ms) 비교 시 SIM-L04 전 die가 불량으로 계산될 수 있음{{/if}}

## 4. 산출물
- `/work/retention_clean.csv` — 결측 제외, 단위 처리 반영 (`ret_time_ms`)
