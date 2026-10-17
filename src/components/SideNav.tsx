import type { LayerNode } from "../types";
import { TYPE_COLORS } from "../meta";

interface SideNavProps {
  node: LayerNode;
  depth: number;
  expandedIds: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onJump: (id: string) => void;
}

export function SideNav({ node, depth, expandedIds, selectedId, onToggle, onJump }: SideNavProps) {
  const kids = node.children ?? [];
  const isOpen = expandedIds.has(node.id);
  return (
    <div>
      <div
        className={"nav-node" + (selectedId === node.id ? " selected" : "")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onJump(node.id)}
      >
        {kids.length > 0 ? (
          <button
            className="nav-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isOpen ? "−" : "+"}
          </button>
        ) : (
          <span className="nav-toggle" style={{ background: "transparent" }} />
        )}
        <span className="nav-dot" style={{ background: TYPE_COLORS[node.type] }} />
        <span className="nav-label">{node.name}</span>
      </div>
      {isOpen &&
        kids.map((c) => (
          <SideNav
            key={c.id}
            node={c}
            depth={depth + 1}
            expandedIds={expandedIds}
            selectedId={selectedId}
            onToggle={onToggle}
            onJump={onJump}
          />
        ))}
    </div>
  );
}
