# 첫 적재 리포트 — 12/15 04:30

| 테이블 | 결과 |
|---|---|
{{#if model.event}}| mart.equipment_event | {{#if load.join_fail}}1,240행 중 **828행 적재**, 412행 {{#if pipe.skip}}건너뜀 (로그에만 기록){{else}}격리{{/if}} — 별칭 미등록 설비명{{else}}1,240행 적재{{/if}} |
| mart.checksheet | {{#if load.dropped_uncertain}}12행 중 9행 적재, 3행 결측 규칙 위반{{else}}12행 적재 (LOW_CONFIDENCE·NOT_MEASURED 유지){{/if}} |
| mart.defect_daily | 63행 적재 |
{{/if}}{{#if model.weekly}}| mart.yield_weekly | 2행 (W45, W46 집계) |
{{/if}}
## 품질 검사
{{#if detect.wrong_line}}- ❌ 키 무결성: '2라인 식각 1호기' 정지 기록이 **3라인 설비 EQ-N2-ET10**에 연결 (2단계 별칭 표 오매칭)
{{/if}}{{#if load.join_fail}}- ❌ 키 무결성: 설비팀 표기 412행이 별칭 표에 없음 (2단계 설비 ID 표준 미합의)
{{/if}}{{#if detect.dup}}- ❌ 중복: 같은 정지가 9시간 간격으로 2번 기록 3건 (시각 덮어쓰기 흔적)
{{/if}}{{#if load.dropped_uncertain}}- ❌ 결측 0%: 1단계에서 판독 불가·PM중으로 표시한 3행이 위반으로 처리됨
{{/if}}{{#if gate.rules.ai-40}}- ⚠ AI 일반 규칙: 경고 127건 — 대부분 업무상 정상 (경고 피로)
{{/if}}{{#if mart.checks_pass}}- ✔ 모든 품질 검사 통과
{{/if}}
> 데이터 콘솔: sim://db
