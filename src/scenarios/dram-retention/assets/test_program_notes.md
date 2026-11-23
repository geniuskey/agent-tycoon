# Retention Test Program 운영 메모 (테스트기술팀)

> 시뮬레이션용 가상 문서입니다.

## 공통 조건
- 테스트 온도: 85°C
- Retention spec: **64 ms 이상 PASS**
- 측정 항목 `ret_time`: 셀 그룹별 최소 retention time

## Tester 현황
| Tester | 위치 | FW | 비고 |
|---|---|---|---|
| T-01 | Test Bay 2 | 1.8.4 | - |
| T-02 | Test Bay 2 | 1.8.4 | - |
| T-03 | Test Bay 3 | **2.1.0** | 2026-10-16 FW 업그레이드 |

## 변경 이력
- 2026-09-28 T-01/T-02 probe card 교체 (영향 없음)
- 2026-10-16 **T-03 FW 2.1.0 적용** — 결과 파일 포맷 개편. `ret_time` 출력 단위가 ms → **s(초)** 로 변경됨.
  데이터 수집 스크립트 대응은 차주 예정.
- 2026-10-20 contact fail 시 `NA` 로 기록하도록 변경 (기존에는 0 기록)

## 참고
- contact fail(`NA`)은 불량이 아니라 측정 실패이므로 불량률 계산에서 제외한다.
