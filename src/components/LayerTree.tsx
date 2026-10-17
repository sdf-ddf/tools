import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { ContentPack, LayerNode } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../meta";

// 折叠后不可见的子树在此被剪掉,可见节点保留 __hasChildren 标记
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

interface SizeInfo {
  width: number;
  height: number;
  dx: number;
  dy: number;
}

function computeLayout(root: VisibleNode): {
  nodes: d3.HierarchyPointNode<VisibleNode>[];
  links: d3.HierarchyPointLink<VisibleNode>[];
  size: SizeInfo;
} {
  const hier = d3.hierarchy<VisibleNode>(root, (d) => d.children);
  // 注意:tree() 的返回值才是带确定 x/y 的 HierarchyPointNode
  const laidOut = d3.tree<VisibleNode>().nodeSize([250, 130])(hier);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  laidOut.each((n) => {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  });
  return {
    nodes: laidOut.descendants(),
    links: laidOut.links(),
    size: {
      // 宽度必须覆盖"内容整体位移 dx"+"最右节点中心 maxX"+"文本余量",
      // 即 (maxX - minX) + 左边距 60 + 文本余量 260
      width: Math.max(600, maxX - minX + 320),
      height: Math.max(360, maxY + 150),
      dx: -minX + 60,
      dy: -minY + 75,
    },
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
  const [size, setSize] = useState<SizeInfo>({ width: 800, height: 500, dx: 150, dy: 75 });

  useEffect(() => {
    const { nodes, links, size: s } = computeLayout(buildVisible(pack.root, expandedIds));
    setSize(s);
    const g = d3.select(gRef.current!);
    g.selectAll("*").remove();

    g.append("g")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.6)
      .attr("d", (l) => {
        const s0 = l.source, t0 = l.target;
        return `M${s0.x},${s0.y}C${s0.x},${(s0.y + t0.y) / 2} ${t0.x},${(s0.y + t0.y) / 2} ${t0.x},${t0.y}`;
      });

    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer");

    node
      .append("circle")
      .attr("r", 21)
      .attr("fill", (d) => TYPE_COLORS[d.data.type])
      .attr("stroke", (d) => (d.data.id === selectedId ? "#3730a3" : "#ffffff"))
      .attr("stroke-width", (d) => (d.data.id === selectedId ? 3 : 2));

    node
      .append("title")
      .text((d) => d.data.summary ?? d.data.name);

    // 展开/折叠指示徽标
    const badge = node.filter((d) => !!d.data.__hasChildren);
    badge
      .append("circle")
      .attr("r", 9)
      .attr("cx", 15)
      .attr("cy", -15)
      .attr("fill", "#f8fafc")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.2);
    badge
      .append("text")
      .attr("x", 15)
      .attr("y", -11.5)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .attr("fill", "#334155")
      .text((d) => (expandedIds.has(d.data.id) ? "−" : "+"));

    node
      .append("text")
      .attr("x", 30)
      .attr("y", 0)
      .attr("dominant-baseline", "middle")
      .attr("font-size", 13.5)
      .attr("fill", "#1e293b")
      .text((d) => (d.data.name.length > 18 ? d.data.name.slice(0, 17) + "…" : d.data.name));

    node
      .append("text")
      .attr("x", 30)
      .attr("y", 14)
      .attr("font-size", 10.5)
      .attr("fill", "#64748b")
      .text((d) => TYPE_LABELS[d.data.type]);

    node.on("click", (_ev, d) => {
      onSelect(d.data.id);
      if (d.data.__hasChildren) onToggle(d.data.id);
    });
  }, [pack, expandedIds, selectedId, onSelect, onToggle]);

  return (
    <svg width={size.width} height={size.height} className="layer-tree-svg">
      <g ref={gRef} transform={`translate(${size.dx},${size.dy})`} />
    </svg>
  );
}
