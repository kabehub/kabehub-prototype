"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { generateMessageSummary } from "@/lib/stringUtils";
import type { TreeEdge, TreeNodeLayout } from "@/lib/branchTree";

type BranchTreeProps = {
  threadId: string;
  nodes: TreeNodeLayout[];
  edges: TreeEdge[];
};

const COL_WIDTH = 220;
const ROW_HEIGHT = 132;
const NODE_WIDTH = 168;
const NODE_HEIGHT = 58;
const PADDING = 56;

export default function BranchTree({ threadId, nodes, edges }: BranchTreeProps) {
  const router = useRouter();

  const nodePositionById = useMemo(() => {
    return nodes.reduce<Record<string, { cx: number; cy: number; node: TreeNodeLayout }>>((acc, node) => {
      acc[node.id] = {
        cx: PADDING + node.x * COL_WIDTH,
        cy: PADDING + node.y * ROW_HEIGHT,
        node,
      };
      return acc;
    }, {});
  }, [nodes]);

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x), 1);
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const canvasWidth = Math.max(720, PADDING * 2 + maxX * COL_WIDTH + NODE_WIDTH);
  const canvasHeight = Math.max(360, PADDING * 2 + maxDepth * ROW_HEIGHT + NODE_HEIGHT);

  if (nodes.length === 0) {
    return (
      <div style={{ padding: "48px 24px", color: "var(--ink-muted)", fontSize: 14 }}>
        表示できるメッセージがありません。
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, background: "#fafafa" }}>
      <div style={{ position: "relative", width: canvasWidth, height: canvasHeight }}>
        <svg
          width={canvasWidth}
          height={canvasHeight}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          {edges.map((edge) => {
            const from = nodePositionById[edge.fromId];
            const to = nodePositionById[edge.toId];
            if (!from || !to) return null;
            const fromY = from.cy + NODE_HEIGHT / 2;
            const toY = to.cy - NODE_HEIGHT / 2;
            const midY = fromY + Math.max(18, (toY - fromY) / 2);
            const isCurrentEdge = to.node.isCurrentLane;
            const stroke = isCurrentEdge ? "#2563eb" : "#c9c9c0";
            return (
              <path
                key={`${edge.fromId}-${edge.toId}`}
                d={`M ${from.cx} ${fromY} L ${from.cx} ${midY} L ${to.cx} ${midY} L ${to.cx} ${toY}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isCurrentEdge ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const pos = nodePositionById[node.id];
          const number = typeof node.message.message_number === "number"
            ? `#${node.message.message_number}`
            : "#?";
          const summary = generateMessageSummary(
            typeof node.message.content === "string" ? node.message.content : "",
            42
          );
          const borderColor = node.isCurrentLane ? "#2563eb" : "#d8d8cf";
          const background = node.isCurrentLane ? "#eff6ff" : node.isCommon ? "#ffffff" : "#f6f6f2";
          const color = node.isCurrentLane ? "#1d4ed8" : "var(--ink)";

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => router.push(`/?thread=${encodeURIComponent(threadId)}&msg=${encodeURIComponent(node.id)}`)}
              title={summary}
              style={{
                position: "absolute",
                left: pos.cx - NODE_WIDTH / 2,
                top: pos.cy - NODE_HEIGHT / 2,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                background,
                color,
                boxShadow: node.isCurrentLane ? "0 4px 14px rgba(37, 99, 235, 0.16)" : "0 2px 8px rgba(0,0,0,0.05)",
                cursor: "pointer",
                textAlign: "left",
                padding: "9px 11px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 4,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1, color: node.isCurrentLane ? "#2563eb" : "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
                {number}
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.3, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", display: "block", width: "100%", minWidth: 0 }}>
                {summary || "(空のメッセージ)"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
