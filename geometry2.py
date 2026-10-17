# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

def svg_texts_geo(pg):
    items = pg.locator("svg.layer-tree-svg text")
    out = []
    for i in range(items.count()):
        el = items.nth(i)
        bb = el.bounding_box()
        out.append({"t": (el.text_content() or "")[:40], "x": round(bb["x"],1) if bb else None, "w": round(bb["width"],1) if bb else None})
    return out

def click(pg, name):
    items = pg.locator("svg.layer-tree-svg text")
    for i in range(items.count()):
        t = items.nth(i).text_content() or ""
        if name in t:
            items.nth(i).scroll_into_view_if_needed()
            pg.wait_for_timeout(150)
            try:
                items.nth(i).click()
                return True
            except Exception:
                items.nth(i).click(force=True)
                return True
    return False

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 2200, "height": 1200})
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(700)

    res = {}
    svg_bb = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox_initial"] = {k: round(v,1) for k,v in svg_bb.items()} if svg_bb else None

    r1 = click(pg, "Encoder 块"); pg.wait_for_timeout(300)
    r2 = click(pg, "Multi-Head"); pg.wait_for_timeout(300)
    r3 = click(pg, "输入编码"); pg.wait_for_timeout(300)
    r4 = click(pg, "前馈网络 FFN"); pg.wait_for_timeout(300)
    res["clicks"] = {"encoder": r1, "mha": r2, "input": r3, "ffn": r4}

    svg2 = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox_expanded"] = {k: round(v,1) for k,v in svg2.items()} if svg2 else None

    geo = svg_texts_geo(pg)
    overflows = [
        {"t": g["t"], "right": round(g["x"] + (g["w"] or 0), 1), "svg_right": round(svg2["x"] + svg2["width"], 1)}
        for g in geo if g["x"] is not None and svg2 and g["x"] + (g["w"] or 0) > svg2["x"] + svg2["width"] + 2
    ]
    res["overflowing_texts"] = overflows
    rights = [g["x"] + (g["w"] or 0) for g in geo if g["x"] is not None]
    res["max_text_right"] = round(max(rights),1) if rights else None
    res["svg_right"] = round(svg2["x"] + svg2["width"],1) if svg2 else None
    res["right_margin"] = round(svg2["x"] + svg2["width"] - max(rights),1) if svg2 and rights else None
    res["svg_height_expanded"] = round(svg2["height"],1) if svg2 else None
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
