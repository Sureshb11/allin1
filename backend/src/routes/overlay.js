// Broadcast overlay engine (spec §8, §10, §11).
//
// Serves two things, both authenticated by the session's overlay token:
//
//   GET /overlay/:sessionId          the overlay page itself
//   GET /overlay/:sessionId/state    the live score it renders
//
// The page is designed to be loaded as a **browser source** by whatever is
// encoding the video — OBS today, a server-side compositor later. That is what
// makes §10's requirement ("the score must be rendered INTO the video stream")
// actually true: the score is part of the picture before it reaches YouTube, so
// it survives fullscreen, it survives the archive, and it survives being
// watched anywhere other than inside the app.
//
// On the token in the query string: a browser source accepts a URL and nothing
// else — there is no header to put a bearer token in. So the token is scoped to
// exactly one capability (read this one match's score), is revoked the moment
// the session ends, and grants no write of any kind. It is a capability URL,
// and it is treated like one.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../lib/pairing.js';
import { liveSummary } from '../lib/liveSummary.js';
import { ACTIVE_BROADCAST_STATUSES } from '../lib/broadcastAuth.js';

const router = Router();

/**
 * Resolve the session from the overlay token. Looks the session up *by hash*,
 * so a wrong token is a failed index lookup rather than a comparison — there is
 * no string to compare in variable time.
 */
async function sessionFromToken(sessionId, token) {
  if (!token) return null;
  const session = await prisma.broadcastSession.findUnique({ where: { id: sessionId } });
  if (!session || !session.overlayTokenHash) return null;
  if (session.overlayTokenHash !== hashToken(token)) return null;
  if (!ACTIVE_BROADCAST_STATUSES.includes(session.status)) return null;
  return session;
}

/** GET /overlay/:sessionId/state — the live score, as JSON. */
router.get('/:sessionId/state', async (req, res, next) => {
  try {
    const session = await sessionFromToken(req.params.sessionId, req.query.token);
    if (!session) return res.status(401).json({ error: 'Invalid or revoked overlay token' });

    const summary = await liveSummary(session.matchId);
    if (!summary) return res.status(404).json({ error: 'Match not found' });

    // Collapse concurrent overlay polls (and any restarts of the encoder) onto
    // one origin query every 2s, per docs/LIVE-SCORING-REALTIME.md phase 0.
    res.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=8');
    res.json({ ...summary, session: { id: session.id, status: session.status } });
  } catch (e) {
    next(e);
  }
});

/** GET /overlay/:sessionId — the overlay page. */
router.get('/:sessionId', async (req, res, next) => {
  try {
    const session = await sessionFromToken(req.params.sessionId, req.query.token);
    if (!session) {
      return res.status(401).type('html').send('<h1>Overlay link is invalid or has been revoked</h1>');
    }
    res.set('Cache-Control', 'no-store');
    res.type('html').send(overlayHtml(session.id, String(req.query.token)));
  } catch (e) {
    next(e);
  }
});

/**
 * The overlay document. Self-contained: no external fonts, no CDN, no build
 * step — an encoder on a laptop at a cricket ground should not need the network
 * to reach anything but this API.
 *
 * Layout is the broadcast convention (Star Sports et al): one full-bleed strip
 * across the bottom of frame, everything on a single line, segmented by rules.
 * That shape is what it is for a reason — it eats the least picture, it reads
 * at a glance, and on a phone in a YouTube player it stays legible where a
 * stacked card turns to mush.
 *
 * Scaled in vw/vh so it is identical at 720p and 1080p. Transparent background:
 * the encoder composites it over the camera.
 */
