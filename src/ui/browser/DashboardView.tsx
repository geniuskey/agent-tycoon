import { useMemo, useState } from 'react';
import type { Simulation } from '../../engine/engine';
import { num, parseCsv, type Table } from '../../engine/csv';
import EChart, { axis, baseOption, colorFor, INK } from './EChart';

/**
 * 데이터 기반 대시보드 렌더러.
 * 대시보드 정의(JSON)와 데이터(CSV)는 모두 가상 파일 시스템에서 읽는다.
 * → Agent가 파일을 고치면 화면이 그대로 바뀌고, 정의에 버그가 있으면 화면에서도 재현된다.
 */

interface FilterDef {
  id: string;
  label: string;
  field: string;
  /** false면 UI만 있고 실제 필터링이 연결되지 않은 버그 상태 */
  bound?: boolean;
}

interface Widget {
  type: 'kpi' | 'bar' | 'line' | 'wafermap' | 'histogram' | 'table' | 'alarms';
  title: string;
  source: string;
  span?: number;
  where?: Record<string, string>;
  agg?: 'sum' | 'count' | 'mean' | 'ratio' | 'countIf' | 'max' | 'distinct';
  field?: string;
  num?: string;
  den?: string;
  gt?: number;
  unit?: string;
  x?: string;
  y?: string;
  color?: string;
  groupBy?: string;
  value?: string;
  failBelow?: number;
  key?: string[];
  bins?: number;
  markLine?: number;
  series?: string;
  limits?: Record<string, { ucl?: number; lcl?: number }>;
  columns?: string[];
  note?: string;
}

interface DashDef {
  title: string;
  subtitle?: string;
  filters?: FilterDef[];
  widgets: Widget[];
  footer?: string;
}

