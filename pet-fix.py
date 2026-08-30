# 修补：清除抠图残留的暗色块（仅暗像素，保留浅色裙摆边缘）
from PIL import Image
import numpy as np

P = r"C:\projects\remainder\desktop\src\assets\pet\remielle.png"
img = Image.open(P).convert("RGBA")
a = np.array(img)

# 残留暗块区域（输出坐标系估算）
x0, x1, y0, y1 = 140, 380, 660, 870
region = a[y0:y1, x0:x1]
lum = region[..., :3].mean(axis=2)
mask = lum < 100
region[mask] = [0, 0, 0, 0]
a[y0:y1, x0:x1] = region

Image.fromarray(a).save(P)
print("patched", P)
