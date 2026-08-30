# M9.1 素材处理：海报卡 → 桌宠立绘（裁切 + rembg/u2net 抠图）
from rembg import remove, new_session
from PIL import Image
import io

SRC = r"C:\projects\remainder\b9d1bdd2a3a7e9416cd64e0f13ab5103.jpg"
OUT = r"C:\projects\remainder\desktop\src\assets\pet\remielle.png"

img = Image.open(SRC).convert("RGB")
w, h = img.size  # 1280x1659

# 裁出人物半身（避开右上角 logo、右下标语文字、底部条幅）
crop = img.crop((int(w*0.24), int(h*0.015), int(w*0.80), int(h*0.64)))

buf = io.BytesIO()
crop.save(buf, format="PNG")
session = new_session("u2net")
out = remove(buf.getvalue(), session=session)
res = Image.open(io.BytesIO(out)).convert("RGBA")

# 收紧透明边缘
bbox = res.getbbox()
if bbox:
    res = res.crop(bbox)

res.save(OUT)
print("saved", OUT, res.size)
