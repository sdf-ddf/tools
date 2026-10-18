# -*- coding: utf-8 -*-
"""工程级第一步回归:取消/持久化/版本标签/单实例锁"""
from playwright.sync_api import sync_playwright
import json, time

res = {}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 1) 版本标签
    res["version_label"] = (pg.locator(".brand-sub").text_content() or "").strip()

    # 2) mock 讲解:点讲解 → 取消按钮出现 → 点停止 → busy 结束
    pg.locator(".tool-btn.accent").click(); pg.wait_for_timeout(300)
    pg.locator(".modal select").first.select_option("mock"); pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click(); pg.wait_for_timeout(300)

    pg.locator(".action-btn.primary", has_text="点选讲解").click()
    pg.wait_for_timeout(400)
    res["cancel_btn_visible"] = pg.locator(".action-btn.cancel").count() == 1
    pg.locator(".action-btn.cancel").click()
    pg.wait_for_timeout(500)
    res["busy_cleared"] = pg.locator(".action-btn", has_text="点选讲解").count() == 1
    res["no_error_after_cancel"] = pg.locator(".llm-error").count() == 0
    res["partial_text_kept"] = pg.locator(".chat-item.assistant").count() == 1

    # 3) 持久化:导入一个测试包 → 刷新 → 应还在
    import os
    SHOT = "E:/Tools/layerview/shots"
    os.makedirs(SHOT, exist_ok=True)
    test_pack = {
        "id": "persist-test",
        "title": "持久化测试包",
        "theme": "测试",
        "root": {
            "id": "p.root", "name": "持久化根", "type": "model", "summary": "测试",
            "children": [{"id": "p.a", "name": "子节点A", "type": "step", "summary": "a"}],
        },
    }
    tmp = SHOT + "/persist.json"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(test_pack, f, ensure_ascii=False)
    pg.locator(".tool-btn", has_text="导入").click(); pg.wait_for_timeout(300)
    pg.locator('input[type="file"]').first.set_input_files(tmp)
    pg.wait_for_timeout(800)
    res["imported_pack_options"] = pg.locator(".pack-switch select option").all_inner_texts()

    # 刷新页面
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(800)
    res["after_reload_options"] = pg.locator(".pack-switch select option").all_inner_texts()
    res["persist_survives_reload"] = "持久化测试包" in res["after_reload_options"]
    # 刷新后自动选中恢复的包
    res["restored_pack_selected"] = "持久化根" in (pg.locator(".panel h2").text_content() or "")

    # 4) 单实例锁:打包版测试跳过(需要桌面环境),记录跳过原因
    res["single_instance_note"] = "单实例锁在 electron 主进程,桌面版启动时生效(web 版无此概念)"

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
