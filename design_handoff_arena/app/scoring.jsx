// scoring.jsx — Cricket live-scoring screen (slides up after Cricket select)
// + a lightweight "season soon" sheet for the other disciplines.

const { useState, useRef } = React;
const { ARENA, SportIcon } = window;

function CricketScoring({ onBack }) {
  const [runs, setRuns] = useState(142);
  const [wkts, setWkts] = useState(4);
  const [balls, setBalls] = useState(98);          // 16.2 overs
  const [over, setOver] = useState(['1', '4', '·', 'W']);
  const [striker, setStriker] = useState({ runs: 58, balls: 45, on: true });
  const [nonstr, setNonstr] = useState({ runs: 21, balls: 19, on: false });
  const [flash, setFlash] = useState(null);

  const oversStr = Math.floor(balls / 6) + '.' + (balls % 6);
  const crr = (runs / (balls / 6)).toFixed(2);

  const pushBall = (label, run, isWk, legal = true) => {
    setFlash(label);
    setTimeout(() => setFlash(null), 280);
    setRuns((r) => r + run);
    if (isWk) setWkts((w) => Math.min(10, w + 1));
    setStriker((s) => ({ ...s, runs: s.runs + (legal ? run : 0), balls: s.balls + (legal ? 1 : 0) }));
    if (legal) {
      setBalls((b) => {
        const nb = b + 1;
        if (nb % 6 === 0) setOver([]); // new over
        return nb;
      });
      setOver((o) => (o.length >= 6 ? [label] : [...o, label]));
      if (run % 2 === 1) { // rotate strike
        setStriker((s) => ({ ...nonstr, on: true }));
        setNonstr((n) => ({ ...striker, on: false }));
      }
    } else {
      setOver((o) => [...o, label]);
    }
  };

  const Btn = ({ label, run = 0, wk = false, legal = true, big = false, danger = false }) => (
    <button onClick={() => pushBall(label, run, wk, legal)}
      style={{
        flex: big ? '1 1 0' : '0 0 auto', minWidth: big ? 0 : 52, height: 52,
        border: 'none', borderRadius: 14, cursor: 'pointer',
        background: danger ? 'rgba(255,90,90,0.14)' : run >= 4 ? ARENA.lime : ARENA.cellHi,
        color: danger ? '#ff7a7a' : run >= 4 ? ARENA.navy0 : ARENA.ink,
        fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 0.5,
        boxShadow: run >= 4 ? '0 6px 18px rgba(196,248,42,0.3)' : 'none',
        transition: 'transform .1s', userSelect: 'none',
      }}
      onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
      {label}
    </button>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, background: ARENA.navy1, display: 'flex', flexDirection: 'column', fontFamily: 'Archivo, sans-serif', animation: 'sheetUp .42s cubic-bezier(.2,.8,.2,1)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 10px' }}>
        <button onClick={onBack} style={{ background: ARENA.cell, border: 'none', width: 38, height: 38, borderRadius: 12, color: ARENA.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3 5 9l6 6" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ARENA.lime }}><SportIcon id="cricket" size={22} /></span>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, color: ARENA.ink, letterSpacing: 0.6 }}>CRICKET</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,90,90,0.14)', padding: '5px 10px', borderRadius: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: '#ff5a5a', animation: 'livePulse 1.4s infinite' }}></span>
          <span style={{ color: '#ff7a7a', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>LIVE</span>
        </div>
      </div>

      {/* big score */}
      <div style={{ padding: '6px 22px 16px' }}>
        <div style={{ fontSize: 12, color: ARENA.inkDim, letterSpacing: 1.5, fontWeight: 700 }}>RAJASTHAN ROYALS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 2, flexWrap: 'nowrap' }}>
          <div style={{ flex: '0 0 auto', fontFamily: 'Anton, sans-serif', fontSize: 56, lineHeight: 0.92, color: ARENA.ink, position: 'relative' }}>
            {runs}<span style={{ color: ARENA.lime }}>-{wkts}</span>
            {flash && <span style={{ position: 'absolute', left: '100%', bottom: 14, marginLeft: 10, color: ARENA.lime, fontSize: 26, animation: 'flashUp .45s ease-out forwards' }}>+{flash}</span>}
          </div>
          <div style={{ flex: '0 0 auto', paddingBottom: 7 }}>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 22, color: ARENA.ink }}>{oversStr}<span style={{ fontSize: 13, color: ARENA.inkDim }}> ov</span></div>
            <div style={{ fontSize: 12, color: ARENA.inkDim, marginTop: 2 }}>CRR <span style={{ color: ARENA.lime, fontWeight: 700 }}>{crr}</span></div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: ARENA.inkDim, marginTop: 8 }}>Need 47 off 22 · Target 189</div>
      </div>

      {/* this over */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 22px 14px' }}>
        <span style={{ fontSize: 11, color: ARENA.inkDim, letterSpacing: 1, fontWeight: 700 }}>THIS OVER</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {over.map((b, i) => {
            const four = b === '4' || b === '6';
            const w = b === 'W';
            return (
              <span key={i} style={{ width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: w ? '#ff5a5a' : four ? ARENA.lime : ARENA.cellHi, color: (w || four) ? ARENA.navy0 : ARENA.ink }}>{b}</span>
            );
          })}
        </div>
      </div>

      {/* batters */}
      <div style={{ margin: '0 18px', background: ARENA.cell, borderRadius: 18, padding: '4px 4px' }}>
        {[striker, nonstr].map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: b.on ? ARENA.lime : 'transparent', border: b.on ? 'none' : '1px solid ' + ARENA.inkDim, marginRight: 12 }}></span>
            <span style={{ color: ARENA.ink, fontWeight: 600, fontSize: 15 }}>{i === 0 ? 'V. Sharma' : 'R. Patel'}{b.on && <span style={{ color: ARENA.lime }}> *</span>}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'Anton, sans-serif', fontSize: 20, color: ARENA.ink }}>{b.runs}</span>
            <span style={{ color: ARENA.inkDim, fontSize: 12, marginLeft: 6, marginBottom: -3 }}>({b.balls})</span>
          </div>
        ))}
      </div>

      {/* scoring pad */}
      <div style={{ marginTop: 'auto', padding: '16px 18px calc(18px + env(safe-area-inset-bottom))', background: ARENA.navy2, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {['0', '1', '2', '3'].map((n) => <Btn key={n} label={n} run={+n} big />)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn label="4" run={4} big />
          <Btn label="6" run={6} big />
          <Btn label="WD" run={1} legal={false} />
          <Btn label="W" wk danger />
        </div>
      </div>
    </div>
  );
}

function ComingSoonSheet({ sport, onBack }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,10,18,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', animation: 'fadeIn .25s ease', zIndex: 50 }} onClick={onBack}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: ARENA.navy2, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: '10px 22px calc(26px + env(safe-area-inset-bottom))', animation: 'sheetUp .4s cubic-bezier(.2,.8,.2,1)', fontFamily: 'Archivo, sans-serif' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '6px auto 18px' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: ARENA.cellHi, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ARENA.lime }}>
            <SportIcon id={sport.id} size={30} />
          </div>
          <div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 26, color: ARENA.ink, letterSpacing: 0.5 }}>{sport.name.toUpperCase()}</div>
            <div style={{ color: ARENA.inkDim, fontSize: 13 }}>{sport.tag} · scoring rolls out this season</div>
          </div>
        </div>
        <button onClick={onBack} style={{ width: '100%', marginTop: 20, height: 52, borderRadius: 16, border: 'none', background: ARENA.lime, color: ARENA.navy0, fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 0.8, cursor: 'pointer' }}>
          NOTIFY ME
        </button>
        <button onClick={onBack} style={{ width: '100%', marginTop: 8, height: 44, borderRadius: 16, border: 'none', background: 'transparent', color: ARENA.inkDim, fontFamily: 'Archivo, sans-serif', fontSize: 14, cursor: 'pointer' }}>
          Pick another arena
        </button>
      </div>
    </div>
  );
}

