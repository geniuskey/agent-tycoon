/**
 * 데이터 콘솔 (view: "db") — 데이터 마트의 테이블·품질 검사·격리·권한을 보여준다.
 * 시나리오는 줄 단위 텍스트 파일 하나로 상태를 표현한다 (템플릿 {{#if}}로 줄을 넣고 뺀다):
 *   meta|<키>|<값>
 *   table|<이름>|<계층>|<행 수>|<오너>|<설명>|<ok|warn|fail>
 *   check|<규칙>|<대상>|<pass|fail|warn|skip>|<설명>
 *   quarantine|<대상>|<행 수>|<사유>
 *   grant|<역할>|<범위>
 */

type Row = string[];

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: '정상', cls: 'bg-emerald-500/15 text-emerald-200' },
  pass: { label: '통과', cls: 'bg-emerald-500/15 text-emerald-200' },
  warn: { label: '경고', cls: 'bg-amber-500/20 text-amber-200' },
  fail: { label: '실패', cls: 'bg-red-500/20 text-red-200' },
  skip: { label: '검사 안 함', cls: 'border border-line2 text-faint' },
};

function Chip({ s }: { s: string }) {
  const st = STATUS[s] ?? { label: s, cls: 'text-dim' };
  return <span className={`rounded px-1.5 py-px text-[10.5px] whitespace-nowrap ${st.cls}`}>{st.label}</span>;
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: string }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-[12.5px] font-semibold text-dim">{title}</h2>
      {children ?? <div className="text-[11.5px] text-faint">{empty}</div>}
    </section>
  );
}

export default function DbConsole({ content }: { content: string }) {
  const rows: Row[] = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
  const of = (k: string) => rows.filter((r) => r[0] === k).map((r) => r.slice(1));
  const meta = Object.fromEntries(of('meta').map(([k, v]) => [k, v]));
  const tables = of('table');
  const checks = of('check');
  const quarantine = of('quarantine');
  const grants = of('grant');
  const failed = checks.filter((c) => c[2] === 'fail').length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="mb-1 text-[11px] text-faint">데이터 콘솔 (가상) · {meta.db ?? 'mart'}</div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold text-strong">{meta.title ?? '데이터 마트'}</h1>
        {meta.last_load && <span className="text-[11.5px] text-dim">마지막 적재 {meta.last_load}</span>}
        {checks.length > 0 && (
          <span className={`text-[11.5px] ${failed ? 'text-red-300' : 'text-emerald-300'}`}>
            품질 검사 {checks.length - failed}/{checks.length} 통과
          </span>
        )}
      </div>

      <Section title="테이블">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-faint">
              <th className="py-1 pr-2 font-normal">이름</th>
              <th className="py-1 pr-2 font-normal">계층</th>
              <th className="py-1 pr-2 text-right font-normal">행</th>
              <th className="py-1 pr-2 font-normal">오너</th>
              <th className="py-1 font-normal">상태</th>
            </tr>
          </thead>
          <tbody>
            {tables.map(([name, layer, n, owner, desc, st]) => (
              <tr key={name} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-mono text-strong">{name}</div>
                  {desc && <div className="text-[11px] text-faint">{desc}</div>}
                </td>
                <td className="py-1.5 pr-2 text-dim">{layer}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-fg tabular-nums">{n}</td>
                <td className="py-1.5 pr-2 text-dim">{owner}</td>
                <td className="py-1.5">
                  <Chip s={st} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="품질 검사" empty="정의된 품질 규칙이 없습니다.">
        {checks.length ? (
          <ul className="space-y-1">
            {checks.map(([rule, target, st, detail], i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <Chip s={st} />
                <span className="min-w-0">
                  <span className="text-fg">{rule}</span> <span className="font-mono text-[11px] text-faint">{target}</span>
                  {detail && <div className="text-[11.5px] text-dim">{detail}</div>}
                </span>
              </li>
            ))}
          </ul>
        ) : undefined}
      </Section>

      <Section title="격리된 행" empty="격리된 행이 없습니다.">
        {quarantine.length ? (
          <ul className="space-y-1">
            {quarantine.map(([target, n, reason], i) => (
              <li key={i} className="text-[12px]">
                <span className="font-mono text-amber-200">{target}</span> <span className="font-mono text-fg">{n}행</span> — <span className="text-dim">{reason}</span>
              </li>
            ))}
          </ul>
        ) : undefined}
      </Section>

      <Section title="접근 권한" empty="부여된 권한이 없습니다.">
        {grants.length ? (
          <ul className="space-y-1">
            {grants.map(([role, scope], i) => (
              <li key={i} className="text-[12px]">
                <span className="font-mono text-sky-200">{role}</span> <span className="text-dim">— {scope}</span>
              </li>
            ))}
          </ul>
        ) : undefined}
      </Section>
    </div>
  );
}
