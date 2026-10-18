# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

res = {}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 1) 导出:捕获下载内容
    with pg.expect_download() as dl_info:
        pg.locator(".tool-btn", has_text="导出").click()
    dl = dl_info.value
    path = "E:/Tools/layerview/shots/downloaded.pack.json"
    dl.save_as(path)
    with open(path, "r", encoding="utf-8") as f:
        exported = json.load(f)
    res["export_filename"] = dl.suggested_filename
    res["export_id"] = exported.get("id")
    res["export_title"] = exported.get("title")
    res["export_root_name"] = exported.get("root", {}).get("name")
    res["export_edges_count"] = len(exported.get("edges", []))

    # 2) 非法导入:缺 title / 缺 root
    bad1 = {"id": "bad", "theme": "x"}  # 无 title 无 root
    p1 = "E:/Tools/layerview/shots/bad1.json"
    with open(p1, "w", encoding="utf-8") as f:
        json.dump(bad1, f)
    pg.locator('input[type="file"]').set_input_files(p1)
    pg.wait_for_timeout(500)
    toast1 = (pg.locator(".import-toast").text_content() or "").strip()
    res["bad_import_toast"] = toast1
    res["bad_import_rejected"] = "校验失败" in toast1

    # 3) 重复 id 导入
    bad2 = {
        "id": "dup", "title": "重复id包", "theme": "t",
        "root": {
            "id": "a", "name": "A", "type": "model",
            "children": [{"id": "a", "name": "B", "type": "step"}],
        },
    }
    p2 = "E:/Tools/layerview/shots/bad2.json"
    with open(p2, "w", encoding="utf-8") as f:
        json.dump(bad2, f)
    pg.locator('input[type="file"]').set_input_files(p2)
    pg.wait_for_timeout(500)
    toast2 = (pg.locator(".import-toast").text_content() or "").strip()
    res["dup_import_toast"] = toast2
    res["dup_import_rejected"] = "校验失败" in toast2

    # 4) 非法 JSON 导入
    p3 = "E:/Tools/layerview/shots/bad3.json"
    with open(p3, "w", encoding="utf-8") as f:
        f.write("{not valid json")
    pg.locator('input[type="file"]').set_input_files(p3)
    pg.wait_for_timeout(500)
    toast3 = (pg.locator(".import-toast").text_content() or "").strip()
    res["badjson_toast"] = toast3
    res["badjson_rejected"] = "解析失败" in toast3

    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
