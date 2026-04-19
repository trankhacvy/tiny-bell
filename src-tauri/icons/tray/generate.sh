#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

SOURCE="/Users/trankhacvy/Downloads/Generated_Image_April_19__2026_-_9_20PM-removebg-preview.png"

if [ ! -f "$SOURCE" ]; then
  echo "Source logo not found: $SOURCE"
  exit 1
fi

# Use a venv with Pillow — create if needed
VENV="/tmp/imgtools"
if [ ! -f "$VENV/bin/python3" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q Pillow

"$VENV/bin/python3" - "$SOURCE" <<'PYEOF'
import sys
from PIL import Image

src = sys.argv[1]
logo = Image.open(src).convert("RGBA")

# Tray icon sizes: 22x22 @1x, 44x44 @2x
sizes = {"@1x": 22, "@2x": 44}

# Variants: name -> (r, g, b) or None for template (keep black)
variants = {
    "template": None,
    "green":    (22, 163, 74),    # #16A34A
    "yellow":   (217, 119, 6),    # #D97706
    "red":      (220, 38, 38),    # #DC2626
    "gray":     (161, 161, 170),  # #A1A1AA
    "syncing":  (113, 113, 122),  # #71717A
}

for suffix, px in sizes.items():
    resized = logo.resize((px, px), Image.LANCZOS)

    for name, color in variants.items():
        out = resized.copy()
        if color is not None:
            # Tint: replace all non-transparent pixel colors with the target,
            # preserving original alpha
            r, g, b = color
            pixels = out.load()
            w, h = out.size
            for y in range(h):
                for x in range(w):
                    _, _, _, a = pixels[x, y]
                    if a > 0:
                        pixels[x, y] = (r, g, b, a)

        out.save(f"tray-{name}{suffix}.png")
        print(f"  tray-{name}{suffix}.png  ({px}x{px})")

print("Done.")
PYEOF

echo ""
echo "Generated tray icons:"
ls -la tray-*.png
