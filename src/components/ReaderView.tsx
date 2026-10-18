import type { ContentPack, LayerNode } from "../types";
import { FormulaView } from "./FormulaView";
import { TYPE_COLORS, TYPE_LABELS } from "../meta";

interface ReaderViewProps {
  pack: ContentPack;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 把树按阅读顺序展平(前序) */
function flatten(nodes: LayerNode[], acc: LayerNode[] = []): LayerNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children) flatten(n.children, acc);
  }
  return acc;
}

/** 阅读模式:线性铺开全部内容,像读一本带注疏的电子书 */
export function ReaderView({ pack, selectedId, onSelect }: ReaderViewProps) {
  const all = flatten([pack.root]);
  // 计算每个节点的深度(用于标题层级)
  const depthOf = new Map<string, number>();
  const walk = (n: LayerNode, d: number) => {
    depthOf.set(n.id, d);
    n.children?.forEach((c) => walk(c, d + 1));
  };
  walk(pack.root, 1);

  return (
    <div className="reader-view">
      <div className="reader-header">
        <h1>{pack.title}</h1>
        <div className="reader-theme">{pack.theme}</div>
      </div>
      {all.map((node) => {
        const depth = depthOf.get(node.id) ?? 1;
        const isSel = node.id === selectedId;
        const Heading = ("h" + Math.min(depth, 4)) as "h1" | "h2" | "h3" | "h4";
        return (
          <section
            key={node.id}
            className={"reader-node" + (isSel ? " selected" : "")}
            onClick={() => onSelect(node.id)}
          >
            <div className="reader-node-head">
              <Heading className="reader-h">{node.name}</Heading>
              <span
                className="type-chip"
                style={{ background: TYPE_COLORS[node.type] }}
              >
                {TYPE_LABELS[node.type]}
              </span>
            </div>
            {node.summary && <p className="reader-summary">{node.summary}</p>}
            {node.formula && (
              <div className="reader-formula-card">
                <FormulaView formula={node.formula} symbols={node.symbols} />
              </div>
            )}
            {node.pseudoCode && (
              <div className="pseudocode-block">
                <pre className="pseudocode-pre">{node.pseudoCode}</pre>
              </div>
            )}
          </section>
        );
      })}
      <div className="reader-end">— 全文完 —</div>
    </div>
  );
}
