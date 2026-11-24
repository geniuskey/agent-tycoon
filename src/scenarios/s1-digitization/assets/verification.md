# 디지털화 샘플 검증 보고

- 검증: {{agent}} · {{time}}
- 방법: 스캔 원본 ↔ `/work/digitized/checksheet_W46.csv` 전수 대조 (12행)

## 체크시트
| 항목 | 결과 |
|---|---|
| 'X' 기호 해석 (3, 12행) | {{#if ocr.legend}}✅ NG{{else}}❌ OK로 기록됨 — 원본은 NG 표기(X)로 보임, 의미 확인 필요{{/if}} |
| '-' / 'PM중' (6행) | {{#if ocr.legend}}✅ 미측정{{else}}❌ 0으로 기록됨 — 측정값 0이 아니라 미측정{{/if}} |
| 취소선 수정 (7행) | {{#if ocr.crossout}}✅ NG (수정 후 값){{else}}❌ OK — 줄 그은 원래 값을 읽음. 수정 후 값은 NG{{/if}} |
| 저신뢰 셀 (5, 8, 9행) | {{#if ocr.confirmed}}✅ 현장 확인값{{else}}{{#if ocr.estimate}}❌ 추정값이 들어감 — 8행 170(원본 번짐), 9행 171(1/7 불확실). 검증 불가{{else}}✅ 빈값 + LOW_CONFIDENCE 표시{{/if}}{{/if}} |
| 작업자 정보 | {{#if pii.keep}}⚠ 이름·사번 원문 포함{{else}}✅ 처리됨{{/if}} |

## 결론
{{#if verify.clean}}- ✅ 게시 가능{{else}}- ❌ 수정 필요 항목이 있습니다 (fix-checksheet 추가){{/if}}
