import { useRef, useState } from "react";
import { loadSettings } from "../llm/settings";
import { extractDocument } from "../llm/extract";
import { validatePack } from "../validate";
import type { ContentPack } from "../types";

interface ExtractModalProps {
  onDone: (pack: ContentPack | null) => void;
  onClose: () => void;
}

export function ExtractModal({ onDone, onClose }: ExtractModalProps) {
  const [docText, setDocText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "extracting" | "preview">("input");
  const [packJson, setPackJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".md") && !name.endsWith(".markdown")) {
      setError("当前版本支持 .txt / .md / .markdown(PDF 解析依赖后端,见调研报告后接入)");
      return;
    }
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setDocText(String(reader.result));
    reader.readAsText(file, "utf-8");
  }

  async function handleExtract() {
    const text = docText.trim();
    if (!text) {
      setError("请先上传或粘贴文档内容");
      return;
    }
    setError(null);
    setPhase("extracting");
    const settings = loadSettings();
    const result = await extractDocument(settings, text);
    if (!result.ok || !result.packJson) {
      setError(result.error ?? "抽取失败");
      setPhase("input");
      return;
    }
    setPackJson(result.packJson);
    setPhase("preview");
  }

  function handleSave() {
    try {
      const parsed = JSON.parse(packJson);
      const res = validatePack(parsed);
      if (!res.ok) {
        setError("校验失败:" + res.errors.slice(0, 3).join(";"));
        return;
      }
      onDone(parsed as ContentPack);
    } catch {
      setError("JSON 语法错误,请修正后保存");
    }
  }

  const SAMPLE = [
    "粘贴文档内容…例如:",
    "",
    "# 大气边界层反演方法",
    "",
    "## 1. 引言",
    "大气边界层高度是空气质量模式的关键输入…",
    "",
    "## 2. 方法",
    "### 2.1 前向模型",
    "辐射传输方程描述…",
  ].join("\n");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal extract-modal" onClick={(e) => e.stopPropagation()}>
        <h3>文档 → 分层结构解析</h3>

        {phase === "input" && (
          <>
            <div className="extract-drop">
              <button className="action-btn" onClick={() => fileRef.current?.click()}>
                选择文件(.txt / .md)
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              {fileName && <span className="extract-filename">{fileName}</span>}
              <span className="extract-or">或直接粘贴文本:</span>
            </div>
            <textarea
              className="extract-textarea"
              placeholder={SAMPLE}
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
            />
          </>
        )}

        {phase === "extracting" && (
          <div className="extract-busy">
            <div className="spinner" />
            <p>正在调用大模型解析文档…(流式输出,长文档会自动分块)</p>
          </div>
        )}

        {phase === "preview" && (
          <>
            <div className="extract-preview-hint">
              抽取结果预览:可直接编辑 JSON,保存前会做结构校验。
            </div>
            <textarea
              className="extract-textarea preview"
              value={packJson}
              onChange={(e) => setPackJson(e.target.value)}
            />
          </>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          {phase === "input" && (
            <>
              <button className="action-btn primary" onClick={handleExtract}>
                开始解析
              </button>
              <button className="action-btn" onClick={onClose}>取消</button>
            </>
          )}
          {phase === "extracting" && (
            <button className="action-btn" onClick={onClose} disabled>
              解析中…
            </button>
          )}
          {phase === "preview" && (
            <>
              <button className="action-btn primary" onClick={handleSave}>
                保存为内容包
              </button>
              <button className="action-btn" onClick={() => { setPhase("input"); setPackJson(""); }}>
                重新解析
              </button>
              <button className="action-btn" onClick={onClose}>取消</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
