import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { SymbolEntry } from "../types";

/** KaTeX 公式渲染(display 模式,失败回退显示原文) */
function KaTeX({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, { displayMode: true, throwOnError: false });
    } catch {
      ref.current.textContent = latex;
    }
  }, [latex]);
  return <div ref={ref} className="formula-katex" />;
}

interface FormulaViewProps {
  formula: string;
  symbols?: SymbolEntry[];
}

/** 公式节点面板:渲染公式 + 逐符号表格 */
export function FormulaView({ formula, symbols }: FormulaViewProps) {
  return (
    <div className="formula-view">
      <KaTeX latex={formula} />
      {symbols && symbols.length > 0 && (
        <div className="symbol-table-wrap">
          <div className="section-title">符号表(逐符号讲解)</div>
          <table className="symbol-table">
            <thead>
              <tr>
                <th>符号</th>
                <th>名称</th>
                <th>含义</th>
                <th>单位</th>
                <th>典型量级</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s, i) => (
                <tr key={i}>
                  <td className="sym-cell"><KaTeX latex={s.symbol} /></td>
                  <td>{s.name}</td>
                  <td>{s.meaning}</td>
                  <td>{s.unit ?? "—"}</td>
                  <td>{s.typical ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
