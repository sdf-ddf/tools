# -*- coding: utf-8 -*-
"""可视化增强(D)回归:播放/导出/对比/上层提示"""
from playwright.sync_api import sync_playwright
import json, time, os

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    try:
        pg.screenshot(path=SHOT + "/" + ts + "-vizD-" + name + ".png"); return True
    except Exception:
        return False

def click_svg_text(pg, name):
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
    pg.wait_for_timeout(800)

    # 开数值调试台(根节点 = 训练损失折线)
    pg.locator(".viz-toggle").click(); pg.wait_for_timeout(400)
    res["drawer_open"] = pg.locator(".viz-drawer").count() == 1

    # 1) 折线播放:点播放 → 帧数应增长
    res["playbar_exists"] = pg.locator(".viz-playbar").count() == 1
    frame_before = (pg.locator(".viz-frame-label").text_content() or "").strip()
    pg.locator(".viz-playbtn").click()
    pg.wait_for_timeout(1200)
    frame_after = (pg.locator(".viz-frame-label").text_content() or "").strip()
    res["play_frame_before"] = frame_before
    res["play_frame_after"] = frame_after
    res["play_advances"] = frame_after != frame_before
    snap(pg, "1-play")

    # 2) 导出 PNG:点击导出 → 应触发下载(用 expect_download)
    try:
        with pg.expect_download(timeout=8000) as dl:
            pg.locator(".viz-export-btn").click()
        d = dl.value
        path = SHOT + "/exported.png"
        d.save_as(path)
        res["export_ok"] = os.path.exists(path) and os.path.getsize(path) > 100
        res["export_name"] = d.suggested_filename
    except Exception as e:
        res["export_ok"] = False
        res["export_err"] = str(e)[:100]

    # 3) 固定对比:固定根节点,跳到注意力热力图节点 → 双栏
    pg.locator(".viz-pin-btn", has_text="固定对比").click()
    pg.wait_for_timeout(300)
    res["pinned_badge"] = pg.locator(".pinned-pane").count() == 1

    # 展开到注意力节点
    click_svg_text(pg, "Encoder 块"); pg.wait_for_timeout(300)
    click_svg_text(pg, "Multi-Head"); pg.wait_for_timeout(300)
    click_svg_text(pg, "注意力分数与 Softmax"); pg.wait_for_timeout(400)
    res["compare_panes"] = pg.locator(".viz-pane").count()
    res["compare_show_both"] = pg.locator(".pinned-pane").count() == 1 and "注意力分数" in (pg.locator(".viz-drawer-title").text_content() or "")
    snap(pg, "2-compare")

    # 4) 上层数值图提示:点一个无图的叶子节点(如"加权求和"没有 visualization)
    click_svg_text(pg, "加权求和"); pg.wait_for_timeout(400)
    res["ancestor_hint_visible"] = pg.locator(".viz-empty-hint").count() == 1
    hint_text = (pg.locator(".viz-empty-hint").text_content() or "")
    res["ancestor_hint_has_jump"] = "跳到" in hint_text and pg.locator(".viz-empty-hint .jump").count() == 1
    # 点跳转 → 应回到有图的祖先
    pg.locator(".viz-empty-hint .jump").click()
    pg.wait_for_timeout(400)
    res["after_jump_title"] = (pg.locator(".viz-drawer-title").text_content() or "").strip()
    snap(pg, "3-ancestor-jump")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
