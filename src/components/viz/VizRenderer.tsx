import { useEffect, useRef, useState } from "react";
import type { VizData } from "../../types";

/** 把 SVG 元素导出为 PNG 下载 */
function exportPng(svgEl: SVGSVGElement, name: string) {
  const rect = svgEl.getBoundingClientRect();
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(Math.ceil(rect.width)));
  clone.setAttribute("height", String(Math.ceil(rect.height)));
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(rect.width) * 2;
    canvas.height = Math.ceil(rect.height) * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = name + ".png";
    a.click();
  };
  img.src = svg64;
}

/** 可视化渲染器:按 kind 分发到具体组件 */
export function VizRenderer({ data, title }: { data: VizData; title?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const handleExport = () => {
    const svg = wrapRef.current?.querySelector("svg.viz-svg");
    if (svg) exportPng(svg as SVGSVGElement, (title ?? "layerview-chart").replace(/[^\w\u4e00-\u9fa5-]+/g, "_"));
  };
  return (
    <div className="viz-wrap" ref={wrapRef}>
      {title && <div className="viz-title">{title}</div>}
      {renderViz(data)}
      <button className="viz-export-btn" onClick={handleExport} title="导出 PNG">
        ⤓ 导出 PNG
      </button>
    </div>
  );
}

function renderViz(data: VizData) {
  switch (data.kind) {
    case "heatmap":
    case "matrix":
      return <Heatmap data={data} />;
    case "histogram":
      return <Histogram data={data} />;
    case "line":
      return <LineChart data={data} />;
    case "scatter":
      return <Scatter data={data} />;
  }
}

// ---------- 热力图 / 矩阵 ----------
function Heatmap({ data }: { data: Extract<VizData, { kind: "heatmap" | "matrix" }> }) {
  const values = data.values;
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return <div className="viz-empty">空数据</div>;
  let min = Infinity, max = -Infinity;
  for (const row of values) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min || 1;
  const color = (v: number) => {
    const t = (v - min) / span;
    if (t < 0.5) {
      const s = t / 0.5;
      const r = Math.round(96 + (255 - 96) * s);
      const g = Math.round(165 + (255 - 165) * s);
      const b = Math.round(250 + (255 - 250) * s);
      return "rgb(" + r + "," + g + "," + b + ")";
    } else {
      const s = (t - 0.5) / 0.5;
      const g = Math.round(255 - (255 - 110) * s);
      return "rgb(255," + g + "," + g + ")";
    }
  };
  const cellW = Math.min(60, Math.max(14, 480 / cols));
  const cellH = Math.min(34, Math.max(12, 300 / rows));
  const labelW = 56;
  const labelH = 18;
  const Wtot = labelW + cols * cellW;
  const Htot = labelH + rows * cellH;
  return (
    <div className="viz-scroll">
      <svg width={Wtot} height={Htot} className="viz-svg">
        {data.cols?.map((c, j) => (
          <text key={j} x={labelW + j * cellW + cellW / 2} y={10} fontSize={9} textAnchor="middle" fill="#64748b">
            {c.length > 8 ? c.slice(0, 7) + "…" : c}
          </text>
        ))}
        {data.rows?.map((r, i) => (
          <text key={i} x={labelW - 6} y={labelH + i * cellH + cellH / 2 + 3} fontSize={9} textAnchor="end" fill="#64748b">
            {r.length > 7 ? r.slice(0, 6) + "…" : r}
          </text>
        ))}
        {values.map((row, i) =>
          row.map((v, j) => (
            <g key={i + "-" + j}>
              <rect x={labelW + j * cellW} y={labelH + i * cellH} width={cellW - 1} height={cellH - 1} fill={color(v)} rx={2} />
              <title>{data.rows?.[i] ?? i} × {data.cols?.[j] ?? j}: {v.toFixed(3)}</title>
            </g>
          ))
        )}
      </svg>
    </div>
  );
}

// ---------- 直方图 ----------
function Histogram({ data }: { data: Extract<VizData, { kind: "histogram" }> }) {
  const n = data.centers.length;
  if (n === 0) return <div className="viz-empty">空数据</div>;
  const maxCount = Math.max(...data.counts);
  const w = 420, h = 160;
  const padL = 34, padB = 26;
  const bw = (w - padL - 10) / n;
  return (
    <svg width={w} height={h} className="viz-svg">
      <line x1={padL} y1={h - padB} x2={w - 6} y2={h - padB} stroke="#cbd5e1" />
      <line x1={padL} y1={h - padB} x2={padL} y2={8} stroke="#cbd5e1" />
      {data.centers.map((c, i) => {
        const bh = (data.counts[i] / maxCount) * (h - padB - 16);
        return (
          <g key={i}>
            <rect x={padL + i * bw + 1} y={h - padB - bh} width={bw - 2} height={bh} fill="#6366f1" opacity={0.85} rx={1.5} />
            <title>{data.xLabel ?? "值"}: {c} → {data.counts[i]}</title>
            {n <= 12 && (
              <text x={padL + i * bw + bw / 2} y={h - padB + 13} fontSize={8} textAnchor="middle" fill="#64748b">
                {c}
              </text>
            )}
          </g>
        );
      })}
      <text x={padL} y={h - 4} fontSize={9} fill="#64748b">{data.xLabel ?? ""}</text>
    </svg>
  );
}

// ---------- 折线图(带时间播放) ----------
function LineChart({ data }: { data: Extract<VizData, { kind: "line" }> }) {
  const n = data.x.length;
  const [frame, setFrame] = useState(0); // 默认第 1 帧,点播放从零开始动画
  const [playing, setPlaying] = useState(false);
  if (n < 2) return <div className="viz-empty">空数据</div>;
  const w = 420, h = 170;
  const padL = 40, padB = 30, padT = 14;
  const xs = data.x, ys = data.y;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const X = (v: number) => padL + ((v - xMin) / (xMax - xMin || 1)) * (w - padL - 12);
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - padT - padB);
  const shown = frame + 1;
  const path = xs.slice(0, shown).map((x, i) => (i === 0 ? "M" : "L") + X(x) + "," + Y(ys[i])).join(" ");

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFrame((f) => {
        if (f >= n - 1) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, 350);
    return () => clearInterval(timer);
  }, [playing, n]);

  return (
    <div>
      <svg width={w} height={h} className="viz-svg">
        <line x1={padL} y1={h - padB} x2={w - 8} y2={h - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={padT - 6} x2={padL} y2={h - padB} stroke="#cbd5e1" />
        <path d={path} fill="none" stroke="#6366f1" strokeWidth={2} />
        {ys.slice(0, shown).map((y, i) => (
          <circle key={i} cx={X(xs[i])} cy={Y(y)} r={2.5} fill="#6366f1">
            <title>{xs[i]}, {y}</title>
          </circle>
        ))}
        <text x={padL - 4} y={padT} fontSize={9} textAnchor="end" fill="#64748b">{yMax.toFixed(2)}</text>
        <text x={padL - 4} y={h - padB + 4} fontSize={9} textAnchor="end" fill="#64748b">{yMin.toFixed(2)}</text>
        <text x={padL} y={h - 6} fontSize={9} fill="#64748b">{data.xLabel ?? ""}</text>
        <text x={8} y={10} fontSize={9} fill="#64748b">{data.yLabel ?? ""}</text>
      </svg>
      <div className="viz-playbar">
        <button onClick={() => setPlaying((p) => !p)} className="viz-playbtn">
          {playing ? "⏸ 暂停" : "▶ 播放"}
        </button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={frame}
          onChange={(e) => {
            setFrame(Number(e.target.value));
            setPlaying(false);
          }}
        />
        <span className="viz-frame-label">{shown}/{n} 步</span>
      </div>
    </div>
  );
}

// ---------- 散点图 ----------
function Scatter({ data }: { data: Extract<VizData, { kind: "scatter" }> }) {
  const n = data.points.length;
  if (n === 0) return <div className="viz-empty">空数据</div>;
  const w = 420, h = 200;
  const padL = 40, padB = 30, padT = 14;
  const xs = data.points.map((p) => p[0]);
  const ys = data.points.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const X = (v: number) => padL + ((v - xMin) / (xMax - xMin || 1)) * (w - padL - 12);
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - padT - padB);
  return (
    <svg width={w} height={h} className="viz-svg">
      <line x1={padL} y1={h - padB} x2={w - 8} y2={h - padB} stroke="#cbd5e1" />
      <line x1={padL} y1={padT - 6} x2={padL} y2={h - padB} stroke="#cbd5e1" />
      {data.points.map((p, i) => (
        <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={3} fill="#10b981" opacity={0.7}>
          <title>({p[0]}, {p[1]})</title>
        </circle>
      ))}
      <text x={padL} y={h - 6} fontSize={9} fill="#64748b">{data.xLabel ?? ""}</text>
      <text x={8} y={10} fontSize={9} fill="#64748b">{data.yLabel ?? ""}</text>
    </svg>
  );
}
