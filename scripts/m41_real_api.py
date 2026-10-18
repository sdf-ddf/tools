# -*- coding: utf-8 -*-
"""真实 DeepSeek + M4.1 新引擎:长文档多块 + Follow-the-Format + 自修复"""
from playwright.sync_api import sync_playwright
import json, os, time

res = {}
LONG_DOC = "# 大气边界层激光雷达反演研究\n\n## 1. 引言\n" + "大气边界层高度(ABLH)是空气质量模式的关键输入参数,传统探空测量时空分辨率不足。" * 20 + "\n\n## 2. 方法\n### 2.1 前向模型\n" + "激光雷达方程描述激光脉冲在大气中的后向散射衰减。" * 20 + "\n### 2.2 反演算法\n" + "小波协方差变换(WCT)对距离校正信号做小波分析,协方差最大处对应边界层顶。" * 20 + "\n\n## 3. 结果\n" + "与探空廓线对比,平均偏差12%,相关系数0.92。" * 20 + "\n\n## 4. 结论\n" + "WCT方法能稳定反演日间边界层高度。" * 20

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").first.select_option("deepseek"); pg.wait_for_timeout(200)
    pg.locator(".modal input[type='password']").fill(os.environ.get("DEEPSEEK_KEY", ""))
    pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(LONG_DOC)
    pg.wait_for_timeout(200)
    t0 = time.time()
    pg.locator(".extract-modal button", has_text="开始解析").click()
    for _ in range(180):
        pg.wait_for_timeout(1500)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["elapsed"] = round(time.time() - t0, 1)
    if pg.locator(".extract-textarea.preview").count() == 1:
        pj = pg.locator(".extract-textarea.preview").input_value()
        try:
            parsed = json.loads(pj)
            res["valid"] = True
            root = parsed.get("root", {})
            res["root_children"] = len(root.get("children", []))
            res["child_names"] = [c.get("name") for c in root.get("children", [])][:8]
            res["nested"] = any(c.get("children") for c in root.get("children", []))
            pg.locator(".extract-modal button", has_text="保存为内容包").click()
            pg.wait_for_timeout(800)
            res["saved"] = "已导入解析结果" in (pg.locator(".import-toast").text_content() or "")
        except Exception as e:
            res["valid"] = False
            res["err"] = str(e)[:120]
    else:
        res["error"] = (pg.locator(".modal-error").text_content() or "").strip()[:250]
    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
