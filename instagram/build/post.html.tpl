<!doctype html>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1080px; }
  body {
    background:#F2EAE1;
    color:#2E2823;
    font-family:'Jost','Liberation Sans',sans-serif;
    display:flex; align-items:center; justify-content:center;
  }
  .frame {
    position:absolute; inset:44px;
    border:1px solid rgba(46,40,35,.16);
  }
  .grain { position:absolute; inset:0; opacity:.5;
    background:
      radial-gradient(1100px 700px at 78% 8%, rgba(255,255,255,.55), transparent 60%),
      radial-gradient(900px 600px at 12% 96%, rgba(197,166,141,.22), transparent 62%);
  }
  .wrap { position:relative; width:1080px; height:1080px;
    display:flex; flex-direction:column; align-items:center;
    padding:118px 108px 104px; text-align:center; }

  .kicker { font-weight:400; font-size:21px; letter-spacing:.42em;
    text-transform:uppercase; color:#96826F; }
  .rule { width:1px; height:48px; background:rgba(46,40,35,.25); margin:30px 0 34px; }

  h1 { font-family:'Cormorant Garamond',serif; font-weight:300;
    font-variant-numeric:lining-nums; font-feature-settings:'lnum' 1;
    font-size:97px; line-height:1.04; letter-spacing:-.5px; }
  h1 em { font-style:italic; font-weight:400; }

  .sub { margin-top:34px; max-width:660px; font-weight:300;
    font-size:29px; line-height:1.58; color:#6E6055; }

  .arches { display:flex; gap:26px; margin-top:56px; margin-bottom:26px; align-items:flex-end; }
  .arch { width:46px; border-radius:23px 23px 8px 8px; }
  .a1 { height:78px;  background:#E3CDBB; }
  .a2 { height:104px; background:#D3B197; }
  .a3 { height:126px; background:#B98B6E; }
  .a4 { height:104px; background:#D3B197; }
  .a5 { height:78px;  background:#E3CDBB; }

  .foot { margin-top:auto; display:flex; flex-direction:column; align-items:center; gap:16px; }
  .cta { border:1px solid #2E2823; border-radius:999px;
    padding:19px 46px; font-size:22px; letter-spacing:.2em;
    text-transform:uppercase; font-weight:400; }
  .meta { font-size:22px; letter-spacing:.06em; color:#7C6C5D; font-weight:300; }
  .ig { font-size:21px; letter-spacing:.22em; color:#7C6C5D; font-weight:300; }
  .handle { font-family:'Cormorant Garamond',serif; font-size:40px;
    letter-spacing:.16em; text-transform:uppercase; color:#2E2823; font-weight:400; }
</style>
<div class="wrap">
  <div class="grain"></div>
  <div class="frame"></div>

  <div class="kicker">Centro &middot; Foz do Iguaçu</div>
  <div class="rule"></div>

  <h1>Mãos e pés<br><em>prontos em 1 hora</em></h1>

  <p class="sub">Para quem está de passagem e para quem mora aqui:
     hora marcada, a poucos minutos de onde você já está.</p>

  <div class="arches">
    <div class="arch a1"></div><div class="arch a2"></div>
    <div class="arch a3"></div><div class="arch a4"></div><div class="arch a5"></div>
  </div>

  <div class="foot">
    <div class="cta">Agende pelo WhatsApp</div>
    <div class="meta">__WHATSAPP__ &nbsp;·&nbsp; __ENDERECO__</div>
    <div class="handle">__SALAO__</div>
    <div class="ig">__ARROBA__</div>
  </div>
</div>
