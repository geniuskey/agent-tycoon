import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCsv } from '../../engine/csv';
import type { Simulation } from '../../engine/engine';
import { formatSimTime } from '../../engine/engine';
import { useSession } from '../../store/session';
import { Btn, agentColor, useSim } from '../common';
import BoardView from './BoardView';
import DashboardView from './DashboardView';
import { BOARD_URL, WIKI_URL } from '../../engine/cli';
import WikiIndex from './WikiIndex';
import DbConsole from './DbConsole';
import EvalView from './EvalView';
import Markdown from './Markdown';
import ScanView from './ScanView';

/**
 * 가상 브라우저. sim:// URL만 열 수 있으며 외부 네트워크에 접근하지 않는다.
 * 각 페이지는 가상 파일(source)을 렌더링하므로 Agent의 파일 변경이 즉시 반영된다.
 */
export default function Browser() {
  const sim = useSim()!;
  const url = useSession((s) => s.browserUrl);
  const idx = useSession((s) => s.browserIndex);
  const histLen = useSession((s) => s.browserHistory.length);
  const { navigate, browserBack, browserForward } = useSession.getState();
  const [addr, setAddr] = useState(url);
  useEffect(() => setAddr(url), [url]);

  const page = sim.scenario.pages.find((p) => p.url === url);
  const file = page ? sim.files.get(page.source) : undefined;
  const version = file?.versions.length ?? 0;
  const last = file?.versions[file.versions.length - 1];

  // 버전 변경 감지 → 업데이트 배너
  const seen = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const prev = seen.current[url];
    seen.current[url] = version;
    if (prev !== undefined && prev !== version && version > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2500);
      return () => clearTimeout(t);
    }
  }, [url, version]);

  const go = (u: string) => {
    const t = u.trim();
    navigate(t.startsWith('sim://') ? t : `sim://${t.replace(/^\/+/, '')}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1.5">
        <Btn onClick={browserBack} disabled={idx === 0} title="뒤로">
          ←
        </Btn>
        <Btn onClick={browserForward} disabled={idx >= histLen - 1} title="앞으로">
          →
        </Btn>
        <Btn onClick={() => navigate('sim://home')} title="홈">
          ⌂
        </Btn>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(addr);
          }}
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            spellCheck={false}
            className="w-full rounded-full border border-line2 bg-bg px-3 py-1 font-mono text-xs text-fg outline-none focus:border-sky-700"
          />
        </form>
        <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-faint" title="격리된 가상 브라우저 — 외부 네트워크 접근 없음">
          sandbox
        </span>
      </div>
      {flash && last && (
        <div className="flash border-b border-sky-900 bg-sky-950/40 px-3 py-1 text-[11px] text-sky-300">
          ↻ 페이지가 갱신되었습니다 — v{version} · {last.by} · {formatSimTime(last.tick)}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-paper">
        {url === 'sim://home' ? (
          <HomePage sim={sim} />
        ) : url === BOARD_URL ? (
          <BoardView sim={sim} />
        ) : url === WIKI_URL ? (
          <WikiIndex sim={sim} />
        ) : !page ? (
          <ErrorPage title="404 — 페이지를 찾을 수 없습니다" detail={`${url} 은(는) 이 시나리오에 없는 주소입니다.`} />
        ) : !file ? (
          <ErrorPage
            title="아직 생성되지 않은 화면입니다"
            detail={`${page.title} 화면은 ${page.source} 파일이 생성되면 표시됩니다. 담당 Agent에게 작업을 지시하세요.`}
          />
        ) : page.view === 'dashboard' ? (
          <DashboardView key={url} sim={sim} source={page.source} />
        ) : page.view === 'table' ? (
          <TableView content={file.content} title={page.title} />
        ) : page.view === 'eval' ? (
          <EvalView content={file.content} />
        ) : page.view === 'db' ? (
          <DbConsole content={file.content} />
        ) : page.view === 'scan' ? (
          <ScanView content={file.content} />
        ) : page.view === 'text' ? (
          <pre className="px-5 py-4 font-mono text-[12px] leading-6 whitespace-pre-wrap text-fg">{file.content}</pre>
        ) : page.view === 'mail' ? (
          <MailView content={file.content} />
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-5">
            <Markdown text={file.content} />
          </div>
        )}
      </div>
      {page && file && (
        <div className="flex items-center gap-3 border-t border-line bg-panel px-3 py-1 text-[10.5px] text-faint">
          <span className="font-mono">{page.source}</span>
          <span>v{version}</span>
          {last && <span>마지막 수정: {last.by} · {formatSimTime(last.tick)}</span>}
        </div>
      )}
    </div>
  );
}

function HomePage({ sim }: { sim: Simulation }) {
  const { navigate } = useSession.getState();
  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="mb-1 text-xs text-faint">{sim.scenario.company.name} · 사내 포털 (가상)</div>
      <h1 className="mb-4 text-lg font-semibold text-strong">업무 화면</h1>
      <div className="grid gap-2">
        <BoardLink sim={sim} />
        {sim.scenario.pages.some((p) => p.url.startsWith(WIKI_URL + '/')) && (
          <button
            onClick={() => navigate(WIKI_URL)}
            className="mb-2 flex items-center gap-3 rounded-md border border-violet-800/70 bg-violet-500/[0.06] px-3 py-2.5 text-left hover:border-violet-600"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-violet-400/80" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-strong">사내 위키</span>
              <span className="font-mono text-[11px] text-faint">{WIKI_URL}</span>
            </span>
          </button>
        )}
        {sim.scenario.pages.filter((p) => !p.url.startsWith(WIKI_URL + '/')).map((p) => {
          const f = sim.files.get(p.source);
          const by = f?.versions[f.versions.length - 1].by;
          const byAgent = by && by !== 'scenario' && by !== 'user' && sim.agents[by] !== undefined;
          return (
            <button
              key={p.url}
              onClick={() => navigate(p.url)}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                f ? 'border-line2 bg-paper2 hover:border-sky-700' : 'border-dashed border-line bg-transparent hover:border-line2'
              }`}
            >
              {/* 입력 자료(시나리오 제공)는 □, Agent 산출물은 ■ — 무엇이 '만들어진 것'인지 구분 */}
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${f ? (byAgent ? '' : 'border border-dim') : 'border border-dashed border-faint'}`}
                style={byAgent ? { background: agentColor(sim, by!) } : undefined}
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] ${f ? 'font-medium text-strong' : 'text-faint'}`}>{p.title}</span>
                <span className="font-mono text-[11px] text-faint">{p.url}</span>
              </span>
              {f ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-line px-1.5 py-px font-mono text-dim">v{f.versions.length}</span>
                  <span className={byAgent ? 'font-mono font-semibold' : 'text-faint'} style={byAgent ? { color: agentColor(sim, by!) } : undefined}>
                    {byAgent ? by : '제공 자료'}
                  </span>
                </span>
              ) : (
                <span className="text-[11px] text-faint italic">아직 없음</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoardLink({ sim }: { sim: Simulation }) {
  const { navigate } = useSession.getState();
  const tasks = sim.visibleTasks();
  const done = tasks.filter((t) => t.status === 'done').length;
  const attention = tasks.filter((t) => ['waiting', 'blocked', 'failed'].includes(t.status)).length;
  return (
    <button
      onClick={() => navigate(BOARD_URL)}
      className="mb-2 flex items-center gap-3 rounded-md border border-sky-800/70 bg-sky-500/[0.06] px-3 py-2.5 text-left hover:border-sky-600"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-sky-400/80" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-strong">업무 보드</span>
        <span className="font-mono text-[11px] text-faint">{BOARD_URL}</span>
      </span>
      <span className="text-[11px] text-dim">
        {done}/{tasks.length} 완료{attention > 0 && <span className="ml-1.5 text-amber-300">확인 필요 {attention}</span>}
      </span>
    </button>
  );
}

function ErrorPage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-3xl text-faint">∅</div>
      <div className="text-sm font-medium text-dim">{title}</div>
      <div className="max-w-sm text-xs text-faint">{detail}</div>
    </div>
  );
}

