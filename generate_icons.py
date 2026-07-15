"""One-time generator for PWA icons from the EcoEnergy logo.
Pads the wordmark (a solid-navy rectangle, no real transparency) onto a
square navy canvas at each required size, so nothing gets stretched/cropped.
"""
from PIL import Image

SRC = "eco-logo.png"
NAVY = (2, 1, 79, 255)

logo = Image.open(SRC).convert("RGBA")


def make_icon(size, margin_frac, out_path):
    canvas = Image.new("RGBA", (size, size), NAVY)
    content_w = int(size * (1 - 2 * margin_frac))
    scale = content_w / logo.width
    resized = logo.resize((content_w, max(1, int(logo.height * scale))), Image.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y), resized)
    canvas.save(out_path)
    print(f"wrote {out_path} ({size}x{size})")


make_icon(192, 0.12, "icons/icon-192.png")
make_icon(512, 0.12, "icons/icon-512.png")
make_icon(512, 0.22, "icons/icon-maskable-512.png")  # extra padding for OS mask safe-zone

# Apple touch icon: iOS wants a fully opaque square, no transparency, it
# applies its own rounded-corner mask - flatten onto navy just in case.
apple = Image.new("RGB", (180, 180), NAVY[:3])
content_w = int(180 * 0.8)
scale = content_w / logo.width
resized = logo.resize((content_w, max(1, int(logo.height * scale))), Image.LANCZOS)
x = (180 - resized.width) // 2
y = (180 - resized.height) // 2
apple.paste(resized, (x, y), resized)
apple.save("icons/apple-touch-icon.png")
print("wrote icons/apple-touch-icon.png (180x180)")
