# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)
    res = {
        "title": pg.title(),
        "topbar_btns": pg.locator(".topbar button").all_inner_texts(),
        "view_btns": pg.locator(".view-btn").all_inner_texts(),
        "search_inputs": pg.locator(".search-box input").count(),
        "svg_count": pg.locator("svg.layer-tree-svg").count(),
        "rect_cards": pg.locator("svg.layer-tree-svg rect[width]").count(),
        "js_errors": errors[:5],
    }
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=2))
