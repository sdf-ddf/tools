# -*- coding: utf-8 -*-
"""真实 DeepSeek 完整旅程:抽取 → 保存为内容包(触发 validatePack)→ 画布呈现"""
from playwright.sync_api import sync_playwright
import json, os, time

res = {}
SAMPLE = "# 基于激光雷达的大气边界层高度反演\n\n## 1. 引言\n大气边界层高度(ABLH)是空气质量模式、污染扩散预报的关键输入参数。地基激光雷达可以连续获取边界层内气溶胶的垂直分布。\n\n## 2. 方法\n### 2.1 前向模型\n激光雷达方程描述激光脉冲在大气中传输时后向散射信号随距离的衰减。\n### 2.2 反演算法\n本文采用小波协方差变换(WCT)方法:对距离校正信号做小波变换,协方差最大处对应气溶胶浓度骤降的边界层顶。\n\n## 3. 结果\n与探空廓线对比,平均偏差 12%,相关系数 0.92。\n\n## 4. 结论\nWCT 方法能稳定反演日间边界层高度。"

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
    pg.locator(".modal select").select_option("deepseek"); pg.wait_for_timeout(200)
    pg.locator(".modal input[type='password']").fill(os.environ.get("DEEPSEEK_KEY", ""))
    pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    # 抽取
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(SAMPLE)
    pg.wait_for_timeout(200)
    pg.locator(".extract-modal button", has_text="开始解析").click()
    for _ in range(80):
        pg.wait_for_timeout(1500)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break

    if pg.locator(".extract-textarea.preview").count() == 1:
        # 保存为内容包 → validatePack 校验 + 加入主界面
        pg.locator(".extract-modal button", has_text="保存为内容包").click()
        pg.wait_for_timeout(800)
        res["toast"] = (pg.locator(".import-toast").text_content() or "").strip()
        res["saved_ok"] = "已导入解析结果" in res["toast"]
        res["pack_options"] = pg.locator(".pack-switch select option").all_inner_texts()
        res["panel_root"] = (pg.locator(".panel h2").text_content() or "").strip()
        # 画布上应有新树的节点
        canvas_texts = " ".join(
            (pg.locator("svg.layer-tree-svg text").nth(i).text_content() or "")
            for i in range(pg.locator("svg.layer-tree-svg text").count())
        )
        res["canvas_has_extracted"] = "反演" in canvas_texts or "ABLH" in canvas_texts
        # 展开看看层级
        for i in range(pg.locator("svg.layer-tree-svg text").count()):
            t = pg.locator("svg.layer-tree-svg text").nth(i).text_content() or ""
            if "引言" in t:
                pg.locator("svg.layer-tree-svg text").nth(i).click()
                break
        pg.wait_for_timeout(500)
        res["nested_visible_after_expand"] = pg.locator("svg.layer-tree-svg text").count() > 4
    else:
        res["extract_failed"] = (pg.locator(".modal-error").text_content() or "").strip()[:200]

    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
