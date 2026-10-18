# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    path = SHOT + "/" + ts + "-m2b-" + name + ".png"
    try:
        pg.screenshot(path=path); return True
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

    # 1) 设置 mock
    pg.locator(".tool-btn.accent").click()
    pg.wait_for_timeout(300)
    pg.locator(".modal select").select_option("mock")
    pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click()
    pg.wait_for_timeout(300)
    res["provider_label"] = pg.locator(".tool-btn.accent").inner_text().strip()

    # 2) 点选讲解 → 四段式 + 流式结束(cursor 消失)
    pg.locator(".action-btn.primary", has_text="点选讲解").click()
    pg.wait_for_timeout(3000)
    t1 = pg.locator(".chat-item.assistant").first.text_content() or ""
    res["explain_four_sections"] = all(k in t1 for k in ["是什么", "为什么", "数值/机制含义", "与上下层的关系"])
    res["explain_streaming_finished"] = pg.locator(".cursor-blink").count() == 0
    res["explain_no_duplication"] = "Transformer 架构 是本分层结构中的一个关键模块" in t1
    snap(pg, "1-explain")

    # 3) 讲到最底层
    pg.locator(".action-btn", has_text="讲到最底层").click()
    pg.wait_for_timeout(3000)
    t2 = pg.locator(".chat-item.assistant").nth(1).text_content() or ""
    res["drill_has_layers"] = "第 1 层" in t2 and "第 2 层" in t2
    res["drill_finished"] = pg.locator(".cursor-blink").count() == 0
    snap(pg, "2-drill")

    # 4) 追问
    pg.locator(".ask-bar input").fill("为什么注意力分数要除以根号 d_k?")
    pg.locator(".ask-bar button").click()
    pg.wait_for_timeout(3000)
    t3 = pg.locator(".chat-item.assistant").nth(2).text_content() or ""
    res["followup_has_mock_reply"] = "mock 模式的追问回复" in t3
    res["followup_finished"] = pg.locator(".cursor-blink").count() == 0
    snap(pg, "3-followup")

    # 5) 切节点清空对话
    pg.locator(".nav-node", has_text="输入编码").first.click()
    pg.wait_for_timeout(400)
    res["chat_cleared"] = pg.locator(".chat-item").count() == 0

    # 6) deepseek 无 Key:设置弹窗应显示内联错误(不阻塞)
    pg.locator(".tool-btn.accent").click()
    pg.wait_for_timeout(300)
    pg.locator(".modal select").select_option("deepseek")
    pg.wait_for_timeout(200)
    pg.locator(".modal button", has_text="保存").click()
    pg.wait_for_timeout(300)
    res["modal_inline_error"] = (pg.locator(".modal-error").text_content() or "").strip()
    res["modal_still_open"] = pg.locator(".modal").count() == 1
    snap(pg, "4-no-key-inline-error")

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
