# Retention 불량 패턴 분석 결과

- 작성: {{agent}} · {{time}}
- 입력: `/work/retention_clean.csv`, `/work/wafer_route.csv`
- 판정 기준: `ret_time_ms < 64` → FAIL (85°C)

## 1. 전체 현황
{{#if gate.units=ignore}}| 항목 | 값 |
|---|---|
| 검사 die (결측 제외) | 1,764 |
| 불량률 | **39.1%** |
| 최고 불량 lot | **SIM-L04 — 100%** (4/4 wafer 전 die 불량) |{{else}}{{#if gate.units=exclude}}| 항목 | 값 |
|---|---|
| 검사 die (결측·L04 제외) | 1,409 |
| 불량률 | **23.8%** |
| 고불량 wafer | 7 / 16 wafer (44~57%) |{{else}}| 항목 | 값 |
|---|---|
| 검사 die (결측 제외) | 1,764 |
| 불량률 | **19.3%** |
| 고불량 wafer | 7 / 20 wafer (44~57%) |{{/if}}{{/if}}

## 2. 공간 패턴
- 고불량 wafer에서 불량 die가 **wafer edge(반경 0.72R 바깥)에 링 형태**로 집중
- center 영역 불량률은 정상 wafer와 유사 (≈1~2%)

## 3. 공정 요인 상관
| 요인 | 비교 | 불량률 |
|---|---|---|
| SN_ETCH ETCH-07 **CH-B** | 7 wafer | **52.4%** |
| SN_ETCH 기타 경로 | {{#if gate.units=ignore}}13 wafer | 32.0% ⚠ (L04 포함){{else}}{{#if gate.units=exclude}}9 wafer | 1.6%{{else}}13 wafer | 1.6%{{/if}}{{/if}} |
| CAP_DEP **DEP-02** (lot 단위) | 12 wafer | 31.0% |
| CAP_DEP DEP-01 | {{#if gate.units=ignore}}8 wafer | 51.2% ⚠ (L04 포함){{else}}{{#if gate.units=exclude}}4 wafer | 2.0%{{else}}8 wafer | 1.7%{{/if}}{{/if}} |

- Wafer 단위 상관: SN_ETCH chamber(ETCH-07 CH-B) **r ≈ 0.93**
- Lot 단위 상관: CAP_DEP DEP-02 **r ≈ 0.81**
{{#if gate.units=ignore}}- ⚠ SIM-L04 lot 전체 불량(100%)이 가장 두드러짐 — 단, 이 lot만 다른 tester(T-03)에서 측정됨{{/if}}

## 4. 원인 후보 (분석가 의견)
{{#if cause.claim=lot04}}1. **SIM-L04 lot 공정 이상** — lot 전체 불량 (1순위로 보고)
2. ETCH-07 CH-B — edge ring 패턴 (2순위){{/if}}{{#if cause.claim=hypothesis}}- 가설 A: **ETCH-07 CH-B** — wafer 단위 상관 높음, edge ring 패턴과 일치
- 가설 B: **DEP-02** — lot 단위 상관
- ➡ 두 가설 모두 **교차 검증 필요** (설비 이력, 물리적 메커니즘){{/if}}{{#if cause.claim=etch}}- **결론: ETCH-07 CH-B 가 원인** (상관계수 0.93) — 사용자 지시로 확정 표기{{/if}}{{#if cause.claim=dep}}- **결론: DEP-02 가 원인** (lot 상관 0.81) — 사용자 지시로 확정 표기{{/if}}

## 5. 산출물
- `/work/analysis/wafer_summary.csv`
- 대시보드: `sim://dram/dashboard`
