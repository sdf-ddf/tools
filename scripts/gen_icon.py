# -*- coding: utf-8 -*-
"""生成 Layerview 图标:紫渐变圆角方块 + 白色分层菱形"""
from PIL import Image, ImageDraw
import os

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 渐变背景(垂直:深紫→靛蓝)
for y in range(SIZE):
    t = y / SIZE
    r = int(67 + (99 - 67) * t)   # 67→99
    g = int(56 + (102 - 56) * t)  # 56→102
    b = int(202 + (241 - 202) * t)  # 202→241
    d.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

# 圆角方块
radius = 96
d.rounded_rectangle([24, 24, SIZE - 24, SIZE - 24], radius=radius, fill=(67, 56, 202, 255))

# 中心白色菱形(◈ 分层透视镜符号)
cx, cy = SIZE // 2, SIZE // 2
diamond_w, diamond_h = 150, 150
d.polygon(
    [(cx, cy - diamond_h), (cx + diamond_w, cy), (cx, cy + diamond_h), (cx - diamond_w, cy)],
    fill=(255, 255, 255, 255),
)
# 内部紫色小菱形(层次感)
inner = 55
d.polygon(
    [(cx, cy - inner), (cx + inner, cy), (cx, cy + inner), (cx - inner, cy)],
    fill=(99, 102, 241, 255),
)

out = "E:/Tools/layerview/build/icon.png"
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out)
print("icon saved:", out, img.size)

# 也生成 ico(Windows)
ico_out = "E:/Tools/layerview/build/icon.ico"
img.save(ico_out, format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("ico saved:", ico_out)