export function TableView({ content, title }: { content: string; title?: string }) {
  const t = useMemo(() => parseCsv(content), [content]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    let r = t.rows;
    if (q) r = r.filter((row) => Object.values(row).some((v) => v.toLowerCase().includes(q.toLowerCase())));
    if (sort) {
      r = [...r].sort((a, b) => {
        const x = a[sort.col];
        const y = b[sort.col];
        const nx = Number(x);
        const ny = Number(y);
        const cmp = !isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y);
        return cmp * sort.dir;
      });
    }
    return r;
  }, [t, q, sort]);
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        {title && <span className="text-sm font-semibold text-strong">{title}</span>}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색…"
          className="ml-auto w-48 rounded border border-line2 bg-panel2 px-2 py-1 text-xs outline-none focus:border-sky-700"
        />
        <span className="text-[11px] text-faint">
          {rows.length.toLocaleString()} / {t.rows.length.toLocaleString()}행
        </span>
      </div>
      <div className="overflow-auto rounded border border-line">
        <table className="w-full border-collapse font-mono text-[11.5px]">
          <thead className="sticky top-0 bg-panel2">
            <tr>
              {t.headers.map((h) => (
                <th
                  key={h}
                  onClick={() => setSort((s) => (s?.col === h ? { col: h, dir: s.dir === 1 ? -1 : 1 } : { col: h, dir: 1 }))}
                  className="cursor-pointer border-b border-line2 px-2 py-1.5 text-left font-medium whitespace-nowrap text-dim hover:text-fg"
                >
                  {h} {sort?.col === h ? (sort.dir === 1 ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((r, i) => (
              <tr key={i} className="hover:bg-panel2">
                {t.headers.map((h) => (
                  <td key={h} className={`border-b border-line/50 px-2 py-0.5 whitespace-nowrap ${r[h] === 'NA' ? 'text-amber-400' : ''}`}>
                    {r[h]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 && <div className="p-2 text-center text-[11px] text-faint">처음 500행만 표시</div>}
      </div>
    </div>
  );
}

function MailView({ content }: { content: string }) {
  const lines = content.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2) ?? '';
  const meta = lines.filter((l) => /^\*\*(From|To|Cc|Date|Subject):\*\*/.test(l));
  const body = lines.filter((l) => !l.startsWith('# ') && !meta.includes(l)).join('\n');
  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <div className="mb-1 text-[11px] text-faint">사내 메일 (가상)</div>
      <h1 className="mb-3 text-lg font-semibold text-strong">{title}</h1>
      <div className="mb-4 rounded-md border border-line bg-panel px-3 py-2 text-xs">
        {meta.map((m) => {
          const [, k, v] = m.match(/^\*\*(\w+):\*\*\s*(.*)$/) ?? [];
          return (
            <div key={m} className="flex gap-2 py-0.5">
              <span className="w-16 text-faint">{k}</span>
              <span className="text-fg">{v}</span>
            </div>
          );
        })}
      </div>
      <Markdown text={body} />
    </div>
  );
}
