#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AzadGram — icon generator v3 («کاغذی + گرادیان»)

Design:
  * deep turquoise gradient (radial for round, diagonal for square)
  * soft halo ring around the circle (premium feel)
  * crisp white paper plane, Telegram-style geometry with two sails + crease,
    gently rotated up-right, with a soft drop shadow
  * three motion trail dots behind the plane (speed / freedom)
  * everything rendered at 4× supersampling, downscaled with LANCZOS

Outputs (relative to the client icons/ folder):
  ic_launcher_{mdpi..xxxhdpi}.png       full-square launcher icon (any mask)
  ic_launcher_round_{...}.png            round icon (transparent outside)
  ic_launcher_fg_{...}.png              adaptive foreground (plane only)
  azadgram_icon_512.png / _1024.png     Play Store / marketing
  azadgram_logo_only_512.png / _1024.png plane only on transparency
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "icons"))
os.makedirs(OUT, exist_ok=True)

SS = 6  # supersampling factor (crisp edges after LANCZOS downscale)

# ---- palette -------------------------------------------------------------
TEAL_LIGHT = (64, 236, 208)    # #40E0D0 — bright aqua highlight
TEAL = (0, 191, 165)           # #00BFA5
TEAL_DEEP = (0, 128, 108)      # #00806C
TEAL_DARKEST = (2, 84, 74)     # #02544A — deep blue-green
WHITE = (255, 255, 255)
WHITE_COOL = (242, 255, 252)   # #F2FFFC
SAIL_BOTTOM_TOP = (232, 255, 250)   # #E8FFFA
SAIL_BOTTOM_BOT = (198, 242, 229)  # #C6F2E5
FOLD_TOP_C = (172, 234, 220)   # #ACEADC
FOLD_BOT_C = (133, 209, 190)   # #85D1BE
CREASE_C = (0, 110, 94)        # dark crease

ANDROID_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---------------------------------------------------------------------------
# backgrounds
# ---------------------------------------------------------------------------

