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
 * Sized for a 1920×1080 canvas and scaled with vw units, so it is identical at
 * 720p and 1080p. Transparent background: OBS composites it over the camera.
 */
export function overlayHtml(sessionId, token) {
  const stateUrl = `/overlay/${sessionId}/state?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Local Legends — Broadcast Overlay</title>
<style>
  /* Transparent so the camera shows through everywhere we haven't drawn. */
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;}
  :root{
    --bg:#0f131f; --surface:#171b28; --surface-hi:#262a37;
    --lime:#abd600; --on-lime:#0f131f; --text:#dfe2f3; --muted:#8d90a2;
    --coral:#ff5a5f;
    /* One scale knob: everything below is in em of this. */
    font-size:calc(0.72vw + 0.35vh);
  }
  .stage{position:fixed;inset:0;}

  /* Title-safe inset. Broadcast convention is ~5% of frame, and a TV that
     overscans will eat anything outside it — so every fixed element below is
     anchored to this, not to the frame edge. */
  .stage{--safe:3.4em;}

  /* ── Top-left brand + live pip ─────────────────────────────────────── */
  .brand{position:absolute;top:var(--safe);left:var(--safe);display:flex;align-items:center;gap:0.9em;
    opacity:0;animation:fadeIn .6s .2s forwards;}
  .brand-mark{font-size:1.05em;font-weight:800;letter-spacing:.22em;color:var(--lime);
    text-shadow:0 2px 10px rgba(0,0,0,.8);}
  .live{display:flex;align-items:center;gap:.45em;background:var(--coral);color:#fff;
    padding:.3em .75em;border-radius:.35em;font-size:.82em;font-weight:800;letter-spacing:.14em;
    box-shadow:0 4px 18px rgba(0,0,0,.45);}
  .live .dot{width:.5em;height:.5em;border-radius:50%;background:#fff;animation:pulse 1.6s infinite;}

  /* ── Lower-third scorebug ──────────────────────────────────────────── */
  .bug{position:absolute;left:var(--safe);bottom:var(--safe);min-width:34em;
    border-radius:.7em;overflow:hidden;
    background:linear-gradient(180deg,rgba(23,27,40,.97),rgba(15,19,31,.97));
    box-shadow:0 1.2em 3em rgba(0,0,0,.55);
    transform:translateY(120%);animation:slideUp .7s .35s cubic-bezier(.16,1,.3,1) forwards;}
  .bug-main{display:flex;align-items:stretch;}
  .team{display:flex;align-items:center;gap:.7em;padding:.85em 1.1em;min-width:13em;}
  .team .crest{width:2.1em;height:2.1em;border-radius:50%;object-fit:cover;
    background:var(--surface-hi);flex:0 0 auto;}
  .team .tname{font-size:1.02em;font-weight:800;letter-spacing:.03em;color:var(--text);
    white-space:nowrap;text-transform:uppercase;}
  .score{display:flex;align-items:baseline;gap:.55em;padding:.85em 1.2em;
    background:var(--lime);color:var(--on-lime);margin-left:auto;}
  .score .runs{font-size:1.9em;font-weight:900;letter-spacing:-.02em;line-height:1;
    font-variant-numeric:tabular-nums;}
  .score .ov{font-size:.85em;font-weight:800;opacity:.72;font-variant-numeric:tabular-nums;}
  /* The first innings total, once there is a chase to compare it to. */
  .prev{display:flex;align-items:center;gap:.5em;padding:.4em 1.1em;
    background:rgba(0,0,0,.32);font-size:.8em;color:var(--muted);font-weight:600;}
  .prev b{color:var(--text);font-weight:800;font-variant-numeric:tabular-nums;}

  /* ── Batters / bowler strip ────────────────────────────────────────── */
  .people{display:flex;align-items:center;gap:1.6em;padding:.6em 1.15em;
    background:rgba(0,0,0,.28);font-size:.86em;}
  .p{display:flex;align-items:baseline;gap:.42em;color:var(--muted);font-weight:600;
    white-space:nowrap;}
  .p .n{color:var(--text);font-weight:700;}
  .p .f{color:var(--text);font-weight:800;font-variant-numeric:tabular-nums;}
  .p.on .n::after{content:'*';color:var(--lime);font-weight:900;margin-left:.1em;}
  .p.bowl{margin-left:auto;}

  /* ── Rates ─────────────────────────────────────────────────────────── */
  .rates{display:flex;gap:1.4em;padding:.5em 1.15em;background:rgba(0,0,0,.42);font-size:.78em;}
  .rate{display:flex;gap:.4em;color:var(--muted);font-weight:700;letter-spacing:.05em;}
  .rate b{color:var(--lime);font-weight:900;font-variant-numeric:tabular-nums;}
  .chase{color:var(--text);font-weight:700;}

  /* ── Recent balls ──────────────────────────────────────────────────── */
  /* Inside the bug, not floating beneath it: anchored to the frame edge it fell
     outside title-safe and was the first thing an overscanning TV clipped. */
  .balls-row{display:flex;align-items:center;gap:.5em;padding:.5em 1.15em .6em;
    background:rgba(0,0,0,.52);}
  .balls-row .cap{font-size:.62em;letter-spacing:.2em;color:var(--muted);font-weight:800;}
  .balls{display:flex;gap:.35em;align-items:center;}
  .b{width:1.5em;height:1.5em;border-radius:50%;display:grid;place-items:center;
    font-size:.72em;font-weight:900;background:var(--surface-hi);color:var(--text);
    box-shadow:0 2px 8px rgba(0,0,0,.5);}
  .b.four{background:#2f6fed;color:#fff;} .b.six{background:#7b3fe4;color:#fff;}
  .b.w{background:var(--coral);color:#fff;} .b.ex{background:#4a4f60;color:#dfe2f3;}

  /* ── Sponsor slot (spec §11) ───────────────────────────────────────── */
  .sponsor{position:absolute;right:var(--safe);bottom:var(--safe);display:flex;flex-direction:column;
    align-items:flex-end;gap:.4em;opacity:0;animation:fadeIn .6s .8s forwards;}
  .sponsor .cap{font-size:.62em;letter-spacing:.24em;color:var(--muted);font-weight:800;}
  .sponsor img{max-height:3.4em;max-width:11em;object-fit:contain;
    filter:drop-shadow(0 4px 14px rgba(0,0,0,.6));}

  /* ── Event bursts: WICKET / FOUR / SIX (spec §11) ──────────────────── */
  .burst{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0;}
  .burst.show{animation:burst 2.6s cubic-bezier(.16,1,.3,1);}
  .burst .word{font-size:7em;font-weight:900;letter-spacing:.06em;color:var(--lime);
    text-shadow:0 .1em .5em rgba(0,0,0,.85);-webkit-text-stroke:.04em rgba(0,0,0,.35);}
  .burst.wicket .word{color:var(--coral);}

  /* ── Innings break / result banner ─────────────────────────────────── */
  .banner{position:absolute;left:50%;top:12%;transform:translateX(-50%);
    background:linear-gradient(180deg,rgba(23,27,40,.97),rgba(15,19,31,.97));
    border-radius:.6em;padding:1em 2.4em;text-align:center;
    box-shadow:0 1em 3em rgba(0,0,0,.6);display:none;}
  .banner.show{display:block;animation:fadeIn .5s;}
  .banner .k{font-size:.72em;letter-spacing:.3em;color:var(--lime);font-weight:800;}
  .banner .v{font-size:1.5em;font-weight:900;color:var(--text);margin-top:.25em;}

  .offline{position:absolute;right:2.4em;top:2.2em;font-size:.72em;font-weight:800;
    letter-spacing:.14em;color:var(--coral);background:rgba(15,19,31,.9);
    padding:.35em .8em;border-radius:.3em;display:none;}
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
  <div class="brand">
    <span class="brand-mark">LOCAL LEGENDS</span>
    <span class="live"><span class="dot"></span>LIVE</span>
  </div>

  <div class="offline" id="offline">NO SIGNAL</div>

  <div class="bug" id="bug">
    <div class="bug-main">
      <div class="team">
        <img class="crest" id="crest" alt="">
        <span class="tname" id="batTeam">—</span>
      </div>
      <div class="score">
        <span class="runs" id="runs">0/0</span>
        <span class="ov" id="overs">0.0</span>
      </div>
    </div>
    <div class="prev" id="prevWrap" style="display:none">
      <span id="prevTeam">—</span><b id="prevScore">—</b>
    </div>
    <div class="people">
      <span class="p" id="p1"><span class="n">—</span><span class="f"></span></span>
      <span class="p" id="p2"><span class="n">—</span><span class="f"></span></span>
      <span class="p bowl" id="p3"><span class="n">—</span><span class="f"></span></span>
    </div>
    <div class="rates">
      <span class="rate">CRR <b id="crr">0.00</b></span>
      <span class="rate" id="rrrWrap" style="display:none">RRR <b id="rrr">0.00</b></span>
      <span class="chase" id="chase"></span>
    </div>
    <div class="balls-row">
      <span class="cap">THIS OVER</span>
      <span class="balls" id="balls"></span>
    </div>
  </div>

  <div class="sponsor" id="sponsor" style="display:none">
    <span class="cap">POWERED BY</span><img id="sponsorImg" alt="">
  </div>

  <div class="burst" id="burst"><span class="word" id="burstWord"></span></div>
  <div class="banner" id="banner"><div class="k" id="bannerK"></div><div class="v" id="bannerV"></div></div>
</div>

<script>
(function(){
  var STATE_URL = ${JSON.stringify(stateUrl)};
  var $ = function(id){ return document.getElementById(id); };
  var lastSig = null, lastBallCount = 0, misses = 0;

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
    el.querySelector('.f').textContent = isBowler
      ? (card.wickets + '/' + card.runs + ' (' + card.overs + ')')
      : (card.runs + ' (' + card.balls + ')');
  }

  function render(s){
    var L = s.live;
    if (!L) return;

    $('batTeam').textContent = L.battingTeam.shortName || L.battingTeam.name;
    if (L.battingTeam.logoUrl) { $('crest').src = L.battingTeam.logoUrl; }
    else { $('crest').style.visibility = 'hidden'; }

    $('runs').textContent = L.runs + '/' + L.wickets;
    $('overs').textContent = L.overs + (L.maxOvers ? ' (' + L.maxOvers + ')' : '');
    $('crr').textContent = (L.runRate || 0).toFixed(2);

    // First-innings total, shown only once someone is chasing it.
    if (L.inningNumber >= 2 && s.innings && s.innings[0]) {
      var f = s.innings[0];
      $('prevTeam').textContent = (f.battingTeam.shortName || f.battingTeam.name);
      $('prevScore').textContent = f.runs + '/' + f.wickets;
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

    // Fire a burst only on a genuinely new delivery — never on a refresh, a
    // reconnect, or a re-render of the same ball.
    var count = L.recentBalls ? L.recentBalls.length : 0;
    var lb = L.lastBall;
    var sig = L.runs + '-' + L.wickets + '-' + L.overs;
    if (lb && sig !== lastSig && lastSig !== null) {
      if (lb.isWicket) burst('WICKET', 'wicket');
      else if (lb.runs === 6) burst('SIX');
      else if (lb.runs === 4) burst('FOUR');
    }
    lastSig = sig; lastBallCount = count;

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
        // A revoked session blanks the overlay rather than freezing on a stale
        // score — a scorebug that keeps showing 153/4 after being pulled is
        // worse than no scorebug.
        if (String(e.message) === 'revoked') {
          $('bug').style.display = 'none';
          return;
        }
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
