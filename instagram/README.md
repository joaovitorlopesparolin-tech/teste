# Instagram — Salão de manicure, Centro de Foz do Iguaçu

Conteúdo para captação de leads locais, com foco em turistas hospedados no Centro
e em moradoras da região.

## Arquivos

- `out/post-manicure-centro-foz.png` — arte A, só tipografia (1080×1080)
- `out/post-manicure-centro-foz-foto.png` — arte B, com foto real (1080×1080)
- `legenda-post.md` — legenda, hashtags e configuração do impulsionamento
- `build/post.html.tpl` — template da arte A
- `build/post-foto.html.tpl` — template da arte B
- `build/assets/unhas-01.jpg` — foto original enviada pelo salão
- `build/config.json` — nome, @, WhatsApp e endereço do salão
- `build/render.py` — gera os PNGs a partir dos templates

## Como regerar as artes com os dados reais

1. Edite `build/config.json`.
2. Rode:

```bash
pip install playwright
python3 instagram/build/render.py
```

O script usa o Chromium já instalado no ambiente e exporta em 2× (2160×2160).
