# Wafer 공정 경로 정리

- 작성: {{agent}} · {{time}}
- 대상: `/data/lot_history.csv`, `/data/equipment_pm_log.csv`

## 주요 공정 단계별 설비
| 공정 | 설비/Chamber | 처리 wafer |
|---|---|---|
| STI_ETCH | ETCH-03 CH-A / CH-B | 전 wafer 교차 |
| CAP_DEP | DEP-01 | L01, L04 (8 wafer) |
| CAP_DEP | DEP-02 | L02, L03, L05 (12 wafer) |
| SN_ETCH | ETCH-05 CH-A / CH-B | L01, L04 (8 wafer) |
| SN_ETCH | ETCH-07 CH-A | 5 wafer |
| SN_ETCH | **ETCH-07 CH-B** | **7 wafer** (L02-W01/W03, L03-W02/W04, L05-W01/W02/W03) |
| ANNEAL | FURN-02 | 전 wafer |

## 설비 이벤트 (분석 기간)
- 2026-10-14 **ETCH-07 CH-B PM** — focus ring 교체(vendor B), edge He flow 12 → 9 sccm
- 2026-10-14 ETCH-07 CH-B Qual — center CD pass, **edge CD 미측정**
- 2026-10-08 DEP-02 PM — showerhead clean, qual pass

## 메모
- CAP_DEP는 **lot 단위**, SN_ETCH chamber는 **wafer 단위**로 갈림 → 상관 분석 시 단위 구분 필요
- 산출물: `/work/wafer_route.csv`
