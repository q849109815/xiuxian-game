import glob, os
from PIL import Image, ImageDraw, ImageFont
ROOT = '/data/workspace/zombie/_vis'
try:
    import subprocess
    fp = subprocess.check_output(['fc-match', '-f', '%{file}', 'WenQuanYi Micro Hei']).decode()
    FONT = ImageFont.truetype(fp, 18)
except Exception:
    FONT = ImageFont.load_default()

def grid(pattern, out, cols, cell, label):
    files = sorted(glob.glob(os.path.join(ROOT, pattern)))
    rows = (len(files) + cols - 1) // cols
    W, H = cell[0] * cols, (cell[1] + 26) * rows
    canvas = Image.new('RGB', (W, H), '#20242c')
    d = ImageDraw.Draw(canvas)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        im.thumbnail(cell)
        x = (i % cols) * cell[0]
        y = (i // cols) * (cell[1] + 26)
        canvas.paste(im, (x, y + 26))
        d.text((x + 6, y + 3), os.path.basename(f).replace('.png', ''), fill='#ffd479', font=FONT)
    canvas.save(os.path.join(ROOT, out))
    print(label, len(files), '->', out, canvas.size)

grid('fe_*.png', '总览_前端.png', 5, (196, 426), 'FE')
grid('be_*.png', '总览_后台.png', 3, (470, 313), 'BE')
