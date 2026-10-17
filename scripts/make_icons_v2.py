#!/usr/bin/env python3
"""
Generate beautiful, Telegram-like AzadGram app icons.

This version improves on v1 by:
1. Drawing a real SVG paper-plane (matching Telegram's geometry)
2. Layered design: gradient circle + soft glow + crisp paper plane
3. Subtle depth with light/shadow side-folds
4. High-quality SVG output + multi-size PNG

Outputs:
  - download/azadgram-client/icons/azadgram_icon_<size>.png (512, 1024)
  - download/azadgram-client/icons/ic_launcher_<density>.png (mdpi-hdpi-xhdpi-xxhdpi-xxxhdpi)
  - download/azadgram-client/icons/ic_launcher_fg_<density>.png (adaptive foreground)
  - download/azadgram-client/icons/ic_launcher_bg_<density>.png (adaptive background)
"""
import os
import math
import subprocess
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUTPUT_DIR = "/home/z/my-project/download/azadgram-client/icons"
SVG_DIR = "/tmp/azadgram_icons"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SVG_DIR, exist_ok=True)

# AzadGram palette
PRIMARY = (0, 191, 165)       # #00BFA5 — AzadGram turquoise
PRIMARY_DARK = (0, 140, 122)  # darker for shadow
PRIMARY_LIGHT = (77, 208, 194) # #4DD0C2 — lighter
PRIMARY_LIGHTER = (130, 230, 215) # highlight
WHITE = (255, 255, 255)
WHITE_SOFT = (245, 255, 253)  # slightly cool white
DARK = (5, 60, 50)            # very dark teal for text/letter

ANDROID_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
EXTRA_SIZES = [512, 1024]


def make_gradient_circle(size: int, radius_frac: float = 0.46) -> Image.Image:
    """Create a turquoise gradient circle on transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    center = size // 2
    radius = int(size * radius_frac)

    # Build gradient by drawing many concentric circles
    for r in range(radius, 0, -1):
        t = 1 - (r / radius)
        # Interpolate between PRIMARY_DARK and PRIMARY_LIGHTER
        color = tuple(int(PRIMARY_DARK[i] + (PRIMARY_LIGHTER[i] - PRIMARY_DARK[i]) * t) for i in range(3))
        ImageDraw.Draw(img).ellipse(
            [center - r, center - r, center + r, center + r],
            fill=color + (255,)
        )
    return img


def make_outer_glow(size: int, radius_frac: float = 0.48) -> Image.Image:
    """Soft halo around the circle for premium feel."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    center = size // 2
    radius = int(size * radius_frac)
    # Draw a blurred disc
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [center - radius, center - radius, center + radius, center + radius],
        fill=PRIMARY + (80,)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, size // 32)))
    img.alpha_composite(glow)
    return img


def make_paper_plane_svg(size: int) -> str:
    """Generate an SVG paper-plane matching Telegram's geometry."""
    cx = cy = size / 2
    s = size  # shorthand
    # Telegram paper plane: a triangle with two side-folds
    # Tip of plane on the right, opening to the left
    tip_x = cx + s * 0.18
    tip_y = cy
    top_x = cx - s * 0.18
    top_y = cy - s * 0.18
    bottom_x = cx - s * 0.18
    bottom_y = cy + s * 0.18

    # Main triangle (the body of the plane, pointing right)
    main_tri = f"M {top_x},{top_y} L {tip_x},{tip_y} L {bottom_x},{bottom_y} Z"

    # Top wing fold (lighter)
    fold_top = f"M {top_x},{top_y} L {tip_x},{tip_y} L {cx - s * 0.04},{cy - s * 0.10} Z"

    # Bottom wing fold (darker for depth)
    fold_bot = f"M {bottom_x},{bottom_y} L {tip_x},{tip_y} L {cx - s * 0.04},{cy + s * 0.10} Z"

    # Center crease line (subtle shadow)
    crease = f"M {top_x},{top_y} L {tip_x},{tip_y} L {bottom_x},{bottom_y}"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <defs>
    <linearGradient id="planeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#e0f7f3" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="foldDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a8e5d8" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#00bfa5" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="foldLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#c0f0e6" stop-opacity="0.7"/>
    </linearGradient>
    <filter id="planeShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="{size * 0.012}"/>
      <feOffset dx="0" dy="{size * 0.018}" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.4"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Main plane body (light) -->
  <path d="{main_tri}" fill="url(#planeGrad)" filter="url(#planeShadow)"/>

  <!-- Top wing fold (very light) -->
  <path d="{fold_top}" fill="url(#foldLight)" opacity="0.95"/>

  <!-- Bottom wing fold (shadow) -->
  <path d="{fold_bot}" fill="url(#foldDark)" opacity="0.6"/>

  <!-- Center crease line -->
  <path d="{crease}" stroke="#009b85" stroke-width="{size * 0.006}" stroke-opacity="0.3" fill="none" stroke-linejoin="round"/>
