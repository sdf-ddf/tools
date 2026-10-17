import { useMemo, useState } from "react";
import { LayerTree } from "./components/LayerTree";
import { SideNav } from "./components/SideNav";
import { NodePanel } from "./components/NodePanel";
import { transformerPack } from "./data/transformerPack";
import { remoteSensingPack } from "./data/remoteSensingPack";
import type { LayerNode } from "./types";

const PACKS = [transformerPack, remoteSensingPack];

function findPath(root: LayerNode, target: string): LayerNode[] | null {
  if (root.id === target) return [root];
  for (const c of root.children ?? []) {
    const p = findPath(c, target);
    if (p) return [root, ...p];
  }
  return null;
}

function collectIds(node: LayerNode, acc: string[] = []): string[] {
  acc.push(node.id);
  node.children?.forEach((c) => collectIds(c, acc));
  return acc;
}

export default function App() {
  const [packId, setPackId] = useState(PACKS[0].id);
  const pack = PACKS.find((p) => p.id === packId)!;
  const [selectedId, setSelectedId] = useState<string | null>(pack.root.id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([pack.root.id]));

  const totalNodes = useMemo(() => collectIds(pack.root).length, [pack]);

  const path = useMemo(
    () => findPath(pack.root, selectedId ?? "") ?? [pack.root],
    [pack, selectedId]
  );

  function expandAncestors(id: string) {
    const p = findPath(pack.root, id);
    if (!p) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      p.forEach((n) => next.add(n.id));
      return next;
    });
  }

  function handleJump(id: string) {
    setSelectedId(id);
    expandAncestors(id);
  }

  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePackChange(id: string) {
    setPackId(id);
    const p = PACKS.find((x) => x.id === id)!;
    setSelectedId(p.root.id);
    setExpandedIds(new Set([p.root.id]));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span>
          <span className="brand-name">Layerview</span>
          <span className="brand-sub">分层透视镜 · M0</span>
        </div>
        <label className="pack-switch">
          内容包
          <select value={packId} onChange={(e) => handlePackChange(e.target.value)}>
            {PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <span className="theme-tag">{pack.theme}</span>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <h3>结构导航</h3>
          <SideNav
            node={pack.root}
            depth={0}
            expandedIds={expandedIds}
            selectedId={selectedId}
            onToggle={handleToggle}
            onJump={handleJump}
          />
        </aside>

        <section className="canvas">
          <div className="canvas-hint">
            单击节点:选中并展开/折叠 · 悬停:查看摘要
          </div>
          <LayerTree
            pack={pack}
            expandedIds={expandedIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggle={handleToggle}
          />
        </section>

        <aside className="panel">
          <NodePanel node={path[path.length - 1]} path={path} onJump={handleJump} />
        </aside>
      </main>

      <footer className="statusbar">
        <span>路径:</span>
        {path.map((p, i) => (
          <span key={p.id}>
            {i > 0 && <span className="crumb-sep">›</span>}{" "}
            <span
              className={"crumb" + (i === path.length - 1 ? " current" : "")}
              onClick={() => i < path.length - 1 && handleJump(p.id)}
            >
              {p.name}
            </span>
          </span>
        ))}
        <span className="stats">
          展开 {expandedIds.size} / 共 {totalNodes} 节点
        </span>
      </footer>
    </div>
  );
}
