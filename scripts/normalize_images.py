#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Нормализация изображений каталога (восстановление стандарта «волны 4», 11.11.2026).

Стандарт (по коммит-описанию da75d41/ac1e6d3):
  - продукт занимает 70-80% поля изображения (базовый fill 0.73 по связующей стороне);
  - полотно 4:3 «под контейнер» карточки; для мелких исходников полотно берётся
    под размер контента (без апскейла контента, мин. короткая сторона холста 240);
  - фон НЕ вырезается: холст заполняется собственным фоном снимка (у белых — белый);
  - крупные холсты ограничены 1200x900 (контент сжимается пропорционально);
  - схемы/рендеры на неоднородном или тёмном фоне не трогаются;
  - идемпотентно: уже нормализованное (4:3 + fill в коридоре, либо портретные
    полотна с fill 0.72-0.80 по обеим сторонам) пропускается.

Запуск:
  python3 scripts/normalize_images.py --dry-run            # отчёт по всему каталогу
  python3 scripts/normalize_images.py --only rlock         # применить к каталогу
  python3 scripts/normalize_images.py --only rlock --dry-run
"""
import argparse, os
from PIL import Image, ImageFilter
import numpy as np

CAT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'products')
FILL = 0.73            # базовая доля продукта по связующей стороне
SKIP_LO, SKIP_HI = 0.60, 0.90   # коридор «уже нормализовано» (4:3); верх расширен до 0.90,
                                 # т.к. повторный замер включает ореол растушёвки (+0.10-0.13)
PORTRAIT_LO, PORTRAIT_HI = 0.72, 0.80  # портретные полотна волны 4 (fill 0.76/0.76)
ASPECT_TOL = 0.03      # допуск на 4:3 (округление холста)
CAP_W, CAP_H = 1200, 900
MIN_SHORT = 240        # мин. короткая сторона холста (иначе мягкий апскейл)
MIN_CONTENT = 96       # мельче — не трогаем
FEATHER = 32           # растушёвка краёв контента (для полноформатных фото, fill ≥ 0.9)
PAD_FADE = 80          # длина затухания продолжения фона
BG_STD_MAX = 12        # std углов: выше — неоднородный фон (схема/рендер/лайфстайл)
BG_LUM_MIN = 170       # средняя яркость углов: ниже — тёмный фон (схема) — не трогаем

def bg_stats(a):
    H, W = a.shape[:2]
    k = max(3, min(W, H) // 20)
    corners = np.concatenate([a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:]]).astype(float)
    mean = corners.reshape(-1, a.shape[2]).mean(axis=0) if a.ndim == 3 else corners.mean()
    lum = corners.mean()
    std = corners.std()
    return mean, lum, std

def content_bbox(base_rgb, bg_mean):
    """bbox контента: пиксели, отличные от фона."""
    diff = np.abs(base_rgb.astype(int) - np.array(bg_mean[:3], dtype=int)).sum(axis=2)
    mask = diff > 40
    H, W = mask.shape
    ridx = np.nonzero(mask.sum(axis=1) > max(2, 0.003 * W))[0]
    cidx = np.nonzero(mask.sum(axis=0) > max(2, 0.003 * H))[0]
    if len(ridx) == 0 or len(cidx) == 0:
        return None
    return int(cidx[0]), int(ridx[0]), int(cidx[-1]) + 1, int(ridx[-1]) + 1

def on_white_bg(bg_mean, bg_std):
    return bg_std <= BG_STD_MAX and bg_mean[0] >= BG_LUM_MIN

def feather_mask(w, h, f):
    """Маска с плавным затуханием к краям (растушёвка шва контент/подложка)."""
    ry = np.minimum(np.arange(h) + 1, h - np.arange(h))
    rx = np.minimum(np.arange(w) + 1, w - np.arange(w))
    dist = np.minimum(ry[:, None], rx[None, :])
    scale = np.clip(dist / max(1, f), 0, 1)
    m = (scale * 255).astype(np.uint8)
    return Image.fromarray(m, 'L').filter(ImageFilter.GaussianBlur(max(2, f / 3)))

def edge_extend_pad(content_arr, px, py, canvas_w, canvas_h, bg_mean, fade=80):
    """Подложка-продолжение: от каждого края контента цвет тянется наружу
    и за fade px затухает к среднему фону — без шва и без зеркальных артефактов."""
    pad = np.empty((canvas_h, canvas_w, 3), dtype=float)
    pad[:, :] = bg_mean
    ch, cw = content_arr.shape[:2]
    bg = np.asarray(bg_mean, dtype=float)
    def strip(edge_vec, length, side):
        # edge_vec: (n,3) цвета края; side: left/right/top/bottom — где шов в массиве
        idx = np.arange(length, dtype=float)
        dist = (length - 1 - idx) if side in ('left', 'top') else idx
        t = (1.0 - np.clip(dist / float(fade), 0, 1)) ** 1.2
        return edge_vec[:, None, :] * t[None, :, None] + bg[None, None, :] * (1 - t)[None, :, None]
    if px > 0:
        pad[py:py+ch, :px] = strip(content_arr[:, 0, :].astype(float), px, 'left')
    if px + cw < canvas_w:
        pad[py:py+ch, px+cw:] = strip(content_arr[:, -1, :].astype(float), canvas_w - px - cw, 'right')
    if py > 0:
        pad[:py, px:px+cw] = strip(content_arr[0, :, :].astype(float), py, 'top').transpose(1, 0, 2)
    if py + ch < canvas_h:
        pad[py+ch:, px:px+cw] = strip(content_arr[-1, :, :].astype(float), canvas_h - py - ch, 'bottom').transpose(1, 0, 2)
    return pad

def bilinear_pad(canvas_w, canvas_h, c_tl, c_tr, c_bl, c_br):
    """Подложка-градиент: билинейная интерполяция цветов углов контента —
    продолжает виньетку фона без видимого шва."""
    ys = np.linspace(0.0, 1.0, canvas_h)[:, None, None]
    xs = np.linspace(0.0, 1.0, canvas_w)[None, :, None]
    tl, tr, bl, br = (np.asarray(c, dtype=float) for c in (c_tl, c_tr, c_bl, c_br))
    top = tl[None, None, :] + (tr - tl)[None, None, :] * xs
    bot = bl[None, None, :] + (br - bl)[None, None, :] * xs
    return (top + (bot - top) * ys).astype(np.uint8)

def process(path, dry):
    im = Image.open(path)
    im.load()
    fmt_ok = im.format in ('JPEG', 'PNG')
    if not fmt_ok:
        return 'SKIP-FMT', im.size, None, None
    base = Image.new('RGB', im.size, (255, 255, 255))
    rgba = im.convert('RGBA')
    base.paste(rgba, mask=rgba.split()[3])
    a = np.asarray(base)
    bg_mean, bg_lum, bg_std = bg_stats(a)
    if bg_std > BG_STD_MAX:
        return 'SKIP-НЕОДНОРОДНЫЙ-ФОН', im.size, None, (bg_mean, bg_lum, bg_std)
    if bg_lum < BG_LUM_MIN:
        return 'SKIP-ТЁМНЫЙ-ФОН', im.size, None, (bg_mean, bg_lum, bg_std)
    W, H = im.size
    if H > W:
        return 'SKIP-ПОРТРЕТ', im.size, None, (bg_mean, bg_lum, bg_std)
    bb = content_bbox(a, bg_mean)
    if bb is None:
        return 'SKIP-ПУСТО', im.size, None, (bg_mean, bg_lum, bg_std)
    x0, y0, x1, y1 = bb
    cw, ch = x1 - x0, y1 - y0
    if min(cw, ch) < MIN_CONTENT:
        return 'SKIP-МИКРО', im.size, (cw, ch), (bg_mean, bg_lum, bg_std)
    fw, fh = cw / W, ch / H
    aspect = W / H
    bind = max(fw, fh)
    if abs(aspect - 4 / 3) <= ASPECT_TOL and SKIP_LO <= bind <= SKIP_HI:
        return 'OK-4:3', im.size, (cw, ch, fw, fh), (bg_mean, bg_lum, bg_std)
    if SKIP_LO <= min(fw, fh) and max(fw, fh) <= SKIP_HI and PORTRAIT_LO <= min(fw, fh):
        return 'OK-ПОРТРЕТ', im.size, (cw, ch, fw, fh), (bg_mean, bg_lum, bg_std)
    if abs(aspect - 1.0) <= ASPECT_TOL and PORTRAIT_LO <= min(fw, fh) and max(fw, fh) <= PORTRAIT_HI:
        return 'OK-ПОРТРЕТ', im.size, (cw, ch, fw, fh), (bg_mean, bg_lum, bg_std)
    # --- нормализация ---
    if cw / ch > 4 / 3:      # ширина связующая
        canvas_w = round(cw / FILL); canvas_h = round(canvas_w * 3 / 4)
        bind_dim = canvas_w
    else:                    # высота связующая
        canvas_h = round(ch / FILL); canvas_w = round(canvas_h * 4 / 3)
        bind_dim = canvas_h
    k = 1.0
    if min(canvas_w, canvas_h) < MIN_SHORT:
        k = MIN_SHORT / min(canvas_w, canvas_h)
        canvas_w, canvas_h = round(canvas_w * k), round(canvas_h * k)
    if canvas_w > CAP_W:
        k2 = CAP_W / canvas_w
        canvas_w, canvas_h = CAP_W, round(canvas_h * k2)
        k *= k2
    if dry:
        return 'NORM', (W, H), (canvas_w, canvas_h, cw * k, ch * k, cw * k / canvas_w, ch * k / canvas_h), (bg_mean, bg_lum, bg_std)
    # реальные пиксели
    content = base.crop(bb)
    if k < 1.0:
        content = content.resize((max(1, round(cw * k)), max(1, round(ch * k))), Image.LANCZOS)
    elif k > 1.0:
        content = content.resize((max(1, round(cw * k)), max(1, round(ch * k))), Image.LANCZOS)
    bg = tuple(int(round(v)) for v in bg_mean[:3])
    px = (canvas_w - content.size[0]) // 2
    py = (canvas_h - content.size[1]) // 2
    carr = np.asarray(content)
    pad = edge_extend_pad(carr.astype(float), px, py, canvas_w, canvas_h, bg_mean[:3], fade=PAD_FADE)
    canvas = Image.fromarray(pad.astype(np.uint8), 'RGB')
    use_feather = fw >= 0.9 and fh >= 0.9
    canvas.paste(content, (px, py), feather_mask(content.size[0], content.size[1], 16) if use_feather else None)
    if path.lower().endswith('.png'):
        canvas.save(path, optimize=True)
    else:
        canvas.save(path, quality=92, optimize=True)
    return 'SAVED', (canvas_w, canvas_h), (content.size[0], content.size[1]), (bg_mean, bg_lum, bg_std)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None, help='подкаталог products/, например rlock')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    root = os.path.join(CAT, args.only) if args.only else CAT
    stats = {}
    norm_by_dir = {}
    for dirpath, _, files in os.walk(root):
        for fn in sorted(files):
            if not fn.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, CAT)
            try:
                status, size, info, bg = process(path, args.dry_run)
            except Exception as e:
                status, size, info, bg = f'ERROR {e}', None, None, None
            stats[status.split('-')[0].split()[0]] = stats.get(status.split('-')[0].split()[0], 0) + 1
            if status.startswith(('NORM', 'SAVED')):
                d = rel.split('/')[0]
                norm_by_dir[d] = norm_by_dir.get(d, 0) + 1
            if status.startswith(('NORM', 'SAVED', 'ERROR', 'SKIP-НЕ', 'SKIP-ТЁ')):
                print(f'{status:22} {rel:46} {size} {info}')
    print()
    print('ИТОГ:', dict(sorted(stats.items())))
    print('NORM/SAVED по каталогам:', dict(sorted(norm_by_dir.items())))

if __name__ == '__main__':
    main()
