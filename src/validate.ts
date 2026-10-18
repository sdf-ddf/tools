import type { ContentPack, LayerNode, NodeType } from "./types";

const NODE_TYPES: NodeType[] = ["model", "layer", "concept", "formula", "step", "data"];
const VIZ_KINDS = ["heatmap", "matrix", "histogram", "tree", "scatter", "animation"];

export interface PackValidation {
  ok: boolean;
  errors: string[];
}

/** 校验一个内容包结构是否合法(供导入内容包与启动自检使用) */
export function validatePack(pack: unknown): PackValidation {
  const errors: string[] = [];
  const p = pack as ContentPack;
  if (!p || typeof p !== "object") return { ok: false, errors: ["内容包不是对象"] };
  if (typeof p.id !== "string" || !p.id) errors.push("pack.id 缺失");
  if (typeof p.title !== "string" || !p.title) errors.push("pack.title 缺失");
  if (typeof p.theme !== "string" || !p.theme) errors.push("pack.theme 缺失");
  if (!p.root || typeof p.root !== "object") {
    errors.push("pack.root 缺失");
  } else {
    const ids = new Set<string>();
    walk(p.root, (n, path) => {
      if (typeof n.id !== "string" || !n.id) {
        errors.push(`${path}: id 缺失`);
        return;
      }
      if (ids.has(n.id)) errors.push(`${path}: id 重复 ${n.id}`);
      ids.add(n.id);
      if (typeof n.name !== "string" || !n.name) errors.push(`${path}: name 缺失`);
      if (!NODE_TYPES.includes(n.type)) errors.push(`${path}: type 非法 ${String(n.type)}`);
      if (n.visualization && !VIZ_KINDS.includes(n.visualization.kind)) {
        errors.push(`${path}: visualization.kind 非法`);
      }
      if (n.edges) {
        n.edges.forEach((e, i) => {
          if (typeof e?.from !== "string" || typeof e?.to !== "string") {
            errors.push(`${path}.edges[${i}]: from/to 缺失`);
          }
        });
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

function walk(node: LayerNode, visit: (n: LayerNode, path: string) => void, path = "root") {
  visit(node, path);
  node.children?.forEach((c, i) => walk(c, visit, `${path}.children[${i}]`));
}
