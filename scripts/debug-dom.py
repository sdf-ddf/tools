# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

def click(pg, name):
    items = pg.locator("svg.layer-tree-svg text")
    for i in range(items.count()):
        t = items.nth(i).text_content() or ""
        if name in t:
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
    pg = b.new_page(viewport={"width": 2200, "height": 1200})
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(600)

    res = {}
    res["svg_attrs"] = pg.locator("svg.layer-tree-svg").evaluate("el => ({width: el.getAttribute('width'), height: el.getAttribute('height'), viewBox: el.getAttribute('viewBox')})")
    res["g_transform"] = pg.locator("svg.layer-tree-svg g").first.evaluate("el => el.getAttribute('transform')")

    click(pg, "Encoder 块"); pg.wait_for_timeout(300)
    click(pg, "Multi-Head"); pg.wait_for_timeout(300)
    click(pg, "输入编码"); pg.wait_for_timeout(300)
    click(pg, "前馈网络 FFN"); pg.wait_for_timeout(300)

    res["svg_attrs_expanded"] = pg.locator("svg.layer-tree-svg").evaluate("el => ({width: el.getAttribute('width'), height: el.getAttribute('height')})")
    res["g_transform_expanded"] = pg.locator("svg.layer-tree-svg g").first.evaluate("el => el.getAttribute('transform')")
    # 所有节点 circle 的 g 级 transform
    res["node_transforms"] = pg.locator("svg.layer-tree-svg g > g").evaluate_all("els => els.slice(0, 30).map(e => e.getAttribute('transform'))")
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
