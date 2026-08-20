<!doctype html>
<meta charset="utf-8">
<style>
  :root {
    --bg:#EFEAF3;
    --ink:#2F2740;
    --muted:#655A78;
    --accent:#8465A8;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1080px; }
  body { background:var(--bg); color:var(--ink);
    font-family:'Jost','Liberation Sans',sans-serif; }

  .wrap { position:relative; width:1080px; height:1080px; overflow:hidden; }

  .wrap img { position:absolute; inset:0; width:100%; height:100%;
    object-fit:cover; object-position:center 26%;
    filter:saturate(1.02) contrast(1.02) brightness(1.03); }

  /* véu lilás sobre a foto, para a imagem entrar na paleta */
  .tint { position:absolute; inset:0; background:#8465A8;
    mix-blend-mode:soft-light; opacity:.34; }

  .scrim { position:absolute; inset:0;
    background:linear-gradient(to bottom,
      rgba(239,234,243,.30) 0%,
      rgba(239,234,243,0) 18%,
      rgba(239,234,243,0) 32%,
      rgba(239,234,243,.62) 47%,
      rgba(239,234,243,.93) 57%,
      rgba(239,234,243,.995) 65%,
      var(--bg) 71%); }

  .content { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; text-align:center; padding:46px 92px 62px; }

  .tag { position:absolute; top:46px; left:58px;
    background:rgba(239,234,243,.92); padding:14px 32px; border-radius:999px;
    font-size:19px; letter-spacing:.34em; text-transform:uppercase;
    color:var(--accent); white-space:nowrap; }

  .block { margin-top:auto; display:flex; flex-direction:column; align-items:center; }

  h1 { font-family:'Cormorant Garamond',serif; font-weight:300;
    font-variant-numeric:lining-nums; font-feature-settings:'lnum' 1;
    font-size:88px; line-height:1.03; letter-spacing:-.5px; }
  h1 em { font-style:italic; font-weight:400; }

  .sub { margin-top:22px; max-width:700px; font-weight:300;
    font-size:26px; line-height:1.5; color:var(--muted); }

  .cta { margin-top:34px; border:1px solid var(--ink); border-radius:999px;
    padding:18px 44px; font-size:21px; letter-spacing:.2em; text-transform:uppercase; }
  .meta { margin-top:20px; font-size:21px; letter-spacing:.05em;
    color:var(--muted); font-weight:300; }
  .handle { margin-top:12px; font-family:'Cormorant Garamond',serif;
    font-size:39px; letter-spacing:.16em; text-transform:uppercase; font-weight:400; }
  .ig { margin-top:9px; font-size:21px; letter-spacing:.22em;
    color:var(--muted); font-weight:300; }
</style>
<div class="wrap">
  <img src="assets/unhas-01-crop.jpg" alt="">
  <div class="tint"></div>
  <div class="scrim"></div>
  <div class="content">
    <div class="tag">Centro &middot; Foz do Iguaçu</div>
    <div class="block">
      <h1>Mãos e pés<br><em>prontos em 1 hora</em></h1>
      <p class="sub">Hora marcada, a poucos minutos de onde você já está.</p>
      <div class="cta">Agende pelo WhatsApp</div>
      <div class="meta">__WHATSAPP__ &nbsp;·&nbsp; __ENDERECO__</div>
      <div class="handle">__SALAO__</div>
      <div class="ig">__ARROBA__</div>
    </div>
  </div>
</div>
