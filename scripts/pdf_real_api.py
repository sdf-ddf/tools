# -*- coding: utf-8 -*-
"""PDF → 真实 DeepSeek 抽取全链路"""
from playwright.sync_api import sync_playwright
import json, os, time

SHOT = "E:/Tools/layerview/shots"
res = {}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # DeepSeek + Key
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").first.select_option("deepseek"); pg.wait_for_timeout(200)
    pg.locator(".modal input[type='password']").fill(os.environ.get("DEEPSEEK_KEY", ""))
    pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    # 上传 PDF
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-modal input[type='file']").set_input_files(SHOT + "/sample-paper-real.pdf")
    for _ in range(40):
        pg.wait_for_timeout(500)
        if pg.locator(".extract-preview-hint").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["pdf_hint"] = (pg.locator(".extract-preview-hint").text_content() or "").strip()

    # 真实抽取
    t0 = time.time()
    pg.locator(".extract-modal button", has_text="开始解析").click()
    for _ in range(80):
        pg.wait_for_timeout(1500)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["elapsed"] = round(time.time() - t0, 1)
    if pg.locator(".extract-textarea.preview").count() == 1:
        pj = pg.locator(".extract-textarea.preview").input_value()
        try:
            parsed = json.loads(pj)
            res["pack_valid"] = True
            res["pack_title"] = parsed.get("title")
            res["pack_id"] = parsed.get("id")
            res["root_name"] = parsed.get("root", {}).get("name")
            res["root_children"] = len(parsed.get("root", {}).get("children", []))
            res["child_names"] = [c.get("name") for c in parsed.get("root", {}).get("children", [])][:8]
        except Exception as e:
            res["pack_valid"] = False
            res["err"] = str(e)[:100]
        # 保存
        pg.locator(".extract-modal button", has_text="保存为内容包").click()
        pg.wait_for_timeout(800)
        res["toast"] = (pg.locator(".import-toast").text_content() or "").strip()
        res["pack_options"] = pg.locator(".pack-switch select option").all_inner_texts()
    else:
        res["extract_err"] = (pg.locator(".modal-error").text_content() or "").strip()[:200]

    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
