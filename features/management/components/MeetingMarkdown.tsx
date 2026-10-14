"use client";

import { useMemo } from "react";
import { parseMarkdown, type MdInline } from "@/lib/domain/kca/markdown";
import { cn } from "@/lib/utils";

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === "bold" ? (
          <strong key={i}>{p.text}</strong>
        ) : p.type === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline-offset-2 hover:underline">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/**
 * Toplantı notu (KCA Panel biçimi: başlıklar, maddeler, onay kutuları, tablolar). HTML basılmaz — metin React'te düz
 * metin, bağlantı yalnız http(s) (lib/domain/kca/markdown.ts).
 */
export function MeetingMarkdown({ body, className }: { body: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(body), [body]);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const cls = b.level === 1 ? "text-lg font-bold" : b.level === 2 ? "pt-2 text-base font-semibold" : "text-sm font-semibold";
            return (
              <p key={i} className={cls} role="heading" aria-level={b.level + 1}>
                <Inline parts={b.text} />
              </p>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="break-words">
                {b.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    <Inline parts={line} />
                  </span>
                ))}
              </p>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={cn("space-y-1 pl-5", b.ordered ? "list-decimal" : b.items.every((x) => x.checked !== null) ? "list-none pl-0" : "list-disc")}>
                {b.items.map((item, j) => (
                  <li key={j} className="break-words">
                    {item.checked !== null && (
                      <input type="checkbox" checked={item.checked} readOnly disabled className="mr-2 size-3.5 translate-y-0.5 accent-primary" aria-hidden />
                    )}
                    <Inline parts={item.text} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {b.header.map((cell, j) => (
                        <th key={j} className="border-b border-border/60 px-2 py-1.5 text-left font-semibold">
                          <Inline parts={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-b border-border/40 last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-2 py-1.5 align-top">
                            <Inline parts={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