// ── Pool Rummy (201) score card ──────────────────────────────────────
function RummyScorecard({ onBack }) {
  const POOL = 201;
  const PLAYERS = ['Aarav', 'Diya', 'Kabir', 'Meera'];
  const INITIAL = [
    [0, 24, 41, 18],
    [33, 0, 27, 12],
    [19, 46, 0, 40],
    [0, 38, 22, 51],
  ];
  const [deals, setDeals] = useState(INITIAL);
  const scriptRef = useRef([
    [29, 0, 15, 44],
    [0, 53, 31, 20],
    [42, 18, 0, 37],
    [25, 0, 48, 19],
  ]);

  const totals = PLAYERS.map((_, p) => deals.reduce((s, d) => s + d[p], 0));
  const live = totals.map((t) => t <= POOL);
  const liveCount = live.filter(Boolean).length;
  const leaderIdx = totals.indexOf(Math.min(...totals));

  const addDeal = () => {
    setDeals((d) => {
      const tot = PLAYERS.map((_, p) => d.reduce((s, row) => s + row[p], 0));
      const liveNow = tot.map((t) => t <= POOL);
      if (liveNow.filter(Boolean).length <= 1) return d;          // game already decided
      const base = scriptRef.current[d.length % scriptRef.current.length];
      return [...d, base.map((v, p) => (liveNow[p] ? v : 0))];     // eliminated players score 0
    });
  };
  const reset = () => setDeals(INITIAL);

  return (
    <div style={{ position: 'absolute', inset: 0, background: ARENA.navy1, display: 'flex', flexDirection: 'column', fontFamily: 'Archivo, sans-serif', animation: 'sheetUp .42s cubic-bezier(.2,.8,.2,1)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 10px' }}>
        <button onClick={onBack} style={{ background: ARENA.cell, border: 'none', width: 38, height: 38, borderRadius: 12, color: ARENA.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3 5 9l6 6" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ARENA.lime }}><SportIcon id="rummy" size={22} /></span>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, color: ARENA.ink, letterSpacing: 0.6 }}>RUMMY</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: ARENA.cellHi, padding: '5px 11px', borderRadius: 20 }}>
          <span style={{ color: ARENA.lime, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>POOL · {POOL}</span>
        </div>
      </div>

      {/* player standings */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px' }}>
        {PLAYERS.map((name, p) => {
          const out = !live[p];
          const lead = p === leaderIdx && live[p];
          const pct = Math.min(100, (totals[p] / POOL) * 100);
          const barColor = out ? '#ff5a5a' : pct > 75 ? '#ffb24a' : ARENA.lime;
          return (
            <div key={p} style={{ flex: '1 1 0', background: out ? 'rgba(255,90,90,0.08)' : lead ? 'rgba(196,248,42,0.1)' : ARENA.cell, border: '1px solid ' + (lead ? 'rgba(196,248,42,0.4)' : out ? 'rgba(255,90,90,0.25)' : ARENA.line), borderRadius: 14, padding: '9px 6px 8px', textAlign: 'center', position: 'relative', opacity: out ? 0.75 : 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', margin: '0 auto', background: lead ? ARENA.lime : ARENA.cellHi, color: lead ? ARENA.navy0 : ARENA.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{name[0]}</div>
              <div style={{ fontSize: 10.5, color: ARENA.inkDim, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 21, color: out ? '#ff7a7a' : lead ? ARENA.lime : ARENA.ink, lineHeight: 1, marginTop: 2 }}>{totals[p]}</div>
              {/* progress to pool limit */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 7, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 2, transition: 'width .3s' }}></div>
              </div>
              <div style={{ fontSize: 8.5, color: out ? '#ff7a7a' : ARENA.inkDim, fontWeight: 800, letterSpacing: 0.5, marginTop: 4 }}>{out ? 'OUT' : (POOL - totals[p]) + ' LEFT'}</div>
              {lead && <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', background: ARENA.lime, color: ARENA.navy0, fontSize: 8, fontWeight: 800, letterSpacing: 0.8, padding: '1px 6px', borderRadius: 7 }}>LEAD</div>}
            </div>
          );
        })}
      </div>

      {/* deals table */}
      <div style={{ flex: '1 1 auto', minHeight: 0, margin: '0 16px', background: ARENA.cell, borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ width: 44, fontSize: 10, color: ARENA.inkDim, letterSpacing: 1, fontWeight: 800 }}>DEAL</span>
          {PLAYERS.map((n, p) => <span key={p} style={{ flex: '1 1 0', textAlign: 'center', fontSize: 10, color: ARENA.inkDim, letterSpacing: 0.5, fontWeight: 800 }}>{n[0]}</span>)}
        </div>
        <div style={{ flex: '1 1 auto', overflowY: 'auto', position: 'relative' }}>
          {/* card-suit watermark fills the empty space */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none', color: ARENA.inkDim, opacity: 0.13, fontSize: 30 }}>
            <span style={{ color: ARENA.ink }}>♠</span><span style={{ color: '#ff6b6b' }}>♥</span><span style={{ color: '#ff6b6b' }}>♦</span><span style={{ color: ARENA.ink }}>♣</span>
          </div>
          {deals.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ width: 44, fontFamily: 'Anton, sans-serif', fontSize: 15, color: ARENA.inkDim }}>{String(i + 1).padStart(2, '0')}</span>
              {d.map((v, p) => {
                const win = v === 0;
                return <span key={p} style={{ flex: '1 1 0', textAlign: 'center', fontFamily: 'Anton, sans-serif', fontSize: 17, color: win ? ARENA.lime : ARENA.ink }}>{win ? '—' : v}</span>;
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', background: ARENA.navy2 }}>
          <span style={{ width: 44, fontSize: 10, color: ARENA.inkDim, letterSpacing: 1, fontWeight: 800 }}>TOTAL</span>
          {totals.map((t, p) => <span key={p} style={{ flex: '1 1 0', textAlign: 'center', fontFamily: 'Anton, sans-serif', fontSize: 17, color: live[p] ? ARENA.lime : '#ff7a7a' }}>{t}</span>)}
        </div>
      </div>

      {/* footer */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <button onClick={reset} style={{ flex: '0 0 auto', width: 52, height: 52, borderRadius: 16, border: '1px solid ' + ARENA.line, background: ARENA.cell, color: ARENA.inkDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10a7 7 0 1 1 2 4.9" /><path d="M3 15v-4h4" /></svg>
        </button>
        <button onClick={addDeal} disabled={liveCount <= 1} style={{ flex: '1 1 auto', height: 52, borderRadius: 16, border: 'none', background: liveCount <= 1 ? ARENA.cellHi : ARENA.lime, color: liveCount <= 1 ? ARENA.inkDim : ARENA.navy0, fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 0.6, cursor: liveCount <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {liveCount <= 1
            ? <React.Fragment><span style={{ color: ARENA.lime }}>{PLAYERS[leaderIdx]} WINS</span> 🏆</React.Fragment>
            : <React.Fragment>+ NEW DEAL</React.Fragment>}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { CricketScoring, ComingSoonSheet, RummyScorecard });
