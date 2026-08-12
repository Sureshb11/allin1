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
 * Layout follows the standard cricket scorebug: a full-bleed bar across the
 * bottom of frame, split two-tone by an angled cut — dark block carrying team
 * and score on the left, white panel carrying the players on the right — with
 * the chase equation on its own strip beneath, and an over tracker at the far
 * right. That shape is what it is for a reason: it eats little picture, the
 * score reads at a glance, and the two-tone split gives the eye a fixed place
 * to look for each kind of information.
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
    --coral:#ff5a5f; --ink:#0f131f; --ink-soft:#5b6070;
    /* One scale knob; everything below is in em of this. */
    font-size:calc(0.72vw + 0.35vh);
  }
  .stage{position:fixed;inset:0;}

  /* ── The dock: scorebug + chase strip, stacked, pinned to the frame edge ──
     A bottom bar is the one element that should touch the edge. It is tall
     enough that its text baseline clears the band an overscanning TV clips. */
  .dock{position:absolute;left:0;right:0;bottom:0;overflow:hidden;
    transform:translateY(110%);animation:slideUp .6s .3s cubic-bezier(.16,1,.3,1) forwards;}

  .bar{display:flex;align-items:stretch;height:4.3em;}

  /* Live pip — the round badge at the head of the bar. */
  .livebadge{flex:0 0 auto;width:2.9em;display:grid;place-items:center;
    background:var(--coral);}
  .livebadge .dot{width:.86em;height:.86em;border-radius:50%;background:#fff;
    animation:pulse 1.6s infinite;}

  /* ── Left: team + score, each a two-line cell ────────────────────────── */
  .teamblock{flex:0 0 auto;display:flex;align-items:stretch;
    background:linear-gradient(180deg,#1c2130,#12161f);padding-right:1.5em;}
  .cell{display:flex;flex-direction:column;justify-content:center;
    padding:0 1.05em;gap:.12em;}
  .cell.num{align-items:flex-end;}
  .big{font-size:1.5em;font-weight:900;letter-spacing:.02em;color:#fff;
    line-height:1;text-transform:uppercase;white-space:nowrap;}
  .big.score{color:var(--lime);font-size:2.25em;font-variant-numeric:tabular-nums;
    letter-spacing:-.01em;}
  .sub{font-size:.68em;font-weight:700;letter-spacing:.09em;color:var(--muted);
    text-transform:uppercase;white-space:nowrap;font-variant-numeric:tabular-nums;}
  .sub .k{color:var(--lime);opacity:.75;}

  /* ── Right: the white player panel, with the angled leading edge ───────
     The whole panel is skewed and its contents un-skewed, which is how this
     shape is cut in broadcast graphics — one transform, no clip-path, and the
     angle stays true at any width. It runs past the right edge and is clipped
     by .dock, so only the left angle is ever visible. */
  .panel{flex:1 1 auto;min-width:0;background:#fff;
    transform:skewX(-13deg);margin-left:-1.1em;margin-right:-3em;
    box-shadow:-.35em 0 0 0 var(--lime);}
  .panel-inner{height:100%;transform:skewX(13deg);display:flex;align-items:center;
    gap:1.5em;padding:0 3.4em 0 2.1em;min-width:0;}

  .pl{display:flex;align-items:baseline;gap:.4em;min-width:0;white-space:nowrap;}
  .pl .nm{font-size:.92em;font-weight:800;color:var(--ink);letter-spacing:.03em;
    text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
  .pl .r{font-size:1.28em;font-weight:900;color:var(--ink);line-height:1;
    font-variant-numeric:tabular-nums;}
  .pl .b{font-size:.74em;font-weight:800;color:var(--ink-soft);
    font-variant-numeric:tabular-nums;}
  /* The bat marks who is on strike. Drawn, not a glyph: OBS's embedded browser
     does not reliably carry an emoji font, and a tofu box on air is forever. */
  .pl .bat{width:1.02em;height:1.02em;flex:0 0 auto;fill:#2f7d1f;
    align-self:center;}
  .pl.bowl .nm{color:var(--ink-soft);}

  /* Over tracker — this over's deliveries, empty slots for what's to come. */
  .tracker{display:flex;gap:.3em;align-items:center;margin-left:auto;flex:0 0 auto;}
  .t{width:1.3em;height:1.3em;border-radius:50%;display:grid;place-items:center;
    font-size:.68em;font-weight:900;border:.12em solid #d3d6de;color:var(--ink-soft);
    background:#fff;}
  .t.on{border-color:transparent;background:#3a4050;color:#fff;}
  .t.four{background:#2f6fed;border-color:transparent;color:#fff;}
  .t.six{background:#7b3fe4;border-color:transparent;color:#fff;}
  .t.w{background:var(--coral);border-color:transparent;color:#fff;}
  .t.ex{background:#9aa0ae;border-color:transparent;color:#fff;}

  /* ── Chase strip — its own line under the bug, like the reference ─────── */
  .chase{display:none;background:linear-gradient(180deg,#1c2130,#12161f);
    border-top:1px solid rgba(255,255,255,.10);
    padding:.42em 1.4em;text-align:center;
    font-size:.82em;font-weight:900;letter-spacing:.13em;color:#fff;
    text-transform:uppercase;}
  .chase.show{display:block;}
  .chase b{color:var(--lime);}

  /* ── Event bursts: WICKET / FOUR / SIX (spec §11) ──────────────────── */
  .burst{position:absolute;left:0;right:0;top:36%;display:grid;place-items:center;
    pointer-events:none;opacity:0;}
  .burst.show{animation:burst 2.6s cubic-bezier(.16,1,.3,1);}
  .burst .word{font-size:7em;font-weight:900;letter-spacing:.06em;color:var(--lime);
    text-shadow:0 .1em .5em rgba(0,0,0,.85);-webkit-text-stroke:.04em rgba(0,0,0,.35);}
  .burst.wicket .word{color:var(--coral);}

  /* ── Brand watermark + status ─────────────────────────────────────────── */
  .brand{position:absolute;top:2.6em;right:2.6em;font-size:1.05em;font-weight:900;
    letter-spacing:.2em;color:#fff;opacity:.92;text-shadow:0 .12em .6em rgba(0,0,0,.7);}
  .sponsor{position:absolute;top:2.4em;left:2.6em;display:none;align-items:center;gap:.5em;}
  .sponsor img{max-height:3em;max-width:9em;object-fit:contain;
    filter:drop-shadow(0 .2em .6em rgba(0,0,0,.6));}

  .banner{position:absolute;left:50%;bottom:7.4em;transform:translateX(-50%);
    background:linear-gradient(180deg,rgba(23,27,40,.97),rgba(15,19,31,.97));
    border-radius:.4em;border-left:.2em solid var(--lime);padding:.7em 1.8em;
    text-align:center;box-shadow:0 1em 3em rgba(0,0,0,.6);display:none;}
  .banner.show{display:block;animation:fadeIn .5s;}
  .banner .bk{font-size:.66em;letter-spacing:.28em;color:var(--lime);font-weight:800;}
  .banner .bv{font-size:1.25em;font-weight:900;color:var(--text);margin-top:.2em;}

  .offline{position:absolute;right:1.6em;bottom:7.4em;font-size:.7em;font-weight:800;
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
  <div class="brand">LOCAL LEGENDS</div>
  <div class="sponsor" id="sponsor"><img id="sponsorImg" alt=""></div>

  <div class="burst" id="burst"><span class="word" id="burstWord"></span></div>
  <div class="banner" id="banner"><div class="bk" id="bannerK"></div><div class="bv" id="bannerV"></div></div>
  <div class="offline" id="offline">NO SIGNAL</div>

  <div class="dock" id="dock">
    <div class="bar">
      <div class="livebadge"><span class="dot"></span></div>

      <div class="teamblock">
        <div class="cell">
          <div class="big" id="batTeam">—</div>
          <div class="sub" id="vsTeam">—</div>
        </div>
        <div class="cell num">
          <div class="big score" id="runs">0-0</div>
          <div class="sub"><span class="k">OVR</span> <span id="overs">0.0</span></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-inner">
          <span class="pl" id="p1"><svg class="bat" viewBox="0 0 24 24"><path d="M16.1 2.4a2.6 2.6 0 0 1 3.7 3.7l-1.6 1.6-3.7-3.7 1.6-1.6Z"/><path d="M13.2 5.3l3.7 3.7-8.1 8.1a3.4 3.4 0 0 1-1.6.9l-3.6.8.8-3.6a3.4 3.4 0 0 1 .9-1.6l7.9-8.3Z"/></svg><span class="nm">—</span><span class="r"></span><span class="b"></span></span>
          <span class="pl" id="p2"><svg class="bat" viewBox="0 0 24 24"><path d="M16.1 2.4a2.6 2.6 0 0 1 3.7 3.7l-1.6 1.6-3.7-3.7 1.6-1.6Z"/><path d="M13.2 5.3l3.7 3.7-8.1 8.1a3.4 3.4 0 0 1-1.6.9l-3.6.8.8-3.6a3.4 3.4 0 0 1 .9-1.6l7.9-8.3Z"/></svg><span class="nm">—</span><span class="r"></span><span class="b"></span></span>
          <span class="pl bowl" id="p3"><span class="nm">—</span><span class="r"></span><span class="b"></span></span>
          <span class="tracker" id="tracker"></span>
        </div>
      </div>
    </div>

    <div class="chase" id="chaseRow"></div>
  </div>
</div>

<script>
(function(){
  var STATE_URL = ${JSON.stringify(stateUrl)};
  var $ = function(id){ return document.getElementById(id); };
  var lastSig = null, misses = 0;
  var MAX_TRACKER = 9;              // 6 legal + a few extras before we trim

  // Sponsor/tournament art is passed on the URL so an operator can rebrand the
  // overlay per tournament without a redeploy: &sponsor=<url>
  var params = new URLSearchParams(location.search);
  var sponsorUrl = params.get('sponsor');
  if (sponsorUrl) { $('sponsorImg').src = sponsorUrl; $('sponsor').style.display = 'flex'; }

  function ballClass(b){
    if (b.isWicket) return 't w';
    if (b.runs === 4) return 't four';
    if (b.runs === 6) return 't six';
    if (b.extraType) return 't ex';
    return 't on';
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

  function batter(el, card, onStrike){
    if (!card || !card.name) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.className = 'pl';
    el.querySelector('.bat').style.display = onStrike ? 'inline' : 'none';
    el.querySelector('.nm').textContent = card.name;
    el.querySelector('.r').textContent = card.runs;
    el.querySelector('.b').textContent = card.balls;
  }

  function bowler(el, card){
    if (!card || !card.name) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.querySelector('.nm').textContent = card.name;
    // Broadcast writes bowling figures wickets-runs, and the overs after.
    el.querySelector('.r').textContent = card.wickets + '-' + card.runs;
    el.querySelector('.b').textContent = card.overs;
  }

  function render(s){
    var L = s.live;
    if (!L) return;

    $('batTeam').textContent = L.battingTeam.shortName || L.battingTeam.name;
    $('vsTeam').textContent = 'V ' + (L.bowlingTeam.name || L.bowlingTeam.shortName || '');
    // Broadcast convention writes a cricket score with a hyphen, not a slash.
    $('runs').textContent = L.runs + '-' + L.wickets;
    $('overs').textContent = L.overs + (L.maxOvers ? '/' + L.maxOvers : '');

    batter($('p1'), L.striker, true);
    batter($('p2'), L.nonStriker, false);
    bowler($('p3'), L.bowler);

    // Six legal slots, plus a circle for every extra delivery — an over with
    // wides genuinely is longer than six balls, and the tracker should say so.
    //
    // Capped, though, and trimmed from the oldest: this is amateur cricket,
    // where a nine-wide over is a real Sunday afternoon, and an uncapped
    // tracker would push the batters off the panel.
    var tr = $('tracker');
    tr.innerHTML = '';
    var over = (L.thisOver || []).slice(-MAX_TRACKER);
    over.forEach(function(b){
      var d = document.createElement('span');
      d.className = ballClass(b); d.textContent = ballText(b);
      tr.appendChild(d);
    });
    var legal = over.filter(function(b){
      return ['wide','noBall','penalty','retired','deadBall'].indexOf(b.extraType) === -1;
    }).length;
    for (var i = legal; i < 6 && over.length + (i - legal) < MAX_TRACKER; i++) {
      var e = document.createElement('span');
      e.className = 't'; tr.appendChild(e);
    }

    // The chase equation gets its own line, and only exists in a chase.
    var cr = $('chaseRow');
    if (L.required != null && L.required > 0 && L.ballsRemaining) {
      cr.innerHTML = 'NEED <b>' + L.required + '</b> RUNS IN <b>' + L.ballsRemaining +
        '</b> BALLS AT <b>' + (L.requiredRunRate != null ? L.requiredRunRate.toFixed(2) : '—') + '</b> RPO';
      cr.className = 'chase show';
    } else {
      cr.className = 'chase';
    }

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
        // A revoked session blanks the bug rather than freezing on a stale
        // score — a scorebug still showing 153-4 after being pulled is worse
        // than no scorebug.
        if (String(e.message) === 'revoked') { $('dock').style.display = 'none'; return; }
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
