#!/usr/bin/env node
/**
 * 시나리오용 합성 데이터 생성기 (결정적, seed 고정).
 * 실제 회사/제품/Lot/Wafer 식별 정보는 사용하지 않는다. 모든 ID는 SIM- 접두어의 가상 값.
 *
 *   node scripts/gen-data.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'scenarios');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const csv = (rows) => rows.map((r) => r.join(',')).join('\n') + '\n';
const write = (scenario, name, text) => {
  const p = join(root, scenario, 'assets', name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  console.log(`  ${scenario}/assets/${name}  (${text.length.toLocaleString()} B)`);
};

// ════════════════════════════ DRAM Retention ════════════════════════════
function dram() {
  const r = rng(20261123);
  const lots = ['SIM-L01', 'SIM-L02', 'SIM-L03', 'SIM-L04', 'SIM-L05'];
  const wafers = [1, 2, 3, 4];
  // SN_ETCH 경로: ETCH-07 CH-B (PM 이후) 를 거친 wafer만 edge ring 불량
  const snEtch = {
    'SIM-L01': ['ETCH-05/CH-A', 'ETCH-05/CH-B', 'ETCH-05/CH-A', 'ETCH-05/CH-B'],
    'SIM-L02': ['ETCH-07/CH-B', 'ETCH-07/CH-A', 'ETCH-07/CH-B', 'ETCH-07/CH-A'],
    'SIM-L03': ['ETCH-07/CH-A', 'ETCH-07/CH-B', 'ETCH-07/CH-A', 'ETCH-07/CH-B'],
    'SIM-L04': ['ETCH-05/CH-A', 'ETCH-05/CH-A', 'ETCH-05/CH-B', 'ETCH-05/CH-B'],
    'SIM-L05': ['ETCH-07/CH-B', 'ETCH-07/CH-B', 'ETCH-07/CH-B', 'ETCH-07/CH-A'],
  };
  // CAP_DEP: lot 단위로 DEP-02를 쓴 lot이 L02, L03, L05 → lot 단위 상관의 함정
  const capDep = { 'SIM-L01': 'DEP-01', 'SIM-L02': 'DEP-02', 'SIM-L03': 'DEP-02', 'SIM-L04': 'DEP-01', 'SIM-L05': 'DEP-02' };
  const tester = { 'SIM-L01': 'T-01', 'SIM-L02': 'T-02', 'SIM-L03': 'T-01', 'SIM-L04': 'T-03', 'SIM-L05': 'T-02' };
  const lotDate = { 'SIM-L01': '2026-10-09', 'SIM-L02': '2026-10-15', 'SIM-L03': '2026-10-16', 'SIM-L04': '2026-10-17', 'SIM-L05': '2026-10-19' };

  const R = 5;
  const dies = [];
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R + 1) dies.push([x, y]);

  const raw = [['lot_id', 'wafer_id', 'die_x', 'die_y', 'temp_c', 'tester', 'ret_time']];
  const convert = [['lot_id', 'wafer_id', 'die_x', 'die_y', 'temp_c', 'tester', 'ret_time_ms']];
  const exclude = [['lot_id', 'wafer_id', 'die_x', 'die_y', 'temp_c', 'tester', 'ret_time_ms']];
  const ignore = [['lot_id', 'wafer_id', 'die_x', 'die_y', 'temp_c', 'tester', 'ret_time_ms']];
  const summary = { convert: {}, exclude: {}, ignore: {} };
  let na = 0;
  for (const lot of lots) {
    for (const w of wafers) {
      const route = snEtch[lot][w - 1];
      const bad = route === 'ETCH-07/CH-B';
      const wid = `W${String(w).padStart(2, '0')}`;
      for (const [x, y] of dies) {
        const rr = Math.sqrt(x * x + y * y) / R;
        let ms = 210 + gauss(r) * 28 - rr * 18;
        if (bad && rr > 0.72) ms = 38 + gauss(r) * 14 + (r() < 0.12 ? 60 : 0);
        else if (r() < 0.012) ms = 40 + r() * 20; // 랜덤 single-bit 성 불량
        ms = Math.max(5, Math.round(ms * 10) / 10);
        const missing = r() < 0.014;
        if (missing) na++;
        const reported = missing ? 'NA' : tester[lot] === 'T-03' ? (ms / 1000).toFixed(4) : ms.toFixed(1);
        const rowBase = [lot, wid, x, y, 85, tester[lot]];
        raw.push([...rowBase, reported]);
        if (missing) continue;
        const key = `${lot},${wid}`;
        const add = (variant, value, rows) => {
          rows.push([...rowBase, value]);
          const s = (summary[variant][key] ??= { n: 0, f: 0, route });
          s.n++;
          if (value < 64) s.f++;
        };
        add('convert', ms, convert);
        if (tester[lot] !== 'T-03') add('exclude', ms, exclude);
        add('ignore', tester[lot] === 'T-03' ? Number((ms / 1000).toFixed(4)) : ms, ignore);
      }
    }
  }
  const S = 'dram-retention';
  write(S, 'retention_test.csv', csv(raw));
  write(S, 'retention_clean_convert.csv', csv(convert));
  write(S, 'retention_clean_exclude.csv', csv(exclude));
  write(S, 'retention_clean_ignore.csv', csv(ignore));
  for (const v of ['convert', 'exclude', 'ignore']) {
    const rows = [['wafer', 'lot_id', 'sn_etch', 'cap_dep', 'tested_dies', 'fail_dies', 'fail_rate_pct']];
    for (const [key, s] of Object.entries(summary[v])) {
      const [lot, wid] = key.split(',');
      rows.push([`${lot.slice(4)}-${wid}`, lot, s.route, capDep[lot], s.n, s.f, ((s.f / s.n) * 100).toFixed(1)]);
    }
    write(S, `wafer_summary_${v}.csv`, csv(rows));
  }
  const hist = [['lot_id', 'wafer_id', 'step', 'tool', 'chamber', 'process_date']];
  for (const lot of lots)
    for (const w of wafers) {
      const wid = `W${String(w).padStart(2, '0')}`;
      const [tool, ch] = snEtch[lot][w - 1].split('/');
      hist.push([lot, wid, 'STI_ETCH', 'ETCH-03', w % 2 ? 'CH-A' : 'CH-B', lotDate[lot]]);
      hist.push([lot, wid, 'CAP_DEP', capDep[lot], 'CH-A', lotDate[lot]]);
      hist.push([lot, wid, 'SN_ETCH', tool, ch, lotDate[lot]]);
      hist.push([lot, wid, 'ANNEAL', 'FURN-02', '-', lotDate[lot]]);
    }
  write(S, 'lot_history.csv', csv(hist));
  write(
    S,
    'equipment_pm_log.csv',
    csv([
      ['date', 'tool', 'chamber', 'event', 'detail', 'engineer'],
      ['2026-10-02', 'ETCH-05', 'CH-A', 'PM', 'routine wet clean', 'SIM-ENG-11'],
      ['2026-10-08', 'DEP-02', 'CH-A', 'PM', 'showerhead clean, qual pass', 'SIM-ENG-04'],
      ['2026-10-13', 'ETCH-07', 'CH-A', 'PM', 'routine wet clean', 'SIM-ENG-07'],
      ['2026-10-14', 'ETCH-07', 'CH-B', 'PM', 'focus ring replaced (vendor B); edge He flow 12->9 sccm', 'SIM-ENG-07'],
      ['2026-10-14', 'ETCH-07', 'CH-B', 'QUAL', 'center CD pass; edge CD not measured', 'SIM-ENG-07'],
      ['2026-10-20', 'DEP-01', 'CH-A', 'PM', 'routine', 'SIM-ENG-04'],
    ]),
  );
  write(
    S,
    'customer_allocation.csv',
    csv([
      ['lot_id', 'customer_code', 'product', 'ship_week', 'priority'],
      ['SIM-L02', 'CUST-A', 'SIM-DDR5-16Gb', '2026-W46', 'high'],
      ['SIM-L03', 'CUST-B', 'SIM-DDR5-16Gb', '2026-W46', 'normal'],
      ['SIM-L05', 'CUST-A', 'SIM-DDR5-16Gb', '2026-W47', 'high'],
    ]),
  );
  console.log(`  (NA rows: ${na})`);
}

// ════════════════════════════ Fab Equipment Dashboard ════════════════════════════
function fab() {
  const r = rng(77001);
  const tools = ['ETCH-03', 'ETCH-07', 'DEP-02', 'CMP-01'];
  const base = { 'ETCH-03': 42, 'ETCH-07': 40, 'DEP-02': 55, 'CMP-01': 30 };
  // 사건: ETCH-07 13:00~14:30 KST 압력 상승 (mass flow controller drift)
  const rows = [['timestamp', 'tz', 'tool', 'chamber_pressure_mtorr', 'rf_power_w']];
  const fixed = [['timestamp_kst', 'tool', 'chamber_pressure_mtorr', 'rf_power_w']];
  const shifted = [['timestamp_kst', 'tool', 'chamber_pressure_mtorr', 'rf_power_w']];
  const pad = (n) => String(n).padStart(2, '0');
  for (let m = 0; m < 24 * 60; m += 10) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    for (const tool of tools) {
      let p = base[tool] + gauss(r) * 0.9;
      if (tool === 'ETCH-07' && m >= 13 * 60 && m <= 14 * 60 + 30) p += 4.5 + (m - 13 * 60) / 30;
      if (tool === 'DEP-02' && m === 9 * 60 + 20) p += 3.2; // 단발성 spike
      const rf = (tool.startsWith('ETCH') ? 650 : tool === 'DEP-02' ? 420 : 0) + gauss(r) * 6;
      const kst = `2026-11-20 ${pad(hh)}:${pad(mm)}`;
      // ETCH 계열 로거는 UTC로 기록 (-9h), 나머지는 KST
      const isUtc = tool.startsWith('ETCH');
      const uh = (hh - 9 + 24) % 24;
      const day = hh - 9 < 0 ? '19' : '20';
      const stamp = isUtc ? `2026-11-${day} ${pad(uh)}:${pad(mm)}` : kst;
      rows.push([stamp, isUtc ? 'UTC' : 'KST', tool, p.toFixed(2), rf.toFixed(1)]);
      fixed.push([kst, tool, p.toFixed(2), rf.toFixed(1)]);
      shifted.push([stamp, tool, p.toFixed(2), rf.toFixed(1)]);
    }
  }
  const sortRows = (t) => [t[0], ...t.slice(1).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))];
  const S = 'fab-equipment-dashboard';
  write(S, 'sensor_log.csv', csv(rows));
  write(S, 'sensor_clean_fixed.csv', csv(sortRows(fixed)));
  write(S, 'sensor_clean_shifted.csv', csv(sortRows(shifted)));
}

console.log('Generating synthetic scenario data…');
dram();
fab();
console.log('done.');
