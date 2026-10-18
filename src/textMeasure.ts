// SVG 文本宽度测量:SVG text 不参与布局,需用隐藏 DOM 元素测量
let el: HTMLSpanElement | null = null;

function ensure(): HTMLSpanElement {
  if (!el) {
    el = document.createElement("span");
    el.style.cssText =
      "position:absolute;visibility:hidden;white-space:nowrap;font-size:13.5px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',system-ui,sans-serif;";
    document.body.appendChild(el);
  }
  return el;
}

/** 测量文本渲染宽度(px) */
export function measureText(text: string, fontSize = 13.5): number {
  const e = ensure();
  e.style.fontSize = fontSize + "px";
  e.textContent = text;
  return e.getBoundingClientRect().width;
}

/** 节点卡片宽度 = 名称宽度 + 左右内边距(18+10)+ 色条 5px */
export function cardWidthFor(name: string): number {
  return Math.ceil(measureText(name)) + 34;
}