def radial_gradient_circle(size, cx_frac=0.40, cy_frac=0.34, radius_frac=0.80):
    """Full-resolution three-stop radial gradient (light aqua -> teal -> deep
    blue-green), computed with numpy — no upscaling banding."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((xx - size * cx_frac) ** 2 + (yy - size * cy_frac) ** 2) / (size * radius_frac)
    d = np.clip(d, 0.0, 1.0)

    t1 = np.clip(d / 0.45, 0.0, 1.0)          # aqua -> teal
    t2 = np.clip((d - 0.45) / 0.55, 0.0, 1.0) ** 1.15  # teal -> deep

    light = np.array(TEAL_LIGHT, dtype=np.float32)
    teal = np.array(TEAL, dtype=np.float32)
    dark = np.array(TEAL_DARKEST, dtype=np.float32)

    rgb = light[None, None, :] * (1 - t1[..., None]) + teal[None, None, :] * t1[..., None]
    rgb = rgb * (1 - t2[..., None]) + dark[None, None, :] * t2[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def diagonal_gradient_square(size):
    """Full-resolution diagonal gradient for the legacy square launcher icon."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    t = np.clip((xx + yy) / (2 * size), 0.0, 1.0)
    light = np.array(TEAL_LIGHT, dtype=np.float32)
    dark = np.array(TEAL_DEEP, dtype=np.float32)
    rgb = light[None, None, :] * (1 - t[..., None]) + dark[None, None, :] * t[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def halo_ring(size, radius_frac=0.47):
    """Soft glow just outside the main circle (on transparency)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    r = size * radius_frac
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
              fill=TEAL + (110,))
    glow = glow.filter(ImageFilter.GaussianBlur(size // 28))
    img.alpha_composite(glow)
    return img


def inner_gloss(size, radius_frac=0.46):
    """Subtle top highlight arc inside the circle."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * radius_frac
    # crescent: big ellipse minus lower ellipse
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dg = ImageDraw.Draw(gloss)
    dg.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
               fill=(255, 255, 255, 34))
    cut = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cut)
    dc.ellipse([size / 2 - r * 1.15, size / 2 - r * 0.15,
                size / 2 + r * 1.15, size / 2 + r * 1.6],
               fill=(255, 255, 255, 255))
    gloss = Image.composite(Image.new("RGBA", (size, size), (0, 0, 0, 0)), gloss, cut)
    gloss = gloss.filter(ImageFilter.GaussianBlur(size // 48))
    img.alpha_composite(gloss)
    return img


# ---------------------------------------------------------------------------
# paper plane
# ---------------------------------------------------------------------------

PLANE_ANGLE_DEG = -32.0  # tilt up-right


def plane_polygons(scale):
    """Telegram-style paper plane in local coordinates, pointing right.

    Returns dict of polygons (lists of (x, y)) + the crease line.
    """
    # silhouette points (unit coords, plane points right)
    tip = (0.42, 0.0)
    back_top = (-0.34, -0.26)
    back_bottom = (-0.34, 0.30)
    notch = (-0.16, 0.02)      # concave tail notch
    fold_low = (-0.20, 0.14)   # lower wing fold shading point

    def P(p):
        return (p[0] * scale, p[1] * scale)

    polys = {
        # upper sail — bright
        "sail_top": [P(tip), P(back_top), P(notch)],
        # lower sail — subtly shaded
        "sail_bottom": [P(tip), P(back_bottom), P(notch)],
        # lower wing fold — deeper shade for 3D feel
        "fold_low": [P(tip), P(back_bottom), P(fold_low)],
    }
    crease = [P(tip), P(notch)]
    return polys, crease


def rotate(points, deg):
    rad = math.radians(deg)
    c, s = math.cos(rad), math.sin(rad)
    return [(x * c - y * s, x * s + y * c) for (x, y) in points]


def draw_plane(canvas_size, plane_scale, offset_frac=(0.02, -0.02), shadow=True):
    """Draw the paper plane + trail on a transparent canvas of canvas_size."""
    size = canvas_size
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    polys, crease = plane_polygons(plane_scale)
    ox, oy = size * (0.5 + offset_frac[0]), size * (0.5 + offset_frac[1])

    def place(pts):
        r = rotate(pts, PLANE_ANGLE_DEG)
        return [(x + ox, y + oy) for (x, y) in r]

    sail_top = place(polys["sail_top"])
    sail_bottom = place(polys["sail_bottom"])
    fold_low = place(polys["fold_low"])
    crease_pts = place(crease)

    # ---- drop shadow (silhouette blurred, offset clearly down-right so it
    # never bleeds under the nose) ----
    if shadow:
        sil = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sil)
        ds.polygon(sail_top, fill=TEAL_DARKEST + (95,))
        ds.polygon(sail_bottom, fill=TEAL_DARKEST + (95,))
        sil = sil.filter(ImageFilter.GaussianBlur(plane_scale * 0.055))
        shifted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        shifted.alpha_composite(sil, (int(plane_scale * 0.06), int(plane_scale * 0.10)))
        img.alpha_composite(shifted)

    # ---- flat-shaded sails (flat fills like Telegram's own icon — crisper
    # than intra-polygon gradients, which read as mushy at launcher sizes) ----
    def flat_fill(polygon, color):
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        dl = ImageDraw.Draw(layer)
        dl.polygon(polygon, fill=color + (255,))
        return layer

    img.alpha_composite(flat_fill(sail_top, WHITE))
    img.alpha_composite(flat_fill(sail_bottom, SAIL_BOTTOM_TOP))
    img.alpha_composite(flat_fill(fold_low, FOLD_TOP_C))

    # ---- crease line (inset from the tip so the nose stays razor sharp) ----
    (tx_, ty_), (nx_, ny_) = crease_pts
    inset = 0.12  # fraction along tip->notch to stop short of the tip
    cx_ = tx_ + (nx_ - tx_) * inset
    cy_ = ty_ + (ny_ - ty_) * inset
    d = ImageDraw.Draw(img)
    d.line([(cx_, cy_), (nx_, ny_)], fill=CREASE_C + (90,),
           width=max(1, int(plane_scale * 0.016)))

    # ---- motion trail (three fading dots behind the plane) ----
    trail_dir = math.radians(PLANE_ANGLE_DEG + 180.0)
    tx, ty = crease_pts[1]  # start at the tail notch
    for i, (dist, rad, alpha) in enumerate(
            [(0.30, 0.055, 235), (0.52, 0.041, 165), (0.72, 0.030, 105)]):
        px = tx + math.cos(trail_dir) * plane_scale * dist
        py = ty + math.sin(trail_dir) * plane_scale * dist
        r = plane_scale * rad
        d.ellipse([px - r, py - r, px + r, py + r], fill=WHITE + (alpha,))

    return img


# ---------------------------------------------------------------------------
# compositors
# ---------------------------------------------------------------------------

def make_full_square_icon(size):
    """Legacy square launcher icon: full-bleed gradient + plane (any launcher mask works)."""
    S = size * SS
    base = diagonal_gradient_square(S).convert("RGBA")
    # subtle radial glow top-left
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.ellipse([-S * 0.25, -S * 0.25, S * 0.75, S * 0.75], fill=WHITE + (22,))
    glow = glow.filter(ImageFilter.GaussianBlur(S // 10))
    base.alpha_composite(glow)

    plane = draw_plane(S, plane_scale=S * 0.40, offset_frac=(0.03, -0.03))
    base.alpha_composite(plane)
    return base.resize((size, size), Image.LANCZOS)


def make_round_icon(size):
    """Round launcher icon: circle + halo + gloss + plane."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # halo outside the circle
    img.alpha_composite(halo_ring(S, radius_frac=0.485))

    # gradient circle
    circle = radial_gradient_circle(S, radius_frac=0.475).convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    r = S * 0.475
    dm.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=255)
    img.paste(circle, (0, 0), mask)

    # inner gloss
    gloss = inner_gloss(S, radius_frac=0.475)
    m2 = Image.new("L", (S, S), 0)
    dm2 = ImageDraw.Draw(m2)
    dm2.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=255)
    gloss.putalpha(Image.composite(gloss.split()[3], Image.new("L", (S, S), 0), m2))
    img.alpha_composite(gloss)

    plane = draw_plane(S, plane_scale=S * 0.37, offset_frac=(0.02, -0.02))
    img.alpha_composite(plane)
    return img.resize((size, size), Image.LANCZOS)


def make_adaptive_foreground(size):
    """Adaptive icon foreground: transparent bg, plane inside the 66% safe zone."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    plane = draw_plane(S, plane_scale=S * 0.26, offset_frac=(0.02, -0.02), shadow=False)
    img.alpha_composite(plane)
    return img.resize((size, size), Image.LANCZOS)


def make_adaptive_background(size):
    """Adaptive icon background: turquoise gradient tile (PNG variant)."""
    S = size * SS
    img = diagonal_gradient_square(S).convert("RGBA")
    return img.resize((size, size), Image.LANCZOS)


def make_logo_only(size):
    """Plane + trail only, on transparency (for docs/panel branding)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    plane = draw_plane(S, plane_scale=S * 0.42, offset_frac=(0.0, 0.0))
    img.alpha_composite(plane)
    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

def main():
    print("Generating AzadGram icons v3 …")

    for density, size in ANDROID_SIZES.items():
        make_full_square_icon(size).save(os.path.join(OUT, f"ic_launcher_{density}.png"))
        make_round_icon(size).save(os.path.join(OUT, f"ic_launcher_round_{density}.png"))
        make_adaptive_foreground(size).save(os.path.join(OUT, f"ic_launcher_fg_{density}.png"))
        make_adaptive_background(size).save(os.path.join(OUT, f"ic_launcher_bg_{density}.png"))
        print(f"  ✓ {density}: launcher / round / fg / bg ({size}px)")

    for size in (512, 1024):
        make_round_icon(size).save(os.path.join(OUT, f"azadgram_icon_{size}.png"))
        make_logo_only(size).save(os.path.join(OUT, f"azadgram_logo_only_{size}.png"))
        print(f"  ✓ store/logo {size}px")

    print("Done →", OUT)


if __name__ == "__main__":
    main()
