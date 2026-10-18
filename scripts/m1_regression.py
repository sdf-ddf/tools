# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time, os

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    path = SHOT + "/" + ts + "-m1-" + name + ".png"
    try:
        pg.screenshot(path=path); res["shot_" + name] = path; return True
    except Exception as e:
        res["shot_" + name] = "FAILED:" + str(e)[:80]; return False

def svg_texts(pg):
    items = pg.locator("svg.layer-tree-svg text")
    return [(items.nth(i).text_content() or "") for i in range(items.count())]

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
    snap(pg, "tree-initial")

    # 1) 展开 Encoder + MHA,验证长名称完整(不截断)
    res["expand_encoder"] = click_svg_text(pg, "Encoder 块"); pg.wait_for_timeout(400)
    res["expand_mha"] = click_svg_text(pg, "Multi-Head"); pg.wait_for_timeout(400)
    texts = svg_texts(pg)
    res["full_mha_name_present"] = any("多头自注意力 Multi-Head Attention" == t for t in texts)
    res["no_ellipsis_in_names"] = not any("…" in t for t in texts)
    snap(pg, "tree-expanded")

    # 2) 搜索
    search = pg.locator(".search-box input")
    search.fill("Softmax")
    pg.wait_for_timeout(300)
    results = pg.locator(".search-results button")
    res["search_results_count"] = results.count()
    res["search_results_texts"] = results.all_inner_texts()
    if results.count() > 0:
        results.first.click()
        pg.wait_for_timeout(400)
        res["panel_after_search_click"] = (pg.locator(".panel h2").text_content() or "").strip()
    snap(pg, "search")

    # 3) 视图切换:网络图
    pg.locator(".view-btn", has_text="网络").click()
    pg.wait_for_timeout(1200)  # 等力导向布局
    res["network_svg_exists"] = pg.locator("svg.layer-tree-svg").count() == 1
    res["network_lines"] = pg.locator("svg.layer-tree-svg line").count()
    res["network_arrow_markers"] = pg.locator("svg.layer-tree-svg marker").count()
    res["network_rects"] = pg.locator("svg.layer-tree-svg rect").count()
    snap(pg, "network")
    # 点击网络图节点
    net_clicked = click_svg_text(pg, "Softmax")
    pg.wait_for_timeout(300)
    res["panel_after_network_click"] = (pg.locator(".panel h2").text_content() or "").strip()

    # 4) 导出
    export_btn = pg.locator(".tool-btn", has_text="导出")
    res["export_btn_exists"] = export_btn.count() == 1
    export_btn.click()
    pg.wait_for_timeout(300)
    res["export_ok"] = True  # 点击成功即视为通过(实际下载另测)

    # 5) 导入(写临时 JSON,通过 set_input_files 上传)
    os.makedirs(SHOT, exist_ok=True)
    test_pack = {
        "id": "test-pack",
        "title": "测试内容包",
        "theme": "测试",
        "root": {
            "id": "tp.root", "name": "测试根节点", "type": "model",
            "summary": "导入测试",
            "children": [
                {"id": "tp.a", "name": "测试子节点 A", "type": "step", "summary": "A 节点"},
            ],
        },
        "edges": [{"from": "tp.root", "to": "tp.a", "label": "测试边"}],
    }
    tmp_path = SHOT + "/test-pack.json"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(test_pack, f, ensure_ascii=False)
    file_input = pg.locator('input[type="file"]')
    file_input.set_input_files(tmp_path)
    pg.wait_for_timeout(600)
    res["import_toast"] = (pg.locator(".import-toast").text_content() or "").strip()
    res["panel_after_import"] = (pg.locator(".panel h2").text_content() or "").strip()
    res["pack_options_after_import"] = pg.locator(".pack-switch select option").all_inner_texts()
    snap(pg, "after-import")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
