import { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../engine/ansi';
import { agentChoices, composePrompt } from '../../engine/choices';
import { useSession } from '../../store/session';
import { agentColor, useSim } from '../common';

/**
 * 객관식 선택 카드 (코딩 Agent CLI 스타일).
 *  - Agent 질문(gate): 단일 선택(라디오) / 복수 선택(체크박스). tool이 있으면 도구 실행 승인 프롬프트
 *  - 프롬프트 작성: 지시 1개(단일) + 조건(복수, 선택사항) → 보낼 프롬프트 미리보기
 *  - plan mode: Shift+Tab — Agent가 계획만 세우고 승인을 기다린다
 *  - 키보드: 1–9 선택/토글 · ↑↓ 이동 · Space 토글 · Enter 확정 · Shift+Tab plan mode · Esc 접기
 * 선택 결과는 구조화 명령(do / agent choose)으로 기록되어 재생·복기된다.
 */
export default function ChoiceCard({ paneId, agentId, onFreeText }: { paneId: string; agentId: string; onFreeText: () => void }) {
  const sim = useSim()!;
  const input = useSession.getState().input;
  const focused = useSession((s) => s.focusedPane === paneId);
  const ch = agentChoices(sim, agentId);
  const key = ch ? (ch.mode === 'gate' ? `gate:${ch.gate.id}` : ch.mode) : 'none';
  const [single, setSingle] = useState<number>(-1);
  const [multi, setMulti] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 선택 상황이 바뀌면 초기화
  useEffect(() => {
    setSingle(-1);
    setMulti(new Set());
    setCursor(0);
    if (key.startsWith('gate') || key === 'confirm') setCollapsed(false);
  }, [key, sim.tick === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focused && (key.startsWith('gate') || key === 'confirm')) ref.current?.focus();
  }, [key, focused]);

  const prompt = useMemo(
    () => (ch?.mode === 'gate' ? sim.resolveLines(ch.gate.prompt, sim.agents[agentId]).map(stripAnsi) : []),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!ch || sim.submitted) return null;
  const run = (cmd: string) => input(paneId, cmd);

  if (ch.mode === 'busy') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-term2 px-2 py-1.5">
        <span className="text-[11px] text-faint">작업 중 —</span>
        {ch.actions.map((a) => (
          <button key={a.command} onClick={() => run(a.command)} className="rounded border border-line2 px-2 py-0.5 text-[11.5px] text-dim hover:border-sky-700 hover:text-fg">
            {a.label}
          </button>
        ))}
        <button onClick={onFreeText} className="ml-auto text-[11px] text-faint hover:text-fg">
          직접 입력 ⌨
        </button>
      </div>
    );
  }

  // 공통 목록 모델
  const isGate = ch.mode === 'gate' || ch.mode === 'confirm';
  const isMulti = ch.mode === 'gate' && ch.multi;
  const primary = ch.mode === 'instruct' ? ch.instructions : ch.options;
  const mods = ch.mode === 'instruct' ? ch.modifiers : [];
  const total = primary.length + mods.length;
  const title =
    ch.mode === 'gate' ? ch.gate.title : ch.mode === 'confirm' ? ch.title : `${agentId}에게 보낼 프롬프트`;
  const blocked = ch.mode === 'gate' && ch.gate.kind === 'blocked';
  const tool = ch.mode === 'gate' ? ch.gate.tool : undefined;
  // 결정 요청(gate/confirm)은 색을 입힌 면, 일상 지시(instruct)는 중립 면 — 한눈에 '내가 답해야 하는 것'이 구분되게
  const tone = isGate
    ? blocked
      ? { box: 'border-red-500/80 bg-[#1c0f12]', head: 'bg-red-500/15', title: 'text-red-100', chip: 'bg-red-400 text-red-950', chipText: tool ? '도구 실행 — 결정 필요' : '차단 — 결정 필요', mark: 'border-red-300 bg-red-400/30', dot: 'bg-red-200', btn: 'bg-red-400 text-red-950 hover:bg-red-300', foot: 'bg-[#1c0f12]', row: 'bg-red-500/10' }
      : { box: 'border-amber-500/80 bg-[#1a1509]', head: 'bg-amber-500/15', title: 'text-amber-50', chip: 'bg-amber-400 text-amber-950', chipText: tool ? '도구 실행 승인' : '결정 필요', mark: 'border-amber-300 bg-amber-400/30', dot: 'bg-amber-200', btn: 'bg-amber-400 text-amber-950 hover:bg-amber-300', foot: 'bg-[#1a1509]', row: 'bg-amber-500/10' }
    : { box: 'border-line2 bg-term2', head: '', title: 'text-fg', chip: '', chipText: '', mark: 'border-sky-400 bg-sky-500/30', dot: 'bg-sky-300', btn: 'bg-sky-500/90 text-slate-950 hover:bg-sky-400', foot: 'bg-term2', row: 'bg-panel2' };

  const toggleMod = (i: number) =>
    setMulti((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const pick = (idx: number) => {
    setCursor(idx);
    if (idx < primary.length) {
      if (isMulti) toggleMod(idx);
      else setSingle(idx);
    } else toggleMod(idx);
  };

  const canSubmit = isMulti ? multi.size >= (ch.mode === 'gate' ? ch.min : 1) && multi.size <= (ch.mode === 'gate' ? ch.max : 99) : single >= 0;

  const submit = () => {
    if (!canSubmit) return;
    if (ch.mode === 'gate') {
      const nums = isMulti ? [...multi].sort((a, b) => a - b).map((i) => i + 1) : [single + 1];
      run(`agent choose ${agentId} ${nums.join(',')}`);
    } else if (ch.mode === 'confirm') {
      run(`agent choose ${agentId} ${single + 1}`);
    } else {
      const intent = ch.instructions[single];
      const chosenMods = [...multi].filter((i) => i >= primary.length).map((i) => ch.modifiers[i - primary.length].id);
      run(`do ${agentId} ${intent.id}${chosenMods.map((m) => ` +${m}`).join('')}${planMode ? ' --plan' : ''}`);
      setMulti(new Set());
      setSingle(-1);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Tab' && e.shiftKey && ch.mode === 'instruct') {
      e.preventDefault();
      setPlanMode((v) => !v);
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && n <= total) {
      e.preventDefault();
      pick(n - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(total - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === ' ') {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!canSubmit && cursor < primary.length && !isMulti) {
        setSingle(cursor);
        return;
      }
      submit();
    } else if (e.key === 'Escape') {
      setCollapsed(true);
      onFreeText();
    }
  };

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-term2 px-2 py-1">
        <button
          onClick={() => setCollapsed(false)}
          className={`rounded px-2 py-0.5 text-[11.5px] ${isGate ? 'attn bg-amber-500/15 font-semibold text-amber-200' : 'text-sky-300 hover:bg-panel2'}`}
        >
          ▸ {isGate ? `선택 필요: ${title}` : '프롬프트 작성'}
        </button>
      </div>
    );
  }

  const row = (idx: number, label: string, note: string | undefined, multiMark: boolean, k: string) => {
    const selected = multiMark ? multi.has(idx) : single === idx;
    return (
      <button
        key={k}
        type="button"
        onClick={() => pick(idx)}
        onMouseEnter={() => setCursor(idx)}
        className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left text-[12.5px] ${cursor === idx && focused ? tone.row : ''} ${
          selected ? `${tone.row} text-strong` : isGate ? 'text-fg' : 'text-dim'
        } ${isGate ? 'hover:bg-white/5' : 'hover:bg-panel2'}`}
      >
        <span className="w-4 shrink-0 font-mono text-[11px] text-faint">{idx + 1 <= 9 ? idx + 1 : ''}</span>
        <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${multiMark ? 'rounded-sm' : 'rounded-full'} ${selected ? tone.mark : 'border-line2'}`}>
          {selected && <span className={`${multiMark ? 'h-2 w-2 rounded-[1px]' : 'h-1.5 w-1.5 rounded-full'} ${tone.dot}`} />}
        </span>
        <span className="flex-1 leading-snug">
          {label}
          {note && <span className="ml-2 text-[10.5px] text-amber-300/80">{note}</span>}
        </span>
      </button>
    );
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => useSession.getState().focusPane(paneId)}
      className={`${isGate ? 'max-h-[78%] min-h-[45%] border-t-2' : 'max-h-[55%] border-t'} shrink-0 overflow-y-auto px-2 pb-1.5 outline-none ${tone.box}`}
    >
      <div className={`-mx-2 mb-1 flex items-start gap-2 px-3 ${isGate ? `pt-2 pb-2 ${tone.head}` : 'pt-1.5'}`}>
        <div className="flex-1">
          {isGate ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide ${tone.chip}`}>{tool ? '⏺' : blocked ? '⛔' : '⏸'} {tone.chipText}</span>
                {isMulti && ch.mode === 'gate' && <span className="text-[10.5px] text-amber-200/80">복수 선택 · {ch.min}~{ch.max}개</span>}
              </div>
              {tool && (
                <div className="mb-1.5 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11.5px] break-all text-strong">{tool}</div>
              )}
              <div className={`text-[13.5px] font-semibold ${tone.title}`}>{title}</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[12px] text-dim">
                <span className="font-mono font-semibold" style={{ color: agentColor(sim, agentId) }}>
                  {agentId}
                </span>
                에게 보낼 프롬프트
                <button
                  onClick={() => setPlanMode((v) => !v)}
                  title="Shift+Tab — plan mode에서는 Agent가 계획만 세우고 승인을 기다립니다"
                  className={`ml-auto rounded px-1.5 py-px text-[10.5px] ${planMode ? 'bg-cyan-500/20 font-semibold text-cyan-200' : 'text-faint hover:text-fg'}`}
                >
                  {planMode ? '⏸ plan mode 켜짐' : 'plan mode 꺼짐'} · Shift+Tab
                </button>
              </div>
              <div className={`mt-1 rounded border px-2 py-1.5 font-mono text-[12px] leading-snug ${single >= 0 ? 'border-line2 bg-black/30 text-strong' : 'border-dashed border-line2 text-faint'}`}>
                <span className="text-dim">&gt; </span>
                {ch.mode === 'instruct' && single >= 0
                  ? composePrompt(
                      ch.instructions[single].label,
                      [...multi].filter((i) => i >= primary.length).sort((x, y) => x - y).map((i) => ch.modifiers[i - primary.length].label),
                    )
                  : '아래에서 시킬 일을 고르면 프롬프트가 만들어집니다'}
              </div>
            </>
          )}
          {prompt.map((l, i) => (
            <div key={i} className={`text-[12px] leading-snug ${isGate ? 'text-fg/80' : 'text-dim'}`}>
              {l}
            </div>
          ))}
        </div>
        <button onClick={() => setCollapsed(true)} className="text-[11px] text-faint hover:text-fg" title="접기 (Esc)">
          ▾
        </button>
      </div>
      {ch.mode === 'instruct' && <div className="px-1 pt-1 text-[10.5px] tracking-wide text-faint">무엇을 시킬까요 — 하나 선택</div>}
      {primary.map((o, i) => (
        row(i, o.label, 'note' in o ? (o as { note?: string }).note : undefined, isMulti, o.id)
      ))}
      {ch.mode === 'instruct' && primary.length === 0 && <div className="px-3 py-1 text-[11.5px] text-faint">지금 이 Agent에게 줄 수 있는 지시가 없습니다.</div>}
      {mods.length > 0 && (
        <>
          <div className="px-1 pt-2 text-[10.5px] tracking-wide text-faint">프롬프트에 덧붙일 조건 — 복수 선택 (선택사항)</div>
          {mods.map((m, j) => (
            row(primary.length + j, m.label, m.note, true, m.id)
          ))}
        </>
      )}
      <div className={`sticky bottom-0 -mx-2 mt-1.5 flex items-center gap-2 border-t border-line px-3 pt-1.5 pb-0.5 ${tone.foot}`}>
        <button
          disabled={!canSubmit}
          onClick={submit}
          className={`rounded px-3 py-1 text-[12px] font-semibold disabled:opacity-30 ${tone.btn}`}
        >
          {ch.mode === 'instruct' ? (planMode ? '계획 요청 ⏎' : '보내기 ⏎') : '확인 ⏎'}
        </button>
        {ch.mode === 'instruct' &&
          ch.actions.map((a) => (
            <button key={a.command} onClick={() => run(a.command)} className="rounded border border-line2 px-2 py-0.5 text-[11.5px] text-dim hover:text-fg">
              {a.label}
            </button>
          ))}
        <span className="ml-auto text-[10.5px] text-faint">1–9 선택 · Space 토글 · ⏎ 확정{ch.mode === 'instruct' ? ' · Shift+Tab plan mode' : ''}</span>
        <button onClick={onFreeText} className="text-[11px] text-faint hover:text-fg">
          직접 입력 ⌨
        </button>
      </div>
    </div>
  );
}
