import { useEffect, useMemo, useRef, useState } from "react";
import { LayerTree } from "./components/LayerTree";
import { SideNav } from "./components/SideNav";
import { NodePanel } from "./components/NodePanel";
import { NetworkGraph } from "./components/NetworkGraph";
import { SettingsModal } from "./components/SettingsModal";
import { VizDrawer } from "./components/VizDrawer";
import { ExtractModal } from "./components/ExtractModal";
import { BUILTIN_PACKS } from "./data/packs";
import type { ContentPack, LayerNode } from "./types";
import { validatePack } from "./validate";
import { loadSettings, saveSettings } from "./llm/settings";
import type { LLMSettings } from "./llm/types";
import { loadState, saveState } from "./storage";

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

function searchNodes(node: LayerNode, q: string, acc: LayerNode[] = []): LayerNode[] {
  if (node.name.toLowerCase().includes(q) || (node.summary ?? "").toLowerCase().includes(q)) {
    acc.push(node);
  }
  node.children?.forEach((c) => searchNodes(c, q, acc));
  return acc;
}

type ViewMode = "tree" | "network";

export default function App() {
  const saved = useMemo(() => loadState(), []);
  const [packs, setPacks] = useState<ContentPack[]>(() =>
    saved && saved.customPacks.length > 0 ? [...BUILTIN_PACKS, ...saved.customPacks] : BUILTIN_PACKS
  );
  const [packId, setPackId] = useState(() => saved?.packId ?? packs[0].id);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [selectedId, setSelectedId] = useState<string | null>(() => saved?.selectedId ?? pack.root.id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(saved?.expandedIds.length ? saved.expandedIds : [pack.root.id])
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => saved?.viewMode ?? "tree");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<LayerNode[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => loadSettings());
  const [showViz, setShowViz] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalNodes = useMemo(() => collectIds(pack.root).length, [pack]);

  // 状态持久化:内容包/选择/视图/展开变化时保存
  useEffect(() => {
    const customPacks = packs.filter((p) => !BUILTIN_PACKS.some((b) => b.id === p.id));
    saveState({
      customPacks,
      packId,
      selectedId: selectedId ?? pack.root.id,
      viewMode,
      expandedIds: [...expandedIds],
    });
  }, [packs, packId, selectedId, viewMode, expandedIds, pack.root.id]);

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
    const p = packs.find((x) => x.id === id)!;
    setSelectedId(p.root.id);
    setExpandedIds(new Set([p.root.id]));
  }

  function handleSearch(q: string) {
    setSearchQ(q);
    setSearchResults(q.trim() ? searchNodes(pack.root, q.trim().toLowerCase()) : []);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pack.id + ".pack.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const res = validatePack(parsed);
        if (!res.ok) {
          setImportMsg("校验失败:" + res.errors.slice(0, 3).join(";"));
          return;
        }
        const p = parsed as ContentPack;
        setPacks((prev) => {
          const without = prev.filter((x) => x.id !== p.id);
          return [...without, p];
        });
        setPackId(p.id);
        setSelectedId(p.root.id);
        setExpandedIds(new Set([p.root.id]));
        setImportMsg(`已导入「${p.title}」`);
      } catch {
        setImportMsg("解析失败:不是合法 JSON 文件");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span>
          <span className="brand-name">Layerview</span>
          <span className="brand-sub">分层透视镜 · v1.0.0</span>
        </div>

        <div className="view-switch">
          <button
            className={"view-btn" + (viewMode === "tree" ? " active" : "")}
            onClick={() => setViewMode("tree")}
          >
            树形
          </button>
          <button
            className={"view-btn" + (viewMode === "network" ? " active" : "")}
            onClick={() => setViewMode("network")}
          >
            网络
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="搜索节点…"
            value={searchQ}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.slice(0, 10).map((n) => (
                <button key={n.id} onClick={() => { handleJump(n.id); setSearchQ(""); setSearchResults([]); }}>
                  {n.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="pack-switch">
          内容包
          <select value={packId} onChange={(e) => handlePackChange(e.target.value)}>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>

        <button className="tool-btn" onClick={handleExport}>导出</button>
        <button className="tool-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <button className="tool-btn accent2" onClick={() => setShowExtract(true)}>
          ✨ 文档解析
        </button>
        <button
          className="tool-btn accent"
          onClick={() => setShowSettings(true)}
          title={llmSettings.model}
        >
          模型:{llmSettings.provider === "deepseek" ? "DeepSeek" : llmSettings.provider}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = "";
          }}
        />
        <span className="theme-tag">{pack.theme}</span>
      </header>

      {importMsg && (
        <div className="import-toast" onClick={() => setImportMsg(null)}>
          {importMsg}
        </div>
      )}

      {showExtract && (
        <ExtractModal
          onDone={(newPack) => {
            if (newPack) {
              setPacks((prev) => {
                const without = prev.filter((x) => x.id !== newPack.id);
                return [...without, newPack];
              });
              setPackId(newPack.id);
              setSelectedId(newPack.root.id);
              setExpandedIds(new Set([newPack.root.id]));
              setImportMsg("已导入解析结果「" + newPack.title + "」");
            }
            setShowExtract(false);
          }}
          onClose={() => setShowExtract(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          current={llmSettings}
          onSave={(s) => {
            saveSettings(s);
            setLlmSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

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
            {viewMode === "tree"
              ? "单击节点:选中并展开/折叠 · 悬停:查看摘要"
              : "拖拽节点调整位置 · 点击选中"}
          </div>
          {viewMode === "tree" ? (
            <LayerTree
              pack={pack}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggle={handleToggle}
            />
          ) : (
            <NetworkGraph pack={pack} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </section>

        <aside className="panel">
          <NodePanel
            pack={pack}
            node={path[path.length - 1]}
            path={path}
            onJump={handleJump}
          />
        </aside>
      </main>

      {showViz && (
        <VizDrawer
          pack={pack}
          node={path[path.length - 1]}
          onClose={() => setShowViz(false)}
          onJump={handleJump}
        />
      )}

      <footer className="statusbar">
        <button
          className="viz-toggle"
          onClick={() => setShowViz((v) => !v)}
          title="查看当前节点的数值可视化"
        >
          ▤ 数值调试台
        </button>
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
          {viewMode === "tree"
            ? `展开 ${expandedIds.size} / 共 ${totalNodes} 节点`
            : `共 ${totalNodes} 节点 · ${pack.edges?.length ?? 0} 条边`}
        </span>
      </footer>
    </div>
  );
}
