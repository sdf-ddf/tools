import { useState } from "react";
import type { ContentPack, LayerNode, VizData } from "../types";
import { VizRenderer } from "./viz/VizRenderer";

interface VizDrawerProps {
  pack: ContentPack;
  node: LayerNode | null;
  onClose: () => void;
  onJump: (id: string) => void; // 跳转到指定节点(用于"上层数值图"提示)
}

/** 解析节点的 visualization 绑定 → 实际数据 */
function resolveData(pack: ContentPack, node: LayerNode): { data: VizData; title?: string } | null {
  const v = node.visualization;
  if (!v) return null;
  if (v.data) return { data: v.data, title: v.title };
  if (v.dataRef && pack.datasets?.[v.dataRef]) {
    return { data: pack.datasets[v.dataRef], title: v.title };
  }
  return null;
}

/** 沿祖先链找最近一个带数值图的节点 */
function findAncestorWithViz(pack: ContentPack, node: LayerNode): LayerNode | null {
  // 从根往下 DFS 找 node 的父链
  const chain: LayerNode[] = [];
  const walk = (n: LayerNode, trail: LayerNode[]): boolean => {
    if (n.id === node.id) {
      chain.push(...trail, n);
      return true;
    }
    for (const c of n.children ?? []) {
      if (walk(c, [...trail, n])) return true;
    }
    return false;
  };
  walk(pack.root, []);
  for (let i = chain.length - 2; i >= 0; i--) {
    if (resolveData(pack, chain[i])) return chain[i];
  }
  return null;
}

export function VizDrawer({ pack, node, onClose, onJump }: VizDrawerProps) {
  const [pinned, setPinned] = useState<{ id: string; name: string; data: VizData; title?: string } | null>(null);
  if (!node) return null;
  const resolved = resolveData(pack, node);
  const ancestor = resolved ? null : findAncestorWithViz(pack, node);

  return (
    <div className="viz-drawer">
      <div className="viz-drawer-head">
        <span className="viz-drawer-title">数值调试台 · {node.name}</span>
        <div className="viz-head-actions">
          {resolved && (
            <button
              className="viz-pin-btn"
              onClick={() => setPinned({ id: node.id, name: node.name, data: resolved.data, title: resolved.title })}
              title="固定当前图,点别的节点可并排对比"
            >
              📌 固定对比
            </button>
          )}
          {pinned && (
            <button className="viz-pin-btn unpin" onClick={() => setPinned(null)}>
              解除固定
            </button>
          )}
          <button className="viz-close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="viz-drawer-body">
        {resolved ? (
          <div className={"viz-compare" + (pinned ? " comparing" : "")}>
            {pinned && (
              <div className="viz-pane pinned-pane">
                <div className="viz-pane-title">📌 {pinned.name}</div>
                <VizRenderer data={pinned.data} title={pinned.title} />
              </div>
            )}
            <div className="viz-pane">
              <div className="viz-pane-title">📍 {node.name}</div>
              <VizRenderer data={resolved.data} title={resolved.title} />
            </div>
          </div>
        ) : ancestor ? (
          <div className="viz-empty-hint">
            该节点没有数值图,但上层「{ancestor.name}」有。
            <button className="action-btn jump" onClick={() => onJump(ancestor.id)}>
              跳到 {ancestor.name} 的数值图
            </button>
          </div>
        ) : (
          <div className="viz-empty-hint">
            该节点暂未绑定数值数据。绑定方式:在内容包 JSON 中给节点加
            <code>visualization</code> 字段(内联 <code>data</code> 或 <code>dataRef</code> 指向
            <code>datasets</code>)。
          </div>
        )}
      </div>
    </div>
  );
}