export function overlayHtml(sessionId, token) {
  const stateUrl = `/overlay/${sessionId}/state?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Local Legends — Broadcast Overlay</title>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;}
  :root{
    --bg:#0f131f; --surface:#171b28; --surface-hi:#262a37;
    --lime:#abd600; --on-lime:#0f131f; --text:#dfe2f3; --muted:#8d90a2;
    --coral:#ff5a5f; --rule:rgba(255,255,255,.10);
    /* One scale knob; everything below is in em of this. */
    font-size:calc(0.72vw + 0.35vh);
  }
  .stage{position:fixed;inset:0;}

  /* ── The strip ─────────────────────────────────────────────────────────
     Full-bleed to the left, right and bottom edges. A bottom bar is the one
     element that *should* touch the frame edge — but overscan can eat the
     lowest few percent of a TV picture, so the bar is tall enough that its
     text baseline clears that zone even when the bar's own edge is clipped. */
  .bar{position:absolute;left:0;right:0;bottom:0;height:4.5em;
    display:flex;align-items:stretch;
    background:linear-gradient(180deg,rgba(23,27,40,.96),rgba(15,19,31,.98));
    border-top:.16em solid var(--lime);
    box-shadow:0 -.5em 2em rgba(0,0,0,.5);
    transform:translateY(110%);animation:slideUp .6s .3s cubic-bezier(.16,1,.3,1) forwards;}

  .seg{display:flex;align-items:center;padding:0 .95em;gap:.55em;
    border-right:1px solid var(--rule);white-space:nowrap;flex:0 0 auto;}
  .seg:last-child{border-right:0;}
  .k{font-size:.62em;letter-spacing:.2em;color:var(--muted);font-weight:800;}

  /* Brand block — the channel ident, left-most, like every sports strip. */
  .brand{background:var(--lime);color:var(--on-lime);padding:0 1.05em;
    font-size:.74em;font-weight:900;letter-spacing:.2em;line-height:1;
    display:flex;align-items:center;border-right:0;}

  /* Batting team + crest. */
  .crest{width:1.75em;height:1.75em;border-radius:50%;object-fit:cover;
    background:var(--surface-hi);}
  .tname{font-size:1.12em;font-weight:800;letter-spacing:.04em;color:var(--text);
    text-transform:uppercase;}

  /* The hero: score + overs. Never allowed to shrink or truncate. */
  .score{background:rgba(171,214,0,.12);gap:.6em;}
  /* Sized against the real target, not the preview: at 1080p this lands near
     38px, which is the band broadcast scorebugs actually use. It was 28px and
     illegible once YouTube scaled the frame onto a phone. */
  .runs{font-size:2.15em;font-weight:900;letter-spacing:-.01em;color:var(--lime);
    font-variant-numeric:tabular-nums;line-height:1;}
  .ov{font-size:.9em;font-weight:800;color:var(--text);opacity:.8;
    font-variant-numeric:tabular-nums;}

  /* First-innings total / target — only once there is a chase. */
  .prev{color:var(--muted);font-size:.8em;font-weight:700;gap:.45em;}
  .prev b{color:var(--text);font-weight:800;font-variant-numeric:tabular-nums;}

  /* Batters and bowler. These are what give way when the frame is narrow,
     because the score must not — so they may shrink (flex-shrink 1) while the
     spacer below absorbs slack first. */
  .people{flex:0 1 auto;min-width:0;overflow:hidden;gap:1.15em;}

  /* Eats the leftover width so every segment's divider hugs its own content
     instead of one segment stretching to the far side of the frame. Collapses
     to nothing before any real content is asked to shrink. */
  .spacer{flex:1 1 0;min-width:0;border-right:1px solid var(--rule);}
  .p{display:flex;align-items:baseline;gap:.35em;font-size:.95em;min-width:0;}
  .p .n{color:var(--text);font-weight:700;overflow:hidden;text-overflow:ellipsis;}
  .p .f{color:var(--lime);font-weight:800;font-variant-numeric:tabular-nums;}
  .p.on .n::after{content:'*';color:var(--lime);font-weight:900;margin-left:.08em;}
  .bowl .f{color:var(--text);}

  /* Rates. */
  .rates{gap:.9em;background:rgba(0,0,0,.25);}
  .rate{display:flex;gap:.35em;font-size:.76em;color:var(--muted);font-weight:800;
    letter-spacing:.06em;}
  .rate b{color:var(--lime);font-weight:900;font-variant-numeric:tabular-nums;}
  .chase{font-size:.78em;color:var(--text);font-weight:800;letter-spacing:.03em;}

  /* This over. */
  .balls{display:flex;gap:.28em;align-items:center;}
  .b{width:1.32em;height:1.32em;border-radius:50%;display:grid;place-items:center;
    font-size:.7em;font-weight:900;background:var(--surface-hi);color:var(--text);}
  .b.four{background:#2f6fed;color:#fff;} .b.six{background:#7b3fe4;color:#fff;}
  .b.w{background:var(--coral);color:#fff;} .b.ex{background:#4a4f60;}

  /* Live pip + sponsor, right-most. */
  .live{gap:.42em;font-size:.74em;font-weight:900;letter-spacing:.16em;color:#fff;
    background:var(--coral);}
  .live .dot{width:.5em;height:.5em;border-radius:50%;background:#fff;
    animation:pulse 1.6s infinite;}
  .sponsor{gap:.5em;}
  .sponsor img{max-height:2.3em;max-width:8em;object-fit:contain;}

  /* ── Event bursts: WICKET / FOUR / SIX (spec §11) ──────────────────── */
  .burst{position:absolute;left:0;right:0;top:38%;display:grid;place-items:center;
    pointer-events:none;opacity:0;}
  .burst.show{animation:burst 2.6s cubic-bezier(.16,1,.3,1);}
  .burst .word{font-size:7em;font-weight:900;letter-spacing:.06em;color:var(--lime);
    text-shadow:0 .1em .5em rgba(0,0,0,.85);-webkit-text-stroke:.04em rgba(0,0,0,.35);}
  .burst.wicket .word{color:var(--coral);}

  /* ── Innings break / result banner ─────────────────────────────────── */
  .banner{position:absolute;left:50%;bottom:5.6em;transform:translateX(-50%);
    background:linear-gradient(180deg,rgba(23,27,40,.97),rgba(15,19,31,.97));
    border-radius:.4em;border-left:.2em solid var(--lime);padding:.7em 1.8em;
    text-align:center;box-shadow:0 1em 3em rgba(0,0,0,.6);display:none;}
  .banner.show{display:block;animation:fadeIn .5s;}
  .banner .bk{font-size:.66em;letter-spacing:.28em;color:var(--lime);font-weight:800;}
  .banner .bv{font-size:1.25em;font-weight:900;color:var(--text);margin-top:.2em;}

  .offline{position:absolute;right:1.4em;bottom:4.6em;font-size:.7em;font-weight:800;
    letter-spacing:.14em;color:var(--coral);background:rgba(15,19,31,.92);
    padding:.35em .8em;border-radius:.25em;display:none;}
  .offline.show{display:block;}

  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
  @keyframes fadeIn{to{opacity:1}}
  @keyframes slideUp{to{transform:translateY(0)}}
  @keyframes burst{
    0%{opacity:0;transform:scale(.7)} 12%{opacity:1;transform:scale(1.06)}
    20%{transform:scale(1)} 78%{opacity:1;transform:scale(1)}
    100%{opacity:0;transform:scale(1.04)}
  }
</style>
</head>
<body>
<div class="stage">
  <div class="burst" id="burst"><span class="word" id="burstWord"></span></div>
  <div class="banner" id="banner"><div class="bk" id="bannerK"></div><div class="bv" id="bannerV"></div></div>
  <div class="offline" id="offline">NO SIGNAL</div>

  <div class="bar" id="bar">
    <div class="seg brand">LOCAL LEGENDS</div>

    <div class="seg">
      <img class="crest" id="crest" alt="">
      <span class="tname" id="batTeam">—</span>
    </div>

    <div class="seg score">
      <span class="runs" id="runs">0-0</span>
      <span class="ov" id="overs">0.0</span>
    </div>

    <div class="seg prev" id="prevWrap" style="display:none">
      <span id="prevTeam">—</span><b id="prevScore">—</b>
    </div>

    <div class="seg people">
      <span class="p" id="p1"><span class="n">—</span><span class="f"></span></span>
      <span class="p" id="p2"><span class="n">—</span><span class="f"></span></span>
    </div>

    <div class="seg people">
      <span class="p bowl" id="p3"><span class="n">—</span><span class="f"></span></span>
    </div>

    <div class="spacer"></div>

    <div class="seg" id="overWrap">
      <span class="k">THIS OVER</span>
      <span class="balls" id="balls"></span>
    </div>

    <div class="seg rates">
      <span class="rate">CRR <b id="crr">0.00</b></span>
      <span class="rate" id="rrrWrap" style="display:none">RRR <b id="rrr">0.00</b></span>
      <span class="chase" id="chase"></span>
    </div>

    <div class="seg sponsor" id="sponsor" style="display:none">
      <span class="k">POWERED BY</span><img id="sponsorImg" alt="">
    </div>

    <div class="seg live"><span class="dot"></span>LIVE</div>
  </div>
</div>

<script>
(function(){
  var STATE_URL = ${JSON.stringify(stateUrl)};
  var $ = function(id){ return document.getElementById(id); };
  var lastSig = null, misses = 0;

  // Sponsor/tournament art is passed on the URL so an operator can rebrand the
  // overlay per tournament without a redeploy: &sponsor=<url>
  var params = new URLSearchParams(location.search);
  var sponsorUrl = params.get('sponsor');
  if (sponsorUrl) { $('sponsorImg').src = sponsorUrl; $('sponsor').style.display = 'flex'; }

  function ballClass(b){
    if (b.isWicket) return 'b w';
    if (b.runs === 4) return 'b four';
    if (b.runs === 6) return 'b six';
    if (b.extraType) return 'b ex';
    return 'b';
  }
  function ballText(b){
    if (b.isWicket) return 'W';
    if (b.extraType === 'wide') return 'wd';
    if (b.extraType === 'noBall') return 'nb';
    if (b.extraType === 'bye') return 'b';
    if (b.extraType === 'legBye') return 'lb';
    return String(b.runs);
  }

  function burst(word, kind){
    var el = $('burst');
    $('burstWord').textContent = word;
    el.className = 'burst ' + (kind || '');
    void el.offsetWidth;              // restart the animation
    el.className = 'burst show ' + (kind || '');
  }

  function person(el, card, onStrike, isBowler){
    if (!card || !card.name) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.className = 'p' + (isBowler ? ' bowl' : '') + (onStrike ? ' on' : '');
    el.querySelector('.n').textContent = card.name;
    // Bowling figures are written wickets-runs; batting is runs(balls).
    el.querySelector('.f').textContent = isBowler
      ? (card.wickets + '-' + card.runs + ' (' + card.overs + ')')
      : (card.runs + '(' + card.balls + ')');
  }

  function render(s){
    var L = s.live;
    if (!L) return;

    $('batTeam').textContent = L.battingTeam.shortName || L.battingTeam.name;
    if (L.battingTeam.logoUrl) { $('crest').src = L.battingTeam.logoUrl; }
    else { $('crest').style.display = 'none'; }

    // Broadcast convention writes a cricket score with a hyphen, not a slash.
    $('runs').textContent = L.runs + '-' + L.wickets;
    $('overs').textContent = L.overs + (L.maxOvers ? '/' + L.maxOvers : '') + ' OV';
    $('crr').textContent = (L.runRate || 0).toFixed(2);

    if (L.inningNumber >= 2 && s.innings && s.innings[0]) {
      var f = s.innings[0];
      $('prevTeam').textContent = (f.battingTeam.shortName || f.battingTeam.name);
      $('prevScore').textContent = f.runs + '-' + f.wickets;
      $('prevWrap').style.display = 'flex';
    } else {
      $('prevWrap').style.display = 'none';
    }

    person($('p1'), L.striker, true, false);
    person($('p2'), L.nonStriker, false, false);
    person($('p3'), L.bowler, false, true);

    if (L.requiredRunRate != null) {
      $('rrr').textContent = L.requiredRunRate.toFixed(2);
      $('rrrWrap').style.display = 'flex';
      $('chase').textContent = L.required > 0
        ? ('NEED ' + L.required + ' OFF ' + L.ballsRemaining)
        : '';
    } else {
      $('rrrWrap').style.display = 'none';
      $('chase').textContent = '';
    }

    var wrap = $('balls');
    wrap.innerHTML = '';
    (L.recentBalls || []).forEach(function(b){
      var d = document.createElement('span');
      d.className = ballClass(b); d.textContent = ballText(b);
      wrap.appendChild(d);
    });
    $('overWrap').style.display = (L.recentBalls && L.recentBalls.length) ? 'flex' : 'none';

    // Fire a burst only on a genuinely new delivery — never on a refresh, a
    // reconnect, or a re-render of the same ball.
    var lb = L.lastBall;
    var sig = L.runs + '-' + L.wickets + '-' + L.overs;
    if (lb && sig !== lastSig && lastSig !== null) {
      if (lb.isWicket) burst('WICKET', 'wicket');
      else if (lb.runs === 6) burst('SIX');
      else if (lb.runs === 4) burst('FOUR');
    }
    lastSig = sig;

    var bn = $('banner');
    if (s.status === 'break') {
      $('bannerK').textContent = 'INNINGS BREAK';
      $('bannerV').textContent = L.target ? ('TARGET ' + L.target) : '';
      bn.className = 'banner show';
    } else if (s.status === 'completed' && s.result) {
      $('bannerK').textContent = 'RESULT';
      $('bannerV').textContent = s.result;
      bn.className = 'banner show';
    } else {
      bn.className = 'banner';
    }
  }

  function tick(){
    fetch(STATE_URL, { cache: 'no-store' })
      .then(function(r){
        if (r.status === 401) throw new Error('revoked');
        return r.json();
      })
      .then(function(s){
        misses = 0; $('offline').className = 'offline';
        render(s);
      })
      .catch(function(e){
        // A revoked session blanks the strip rather than freezing on a stale
        // score — a scorebug that keeps showing 153-4 after being pulled is
        // worse than no scorebug.
        if (String(e.message) === 'revoked') { $('bar').style.display = 'none'; return; }
        // Two missed polls is a blip on a mobile signal; six is a real outage.
        if (++misses >= 6) $('offline').className = 'offline show';
      });
  }

  tick();
  setInterval(tick, 2000);
})();
</script>
</body>
</html>`;
}

export default router;
