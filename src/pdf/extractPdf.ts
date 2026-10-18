// PDF 文本提取(pdfjs-dist,浏览器端)。
// 关键点:getTextContent 按渲染顺序输出,需要用 transform[5](y) 按"行"聚类并按行重建文本。
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface PdfExtractResult {
  ok: boolean;
  text?: string;
  pages?: number;
  error?: string;
}

interface LineItem {
  y: number;
  text: string;
}

const LINE_TOLERANCE = 3; // 同一行的 y 容差(pt)

/**
 * 从 PDF 文件提取全文文本,按阅读顺序重建。
 * 扫描件(无文本层)会得到空文本 → 返回明确错误。
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  // 动态导入,避免主包体积增大
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let allText = "";

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is TextItem => "str" in it);

      // 按 y 聚类成行(同一行 y 相近),行内按 x 排序
      const linesMap = new Map<number, { y: number; parts: { x: number; s: string }[] }>();
      for (const it of items) {
        const y = Math.round((it.transform[5] ?? 0) * 10) / 10;
        let key = 0;
        let found = false;
        for (const k of linesMap.keys()) {
          if (Math.abs(k - y) <= LINE_TOLERANCE) {
            key = k;
            found = true;
            break;
          }
        }
        if (!found) {
          key = y;
          linesMap.set(key, { y: key, parts: [] });
        }
        linesMap.get(key)!.parts.push({ x: it.transform[4] ?? 0, s: it.str });
      }

      // 页面从上到下(y 从大到小),行内从左到右
      const lines: LineItem[] = [...linesMap.entries()]
        .sort((a, b) => b[1].y - a[1].y)
        .map(([, line]) => ({
          y: line.y,
          text: line.parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.s)
            .join(" "),
        }));

      allText += lines.map((l) => l.text).join("\n") + "\n\n";
    }

    const trimmed = allText.trim();
    if (!trimmed) {
      return {
        ok: false,
        pages: doc.numPages,
        error: "此 PDF 没有可提取的文本层(可能是扫描件)。建议先 OCR,或改用 .md/.txt。",
      };
    }
    return { ok: true, text: trimmed, pages: doc.numPages };
  } catch (e) {
    return {
      ok: false,
      error: "PDF 解析失败:" + (e instanceof Error ? e.message : String(e)),
    };
  }
}
