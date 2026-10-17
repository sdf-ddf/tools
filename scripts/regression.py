# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
results = {}

def snap(pg, name):
    path = SHOT + "/" + ts + "-" + name + ".png"
    try:
        pg.screenshot(path=path); return True
    except Exception:
        return False

def svg_texts(pg):
    items = pg.locator("svg.layer-tree-svg text")
    return [(items.nth(i).text_content() or "") for i in range(items.count())]

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
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(700)
    snap(pg, "1-default")
    results["panel_initial"] = (pg.locator(".panel h2").text_content() or "").strip()
    results["breadcrumb_initial"] = pg.locator(".statusbar").inner_text().strip()

    results["expand_encoder"] = click(pg, "Encoder 块"); pg.wait_for_timeout(400)
    results["expand_mha"] = click(pg, "Multi-Head"); pg.wait_for_timeout(400)
    after = svg_texts(pg)
    results["qkv_visible"] = any("Q/K/V" in t for t in after)
    snap(pg, "2-expanded")

    nav = pg.locator(".nav-node", has_text="Q/K/V")
    results["nav_count"] = nav.count()
    nav.first.click(); pg.wait_for_timeout(400)
    results["panel_nav"] = (pg.locator(".panel h2").text_content() or "").strip()
    results["breadcrumb_nav"] = pg.locator(".statusbar").inner_text().strip()
    snap(pg, "3-nav")

    results["collapse_mha"] = click(pg, "Multi-Head"); pg.wait_for_timeout(400)
    after_col = svg_texts(pg)
    results["qkv_hidden_after_collapse"] = not any("Q/K/V" in t for t in after_col)
    results["panel_keeps_selection"] = (pg.locator(".panel h2").text_content() or "").strip()

    crumbs = pg.locator(".crumb")
    for i in range(crumbs.count()):
        if "Encoder" in (crumbs.nth(i).text_content() or ""):
            crumbs.nth(i).click(); break
    pg.wait_for_timeout(400)
    results["panel_after_crumb"] = (pg.locator(".panel h2").text_content() or "").strip()

    pg.select_option(".pack-switch select", "remote-sensing"); pg.wait_for_timeout(500)
    results["rs_expand_l1"] = click(pg, "Level 1"); pg.wait_for_timeout(300)
    results["rs_expand_l2"] = click(pg, "Level 2"); pg.wait_for_timeout(300)
    rs = svg_texts(pg)
    results["rs_l1a"] = any("L1A" in t for t in rs)
    results["rs_retrieval"] = any("参数反演" in t for t in rs)
    snap(pg, "4-rs-expanded")

    results["js_errors"] = errors[:10]
    b.close()

print(json.dumps(results, ensure_ascii=False, indent=2))
