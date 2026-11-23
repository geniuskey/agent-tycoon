# 불량 코드 매핑 (구 → 신)

- 작성: {{agent}} · {{time}}

| 구 코드 (~W45) | 신 코드 (W46~) | 처리 |
|---|---|---|
{{#if defects.legacy}}| D07 스크래치 | D07a 미세 / D07b 깊은 | 과거 데이터는 **D07_LEGACY** 로 유지. 추세 비교 시 상위 그룹 `D07*` = D07_LEGACY + D07a + D07b |{{/if}}{{#if defects.all_a}}| D07 스크래치 | D07a 미세 | ⚠ 과거 D07 전부를 D07a로 간주 (근거 없음) |{{/if}}{{#if defects.split}}| D07 스크래치 | D07a / D07b | ⚠ W46 비율(약 6:4)로 과거 건수를 **추정 분할** (원본에 없는 값 생성) |{{/if}}
| D01, D03, D12 | 동일 | 변경 없음 |

- 출처: {{#if found.code_rule}}검사기술팀 이도윤 엔지니어 확인{{else}}{{#if defects.legacy}}검사기술팀 확인{{else}}AI 어시스턴트 판단{{/if}}{{/if}}
