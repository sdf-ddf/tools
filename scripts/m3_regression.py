# -*- coding: utf-8 -*-
"""M3 回归:数值抽屉 + 8 个可视化绑定(Transformer 5 + 遥感 3)"""
from playwright.sync_api import sync_playwright
import json, time

SHOT = "E:/Tools/layerview/shots"
ts = str(int(time.time() * 1000))
res = {}

def snap(pg, name):
    path = SHOT + "/" + ts + "-m3f-" + name + ".png"
    try:
        pg.screenshot(path=path); return True
    except Exception:
        return False

def click_svg_text(pg, name, exact=False):
    items = pg.locator("svg.layer-tree-svg text")
    for i in range(items.count()):
        t = items.nth(i).text_content() or ""
        hit = (t == name) if exact else (name in t)
        if hit:
            items.nth(i).scroll_into_view_if_needed()
            pg.wait_for_timeout(100)
            try:
                items.nth(i).click()
            except Exception:
                items.nth(i).click(force=True)
            return True
    return False

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1680, "height": 950})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # 1) 根节点:训练损失折线
    pg.locator(".viz-toggle").click(); pg.wait_for_timeout(300)
    res["viz1_root_line"] = pg.locator(".viz-drawer path").count() >= 1
    snap(pg, "1-root-line")

    # 2) Transformer:注意力热力图
    click_svg_text(pg, "Encoder 块"); pg.wait_for_timeout(300)
    click_svg_text(pg, "Multi-Head"); pg.wait_for_timeout(300)
    click_svg_text(pg, "注意力分数与 Softmax"); pg.wait_for_timeout(300)
    res["viz2_attn_heatmap"] = pg.locator(".viz-drawer rect").count() == 25
    snap(pg, "2-attn")

    # 3) Q/K/V 矩阵
    click_svg_text(pg, "Q/K/V 线性投影"); pg.wait_for_timeout(300)
    res["viz3_qkv_matrix"] = pg.locator(".viz-drawer rect").count() == 12
    snap(pg, "3-qkv")

    # 4) FFN 直方图
    click_svg_text(pg, "前馈网络 FFN"); pg.wait_for_timeout(300)
    click_svg_text(pg, "线性扩展"); pg.wait_for_timeout(300)
    res["viz4_ffn_histogram"] = pg.locator(".viz-drawer rect").count() == 7
    snap(pg, "4-ffn")

    # 5) 词嵌入散点
    click_svg_text(pg, "输入编码"); pg.wait_for_timeout(300)
    click_svg_text(pg, "Token Embedding"); pg.wait_for_timeout(300)
    res["viz5_emb_scatter"] = pg.locator(".viz-drawer circle").count() == 15
    snap(pg, "5-emb")

    # 6) 遥感:定标曲线
    pg.select_option(".pack-switch select", "remote-sensing"); pg.wait_for_timeout(500)
    click_svg_text(pg, "Level 1"); pg.wait_for_timeout(300)
    click_svg_text(pg, "L1A 辐射定标"); pg.wait_for_timeout(300)
    res["viz6_rs_cal"] = pg.locator(".viz-drawer path").count() >= 1
    snap(pg, "6-rs-cal")

    # 7) 遥感:权重函数
    click_svg_text(pg, "Level 2"); pg.wait_for_timeout(300)
    click_svg_text(pg, "参数反演"); pg.wait_for_timeout(300)
    res["viz7_rs_weightfn"] = pg.locator(".viz-drawer path").count() >= 1
    snap(pg, "7-rs-wf")

    # 8) 遥感:代价收敛(精确匹配子节点)
    click_svg_text(pg, "大气校正", exact=True); pg.wait_for_timeout(300)
    res["viz8_rs_cost"] = pg.locator(".viz-drawer path").count() >= 1
    snap(pg, "8-rs-cost")

    # 9) 空节点提示 + 关闭
    click_svg_text(pg, "Level 0"); pg.wait_for_timeout(300)
    res["empty_hint"] = pg.locator(".viz-empty-hint").count() == 1
    pg.locator(".viz-close").click(); pg.wait_for_timeout(300)
    res["drawer_closed"] = pg.locator(".viz-drawer").count() == 0

    res["js_errors"] = errors[:10]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
