"use client";

import { useState } from "react";
import { buildSourceChipModel, visibleSourceItems } from "@/lib/sourceChips";

export default function SourceChips({ sources }: { sources: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const model = buildSourceChipModel(sources);
  if (!model.allItems.length) return null;
  const linkEvents = {
    onMouseEnter: (event: React.MouseEvent<HTMLAnchorElement>) => { event.currentTarget.style.color = "var(--accent)"; },
    onMouseLeave: (event: React.MouseEvent<HTMLAnchorElement>) => { event.currentTarget.style.color = "var(--ink-muted)"; },
  };
  return (
    <div className="not-prose" aria-label="出典" style={{ marginTop: "8px", fontSize: "11px", color: "var(--ink-muted)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
        <span>出典</span>
        {model.chips.map(item => (
          <a key={item.domain} href={item.url} target="_blank" rel="noopener noreferrer nofollow" title={item.title}
            {...linkEvents} style={{ display: "inline-flex", alignItems: "center", gap: "5px", maxWidth: "100%", padding: "3px 7px", border: "1px solid var(--border)", borderRadius: "12px", color: "var(--ink-muted)", textDecoration: "none", overflowWrap: "anywhere" }}>
            <span aria-hidden="true" style={{ width: "14px", height: "14px", flexShrink: 0, borderRadius: "50%", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px" }}>{Array.from(item.domain)[0]?.toUpperCase()}</span>
            {item.domain}
          </a>
        ))}
        {model.hiddenCount > 0 && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
            style={{ fontSize: "11px", padding: "3px 7px", borderRadius: "12px", border: "1px solid var(--border)", color: "var(--accent)", background: "transparent", cursor: "pointer" }}>
            {expanded ? "閉じる" : `+${model.hiddenCount}`}
          </button>
        )}
      </div>
      {expanded && (
        <ul style={{ margin: "6px 0 0", paddingLeft: "18px", listStyle: "disc" }}>
          {visibleSourceItems(model, true).map((item, index) => (
            <li key={`${item.url}:${index}`} style={{ marginTop: "4px", minWidth: 0 }}>
              <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" title={item.title} {...linkEvents}
                style={{ display: "block", color: "var(--ink-muted)", textDecoration: "none", minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || item.domain}</span>
                <span style={{ overflowWrap: "anywhere" }}>{item.domain}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