</svg>"""


def render_svg_to_png(svg_path: str, png_path: str, size: int):
    """Render SVG to PNG using rsvg-convert or cairosvg or chromium."""
    # Try rsvg-convert
    try:
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size),
                        svg_path, "-o", png_path],
                       check=True, capture_output=True)
        return
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    # Try cairosvg
    try:
        import cairosvg
        cairosvg.svg2png(url=svg_path, write_to=png_path,
                         output_width=size, output_height=size)
        return
    except ImportError:
        pass
    # Fallback: use Pillow to draw plane manually
    fallback_draw_plane(png_path, size)


def fallback_draw_plane(png_path: str, size: int):
    """Fallback if no SVG renderer — draw plane with PIL polygons."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx = cy = size // 2
    s = size
    # Main triangle (light)
    main_tri = [
        (cx - s * 0.18, cy - s * 0.18),  # top-left
        (cx + s * 0.18, cy),             # right tip
        (cx - s * 0.18, cy + s * 0.18),  # bottom-left
    ]
    draw.polygon(main_tri, fill=WHITE_SOFT + (255,))
    # Top wing fold (very light gradient)
    fold_top = [
        (cx - s * 0.18, cy - s * 0.18),
        (cx + s * 0.18, cy),
        (cx - s * 0.04, cy - s * 0.10),
    ]
    draw.polygon(fold_top, fill=(220, 250, 245) + (255,))
    # Bottom wing fold (darker, for depth)
    fold_bot = [
        (cx - s * 0.18, cy + s * 0.18),
        (cx + s * 0.18, cy),
        (cx - s * 0.04, cy + s * 0.10),
    ]
    draw.polygon(fold_bot, fill=(150, 220, 210) + (200,))
    # Crease line
    crease = [(cx - s * 0.18, cy - s * 0.18), (cx + s * 0.18, cy), (cx - s * 0.18, cy + s * 0.18)]
    draw.line(crease, fill=PRIMARY_DARK + (60,), width=max(1, int(s * 0.006)))
    img.save(png_path, "PNG")


def build_complete_icon(size: int, output_path: str, with_letter: bool = False):
    """Build the full AzadGram icon: glow + gradient circle + paper plane."""
    # Layer 1: outer glow
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = make_outer_glow(size)
    final.alpha_composite(glow)

    # Layer 2: gradient circle (slightly smaller than glow)
    circle = make_gradient_circle(size, radius_frac=0.46)
    final.alpha_composite(circle)

    # Layer 3: paper plane (SVG-rendered for crispness)
    svg_path = os.path.join(SVG_DIR, f"plane_{size}.svg")
    with open(svg_path, "w") as f:
        f.write(make_paper_plane_svg(size))
    plane_path = os.path.join(SVG_DIR, f"plane_{size}.png")
    render_svg_to_png(svg_path, plane_path, size)
    plane = Image.open(plane_path).convert("RGBA")
    # Scale plane down a bit to fit inside circle
    new_size = int(size * 0.85)
    plane = plane.resize((new_size, new_size), Image.LANCZOS)
    # Center it
    offset = (size - new_size) // 2
    final.alpha_composite(plane, (offset, offset))

    # Optional: subtle "آ" letter at bottom — skip for clean plane design
    final.save(output_path, "PNG")


def build_adaptive_foreground(size: int, output_path: str):
    """Adaptive icon foreground: just the paper plane on transparent bg."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    svg_path = os.path.join(SVG_DIR, f"fg_{size}.svg")
    with open(svg_path, "w") as f:
        f.write(make_paper_plane_svg(size))
    png_path = os.path.join(SVG_DIR, f"fg_{size}.png")
    render_svg_to_png(svg_path, png_path, size)
    plane = Image.open(png_path).convert("RGBA")
    new_size = int(size * 0.65)  # foreground should occupy 60-70% of canvas
    plane = plane.resize((new_size, new_size), Image.LANCZOS)
    offset = (size - new_size) // 2
    img.alpha_composite(plane, (offset, offset))
    img.save(output_path, "PNG")


def build_adaptive_background(size: int, output_path: str):
    """Adaptive icon background: gradient fill."""
    img = make_gradient_circle(size, radius_frac=0.7)  # fills most of canvas
    img.save(output_path, "PNG")


def main():
    # Standard launcher icons
    for density, size in ANDROID_SIZES.items():
        build_complete_icon(size, os.path.join(OUTPUT_DIR, f"ic_launcher_{density}.png"))
        build_adaptive_foreground(size, os.path.join(OUTPUT_DIR, f"ic_launcher_fg_{density}.png"))
        build_adaptive_background(size, os.path.join(OUTPUT_DIR, f"ic_launcher_bg_{density}.png"))
        print(f"Generated {density} ({size}px)")

    # Play Store / high-res
    for size in EXTRA_SIZES:
        build_complete_icon(size, os.path.join(OUTPUT_DIR, f"azadgram_icon_{size}.png"))
        print(f"Generated extra {size}px")

    # Logo-only versions (no circle, just gradient square + plane)
    for size in EXTRA_SIZES:
        img = Image.new("RGBA", (size, size), PRIMARY + (255,))
        # Gradient fill
        for y in range(size):
            for x in range(size):
                t = (x + y) / (2 * size)
                img.putpixel((x, y),
                             tuple(int(PRIMARY[i] + (PRIMARY_LIGHTER[i] - PRIMARY[i]) * t) for i in range(3)) + (255,))
        svg_path = os.path.join(SVG_DIR, f"logo_{size}.svg")
        with open(svg_path, "w") as f:
            f.write(make_paper_plane_svg(size))
        png_path = os.path.join(SVG_DIR, f"logo_{size}.png")
        render_svg_to_png(svg_path, png_path, size)
        plane = Image.open(png_path).convert("RGBA")
        new_size = int(size * 0.7)
        plane = plane.resize((new_size, new_size), Image.LANCZOS)
        offset = (size - new_size) // 2
        img.alpha_composite(plane, (offset, offset))
        img.save(os.path.join(OUTPUT_DIR, f"azadgram_logo_only_{size}.png"), "PNG")
        print(f"Generated logo-only {size}px")

    print(f"\nAll icons generated in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
