import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

/** 다크 표면용 검증된 categorical 팔레트 (고정 순서, 순환하지 않음) */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
export const INK = { primary: '#e5e9f0', secondary: '#a3acbb', muted: '#6b7689', grid: '#222b3b' };

/** 엔티티 이름 → 색 (필터로 개수가 바뀌어도 색이 유지되도록 전체 도메인 기준) */
export function colorFor(domain: string[], name: string): string {
  const i = domain.indexOf(name);
  return i < 0 || i >= SERIES.length ? '#8a96aa' : SERIES[i];
}

export const baseOption = (): EChartsCoreOption => ({
  backgroundColor: 'transparent',
  textStyle: { color: INK.secondary, fontFamily: 'inherit' },
  grid: { left: 44, right: 16, top: 28, bottom: 28, containLabel: false },
  tooltip: {
    backgroundColor: '#1a2131',
    borderColor: '#2c3749',
    textStyle: { color: INK.primary, fontSize: 12 },
  },
  legend: { top: 0, right: 0, textStyle: { color: INK.secondary, fontSize: 11 }, itemWidth: 10, itemHeight: 10, icon: 'roundRect' },
});

export const axis = (extra: object = {}) => ({
  axisLine: { lineStyle: { color: INK.grid } },
  axisTick: { show: false },
  axisLabel: { color: INK.muted, fontSize: 10.5 },
  splitLine: { lineStyle: { color: INK.grid, type: 'dashed' as const } },
  ...extra,
});

export default function EChart({ option, height = 220 }: { option: EChartsCoreOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);
  return <div ref={ref} style={{ height }} className="w-full" />;
}
