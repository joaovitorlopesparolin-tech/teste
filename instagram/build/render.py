#!/usr/bin/env python3
"""Renderiza as artes do post a partir dos templates HTML + config.json."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
BASE = pathlib.Path(__file__).resolve().parent
OUT = BASE.parent / "out"
CFG = json.loads((BASE / "config.json").read_text(encoding="utf-8"))

JOBS = [("post.html.tpl", "post-manicure-centro-foz.png", 1080, 1080),
        ("post-foto.html.tpl", "post-manicure-centro-foz-foto.png", 1080, 1080),
        ("story.html.tpl", "story-manicure-centro-foz.png", 1080, 1920)]

def fill(tpl: str) -> str:
    out = tpl
    for k, v in CFG.items():
        out = out.replace("__" + k.upper() + "__", v)
    return out

def prep_assets():
    """Recorta a foto original para tirar a bolsa/parede da esquerda."""
    from PIL import Image
    src = BASE / "assets" / "unhas-01.jpg"
    if not src.exists():
        return
    dst = BASE / "assets" / "unhas-01-crop.jpg"
    Image.open(src).crop((120, 200, 960, 1280)).save(dst, quality=95)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    prep_assets()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if pathlib.Path(CHROME).exists() else None,
                                    args=["--no-sandbox"])
        for tpl_name, png, w, h in JOBS:
            tpl = BASE / tpl_name
            if not tpl.exists():
                continue
            html = BASE / (tpl_name + ".rendered.html")
            html.write_text(fill(tpl.read_text(encoding="utf-8")), encoding="utf-8")
            page = browser.new_page(viewport={"width": w, "height": h},
                                    device_scale_factor=2)
            page.goto(html.as_uri())
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / png))
            page.close()
            html.unlink()
            print("gerado:", OUT / png)
        browser.close()

if __name__ == "__main__":
    sys.exit(main())
