"""Remainder icon - final art (concept C: pixel mascot face), 2x supersampled"""
from PIL import Image, ImageDraw, ImageFilter

SS = 2  # supersample
S = 1024 * SS
RADIUS = 220 * SS

VIOLET = (124, 58, 237)
PINK = (236, 72, 153)
INDIGO_EYE = (88, 60, 220)
BLUSH = (255, 170, 190)

def radial_bg():
    """diagonal gradient violet->pink + soft center glow"""
    img = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(img)
    for y in range(S):
        for_x = y / S
        c = tuple(int(VIOLET[i] + (PINK[i] - VIOLET[i]) * for_x) for i in range(3)) + (255,)
        d.line([(0, y), (S, y)], fill=c)
    # soft white glow behind face
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = S // 2, S // 2 + 20 * SS, int(330 * SS)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(60 * SS))
    img.alpha_composite(glow)
    return img

def rounded_mask():
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, S, S], radius=RADIUS, fill=255)
    return m

img = radial_bg()
d = ImageDraw.Draw(img)

# face geometry
hs = int(500 * SS)          # head size
hx = (S - hs) // 2
hy = int(300 * SS)
er = int(96 * SS)           # head corner radius

# ears (behind head)
ear_w = int(150 * SS)
ear_h = int(140 * SS)
ear_y = hy + int(30 * SS)
for side in (-1, 1):
    ex = hx + int(60 * SS) if side < 0 else hx + hs - int(60 * SS)
    d.polygon(
        [(ex - ear_w // 2, ear_y), (ex, ear_y - ear_h), (ex + ear_w // 2, ear_y)],
        fill=(255, 255, 255, 255),
    )
    # inner ear
    iw = int(ear_w * 0.5)
    d.polygon(
        [(ex - iw // 2, ear_y - int(18 * SS)), (ex, ear_y - ear_h + int(38 * SS)), (ex + iw // 2, ear_y - int(18 * SS))],
        fill=(*BLUSH, 255),
    )

# head with soft vertical gradient (white -> #F3EEFF)
head = Image.new('RGBA', (S, S), (0, 0, 0, 0))
hd = ImageDraw.Draw(head)
for y in range(hy, hy + hs):
    t = (y - hy) / hs
    c = tuple(int(255 + (243 - 255) * t) for _ in range(2)) + (int(255 + (238 - 255) * t), 255)
    c = (int(255 - 12 * t), int(255 - 12 * t), 255, 255)
    hd.line([(hx, y), (hx + hs, y)], fill=c)
head_mask = Image.new('L', (S, S), 0)
hm = ImageDraw.Draw(head_mask)
hm.rounded_rectangle([hx, hy, hx + hs, hy + hs], radius=er, fill=255)
img.paste(head, (0, 0), head_mask)

# face shadow under ears junction / soft bottom shade
shade = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(shade)
sd.rounded_rectangle([hx, hy + hs - int(60 * SS), hx + hs, hy + hs], radius=er, fill=(124, 58, 237, 18))
img.paste(shade, (0, 0), head_mask)

d = ImageDraw.Draw(img)

# eyes: tall rounded rects with double highlight
ew = int(62 * SS)
eh = int(96 * SS)
ey = hy + int(190 * SS)
ex1 = hx + int(120 * SS)
ex2 = hx + hs - int(120 * SS) - ew
for ex in (ex1, ex2):
    d.rounded_rectangle([ex, ey, ex + ew, ey + eh], radius=int(16 * SS), fill=(*INDIGO_EYE, 255))
    # highlights
    d.rectangle([ex + int(12 * SS), ey + int(12 * SS), ex + int(30 * SS), ey + int(30 * SS)], fill=(255, 255, 255, 255))
    d.rectangle([ex + int(34 * SS), ey + int(34 * SS), ex + int(44 * SS), ey + int(44 * SS)], fill=(255, 255, 255, 200))

# blush
bw = int(86 * SS)
bh = int(40 * SS)
by = hy + int(320 * SS)
d.ellipse([hx + int(60 * SS), by, hx + int(60 * SS) + bw, by + bh], fill=(*BLUSH, 255))
d.ellipse([hx + hs - int(60 * SS) - bw, by, hx + hs - int(60 * SS), by + bh], fill=(*BLUSH, 255))

# mouth: small cat w-mouth
my = hy + int(300 * SS)
mx = hx + hs // 2
mw = int(52 * SS)
d.arc([mx - mw, my, mx, my + int(46 * SS)], 20, 160, fill=(*INDIGO_EYE, 255), width=int(9 * SS))
d.arc([mx, my, mx + mw, my + int(46 * SS)], 20, 160, fill=(*INDIGO_EYE, 255), width=int(9 * SS))

# pixel sparkles around (brand pixel vibe)
sp = [
    (int(200 * SS), int(200 * SS), 18), (int(830 * SS), int(240 * SS), 14),
    (int(160 * SS), int(760 * SS), 14), (int(850 * SS), int(800 * SS), 18),
]
for sx, sy, sr in sparkles if False else sp:
    d.rectangle([sx, sy, sx + sr * SS // 2, sy + sr * SS // 2], fill=(255, 255, 255, 200))

# clip to rounded square
final = Image.new('RGBA', (S, S), (0, 0, 0, 0))
final.paste(img, (0, 0), rounded_mask())
final = final.resize((1024, 1024), Image.LANCZOS)
final.save('icon-source.png')
print('icon-source.png (concept C final) written')
