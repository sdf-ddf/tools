# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

def svg_texts_geo(pg):
    items = pg.locator("svg.layer-tree-svg text")
    out = []
    for i in range(items.count()):
        el = items.nth(i)
        bb = el.bounding_box()
        out.append({"t": (el.text_content() or "")[:40], "x": round(bb["x"],1) if bb else None, "y": round(bb["y"],1) if bb else None, "w": round(bb["width"],1) if bb else None})
    return out

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(700)

    res = {}
    # SVG 尺寸与视口关系
    svg_bb = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox"] = {k: round(v,1) for k,v in svg_bb.items()} if svg_bb else None
    # 画布区尺寸
    canvas_bb = pg.locator(".canvas").bounding_box()
    res["canvas_bbox"] = {k: round(v,1) for k,v in canvas_bb.items()} if canvas_bb else None

    # 初始状态:节点是否全部在 SVG 内(文本 x+w 不超 svg 宽度)
    geo = svg_texts_geo(pg)
    res["initial_texts"] = geo
    res["texts_inside_svg"] = all(
        g["x"] is not None and g["x"] >= 0 and svg_bb and g["x"] + (g["w"] or 0) <= svg_bb["width"] + 2
        for g in geo
    )

    # 展开全部后 SVG 高度是否自适应增长
    def click(name):
        items = pg.locator("svg.layer-tree-svg text")
        for i in range(items.count()):
            t = items.nth(i).text_content() or ""
            if name in t:
                items.nth(i).click(); return True
        return False
    click("Encoder 块"); pg.wait_for_timeout(300)
    click("Multi-Head"); pg.wait_for_timeout(300)
    click("输入编码"); pg.wait_for_timeout(300)
    click("前馈网络 FFN"); pg.wait_for_timeout(300)
    svg2 = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox_expanded"] = {k: round(v,1) for k,v in svg2.items()} if svg2 else None
    geo2 = svg_texts_geo(pg)
    res["expanded_texts"] = geo2
    res["expanded_texts_inside"] = all(
        g["x"] is not None and g["x"] >= 0 and svg2 and g["x"] + (g["w"] or 0) <= svg2["width"] + 2
        for g in geo2
    )
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
