#!/usr/bin/env python3
"""
Generate AzadGram app icon in multiple sizes.
Bright turquoise gradient background with white paper-plane + "آ" glyph.

Outputs to /home/z/my-project/download/azadgram-client/icons/
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = "/home/z/my-project/download/azadgram-client/icons"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# AzadGram palette
PRIMARY = (0, 191, 165)        # #00BFA5
PRIMARY_LIGHT = (20, 200, 180) # #14C8B4
PRIMARY_LIGHTER = (77, 208, 194) # #4DD0C2
WHITE = (255, 255, 255)
DARK = (10, 31, 31)

# Android standard sizes
ANDROID_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# Play Store / App Store sizes
EXTRA_SIZES = [512, 1024]

def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def make_gradient(size, corner_radius=None):
    """Create a diagonal turquoise gradient."""
    img = Image.new("RGB", (size, size), PRIMARY)
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            pixels[x, y] = lerp(PRIMARY, PRIMARY_LIGHTER, t)
    # Apply rounded corners (iOS-style)
    if corner_radius is None:
        corner_radius = size // 5
    if corner_radius > 0:
        mask = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(mask)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, fill=255)
        bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        bg.paste(img, (0, 0), mask)
        return bg.convert("RGBA")
    return img.convert("RGBA")

def find_font(size, bold=True):
    """Find a Persian-capable font on the system."""
    candidates = [
        f"/home/z/.fonts/Vazirmatn-{'Bold' if bold else 'Regular'}.ttf",
        "/home/z/.fonts/Vazirmatn-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

def draw_paper_plane(draw, size, color=WHITE, cx=None, cy=None):
    """Draw a stylized paper plane (forward arrow shape)."""
    if cx is None:
        cx = size // 2
    if cy is None:
        cy = size // 2
    s = size
    # A 3-triangle paper plane
    # Main triangle pointing right (in our case rotated 45deg for "azad" feel)
    pts_main = [
        (cx - s * 0.30, cy - s * 0.05),
        (cx + s * 0.30, cy - s * 0.30),
        (cx + s * 0.30, cy + s * 0.30),
    ]
    # White fill for the plane body
    draw.polygon(pts_main, fill=color)
    # Bottom shadow
    pts_shadow = [
        (cx - s * 0.30, cy + s * 0.05),
        (cx + s * 0.30, cy + s * 0.30),
        (cx + s * 0.10, cy + s * 0.05),
    ]
    draw.polygon(pts_shadow, fill=lerp(color, DARK, 0.15))

def draw_azad_letter(draw, size, color=WHITE):
    """Draw the Persian letter 'آ' (alef with madda) using best-available font."""
    font_path = find_font(size)
    if not font_path:
        # Fallback: draw the plane only
        draw_paper_plane(draw, size, color)
        return
    font = ImageFont.truetype(font_path, int(size * 0.55))
    # Try Persian alef with madda
    letter = "آ"
    text = letter
    # get bbox
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    cx = (size - tw) / 2 - bbox[0]
    cy = (size - th) / 2 - bbox[1]
    # Draw with subtle drop shadow
    shadow_color = (0, 0, 0, 80)
    for off in [(2, 2), (3, 3)]:
        draw.text((cx + off[0], cy + off[1]), text, font=font, fill=(0, 80, 70, 100))
    draw.text((cx, cy), text, font=font, fill=color)

def make_icon(size, with_plane=True, with_letter=True):
    """Build a complete AzadGram icon at the given size."""
    img = make_gradient(size)
    draw = ImageDraw.Draw(img)
    # Soft inner ring for premium feel
    inner = make_gradient(size, corner_radius=size // 6)
    # Apply subtle inner shadow
    pad = max(1, size // 30)
    inner2 = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner2.paste(img, (0, 0))
    # White circle behind glyph
    if size >= 64:
        circle_r = int(size * 0.32)
        c = (size // 2, size // 2)
        # Outer halo
        for r, alpha in [(circle_r + 4, 30), (circle_r + 2, 60)]:
            d = ImageDraw.Draw(img)
            d.ellipse([c[0]-r, c[1]-r, c[0]+r, c[1]+r], fill=(255, 255, 255, alpha))
        # White disc
        d = ImageDraw.Draw(img)
        d.ellipse([c[0]-circle_r, c[1]-circle_r, c[0]+circle_r, c[1]+circle_r], fill=(255, 255, 255, 255))
    # Letter glyph
    if with_letter:
        # Need to convert to RGBA and use ImageDraw on RGBA
        d2 = ImageDraw.Draw(img)
        # Use the dark teal letter on white circle
        draw_letter_on_circle(d2, size, fill=DARK + (255,))
    return img

def draw_letter_on_circle(draw, size, fill=DARK + (255,)):
    """Draw 'آ' centered with the icon's circle."""
    font_path = find_font(size)
    if not font_path:
        return
    font = ImageFont.truetype(font_path, int(size * 0.32))
    text = "آ"
    cx, cy = size // 2, size // 2
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = cx - tw / 2 - bbox[0]
    y = cy - th / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)

def main():
    # Generate Android standard sizes
    for density, size in ANDROID_SIZES.items():
        icon = make_icon(size)
        out = os.path.join(OUTPUT_DIR, f"ic_launcher_{density}.png")
        icon.save(out, "PNG")
        # foreground (adaptive icon)
        # Background tint only for adaptive
        bg = make_gradient(size, corner_radius=0)
        bg.save(os.path.join(OUTPUT_DIR, f"ic_launcher_bg_{density}.png"), "PNG")
        # Foreground = white circle + letter
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(fg)
        circle_r = int(size * 0.32)
        c = (size // 2, size // 2)
        d.ellipse([c[0]-circle_r, c[1]-circle_r, c[0]+circle_r, c[1]+circle_r], fill=(255, 255, 255, 255))
        draw_letter_on_circle(d, size, fill=DARK + (255,))
        fg.save(os.path.join(OUTPUT_DIR, f"ic_launcher_fg_{density}.png"), "PNG")
        print(f"Generated {density} ({size}px) — {out}")

    # Play Store icon (512) and high-res (1024)
    for size in EXTRA_SIZES:
        icon = make_icon(size)
        out = os.path.join(OUTPUT_DIR, f"azadgram_icon_{size}.png")
        icon.save(out, "PNG")
        print(f"Generated extra {size}px — {out}")

    # No-letter "logo only" version (plane only)
    for size in [512, 1024]:
        img = make_gradient(size)
        d = ImageDraw.Draw(img)
        # White paper plane in middle
        s = size
        pts = [
            (s * 0.20, s * 0.50),
            (s * 0.80, s * 0.25),
            (s * 0.80, s * 0.75),
        ]
        d.polygon(pts, fill=WHITE)
        pts2 = [
            (s * 0.20, s * 0.50),
            (s * 0.80, s * 0.75),
            (s * 0.40, s * 0.50),
        ]
        d.polygon(pts2, fill=lerp(WHITE, DARK, 0.15))
        out = os.path.join(OUTPUT_DIR, f"azadgram_logo_only_{size}.png")
        img.save(out, "PNG")
        print(f"Generated logo-only {size}px — {out}")

    print("\nAll icons generated in:", OUTPUT_DIR)

if __name__ == "__main__":
    main()
