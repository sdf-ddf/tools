# -*- coding: utf-8 -*-
"""验证 Electron 内置服务器上的页面功能(mock 全流程)"""
from playwright.sync_api import sync_playwright
import json, time

res = {}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:45173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    res["title"] = pg.title()
    res["topbar"] = pg.locator(".topbar").inner_text()[:150]
    res["svg_exists"] = pg.locator("svg.layer-tree-svg").count() == 1
    res["panel_root"] = (pg.locator(".panel h2").text_content() or "").strip()

    # mock 讲解全流程
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").first.select_option("mock"); pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    pg.locator(".action-btn.primary", has_text="点选讲解").click()
    pg.wait_for_timeout(3000)
    t = pg.locator(".chat-item.assistant").first.text_content() or ""
    res["explain_ok"] = all(k in t for k in ["是什么", "为什么", "数值/机制含义", "与上下层的关系"])
    res["streaming_done"] = pg.locator(".cursor-blink").count() == 0

    # 文档解析弹窗在 electron 环境可用
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    res["extract_modal_ok"] = pg.locator(".extract-modal").count() == 1
    pg.locator(".extract-modal button", has_text="取消").click()

    # 数值抽屉
    pg.locator(".viz-toggle").click(); pg.wait_for_timeout(400)
    res["viz_drawer_ok"] = pg.locator(".viz-drawer").count() == 1

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
