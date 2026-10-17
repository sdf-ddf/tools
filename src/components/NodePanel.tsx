import type { LayerNode } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../meta";

interface NodePanelProps {
  node: LayerNode | null;
  path: LayerNode[];
  onJump: (id: string) => void;
}

export function NodePanel({ node, path, onJump }: NodePanelProps) {
  if (!node) {
    return (
      <div className="panel-empty">
        <p>在左侧或画布中选择一个节点,这里会显示它的详细讲解。</p>
      </div>
    );
  }
  const kids = node.children ?? [];
  return (
    <>
      <h2>{node.name}</h2>
      <div>
        <span className="type-chip" style={{ background: TYPE_COLORS[node.type] }}>
          {TYPE_LABELS[node.type]}
        </span>
        <span className="depth">第 {Math.max(0, path.length - 1)} 层</span>
      </div>

      <div className="section-title">静态简介(LLM 讲解将在 M2 接入)</div>
      <p className="summary">{node.summary ?? "暂无简介。"}</p>

      {kids.length > 0 && (
        <>
          <div className="section-title">子层({kids.length})· 点击跳转</div>
          <div className="kids">
            {kids.map((k) => (
              <button key={k.id} className="kid-chip" onClick={() => onJump(k.id)}>
                {k.name}
              </button>
            ))}
          </div>
        </>
      )}

      {path.length > 1 && (
        <>
          <div className="section-title">上层节点</div>
          <div className="kids">
            {path.slice(0, -1).map((p) => (
              <button key={p.id} className="kid-chip" onClick={() => onJump(p.id)}>
                ↑ {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="hint">
        单击画布节点:选中并展开/折叠。
        <br />
        悬停节点:显示摘要。
        <br />
        「讲到最底层」与追问链将在 M2 接入大模型后启用。
      </div>
      <button className="btn-deep" disabled title="M2 接入 LLM 后启用">
        讲到最底层(M2)
      </button>
    </>
  );
}
