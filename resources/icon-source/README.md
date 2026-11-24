# App icon source

- `icon.svg`: the full icon, used at 32px@2x (64px) and above.
- `icon-small.svg`: simpler art (no folded corner, heavier mark) for the 16px and 32px slots, where the full icon blurs.

To rebuild `resources/icon.png` and `resources/icon.icns`:

1. Render each SVG to a 1024×1024 PNG with a transparent background. Headless Chrome works:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --default-background-color=00000000 --window-size=1024,1024 --screenshot=out.png page.html`
   where `page.html` is just `<body style="margin:0"><img src="icon.svg" width="1024" height="1024">`.
2. Fill a `Presspad.iconset` folder with `sips -z`:
   - from the small art: `icon_16x16`, `icon_16x16@2x`, `icon_32x32`
   - from the full art: every other size, from `icon_32x32@2x` up to `icon_512x512@2x` (the 1024 PNG itself)
3. Run `iconutil -c icns Presspad.iconset -o resources/icon.icns` and copy the full 1024 PNG to `resources/icon.png`.
