# -*- coding: utf-8 -*-
"""阅读模式回归"""
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 1) 切到阅读模式
    pg.locator(".view-btn", has_text="阅读").click()
    pg.wait_for_timeout(600)
    res["reader_visible"] = pg.locator(".reader-view").count() == 1
    res["reader_title"] = (pg.locator(".reader-header h1").text_content() or "").strip()
    # 节点铺开:根+3章+方法下4个公式/算法 = 应有多个 section
    res["reader_sections"] = pg.locator(".reader-node").count()
    # 公式卡片(含 KaTeX)
    res["reader_formula_cards"] = pg.locator(".reader-formula-card").count()
    res["reader_katex"] = pg.locator(".reader-view .katex").count() >= 1
    # 符号表在全宽卡片里
    res["reader_symbol_rows"] = pg.locator(".reader-view .symbol-table tbody tr").count()
    pg.screenshot(path=SHOT + "/" + ts + "-reader-1-top.png")

    # 2) 点一个 section → 右侧面板联动(用标题精确匹配)
    pg.locator(".reader-node h3", has_text="权重函数").first.click()
    pg.wait_for_timeout(500)
    res["panel_after_click"] = (pg.locator(".panel h2").text_content() or "").strip()
    res["section_selected_class"] = pg.locator(".reader-node.selected").count() == 1

    # 3) 滚动到底部验证全文完
    pg.locator(".reader-view").evaluate("el => el.scrollIntoView({block: 'end'})")
    pg.wait_for_timeout(300)
    res["reader_end_visible"] = pg.locator(".reader-end").count() == 1
    pg.screenshot(path=SHOT + "/" + ts + "-reader-2-bottom.png")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
