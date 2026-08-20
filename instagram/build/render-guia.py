#!/usr/bin/env python3
"""Gera o PDF do guia de impulsionamento a partir do HTML."""
import pathlib
from playwright.sync_api import sync_playwright

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
SRC = pathlib.Path(__file__).resolve().parent.parent / "guia" / "guia-turbinar.html"
OUT = SRC.parent / "guia-turbinar-post-salao-bless.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=CHROME if pathlib.Path(CHROME).exists() else None,
        args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(SRC.as_uri())
    page.wait_for_timeout(500)
    page.pdf(path=str(OUT), format="A4", print_background=True)
    browser.close()

print("gerado:", OUT)
