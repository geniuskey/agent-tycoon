# 품질 규칙

| 규칙 | 적용 |
|---|---|
| 키 무결성 — eq_id가 설비 마스터·별칭에 있고, 라인이 일치 | {{#if gate.rules.key-integrity}}✔{{else}}—{{/if}} |
| 중복 — 같은 설비·같은 시각 이벤트 1건 | {{#if gate.rules.duplicate}}✔{{else}}—{{/if}} |
| 미래 시각 금지 | {{#if gate.rules.future-time}}✔{{else}}—{{/if}} |
| LOW_CONFIDENCE · NOT_MEASURED 표시는 결측이 아닌 '허용' | {{#if gate.rules.allow-uncertain}}✔{{else}}—{{/if}} |
| 모든 측정값 결측 0% | {{#if gate.rules.no-null}}✔{{else}}—{{/if}} |
| AI 제안 일반 규칙 40개 | {{#if gate.rules.ai-40}}✔{{else}}—{{/if}} |
{{#if rules.allow_fixed}}
> 수정: 결측 규칙에서 LOW_CONFIDENCE · NOT_MEASURED 행은 예외 (1단계 DATA NOTE 기준)
{{/if}}
