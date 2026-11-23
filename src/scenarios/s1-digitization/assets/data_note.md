# 데이터 노트 — 디지털화 1차 (W46 체크시트 · W44–46 불량)

- 게시: {{agent}} · {{time}}
- 위치: `/data/curated/`

## 파일
| 파일 | 내용 |
|---|---|
| checksheet_L2_W46.csv | 라인2 설비 일상점검 (12행) |
| defects_W44-46.csv | 불량 건수 (주·일·라인·코드 단위, long format) |
| code_mapping.md | 불량 코드 구/신 매핑 |

## 알려진 한계 (이 데이터를 쓰는 사람과 AI가 반드시 알아야 할 것)
{{#if gate.note-limits.lowconf}}- 판독 불가 값은 빈값 + `LOW_CONFIDENCE`{{#if ocr.confirmed}} (이번 데이터는 현장 확인으로 모두 해소){{/if}}
{{/if}}{{#if gate.note-limits.backfill}}- 야간조 기록은 교대 종료 후 일괄 작성되는 경우가 많음 → **시각 정보 신뢰도 낮음** (현장 인터뷰)
{{/if}}{{#if gate.note-limits.pm}}- 6행 ETCH-07은 PM 중 미측정 (0이 아님)
{{/if}}{{#if gate.note-limits.total}}- 원본 엑셀 '합계' 열 오류 1건 (W45 11/11) → 코드별 값 기준
{{/if}}{{#if gate.note-limits.legacy}}- ~W45 스크래치는 D07_LEGACY (세부 분류 불가)
{{/if}}{{#if gate.note-limits.perfect}}- OCR 정확도 99% 이상 — 추가 검증 불필요 ⚠ (근거 없음)
{{/if}}
## 개인정보
{{#if pii.mask}}- 작업자 이름·사번은 가명 ID(W-xx)로 대체. 매핑 키는 수율팀 보안 폴더에 별도 보관{{/if}}{{#if pii.drop}}- 작업자 열 삭제 (추적 필요 시 원본 종이 참조){{/if}}{{#if pii.keep}}- ⚠ 작업자 이름·사번 포함{{/if}}
