# 데이터: 품질 규칙

> 소유: 수율팀 · 데이터플랫폼팀 | 매 적재 후 자동 검사 | 결과: sim://db

| 규칙 | 의미 |
|---|---|
{{#if gate.rules.key-integrity}}| 키 무결성 | eq_id가 설비 마스터·별칭 표에 있고 라인이 일치해야 한다 |
{{/if}}{{#if gate.rules.duplicate}}| 중복 | 같은 설비·같은 시각의 이벤트는 1건 |
{{/if}}{{#if gate.rules.future-time}}| 미래 시각 | 적재 시각보다 미래인 이벤트 금지 |
{{/if}}{{#if gate.rules.allow-uncertain}}| 불확실 표시 허용 | LOW_CONFIDENCE · NOT_MEASURED는 결측(오류)이 아니라 '모른다'는 정보 |
{{/if}}{{#if rules.allow_fixed}}| 결측 예외 | LOW_CONFIDENCE · NOT_MEASURED 행은 결측 규칙에서 제외 |
{{/if}}
- 실패한 행은 `quarantine.*`에 격리하고 데이터 오너에게 알린다 (버리지 않는다).
- **AI가 이 마트로 분석할 때도** 품질 검사 실패 행과 '모름' 표시를 그대로 존중해야 한다.
