# -*- coding: utf-8 -*-
"""PDF 回归 v3:用预生成的真实 PDF 跑浏览器全旅程"""
from playwright.sync_api import sync_playwright
import json, os, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}
pdf_path = SHOT + "/sample-paper-real.pdf"
scanned_path = SHOT + "/scanned-real.pdf"

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

    # 1) 上传真实 PDF
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-modal input[type='file']").set_input_files(pdf_path)
    for _ in range(40):
        pg.wait_for_timeout(500)
        if pg.locator(".extract-preview-hint").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["pdf_hint"] = (pg.locator(".extract-preview-hint").text_content() or "").strip()
    res["pdf_error"] = (pg.locator(".modal-error").text_content() or "").strip() if pg.locator(".modal-error").count() else None
    extracted = pg.locator(".extract-textarea").input_value()
    res["extract_len"] = len(extracted)
    res["has_title"] = "Atmospheric Boundary Layer" in extracted
    res["has_sections"] = all(k in extracted for k in ["1. Introduction", "2. Method", "3. Results", "4. Conclusion"])
    pg.screenshot(path=SHOT + "/" + ts + "-pdf-1-preview.png")

    # 2) 开始解析(mock)
    if not res["pdf_error"]:
        pg.locator(".extract-modal button", has_text="开始解析").click()
        for _ in range(40):
            pg.wait_for_timeout(500)
            if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
                break
        res["preview_reached"] = pg.locator(".extract-textarea.preview").count() == 1
        if res["preview_reached"]:
            pj = pg.locator(".extract-textarea.preview").input_value()
            try:
                parsed = json.loads(pj)
                res["pack_valid"] = True
                res["pack_root"] = parsed.get("root", {}).get("name")
                res["pack_child_count"] = len(parsed.get("root", {}).get("children", []))
            except Exception:
                res["pack_valid"] = False
            pg.locator(".extract-modal button", has_text="保存为内容包").click()
            pg.wait_for_timeout(800)
            res["saved_toast"] = (pg.locator(".import-toast").text_content() or "").strip()
        pg.screenshot(path=SHOT + "/" + ts + "-pdf-2-saved.png")

    # 3) 扫描件
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-modal input[type='file']").set_input_files(scanned_path)
    for _ in range(40):
        pg.wait_for_timeout(500)
        if pg.locator(".modal-error").count() == 1 or pg.locator(".extract-preview-hint").count() == 1:
            break
    err_text = (pg.locator(".modal-error").text_content() or "").strip()
    res["scanned_err_shown"] = ("文本层" in err_text) or ("扫描" in err_text)
    res["scanned_err_text"] = err_text[:150]
    pg.screenshot(path=SHOT + "/" + ts + "-pdf-3-scanned.png")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
