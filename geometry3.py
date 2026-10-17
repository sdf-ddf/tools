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
    svg_bb = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox_initial"] = {k: round(v,1) for k,v in svg_bb.items()} if svg_bb else None

    res["clicks"] = {
        "encoder": click(pg, "Encoder 块"),
        "mha": click(pg, "Multi-Head"),
        "input": click(pg, "输入编码"),
        "ffn": click(pg, "前馈网络 FFN"),
    }
    pg.wait_for_timeout(400)

    svg2 = pg.locator("svg.layer-tree-svg").bounding_box()
    res["svg_bbox_expanded"] = {k: round(v,1) for k,v in svg2.items()} if svg2 else None

    geo = svg_texts_geo(pg)
    svg_right = svg2["x"] + svg2["width"]
    svg_left = svg2["x"]
    overflows = [
        {"t": g["t"], "right": round(g["x"] + (g["w"] or 0), 1), "svg_right": round(svg_right, 1)}
        for g in geo if g["x"] is not None and (g["x"] + (g["w"] or 0) > svg_right + 2 or g["x"] < svg_left - 2)
    ]
    res["overflowing_texts"] = overflows
    rights = [g["x"] + (g["w"] or 0) for g in geo if g["x"] is not None]
    lefts = [g["x"] for g in geo if g["x"] is not None]
    res["right_margin"] = round(svg_right - max(rights),1)
    res["left_margin"] = round(min(lefts) - svg_left,1)
    res["svg_height_expanded"] = round(svg2["height"],1)
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
