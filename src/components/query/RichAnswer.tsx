import { Fragment, type ReactNode } from "react";

/** Renders V's answers: **bold**, *italic*, bullet lists, paragraphs, and [1] citations as small pills. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[\d+\](?:\s*\[\d+\])*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-foreground">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("*")) out.push(<em key={`${key}-${i++}`} className="text-muted-foreground">{t.slice(1, -1)}</em>);
    else for (const n of t.match(/\d+/g) ?? []) out.push(
      <sup key={`${key}-${i++}`} className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-muted px-1 align-[0.15em] font-mono text-[10px] text-muted-foreground">{n}</sup>,
    );
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichAnswer({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) return (
          <ul key={bi} className="space-y-1.5">
            {lines.map((l, li) => (
              <li key={li} className="flex gap-2"><span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" /><span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), `${bi}-${li}`)}</span></li>
            ))}
          </ul>
        );
        // A whole paragraph wrapped in *(...)* is an aside: show it quieter, without the asterisks.
        const aside = /^\*\(?[\s\S]*\)?\*$/.test(b.trim()) && !b.trim().startsWith("**");
        const body = aside ? b.trim().replace(/^\*\(?/, "").replace(/\)?\*$/, "") : b;
        return (
          <p key={bi} className={aside ? "border-l-2 border-border pl-3 text-sm text-muted-foreground" : ""}>
            {body.split("\n").map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${li}`)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}
