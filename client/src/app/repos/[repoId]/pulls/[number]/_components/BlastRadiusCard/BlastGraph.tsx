"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import {
  GRAPH_VIEWBOX_WIDTH,
  GRAPH_ROW_HEIGHT,
  GRAPH_TOP_PADDING,
  GRAPH_NODE_WIDTH,
  GRAPH_NODE_HEIGHT,
  GRAPH_MAX_LABEL_CHARS,
  GRAPH_ACCENT,
  GRAPH_NEUTRAL,
  CRON_PILL,
} from "./constants";
import { toGraph, type GraphNode } from "./helpers";
import { s } from "./styles";

const COLUMNS: GraphNode["column"][] = ["symbol", "caller", "impact"];

function truncate(label: string): string {
  return label.length > GRAPH_MAX_LABEL_CHARS ? `${label.slice(0, GRAPH_MAX_LABEL_CHARS - 1)}…` : label;
}

function nodeColors(node: GraphNode) {
  if (node.column === "caller") return GRAPH_NEUTRAL;
  if (node.kind === "cron") return CRON_PILL;
  return GRAPH_ACCENT; // changed symbol + endpoint impact — accent blue per design
}

/** Left-to-right SVG graph: changed symbol -> caller -> endpoint/cron.
 *  `toGraph` (helpers.ts) does all the data shaping (dedupe, column
 *  assignment, deterministic order); this component only lays it out.
 *  Inline SVG rather than the already-installed mermaid — a fixed 3-column
 *  shape with curved edges is simpler to hand-layout than to coax out of
 *  mermaid's auto layout, and it's what the reference design shows. */
export function BlastGraph({ blast }: { blast: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges } = React.useMemo(() => toGraph(blast), [blast]);

  if (edges.length === 0) {
    return <div style={s.empty}>{t("graph.empty")}</div>;
  }

  const byColumn: Record<GraphNode["column"], GraphNode[]> = { symbol: [], caller: [], impact: [] };
  for (const node of nodes) byColumn[node.column].push(node);

  const maxRows = Math.max(1, ...COLUMNS.map((col) => byColumn[col].length));
  const height = GRAPH_TOP_PADDING * 2 + maxRows * GRAPH_ROW_HEIGHT;
  const columnWidth = GRAPH_VIEWBOX_WIDTH / COLUMNS.length;

  const positions = new Map<string, { x: number; y: number }>();
  COLUMNS.forEach((col, colIdx) => {
    const x = columnWidth * colIdx + columnWidth / 2;
    byColumn[col].forEach((node, rowIdx) => {
      const y = GRAPH_TOP_PADDING + rowIdx * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
      positions.set(node.id, { x, y });
    });
  });

  return (
    <div style={s.graphWrap}>
      <svg
        viewBox={`0 0 ${GRAPH_VIEWBOX_WIDTH} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("graph.ariaLabel")}
        style={s.graphSvg}
      >
        {edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + GRAPH_NODE_WIDTH / 2;
          const x2 = to.x - GRAPH_NODE_WIDTH / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M ${x1},${from.y} C ${midX},${from.y} ${midX},${to.y} ${x2},${to.y}`}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.5}
            />
          );
        })}

        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const colors = nodeColors(node);
          return (
            <g key={node.id} transform={`translate(${pos.x - GRAPH_NODE_WIDTH / 2}, ${pos.y - GRAPH_NODE_HEIGHT / 2})`}>
              <title>{node.label}</title>
              <rect
                width={GRAPH_NODE_WIDTH}
                height={GRAPH_NODE_HEIGHT}
                rx={6}
                fill={colors.bg}
                stroke={colors.color}
                strokeWidth={1.5}
              />
              <text
                x={GRAPH_NODE_WIDTH / 2}
                y={GRAPH_NODE_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fill={colors.color}
              >
                {truncate(node.label)}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={s.graphLegend}>
        <span style={s.graphLegendItem}>
          <span style={s.graphLegendSwatch(GRAPH_ACCENT.color)} />
          {t("graph.legend.symbol")}
        </span>
        <span style={s.graphLegendItem}>
          <span style={s.graphLegendSwatch(GRAPH_NEUTRAL.color)} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.graphLegendItem}>
          <span style={s.graphLegendSwatch(GRAPH_ACCENT.color)} />
          {t("graph.legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
