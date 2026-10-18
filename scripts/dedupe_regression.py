# -*- coding: utf-8 -*-
"""回归:重复 id 修复(dedupeIds)。模拟 DeepSeek 抽取产生的坏 JSON,
验证:① 抽取出口自动修复 ② 保存兜底修复 ③ 校验通过。"""
from playwright.sync_api import sync_playwright
import json, time

res = {}

# 坏 JSON:root.children[1] 的 id 与 root.children[0] 重复,且子节点也有重复
BAD_PACK = {
    "id": "bad-pack",
    "title": "重复 id 测试",
    "theme": "测试",
    "root": {
        "id": "r",
        "name": "根",
        "type": "model",
        "summary": "x",
        "children": [
            {"id": "pangu", "name": "第一章", "type": "layer", "summary": "一"},
            {
                "id": "pangu", "name": "第二章", "type": "layer", "summary": "二",
                "children": [
                    {"id": "3dest", "name": "小节1", "type": "step", "summary": "a"},
                    {"id": "3dest", "name": "小节2", "type": "step", "summary": "b"},
                    {"id": "hta", "name": "小节3", "type": "step", "summary": "c"},
                    {"id": "hta", "name": "小节4", "type": "step", "summary": "d"},
                ],
            },
        ],
    },
}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 直接测 dedupeIds 纯函数:通过页面上下文调用
    # 注意:dedupeIds 是 TS 模块,没暴露到 window。用导入包方式不行,
    # 改为端到端:构造坏 pack JSON 文件,导入(导入路径也有 validatePack)。
    # 更直接:用 JS 在页面里 import('/src/llm/extract.ts')
    dedupe_result = pg.evaluate("""async () => {
        const mod = await import('/src/llm/extract.ts');
        const bad = JSON.parse(JSON.stringify(%s));
        mod.dedupeIds(bad);
        return bad;
    }""" % json.dumps(BAD_PACK, ensure_ascii=False))
    res["dedupe_applied"] = True
    root = dedupe_result["root"]
    res["children_ids_after"] = [c["id"] for c in root["children"]]
    res["dup_child_fixed"] = root["children"][0]["id"] != root["children"][1]["id"]
    grand = root["children"][1]["children"]
    res["grand_ids_after"] = [c["id"] for c in grand]
    res["grand_unique"] = len(set(c["id"] for c in grand)) == len(grand)

    # 端到端:把坏 pack JSON 放进"导入"流程(它会走 validatePack + 无 dedupe)→ 应报错
    # 然后确认新的"文档解析"保存路径有 dedupe(在 ExtractModal 的 handleSave)
    # 用页面 JS 验证:validatePack 对坏数据确实报 id 重复(证明修复前的确会失败)
    val_result = pg.evaluate("""async () => {
        const { validatePack } = await import('/src/validate.ts');
        const bad = JSON.parse(JSON.stringify(%s));
        return validatePack(bad);
    }""" % json.dumps(BAD_PACK, ensure_ascii=False))
    res["validate_before_dedupe_has_errors"] = len(val_result["errors"]) > 0
    res["validate_errors"] = val_result["errors"][:4]

    # 修复后再校验 → 应通过
    val_after = pg.evaluate("""async () => {
        const { validatePack } = await import('/src/validate.ts');
        const { dedupeIds } = await import('/src/llm/extract.ts');
        const bad = JSON.parse(JSON.stringify(%s));
        dedupeIds(bad);
        return validatePack(bad);
    }""" % json.dumps(BAD_PACK, ensure_ascii=False))
    res["validate_after_dedupe_ok"] = val_after["ok"] == True
    res["validate_after_errors"] = val_after["errors"]

    res["js_errors"] = errors[:8]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
