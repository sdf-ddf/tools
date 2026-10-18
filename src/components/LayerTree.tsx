import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { ContentPack, LayerNode } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../meta";
import { cardWidthFor } from "../textMeasure";

interface VisibleNode extends LayerNode {
  __hasChildren?: boolean;
  children?: VisibleNode[];
}

function buildVisible(node: LayerNode, expanded: Set<string>): VisibleNode {
  const has = (node.children?.length ?? 0) > 0;
  const children = has && expanded.has(node.id)
    ? node.children!.map((c) => buildVisible(c, expanded))
    : undefined;
  return { ...node, __hasChildren: has, children };
}

const CARD_H = 46;
const ROW_H = 68;
const GAP_X = 56;

interface PlacedNode {
  node: VisibleNode;
  x: number;
  y: number;
  w: number;
  depth: number;
  parent?: PlacedNode;
}

interface TreeLayout {
  placed: PlacedNode[];
  links: { s: PlacedNode; t: PlacedNode }[];
  width: number;
  height: number;
}

/** 自定义"左→右"层级布局:y 由叶子计数分配,x 按每层最大卡片宽度推进 */
function placeTree(root: VisibleNode): TreeLayout {
  const measure = (n: VisibleNode) => Math.max(96, cardWidthFor(n.name));

  const placed: PlacedNode[] = [];
  const links: { s: PlacedNode; t: PlacedNode }[] = [];
  let leafY = 0;

  function walkY(n: VisibleNode, parent?: PlacedNode, depth = 0): { first: PlacedNode; last: PlacedNode } {
    const p: PlacedNode = { node: n, x: 0, y: 0, w: measure(n), depth, parent };
    placed.push(p);
    if (parent) links.push({ s: parent, t: p });
    const kids = n.children;
    if (kids && kids.length > 0) {
      let first: PlacedNode | null = null, last: PlacedNode | null = null;
      for (const c of kids) {
        const r = walkY(c, p, depth + 1);
        if (!first) first = r.first;
        last = r.last;
      }
      p.y = (first!.y + last!.y) / 2;
      return { first: first!, last: last! };
    } else {
      p.y = leafY * ROW_H + CARD_H / 2;
      leafY++;
      return { first: p, last: p };
    }
  }

  walkY(root);

  // 按层推进 x
  const byDepth = new Map<number, PlacedNode[]>();
  for (const p of placed) {
    const arr = byDepth.get(p.depth) ?? [];
    arr.push(p);
    byDepth.set(p.depth, arr);
  }
  let x = 24;
  let totalW = 0;
  for (const [, nodes] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    const layerW = Math.max(...nodes.map((p) => p.w));
    for (const p of nodes) p.x = x;
    x += layerW + GAP_X;
    totalW = x;
  }

  return {
    placed,
    links,
    width: totalW + 24,
    height: Math.max(360, leafY * ROW_H + 40),
  };
}

interface LayerTreeProps {
  pack: ContentPack;
  expandedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

export function LayerTree({ pack, expandedIds, selectedId, onSelect, onToggle }: LayerTreeProps) {
  const gRef = useRef<SVGGElement>(null);
  const layout = useMemo(() => placeTree(buildVisible(pack.root, expandedIds)), [pack, expandedIds]);

  useEffect(() => {
    const g = d3.select(gRef.current!);
    g.selectAll("*").remove();

    g.append("g")
      .selectAll("path")
      .data(layout.links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.6)
      .attr("d", (l) => {
        const x0 = l.s.x + l.s.w, y0 = l.s.y + CARD_H / 2;
        const x1 = l.t.x, y1 = l.t.y + CARD_H / 2;
        return `M${x0},${y0}C${x0 + 30},${y0} ${x1 - 30},${y1} ${x1},${y1}`;
      });

    const node = g
      .append("g")
      .selectAll("g")
      .data(layout.placed)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer");

    const selected = (d: PlacedNode) => d.node.id === selectedId;

    node
      .append("rect")
      .attr("width", (d) => d.w)
      .attr("height", CARD_H)
      .attr("rx", 10)
      .attr("fill", (d) => (selected(d) ? "#eef2ff" : "#ffffff"))
      .attr("stroke", (d) => (selected(d) ? "#4338ca" : TYPE_COLORS[d.node.type]))
      .attr("stroke-width", (d) => (selected(d) ? 2.5 : 1.5));

    node
      .append("rect")
      .attr("width", 5)
      .attr("height", CARD_H)
      .attr("rx", 2.5)
      .attr("fill", (d) => TYPE_COLORS[d.node.type]);

    node
      .append("title")
      .text((d) => d.node.summary ?? d.node.name);

    node
      .append("text")
      .attr("x", 18)
      .attr("y", 19)
      .attr("font-size", 13.5)
      .attr("fill", "#1e293b")
      .text((d) => d.node.name);

    node
      .append("text")
      .attr("x", 18)
      .attr("y", 35)
      .attr("font-size", 10)
      .attr("fill", "#64748b")
      .text((d) => TYPE_LABELS[d.node.type]);

    // 展开/折叠徽标
    const badge = node.filter((d) => !!d.node.__hasChildren);
    badge
      .append("circle")
      .attr("cx", (d) => d.w - 16)
      .attr("cy", CARD_H / 2)
      .attr("r", 9)
      .attr("fill", "#f8fafc")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.2);
    badge
      .append("text")
      .attr("x", (d) => d.w - 16)
      .attr("y", CARD_H / 2 + 3.5)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .attr("fill", "#334155")
      .text((d) => (expandedIds.has(d.node.id) ? "−" : "+"));

    node.on("click", (_ev, d) => {
      onSelect(d.node.id);
      if (d.node.__hasChildren) onToggle(d.node.id);
    });
  }, [layout, selectedId, expandedIds, onSelect, onToggle]);

  return (
    <svg width={layout.width} height={layout.height} className="layer-tree-svg">
      <g ref={gRef} />
    </svg>
  );
}
