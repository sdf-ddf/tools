# -*- coding: utf-8 -*-
"""真实 DeepSeek API 链路测试:抽取大气遥感样例文本。
API Key 从环境变量 DEEPSEEK_KEY 读取,不写文件、不打印。"""
from playwright.sync_api import sync_playwright
import json, os, time

res = {}
SAMPLE = "# 基于激光雷达的大气边界层高度反演\n\n## 1. 引言\n大气边界层高度(ABLH)是空气质量模式、污染扩散预报的关键输入参数。传统的探空测量时空分辨率不足,地基激光雷达可以连续获取边界层内气溶胶的垂直分布,为反演提供高时间分辨率观测。\n\n## 2. 方法\n### 2.1 前向模型\n激光雷达方程描述激光脉冲在大气中传输时后向散射信号随距离的衰减,信号强度与气溶胶消光系数和距离的平方成反比。\n### 2.2 反演算法\n本文采用小波协方差变换(WCT)方法:对距离校正信号做小波变换,协方差最大处对应气溶胶浓度骤降的边界层顶。WCT 的优点是无需先验假设,能自动适应不同信噪比。\n\n## 3. 结果\n与探空廓线对比,激光雷达反演的 ABLH 平均偏差 12%,相关系数 0.92,白天对流边界层反演效果最佳。\n\n## 4. 结论\nWCT 方法配合地基激光雷达,能稳定反演日间边界层高度,为空气质量模式提供高时效输入。"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 1) 打开设置,选 DeepSeek,填 Key(来自环境变量)
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").select_option("deepseek"); pg.wait_for_timeout(200)
    key = os.environ.get("DEEPSEEK_KEY", "")
    if key:
        pg.locator(".modal input[type='password']").fill(key)
        pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click()
    pg.wait_for_timeout(300)
    res["provider_btn"] = pg.locator(".tool-btn.accent").inner_text().strip()
    res["key_provided"] = bool(key)

    # 2) 打开文档解析,粘贴样例
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(SAMPLE)
    pg.wait_for_timeout(200)

    # 3) 开始解析(真实 API,流式;最多等 120s)
    t0 = time.time()
    pg.locator(".extract-modal button", has_text="开始解析").click()
    # 轮询等待进入 preview 或出现错误
    for _ in range(80):
        pg.wait_for_timeout(1500)
        if pg.locator(".extract-textarea.preview").count() == 1:
            break
        if pg.locator(".modal-error").count() == 1:
            break
    elapsed = round(time.time() - t0, 1)
    res["elapsed_seconds"] = elapsed

    if pg.locator(".extract-textarea.preview").count() == 1:
        preview = pg.locator(".extract-textarea.preview").input_value()
        res["preview_reached"] = True
        try:
            parsed = json.loads(preview)
            res["json_valid"] = True
            root = parsed.get("root", {})
            res["pack_id"] = parsed.get("id")
            res["pack_title"] = parsed.get("title")
            res["root_name"] = root.get("name")
            res["root_type"] = root.get("type")
            res["children_count"] = len(root.get("children", []))
            res["child_names"] = [c.get("name") for c in root.get("children", [])][:6]
            # 是否有嵌套子层
            nested = [c for c in root.get("children", []) if c.get("children")]
            res["nested_child"] = nested[0].get("name") if nested else None
            res["nested_grandchildren"] = [g.get("name") for g in nested[0].get("children", [])][:6] if nested else []
        except Exception as e:
            res["json_valid"] = False
            res["parse_error"] = str(e)[:100]
    else:
        res["preview_reached"] = False
        res["error_text"] = (pg.locator(".modal-error").text_content() or "").strip()[:300]

    res["js_errors"] = errors[:5]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
