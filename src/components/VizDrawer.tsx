import type { ContentPack, LayerNode, VizData } from "../types";
import { VizRenderer } from "./viz/VizRenderer";

interface VizDrawerProps {
  pack: ContentPack;
  node: LayerNode | null;
  onClose: () => void;
}

/** 解析节点的 visualization 绑定 → 实际数据(data 优先,其次 dataRef → pack.datasets) */
function resolveData(pack: ContentPack, node: LayerNode): { data: VizData; title?: string } | null {
  const v = node.visualization;
  if (!v) return null;
  if (v.data) return { data: v.data, title: v.title };
  if (v.dataRef && pack.datasets?.[v.dataRef]) {
    return { data: pack.datasets[v.dataRef], title: v.title };
  }
  return null;
}

export function VizDrawer({ pack, node, onClose }: VizDrawerProps) {
  if (!node) return null;
  const resolved = resolveData(pack, node);

  return (
    <div className="viz-drawer">
      <div className="viz-drawer-head">
        <span className="viz-drawer-title">
          数值调试台 · {node.name}
        </span>
        <button className="viz-close" onClick={onClose}>✕</button>
      </div>
      <div className="viz-drawer-body">
        {resolved ? (
          <VizRenderer data={resolved.data} title={resolved.title} />
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
