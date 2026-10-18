import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { ContentPack, LayerNode } from "../types";
import { TYPE_COLORS } from "../meta";
import { cardWidthFor } from "../textMeasure";

const CARD_H = 46;

interface GraphNode {
  id: string;
  name: string;
  type: LayerNode["type"];
  summary?: string;
  w: number;
  // d3-force 仿真在 tick 中注入的坐标(声明为可选)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string;
}

function flatten(node: LayerNode, acc: LayerNode[] = []): LayerNode[] {
  acc.push(node);
  node.children?.forEach((c) => flatten(c, acc));
  return acc;
}

interface NetworkGraphProps {
  pack: ContentPack;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function NetworkGraph({ pack, selectedId, onSelect }: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size] = useState({ width: 1100, height: 640 });

  const nodes: GraphNode[] = useMemo(
    () =>
      flatten(pack.root).map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        summary: n.summary,
        w: Math.max(96, cardWidthFor(n.name)),
      })),
    [pack]
  );

  const links: GraphLink[] = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return (pack.edges ?? [])
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, label: e.label }));
  }, [pack, nodes]);

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();

    // 箭头 marker
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 24)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.w / 2 + 28));

    const link = svg
      .append("g")
      .selectAll("g")
      .data(links)
      .join("g");

    link
      .append("line")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.4)
      .attr("marker-end", "url(#arrow)");

    link
      .append("text")
      .attr("font-size", 10)
      .attr("fill", "#64748b")
      .attr("text-anchor", "middle")
      .text((d) => d.label ?? "");

    const node = svg
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join<SVGGElement>("g")
      .style("cursor", "pointer");

    node
      .append("rect")
      .attr("width", (d) => d.w)
      .attr("height", CARD_H)
      .attr("rx", 10)
      .attr("fill", (d) => (d.id === selectedId ? "#eef2ff" : "#ffffff"))
      .attr("stroke", (d) => (d.id === selectedId ? "#4338ca" : TYPE_COLORS[d.type]))
      .attr("stroke-width", (d) => (d.id === selectedId ? 2.5 : 1.5));

    node
      .append("rect")
      .attr("width", 5)
      .attr("height", CARD_H)
      .attr("rx", 2.5)
      .attr("fill", (d) => TYPE_COLORS[d.type]);

    node
      .append("text")
      .attr("x", 18)
      .attr("y", 19)
      .attr("font-size", 13.5)
      .attr("fill", "#1e293b")
      .text((d) => d.name);

    node
      .append("text")
      .attr("x", 18)
      .attr("y", 35)
      .attr("font-size", 10)
      .attr("fill", "#64748b")
      .text((d) => d.id);

    node
      .append("title")
      .text((d) => d.summary ?? d.name);

    node.on("click", (_ev, d) => onSelect(d.id));

    node.call(
      d3.drag<SVGGElement, GraphNode, SVGGElement>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    sim.on("tick", () => {
      link
        .select("line")
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => ((d.source as GraphNode).y ?? 0) + CARD_H / 2)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => ((d.target as GraphNode).y ?? 0) + CARD_H / 2);
      link
        .select("text")
        .attr("x", (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr("y", (d) => ((((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2) + CARD_H / 2 - 6);
      node.attr("transform", (d) => `translate(${(d.x ?? 0) - d.w / 2},${d.y ?? 0})`);
    });

    sim.on("end", () => {
      node.attr("transform", (d) => `translate(${(d.x ?? 0) - d.w / 2},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
    };
  }, [nodes, links, selectedId, onSelect, size]);

  return (
    <svg ref={svgRef} width={size.width} height={size.height} className="layer-tree-svg" />
  );
}
