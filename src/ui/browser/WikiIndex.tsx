import type { Simulation } from '../../engine/engine';
import { formatSimTime } from '../../engine/engine';
import { WIKI_URL } from '../../engine/cli';
import { useSession } from '../../store/session';
import { agentColor } from '../common';

/**
 * 사내 위키 목록 (sim://wiki). 시나리오의 sim://wiki/… 페이지를 모아 보여준다.
 * 합의된 표준·규칙이 사람과 Agent가 함께 읽는 문서로 쌓이는 곳.
 */
export default function WikiIndex({ sim }: { sim: Simulation }) {
  const { navigate } = useSession.getState();
  const pages = sim.scenario.pages.filter((p) => p.url.startsWith(WIKI_URL + '/'));
  const published = pages.filter((p) => sim.files.has(p.source)).length;
  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="mb-1 text-xs text-faint">{sim.scenario.company.name} · 사내 위키 (가상)</div>
      <h1 className="text-lg font-semibold text-strong">사내 위키</h1>
      <p className="mt-1 mb-4 text-[12px] text-dim">
        부서 간 합의한 표준과 규칙. 사람과 AI Agent가 같은 문서를 읽습니다. ({published}/{pages.length} 게시)
      </p>
      {!pages.length && <div className="text-[12px] text-faint">아직 문서가 없습니다.</div>}
      <div className="grid gap-2">
        {pages.map((p) => {
          const f = sim.files.get(p.source);
          const last = f?.versions[f.versions.length - 1];
          const byAgent = last && sim.agents[last.by] !== undefined;
          return (
            <button
              key={p.url}
              onClick={() => navigate(p.url)}
              className={`rounded-md border px-3 py-2.5 text-left ${f ? 'border-line2 bg-paper2 hover:border-violet-600' : 'border-dashed border-line hover:border-line2'}`}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-[13.5px] ${f ? 'font-medium text-strong' : 'text-faint'}`}>{p.title}</span>
                <span className="ml-auto shrink-0 text-[11px]">
                  {f ? (
                    <>
                      <span className="rounded bg-line px-1.5 py-px font-mono text-dim">v{f.versions.length}</span>{' '}
                      <span className={byAgent ? 'font-mono' : 'text-faint'} style={byAgent ? { color: agentColor(sim, last!.by) } : undefined}>
                        {last!.by}
                      </span>{' '}
                      <span className="text-faint">· {formatSimTime(last!.tick)}</span>
                    </>
                  ) : (
                    <span className="text-faint italic">초안 없음</span>
                  )}
                </span>
              </div>
              {p.description && <div className="mt-0.5 text-[11.5px] text-faint">{p.description}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
