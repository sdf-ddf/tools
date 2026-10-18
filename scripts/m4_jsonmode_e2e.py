# -*- coding: utf-8 -*-
"""真实 API 最终回归:json_object 抽取 + 保存,验证 M4 调研结论落地"""
from playwright.sync_api import sync_playwright
import json, os, time

res = {}
SAMPLE = "# 基于激光雷达的大气边界层高度反演\n\n## 1. 引言\n大气边界层高度(ABLH)是空气质量模式、污染扩散预报的关键输入参数。\n\n## 2. 方法\n### 2.1 前向模型\n激光雷达方程描述激光脉冲在大气中传输时后向散射信号随距离的衰减。\n### 2.2 反演算法\n采用小波协方差变换(WCT):协方差最大处对应边界层顶。\n\n## 3. 结果\n与探空对比,平均偏差 12%,相关系数 0.92。\n\n## 4. 结论\nWCT 方法能稳定反演日间边界层高度。"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # DeepSeek + Key(默认模型应为 deepseek-flash)
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").nth(0).select_option("deepseek"); pg.wait_for_timeout(200)
    pg.locator(".modal input[type='password']").fill(os.environ.get("DEEPSEEK_KEY", ""))
    pg.wait_for_timeout(200)
    # 模型下拉现在应是 select(flash 默认)
    model_selects = pg.locator(".modal select")
    res["model_select_count"] = model_selects.count()
    if model_selects.count() >= 2:
        res["default_model"] = model_selects.nth(1).input_value()
        res["model_options"] = pg.locator(".modal select").nth(1).locator("option").all_inner_texts()
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)
    res["provider_btn"] = pg.locator(".tool-btn.accent").inner_text().strip()

    # 抽取(应走 json_object)
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(SAMPLE)
    pg.wait_for_timeout(200)
    t0 = time.time()
    pg.locator(".extract-modal button", has_text="开始解析").click()
    for _ in range(80):
        pg.wait_for_timeout(1500)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["elapsed"] = round(time.time() - t0, 1)

    if pg.locator(".extract-textarea.preview").count() == 1:
        preview = pg.locator(".extract-textarea.preview").input_value()
        try:
            parsed = json.loads(preview)
            res["json_valid"] = True
            res["pack_id"] = parsed.get("id")
            res["pack_title"] = parsed.get("title")
            res["root_children"] = len(parsed.get("root", {}).get("children", []))
        except Exception as e:
            res["json_valid"] = False
            res["err"] = str(e)[:80]
        # 保存
        pg.locator(".extract-modal button", has_text="保存为内容包").click()
        pg.wait_for_timeout(800)
        res["saved_toast"] = (pg.locator(".import-toast").text_content() or "").strip()
    else:
        res["extract_error"] = (pg.locator(".modal-error").text_content() or "").strip()[:200]

    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
