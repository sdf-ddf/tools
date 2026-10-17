# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
shots = {}
results = {}

def snap(pg, name):
    path = SHOT + "/" + ts + "-" + name + ".png"
    try:
        pg.screenshot(path=path)
        shots[name] = path
        return True
    except Exception as e:
        shots[name] = "FAILED: " + str(e)[:120]
        return False

def svg_texts(pg):
    items = pg.locator("svg.layer-tree-svg text")
    out = []
    for i in range(items.count()):
        out.append(items.nth(i).text_content() or "")
    return out

def click_svg_text(pg, name):
    items = pg.locator("svg.layer-tree-svg text")
    for i in range(items.count()):
        t = items.nth(i).text_content() or ""
        if name in t:
            items.nth(i).click()
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

    # 1) 展开 Encoder
    results["expand_encoder"] = click_svg_text(pg, "Encoder 块")
    pg.wait_for_timeout(400)

    # 2) 展开 MHA(截断标签,用子串 Multi-Head 匹配)
    results["expand_mha"] = click_svg_text(pg, "Multi-Head")
    pg.wait_for_timeout(400)
    after_mha = svg_texts(pg)
    results["qkv_in_svg_after_mha"] = any("Q/K/V" in t for t in after_mha)
    results["softmax_in_svg_after_mha"] = any("注意力分数" in t for t in after_mha)
    snap(pg, "5-mha-expanded")

    # 3) 左侧导航跳转 Q/K/V
    nav = pg.locator(".nav-node", has_text="Q/K/V")
    results["nav_qkv_count"] = nav.count()
    if nav.count() > 0:
        nav.first.click()
        pg.wait_for_timeout(400)
        results["panel_after_nav"] = (pg.locator(".panel h2").text_content() or "").strip()
        results["breadcrumb_after_nav"] = pg.locator(".statusbar").inner_text().strip()
        results["panel_kids"] = pg.locator(".kid-chip").all_inner_texts()
        snap(pg, "6-nav-qkv")

    # 4) 折叠 MHA → Q/K/V 应从画布消失
    results["collapse_mha"] = click_svg_text(pg, "Multi-Head")
    pg.wait_for_timeout(400)
    after_collapse = svg_texts(pg)
    results["qkv_in_svg_after_collapse"] = any("Q/K/V" in t for t in after_collapse)
    # 面板仍应保留 Q/K/V 选中(折叠不影响选中态)
    results["panel_after_collapse"] = (pg.locator(".panel h2").text_content() or "").strip()
    snap(pg, "7-after-collapse")

    # 5) 面包屑点击 "Encoder 块" 返回上层
    crumbs = pg.locator(".crumb")
    for i in range(crumbs.count()):
        t = (crumbs.nth(i).text_content() or "").strip()
        if "Encoder" in t:
            crumbs.nth(i).click()
            break
    pg.wait_for_timeout(400)
    results["panel_after_crumb_click"] = (pg.locator(".panel h2").text_content() or "").strip()
    snap(pg, "8-crumb-click")

    # 6) 切换到遥感包并展开 L1/L2
    pg.select_option(".pack-switch select", "remote-sensing")
    pg.wait_for_timeout(500)
    results["rs_expand_l1"] = click_svg_text(pg, "Level 1")
    pg.wait_for_timeout(300)
    results["rs_expand_l2"] = click_svg_text(pg, "Level 2")
    pg.wait_for_timeout(300)
    rs_texts = svg_texts(pg)
    results["rs_l1a_in_svg"] = any("L1A" in t for t in rs_texts)
    results["rs_retrieval_in_svg"] = any("参数反演" in t for t in rs_texts)
    results["rs_breadcrumb"] = pg.locator(".statusbar").inner_text().strip()
    snap(pg, "9-rs-expanded")

    results["js_errors"] = errors[:10]
    b.close()

results["shots"] = shots
print(json.dumps(results, ensure_ascii=False, indent=2))