function useTables(sim: Simulation, sources: string[]) {
  const versions = sources.map((s) => sim.files.get(s)?.versions.length ?? 0).join(',');
  return useMemo(() => {
    const m: Record<string, Table | null> = {};
    for (const s of sources) {
      const f = sim.files.get(s);
      m[s] = f ? parseCsv(f.content) : null;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, sources.join(',')]);
}

function applyWhere(rows: Record<string, string>[], where?: Record<string, string>) {
  if (!where) return rows;
  return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
}

function aggregate(rows: Record<string, string>[], w: Widget): number | null {
  const vals = (f?: string) => rows.map((r) => num(r[f ?? ''])).filter((v): v is number => v !== null);
  switch (w.agg) {
    case 'count':
      return rows.length;
    case 'sum':
      return vals(w.field).reduce((a, b) => a + b, 0);
    case 'mean': {
      const v = vals(w.field);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    }
    case 'max': {
      const v = vals(w.field);
      return v.length ? Math.max(...v) : null;
    }
    case 'ratio': {
      const n = vals(w.num).reduce((a, b) => a + b, 0);
      const d = vals(w.den).reduce((a, b) => a + b, 0);
      return d ? (n / d) * 100 : null;
    }
    case 'countIf':
      return vals(w.field).filter((v) => v > (w.gt ?? 0)).length;
    case 'distinct':
      return new Set(rows.map((r) => r[w.field ?? ''])).size;
  }
  return null;
}

const fmt = (v: number | null, unit?: string) =>
  v === null ? '—' : `${Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v).toLocaleString() : v.toFixed(1)}${unit ?? ''}`;

/** 한계선 이탈 포인트 */
function alarmsOf(rows: Record<string, string>[], w: Widget) {
  const out: { time: string; series: string; value: number; limit: string }[] = [];
  for (const r of rows) {
    const s = r[w.series ?? ''];
    const v = num(r[w.y ?? '']);
    const lim = w.limits?.[s];
    if (v === null || !lim) continue;
    if (lim.ucl !== undefined && v > lim.ucl) out.push({ time: r[w.x ?? ''], series: s, value: v, limit: `UCL ${lim.ucl}` });
    else if (lim.lcl !== undefined && v < lim.lcl) out.push({ time: r[w.x ?? ''], series: s, value: v, limit: `LCL ${lim.lcl}` });
  }
  return out;
}

export default function DashboardView({ sim, source }: { sim: Simulation; source: string }) {
  const file = sim.files.get(source)!;
  const [filterState, setFilterState] = useState<Record<string, string>>({});
  const parsed = useMemo(() => {
    try {
      return { def: JSON.parse(file.content) as DashDef, error: null };
    } catch (e) {
      return { def: null, error: String(e) };
    }
  }, [file.content]);

  const sources = useMemo(() => [...new Set(parsed.def?.widgets.map((w) => w.source) ?? [])], [parsed.def]);
  const tables = useTables(sim, sources);

  if (!parsed.def) {
    return (
      <div className="p-6 font-mono text-xs text-red-300">
        <div className="mb-2 text-sm font-semibold">대시보드 정의를 해석할 수 없습니다</div>
        <div>{source}</div>
        <div className="mt-2 text-red-400/80">{parsed.error}</div>
      </div>
    );
  }
  const def = parsed.def;

  // 필터 옵션은 첫 번째로 해당 필드를 가진 테이블에서 추출
  const filterOptions = (f: FilterDef) => {
    for (const s of sources) {
      const t = tables[s];
      if (t?.headers.includes(f.field)) return [...new Set(t.rows.map((r) => r[f.field]))].sort();
    }
    return [];
  };

  const rowsFor = (w: Widget) => {
    const t = tables[w.source];
    if (!t) return null;
    let rows = applyWhere(t.rows, w.where);
    for (const f of def.filters ?? []) {
      const v = filterState[f.id];
      if (!v || f.bound === false) continue; // bound:false → 선택해도 반영되지 않는 버그
      if (t.headers.includes(f.field)) rows = rows.filter((r) => r[f.field] === v);
    }
    return { rows, headers: t.headers };
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-strong">{def.title}</h1>
          {def.subtitle && <div className="mt-0.5 text-xs text-dim">{def.subtitle}</div>}
        </div>
        {!!def.filters?.length && (
          <div className="flex flex-wrap items-center gap-2">
            {def.filters.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 text-xs text-dim">
                {f.label}
                <select
                  value={filterState[f.id] ?? ''}
                  onChange={(e) => setFilterState((s) => ({ ...s, [f.id]: e.target.value }))}
                  className="rounded border border-line2 bg-panel2 px-2 py-1 text-xs text-fg outline-none focus:border-sky-700"
                >
                  <option value="">전체</option>
                  {filterOptions(f).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {def.widgets.map((w, i) => {
          const data = rowsFor(w);
          const isKpi = w.type === 'kpi';
          const span = isKpi ? '' : w.span === 2 ? 'lg:col-span-2 2xl:col-span-4' : 'lg:col-span-1 2xl:col-span-2';
          return (
            <div key={i} className={`rounded-md border border-line bg-panel p-3 ${span}`}>
              <div className="mb-1 text-[11px] font-medium text-dim">{w.title}</div>
              {!data ? (
                <div className="py-6 text-center text-xs text-red-300">데이터 소스 없음: {w.source}</div>
              ) : (
                <WidgetBody w={w} rows={data.rows} headers={data.headers} allRows={tables[w.source]?.rows ?? []} />
              )}
              {w.note && <div className="mt-1 text-[10.5px] text-faint">{w.note}</div>}
            </div>
          );
        })}
      </div>
      {def.footer && <div className="mt-3 text-[11px] text-faint">{def.footer}</div>}
    </div>
  );
}

function WidgetBody({ w, rows, headers, allRows }: { w: Widget; rows: Record<string, string>[]; headers: string[]; allRows: Record<string, string>[] }) {
  switch (w.type) {
    case 'kpi':
      return (
        <div className="font-mono text-2xl font-semibold text-strong">
          {fmt(w.limits ? alarmsOf(rows, w).length : aggregate(rows, w), w.unit)}
        </div>
      );
    case 'bar':
      return <BarWidget w={w} rows={rows} allRows={allRows} />;
    case 'line':
      return <LineWidget w={w} rows={rows} allRows={allRows} />;
    case 'histogram':
      return <HistWidget w={w} rows={rows} />;
    case 'wafermap':
      return <WaferMapWidget w={w} rows={rows} />;
    case 'alarms':
      return <SimpleTable columns={['시각', '설비', '값', '기준']} rows={alarmsOf(rows, w).map((a) => [a.time, a.series, a.value.toFixed(2), a.limit])} emptyText="이탈 없음" />;
    case 'table': {
      const cols = w.columns ?? headers;
      return <SimpleTable columns={cols} rows={rows.map((r) => cols.map((c) => r[c]))} />;
    }
  }
}

function SimpleTable({ columns, rows, emptyText = '데이터 없음' }: { columns: string[]; rows: string[][]; emptyText?: string }) {
  return (
    <div className="max-h-56 overflow-auto">
      <div className="mb-1 text-[10.5px] text-faint">{rows.length}건</div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-faint">{emptyText}</div>
      ) : (
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 bg-panel">
            <tr>
              {columns.map((c) => (
                <th key={c} className="border-b border-line2 px-2 py-1 text-left font-medium text-dim">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r, i) => (
              <tr key={i} className="hover:bg-panel2">
                {r.map((c, j) => (
                  <td key={j} className="border-b border-line/60 px-2 py-0.5 whitespace-nowrap text-fg">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BarWidget({ w, rows, allRows }: { w: Widget; rows: Record<string, string>[]; allRows: Record<string, string>[] }) {
  const option = useMemo(() => {
    if (w.groupBy) {
      const groups = [...new Set(rows.map((r) => r[w.groupBy!]))].sort();
      const vals = groups.map((g) => aggregate(rows.filter((r) => r[w.groupBy!] === g), w));
      return {
        ...baseOption(),
        tooltip: { ...(baseOption().tooltip as object), trigger: 'axis', valueFormatter: (v: number) => fmt(v, '%') },
        xAxis: { type: 'category', data: groups, ...axis({ splitLine: { show: false } }) },
        yAxis: { type: 'value', ...axis() },
        series: [
          {
            type: 'bar',
            data: vals.map((v) => (v === null ? null : Number(v.toFixed(2)))),
            barMaxWidth: 28,
            itemStyle: { color: '#3574f0', borderRadius: [4, 4, 0, 0] },
            label: { show: true, position: 'top', color: INK.secondary, fontSize: 10, formatter: (p: { value: number }) => fmt(p.value) },
          },
        ],
      };
    }
    const xs = rows.map((r) => r[w.x!]);
    const domain = w.color ? [...new Set(allRows.map((r) => r[w.color!]))].sort() : [];
    const series = w.color
      ? domain.map((cat) => ({
          name: cat,
          type: 'bar',
          stack: 'one',
          barMaxWidth: 22,
          itemStyle: { color: colorFor(domain, cat), borderRadius: [4, 4, 0, 0] },
          data: rows.map((r) => (r[w.color!] === cat ? num(r[w.y!]) : null)),
        }))
      : [{ type: 'bar', barMaxWidth: 22, itemStyle: { color: '#3574f0', borderRadius: [4, 4, 0, 0] }, data: rows.map((r) => num(r[w.y!])) }];
    return {
      ...baseOption(),
      tooltip: { ...(baseOption().tooltip as object), trigger: 'axis' },
      xAxis: { type: 'category', data: xs, ...axis({ splitLine: { show: false }, axisLabel: { color: INK.muted, fontSize: 9.5, rotate: 45 } }) },
      yAxis: { type: 'value', ...axis() },
      grid: { left: 44, right: 16, top: 30, bottom: 54 },
      series,
    };
  }, [w, rows, allRows]);
  return <EChart option={option} height={w.groupBy ? 200 : 240} />;
}

function LineWidget({ w, rows, allRows }: { w: Widget; rows: Record<string, string>[]; allRows: Record<string, string>[] }) {
  const option = useMemo(() => {
    const domain = w.series ? [...new Set(allRows.map((r) => r[w.series!]))].sort() : ['value'];
    const present = w.series ? [...new Set(rows.map((r) => r[w.series!]))].sort() : ['value'];
    const xs = [...new Set(rows.map((r) => r[w.x!]))].sort();
    const series = present.map((s) => {
      const byX = new Map(rows.filter((r) => !w.series || r[w.series] === s).map((r) => [r[w.x!], num(r[w.y!])]));
      const lim = w.limits?.[s];
      const color = colorFor(domain, s);
      return {
        name: s,
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        data: xs.map((x) => byX.get(x) ?? null),
        markLine:
          lim && present.length <= 2
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color, type: 'dashed', width: 1 },
                label: { color: INK.secondary, fontSize: 10, formatter: '{b}' },
                data: [
                  ...(lim.ucl !== undefined ? [{ name: `${s} UCL ${lim.ucl}`, yAxis: lim.ucl }] : []),
                  ...(lim.lcl !== undefined ? [{ name: `${s} LCL ${lim.lcl}`, yAxis: lim.lcl }] : []),
                ],
              }
            : undefined,
      };
    });
    return {
      ...baseOption(),
      tooltip: { ...(baseOption().tooltip as object), trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.muted } } },
      xAxis: { type: 'category', data: xs, ...axis({ splitLine: { show: false }, axisLabel: { color: INK.muted, fontSize: 10, formatter: (v: string) => v.slice(-5) } }) },
      yAxis: { type: 'value', scale: true, ...axis() },
      grid: { left: 44, right: 70, top: 30, bottom: 28 },
      series,
    };
  }, [w, rows, allRows]);
  return <EChart option={option} height={260} />;
}

function HistWidget({ w, rows }: { w: Widget; rows: Record<string, string>[] }) {
  const option = useMemo(() => {
    const vals = rows.map((r) => num(r[w.field!])).filter((v): v is number => v !== null);
    const bins = w.bins ?? 20;
    const min = Math.min(...vals, w.markLine ?? Infinity);
    const max = Math.max(...vals);
    const step = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - min) / step))]++;
    const labels = counts.map((_, i) => (min + i * step).toFixed(step < 1 ? 2 : 0));
    const markIdx = w.markLine !== undefined ? Math.floor((w.markLine - min) / step) : -1;
    return {
      ...baseOption(),
      tooltip: { ...(baseOption().tooltip as object), trigger: 'axis' },
      xAxis: { type: 'category', data: labels, ...axis({ splitLine: { show: false } }) },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          type: 'bar',
          barCategoryGap: '8%',
          data: counts.map((c, i) => ({ value: c, itemStyle: { color: i < markIdx ? '#e66767' : '#3574f0', borderRadius: [3, 3, 0, 0] } })),
          markLine:
            markIdx >= 0
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: INK.secondary, type: 'dashed' },
                  label: { color: INK.secondary, formatter: `spec ${w.markLine}` },
                  data: [{ xAxis: markIdx }],
                }
              : undefined,
        },
      ],
    };
  }, [w, rows]);
  return <EChart option={option} height={220} />;
}

function WaferMapWidget({ w, rows }: { w: Widget; rows: Record<string, string>[] }) {
  const key = (r: Record<string, string>) => (w.key ?? []).map((k) => r[k]).join(' / ');
  const wafers = useMemo(() => [...new Set(rows.map(key))].sort(), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const shown = wafers.length <= 24 ? wafers : wafers.slice(0, 24);
  const xs = rows.map((r) => num(r[w.x!]) ?? 0);
  const ys = rows.map((r) => num(r[w.y!]) ?? 0);
  const R = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs), 1) + 0.6;
  const fail = (v: number | null) => v !== null && v < (w.failBelow ?? 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {wafers.map((k) => (
          <button
            key={k}
            onClick={() => setSel(sel === k ? null : k)}
            className={`rounded border px-1.5 py-px font-mono text-[10px] ${sel === k ? 'border-sky-600 text-sky-300' : 'border-line2 text-faint hover:text-fg'}`}
          >
            {k.replace('SIM-', '')}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {(sel ? [sel] : shown).map((k) => {
          const wr = rows.filter((r) => key(r) === k);
          const nf = wr.filter((r) => fail(num(r[w.value!]))).length;
          const size = sel ? 260 : wafers.length > 8 ? 92 : 118;
          return (
            <div key={k} className="text-center">
              <svg width={size} height={size} viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="cursor-pointer" onClick={() => setSel(sel === k ? null : k)}>
                <circle cx={0} cy={0} r={R - 0.05} fill="#26282b" stroke="#4a4d52" strokeWidth={0.08} />
                {wr.map((r, i) => {
                  const v = num(r[w.value!]);
                  const x = num(r[w.x!]) ?? 0;
                  const y = num(r[w.y!]) ?? 0;
                  const id = `${k}:${x},${y}`;
                  return (
                    <rect
                      key={i}
                      x={x - 0.45}
                      y={-y - 0.45}
                      width={0.9}
                      height={0.9}
                      rx={0.12}
                      fill={fail(v) ? '#e66767' : '#199e70'}
                      opacity={hover === id ? 1 : fail(v) ? 0.95 : 0.55}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <title>{`${k} (${x}, ${y})  ${w.value}=${v ?? 'NA'}  ${fail(v) ? 'FAIL' : 'PASS'}`}</title>
                    </rect>
                  );
                })}
              </svg>
              <div className="font-mono text-[10px] text-dim">
                {k.replace('SIM-', '')} · <span className={nf / wr.length > 0.2 ? 'text-red-300' : ''}>{((nf / Math.max(1, wr.length)) * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#e66767]" /> FAIL (&lt; {w.failBelow})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#199e70] opacity-60" /> PASS
        </span>
        <span>{wafers.length > 24 && !sel ? `처음 24장 표시 · 버튼으로 wafer 선택` : 'wafer 클릭: 확대/축소 · die hover: 측정값'}</span>
      </div>
    </div>
  );
}
