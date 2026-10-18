# -*- coding: utf-8 -*-
"""切片2回归:伪代码/复现清单按钮 + 内置伪代码块"""
from playwright.sync_api import sync_playwright
import json, time

res = {}

def click_svg_text(pg, name, exact=True):
    items = pg.locator("svg.layer-tree-svg text")
    for i in range(items.count()):
        t = items.nth(i).text_content() or ""
        hit = (t == name) if exact else (name in t)
        if hit:
            items.nth(i).scroll_into_view_if_needed()
            pg.wait_for_timeout(100)
            try:
                items.nth(i).click()
            except Exception:
                items.nth(i).click(force=True)
            return True
    return False

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # mock 模式
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").first.select_option("mock"); pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    # 展开方法 → OEM → Gauss-Newton(有内置伪代码)
    click_svg_text(pg, "方法"); pg.wait_for_timeout(400)
    click_svg_text(pg, "最优估计反演(OEM)"); pg.wait_for_timeout(400)
    click_svg_text(pg, "Gauss-Newton 迭代"); pg.wait_for_timeout(500)
    res["panel_gauss"] = (pg.locator(".panel h2").text_content() or "").strip()
    # 内置伪代码块
    res["builtin_pseudocode"] = pg.locator(".pseudocode-block").count() == 1
    res["pseudocode_has_formula"] = "x_{n+1}" in (pg.locator(".pseudocode-pre").text_content() or "")

    # 生成伪代码按钮(mock)
    res["pseudo_btn_exists"] = pg.locator(".action-btn", has_text="生成伪代码").count() == 1
    pg.locator(".action-btn", has_text="生成伪代码").click()
    pg.wait_for_timeout(2500)
    res["mock_pseudocode_streamed"] = pg.locator(".chat-item.assistant").count() >= 1
    last_chat = (pg.locator(".chat-item.assistant").last.text_content() or "")
    res["mock_pseudocode_has_code"] = "import numpy" in last_chat or "oem_retrieval" in last_chat

    # 复现清单按钮(mock)
    pg.locator(".action-btn", has_text="复现清单").click()
    pg.wait_for_timeout(2500)
    last_chat2 = (pg.locator(".chat-item.assistant").last.text_content() or "")
    res["mock_repro_has_sections"] = all(k in last_chat2 for k in ["需要的数据", "实现步骤", "验证方式"])

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
