# -*- coding: utf-8 -*-
"""M4.1 回归:多块分层归并 + 自修复循环 + jsonrepair + 旧功能"""
from playwright.sync_api import sync_playwright
import json, time, os

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

# 一个长文档(>6000 字符,含标题层级),测多块归并
LONG_DOC = ""
for i in range(1, 6):
    LONG_DOC += "# 第" + str(i) + "章 主题\n\n"
    for j in range(1, 4):
        LONG_DOC += "## " + str(i) + "." + str(j) + " 小节\n"
        LONG_DOC += "这是第" + str(i) + "章第" + str(j) + "小节的详细内容。" * 30 + "\n\n"

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

    # 1) 长文档多块抽取(mock 每块生成合法 pack)
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(LONG_DOC)
    pg.wait_for_timeout(200)
    # 参数控件存在
    res["param_controls"] = pg.locator(".extract-params").count() == 1
    pg.locator(".extract-modal button", has_text="开始解析").click()
    # 等 preview(mock 快,但要给 chunk 流式时间;长文档多块 × 每块 mock 抽取)
    for _ in range(90):
        pg.wait_for_timeout(1000)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["multi_chunk_preview"] = pg.locator(".extract-textarea.preview").count() == 1
    if res["multi_chunk_preview"]:
        pj = pg.locator(".extract-textarea.preview").input_value()
        try:
            parsed = json.loads(pj)
            res["merged_valid_json"] = True
            root = parsed.get("root", {})
            res["merged_root_name"] = root.get("name")
            res["merged_children"] = len(root.get("children", []))
            res["merged_nested"] = any("children" in c and c["children"] for c in root.get("children", []))
        except Exception as e:
            res["merged_valid_json"] = False
            res["merged_err"] = str(e)[:100]
    else:
        res["multi_chunk_error"] = (pg.locator(".modal-error").text_content() or "").strip()[:200]

    # 2) jsonrepair:页面 JS 直接测 tryParseObject 对坏 JSON 的修复
    repair_test = pg.evaluate("""async () => {
        const { tryParseObject } = await import('/src/llm/extract.ts');
        // 典型 LLM 坏输出:尾逗号
        const bad = '{"id":"x","title":"t","root":{"id":"r","name":"n","type":"model","summary":"s",}}';
        const r = tryParseObject(bad);
        return r ? { ok: true, title: r.title } : { ok: false };
    }""")
    res["jsonrepair_trailing_comma"] = repair_test["ok"] == True

    # 3) 自修复循环:mock 模式触发不了真错,改为页面 JS 验证 validatePack 能被调用(间接)
    # 直接测:把带重复 id 的包走 extractDocument 的 mock 路径 → 最终应可保存(自动修复)
    dup_doc = "# 测试\n\n## 1. 引言\nABLH 是空气质量模式关键输入。\n\n## 2. 方法\nWCT 小波协方差变换。"
    pg.locator(".extract-modal button", has_text="取消").click(); pg.wait_for_timeout(300)
    pg.locator(".tool-btn.accent2").click(); pg.wait_for_timeout(300)
    pg.locator(".extract-textarea").fill(dup_doc)
    pg.locator(".extract-modal button", has_text="开始解析").click()
    for _ in range(40):
        pg.wait_for_timeout(800)
        if pg.locator(".extract-textarea.preview").count() == 1 or pg.locator(".modal-error").count() == 1:
            break
    res["dup_doc_preview"] = pg.locator(".extract-textarea.preview").count() == 1
    if res["dup_doc_preview"]:
        # 保存应成功(finalizePack 自动修复)
        pg.locator(".extract-modal button", has_text="保存为内容包").click()
        pg.wait_for_timeout(600)
        toast = (pg.locator(".import-toast").text_content() or "").strip()
        res["dup_doc_saved"] = "已导入解析结果" in toast
        res["dup_doc_toast"] = toast

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
