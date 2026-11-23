import { useMemo, useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { lineDiff, listDir } from '../../engine/cli';
import type { Simulation } from '../../engine/engine';
import { formatSimTime } from '../../engine/engine';
import { useSession } from '../../store/session';
import { Btn, useSim } from '../common';
import Markdown from '../browser/Markdown';
import { TableView } from '../browser/Browser';

export function FileExplorer() {
  const sim = useSim()!;
  const preview = useSession((s) => s.previewPath);
  const [open, setOpen] = useState<Record<string, boolean>>({ '/data': true, '/docs': true, '/work': true });
  // 최근 변경된 파일 강조
  const recent = useMemo(() => {
    const set = new Set<string>();
    for (const e of sim.events.slice(-40)) if ((e.type === 'file.created' || e.type === 'file.updated') && sim.tick - e.tick < 15) set.add(e.data!.path as string);
    return set;
  }, [sim.events.length, sim.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const { dirs, files } = listDir(sim, dir);
    return (
      <>
        {dirs.map((d) => {
          const path = (dir === '/' ? '' : dir) + '/' + d;
          const isOpen = open[path] ?? true;
          return (
            <div key={path}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [path]: !isOpen }))}
                className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs text-dim hover:bg-panel2"
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                <span className="w-3 text-faint">{isOpen ? '▾' : '▸'}</span>
                <span className="text-sky-300/80">{d}/</span>
              </button>
              {isOpen && renderDir(path, depth + 1)}
            </div>
          );
        })}
        {files.map((f) => {
          const path = (dir === '/' ? '' : dir) + '/' + f;
          const file = sim.files.get(path)!;
          return (
            <button
              key={path}
              onClick={() => useSession.getState().openFile(path)}
              title={file.description ?? path}
              className={`flex w-full items-center gap-1.5 px-2 py-0.5 text-left font-mono text-[11.5px] hover:bg-panel2 ${
                preview === path ? 'bg-sky-950/50 text-sky-200' : file.restricted ? 'text-red-300/80' : 'text-fg'
              } ${recent.has(path) ? 'flash' : ''}`}
              style={{ paddingLeft: 20 + depth * 12 }}
            >
              <span className="truncate">{f}</span>
              {file.restricted && <span title="보안 등급">🔒</span>}
              {file.versions.length > 1 && <span className="text-[10px] text-amber-300/80">v{file.versions.length}</span>}
              {file.createdBy !== 'scenario' && <span className="ml-auto text-[10px] text-faint">{file.createdBy}</span>}
            </button>
          );
        })}
      </>
    );
  };

  return (
    <div className="h-full overflow-auto py-1">
      {renderDir('/', 0)}
      <div className="px-3 pt-3 text-[10.5px] text-faint">파일 클릭 → 미리보기 · 터미널: ls, tree, cat, diff</div>
    </div>
  );
}

export function FilePreview() {
  const sim = useSim()!;
  const path = useSession((s) => s.previewPath);
  const [mode, setMode] = useState<'auto' | 'raw' | 'diff'>('auto');
  const [ver, setVer] = useState<number | null>(null);
  if (!path) return <div className="p-6 text-center text-xs text-faint">파일 탐색기에서 파일을 선택하세요.</div>;
  const f = sim.files.get(path);
  if (!f) return <div className="p-6 text-center text-xs text-faint">{path} — 삭제되었거나 없는 파일입니다.</div>;
  if (f.restricted)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-2xl">🔒</div>
        <div className="text-sm text-red-300">접근 권한이 없습니다</div>
        <div className="max-w-xs text-xs text-faint">{path} 는 보안 등급 데이터입니다. 접근 시도는 기록됩니다.</div>
      </div>
    );
  const vi = ver === null || ver >= f.versions.length ? f.versions.length - 1 : ver;
  const v = f.versions[vi];
  const ext = path.split('.').pop();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1 text-xs">
        <span className="truncate font-mono text-fg">{path}</span>
        <select
          value={vi}
          onChange={(e) => setVer(Number(e.target.value))}
          className="ml-auto rounded border border-line2 bg-panel2 px-1 py-0.5 text-[11px] text-dim"
        >
          {f.versions.map((x, i) => (
            <option key={i} value={i}>
              v{i + 1} · {x.by} · {formatSimTime(x.tick)}
            </option>
          ))}
        </select>
        <Btn variant={mode === 'auto' ? 'outline' : 'ghost'} onClick={() => setMode('auto')}>
          보기
        </Btn>
        <Btn variant={mode === 'raw' ? 'outline' : 'ghost'} onClick={() => setMode('raw')}>
          원본
        </Btn>
        <Btn variant={mode === 'diff' ? 'outline' : 'ghost'} disabled={vi === 0} onClick={() => setMode('diff')}>
          변경
        </Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-bg">
        {mode === 'diff' && vi > 0 ? (
          <pre className="p-3 font-mono text-[11.5px] leading-5">
            {lineDiff(f.versions[vi - 1].content, v.content).map((l, i) => {
              const t = stripAnsi(l);
              return (
                <div key={i} className={t.startsWith('+') ? 'bg-emerald-950/40 text-emerald-300' : t.startsWith('-') ? 'bg-red-950/40 text-red-300' : 'text-faint'}>
                  {t}
                </div>
              );
            })}
          </pre>
        ) : mode === 'auto' && ext === 'md' ? (
          <div className="px-5 py-4">
            <Markdown text={v.content} />
          </div>
        ) : mode === 'auto' && ext === 'csv' ? (
          <TableView content={v.content} />
        ) : (
          <CodeView text={ext === 'json' ? prettyJson(v.content) : v.content} />
        )}
      </div>
    </div>
  );
}

function prettyJson(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function CodeView({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <pre className="py-2 font-mono text-[11.5px] leading-5">
      {lines.map((l, i) => (
        <div key={i} className="flex hover:bg-panel2">
          <span className="w-10 shrink-0 pr-3 text-right text-faint select-none">{i + 1}</span>
          <span className="whitespace-pre-wrap text-fg">{l}</span>
        </div>
      ))}
    </pre>
  );
}

export type { Simulation };
