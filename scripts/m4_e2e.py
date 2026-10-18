# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    try:
        pg.screenshot(path=SHOT + "/" + ts + "-m4e2e-" + name + ".png"); return True
    except Exception:
        return False

SAMPLE = "# 大气边界层反演方法\n\n## 1. 引言\n大气边界层高度是空气质量模式的关键输入,本文提出一种基于激光雷达的反演方法。\n\n## 2. 方法\n### 2.1 前向模型\n辐射传输方程描述激光脉冲在大气中的衰减。\n### 2.2 反演算法\n采用最优估计方法最小化代价函数。"

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

    # 打开文档解析
    pg.locator(".tool-btn.accent2").click()
    pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(SAMPLE)
    pg.wait_for_timeout(200)
    pg.locator(".extract-modal button", has_text="开始解析").click()
    pg.wait_for_timeout(6000)  # mock 流式

    # 应进入 preview 态
    res["preview_reached"] = pg.locator(".extract-textarea.preview").count() == 1
    preview_json = pg.locator(".extract-textarea.preview").input_value()
    res["preview_is_valid_json"] = True
    try:
        parsed = json.loads(preview_json)
        res["preview_root_name"] = parsed.get("root", {}).get("name")
        res["preview_h1_count"] = len(parsed.get("root", {}).get("children", []))
    except Exception as e:
        res["preview_is_valid_json"] = False
        res["preview_error"] = str(e)[:100]
    snap(pg, "1-preview")

    # 保存为内容包
    pg.locator(".extract-modal button", has_text="保存为内容包").click()
    pg.wait_for_timeout(600)
    res["modal_closed_after_save"] = pg.locator(".extract-modal").count() == 0
    res["toast"] = (pg.locator(".import-toast").text_content() or "").strip()
    res["pack_options"] = pg.locator(".pack-switch select option").all_inner_texts()
    res["panel_shows_new_root"] = (pg.locator(".panel h2").text_content() or "").strip()
    snap(pg, "2-saved")

    # 新包应已在画布渲染
    res["canvas_has_mock_root"] = "文档解析结果" in " ".join(
        (pg.locator("svg.layer-tree-svg text").nth(i).text_content() or "")
        for i in range(pg.locator("svg.layer-tree-svg text").count())
    )

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
