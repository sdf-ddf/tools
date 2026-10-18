# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    try:
        pg.screenshot(path=SHOT + "/" + ts + "-m4-" + name + ".png"); return True
    except Exception:
        return False

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 切到 mock(不花真实 API)
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").select_option("mock"); pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    # 1) 打开文档解析弹窗
    pg.locator(".tool-btn.accent2").click()
    pg.wait_for_timeout(300)
    res["modal_visible"] = pg.locator(".extract-modal").count() == 1
    res["modal_title"] = (pg.locator(".extract-modal h3").text_content() or "").strip()
    snap(pg, "1-modal-open")

    # 2) 空文本点开始 → 错误提示
    pg.locator(".extract-modal button", has_text="开始解析").click()
    pg.wait_for_timeout(300)
    res["empty_error"] = (pg.locator(".modal-error").text_content() or "").strip()
    snap(pg, "2-empty-error")

    # 3) 粘贴文本 + mock 抽取 → 应优雅失败(非 JSON → 重试 → 仍失败 → 报错回 input)
    pg.locator(".extract-textarea").fill("# 测试文档\n\n## 1. 引言\n这是一段测试文本。\n\n## 2. 方法\n### 2.1 前向模型\n辐射传输方程。")
    pg.wait_for_timeout(200)
    pg.locator(".extract-modal button", has_text="开始解析").click()
    pg.wait_for_timeout(6000)  # mock 会流式输出两轮(首次+重试)
    res["mock_extract_failed_gracefully"] = pg.locator(".modal-error").count() == 1
    res["mock_extract_error_text"] = (pg.locator(".modal-error").text_content() or "").strip()[:150]
    res["back_to_input_phase"] = pg.locator(".extract-textarea:not(.preview)").count() == 1
    snap(pg, "3-mock-fail-graceful")

    # 4) 不支持的文件类型(通过 JS 直接触发 handleFile 不可行,改用 input 上传 .pdf)
    # 创建一个假 pdf 文件并上传
    import os
    os.makedirs(SHOT, exist_ok=True)
    with open(SHOT + "/fake.pdf", "wb") as f:
        f.write(b"%PDF-1.4 fake")
    pg.locator(".extract-modal input[type='file']").set_input_files(SHOT + "/fake.pdf")
    pg.wait_for_timeout(400)
    res["pdf_rejected"] = pg.locator(".modal-error").count() == 1
    res["pdf_error_text"] = (pg.locator(".modal-error").text_content() or "").strip()[:120]
    snap(pg, "4-pdf-rejected")

    # 5) 关闭弹窗
    pg.locator(".extract-modal button", has_text="取消").click()
    pg.wait_for_timeout(300)
    res["modal_closed"] = pg.locator(".extract-modal").count() == 0

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
