# -*- coding: utf-8 -*-
"""论文精读模式回归 v2:精确匹配节点名"""
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    try:
        pg.screenshot(path=SHOT + "/" + ts + "-paper-" + name + ".png"); return True
    except Exception:
        return False

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

    # 1) 默认新示例论文包
    res["default_pack"] = (pg.locator(".panel h2").text_content() or "").strip()

    # 2) 精确展开"方法" → "辐射传输方程"
    res["exp_method"] = click_svg_text(pg, "方法", exact=True); pg.wait_for_timeout(500)
    res["exp_rte"] = click_svg_text(pg, "辐射传输方程", exact=True); pg.wait_for_timeout(600)
    res["panel_rte"] = (pg.locator(".panel h2").text_content() or "").strip()
    res["katex_rendered"] = pg.locator(".formula-katex .katex").count() >= 1
    res["symbol_rows"] = pg.locator(".symbol-table tbody tr").count()
    res["symbol_has_tau"] = "透过率" in (pg.locator(".symbol-table").text_content() or "")
    res["symbol_has_unit"] = "W·m⁻²" in (pg.locator(".symbol-table").text_content() or "")
    snap(pg, "1-rte")

    # 3) 权重函数
    res["exp_wf"] = click_svg_text(pg, "权重函数", exact=True); pg.wait_for_timeout(500)
    res["wf_katex"] = pg.locator(".formula-katex .katex").count() >= 1
    res["wf_symbols"] = pg.locator(".symbol-table tbody tr").count()
    snap(pg, "2-weightfn")

    # 4) OEM → 平均核矩阵
    res["exp_oem"] = click_svg_text(pg, "最优估计反演(OEM)", exact=True); pg.wait_for_timeout(500)
    res["exp_avgk"] = click_svg_text(pg, "平均核矩阵", exact=True); pg.wait_for_timeout(600)
    res["avgk_katex"] = pg.locator(".formula-katex .katex").count() >= 1
    res["avgk_symbols"] = pg.locator(".symbol-table tbody tr").count()
    snap(pg, "3-avgkernel")

    # 5) 网络图:公式链 4 条边
    pg.locator(".view-btn", has_text="网络").click(); pg.wait_for_timeout(1500)
    res["network_lines"] = pg.locator("svg.layer-tree-svg line").count()
    snap(pg, "4-chain")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
