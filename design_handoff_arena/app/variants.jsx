// variants.jsx — four picker treatments sharing the Honeycomb engine.
// V1 Classic · V2 Spotlight · V3 Pulse · V4 Pro

const { useState, useCallback } = React;
const { ARENA, SPORTS, SportIcon, Honeycomb, PhoneScreen, TopBar, ArenaTitle, CricketScoring, ComingSoonSheet, RummyScorecard, layoutHoney } = window;

const ICON = (c) => (c.featured ? 36 : 31);

// shared select → overlay handling
function useArena() {
  const [scoring, setScoring] = useState(null);   // 'cricket' | 'rummy' | null
  const [soon, setSoon] = useState(null);
  const onSelect = useCallback((cell) => {
    if (cell.id === 'cricket' || cell.id === 'rummy') setScoring(cell.id);
    else setSoon(cell);
  }, []);
  const overlay = scoring === 'cricket'
    ? <CricketScoring onBack={() => setScoring(null)} />
    : scoring === 'rummy'
      ? <RummyScorecard onBack={() => setScoring(null)} />
      : soon
        ? <ComingSoonSheet sport={soon} onBack={() => setSoon(null)} />
        : null;
  return { onSelect, overlay };
}

// ─────────────────────────── V1 · CLASSIC ───────────────────────────
function PickerClassic() {
  const { onSelect, overlay } = useArena();
  const render = (c, { focused }) => (
    <div style={{
      width: '100%', height: '100%', borderRadius: '50%',
      background: c.featured ? ARENA.cellHi : ARENA.cell,
      border: '1px solid ' + (focused ? ARENA.lime : ARENA.line),
      boxShadow: focused ? '0 0 0 3px rgba(196,248,42,0.16), 0 10px 26px rgba(0,0,0,0.45)' : '0 6px 16px rgba(0,0,0,0.32)',
      color: ARENA.lime, display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color .25s, box-shadow .25s, background .25s',
    }}>
      <SportIcon id={c.id} size={ICON(c)} />
    </div>
  );
  return (
    <PhoneScreen>
      <TopBar />
      <ArenaTitle />
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <Honeycomb cellSize={64} spacing={86} falloff={120} minScale={0.40} onSelect={onSelect} renderCell={render} />
      </div>
      {overlay}
    </PhoneScreen>
  );
}

// ─────────────────────────── V2 · SPOTLIGHT ─────────────────────────
function PickerSpotlight() {
  const { onSelect, overlay } = useArena();
  const [focus, setFocus] = useState(SPORTS[0]);
  const idx = SPORTS.findIndex((s) => s.id === focus.id);
  // Apple-Watch disc — uniform bubbles; focused one gets a tasteful lime lock-ring.
  const render = (c, { focused }) => (
    <div className={'disc' + (focused ? ' is-lock' : '')} style={{
      width: '100%', height: '100%', borderRadius: '50%', boxSizing: 'border-box',
      border: focused ? '2.5px solid rgba(196,248,42,0.95)' : '2.5px solid transparent',
      background: focused
        ? 'radial-gradient(circle at 50% 32%, #34465f, #1c2839)'
        : 'radial-gradient(circle at 50% 32%, #202a3d, #131b29)',
      boxShadow: focused
        ? '0 10px 22px rgba(0,0,0,0.55)'
        : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 16px rgba(0,0,0,0.5)',
      color: focused ? ARENA.lime : 'rgba(196,248,42,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'box-shadow .25s, background .25s, color .25s, border-color .25s',
    }}>
      <SportIcon id={c.id} size={ICON(c)} />
    </div>
  );
  return (
    <PhoneScreen bg={ARENA.navy0}>
      <TopBar />
      <ArenaTitle subtitle={false} compact />
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        {/* centre stage spotlight */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(34% 24% at 50% 50%, rgba(196,248,42,0.07), transparent 72%)', pointerEvents: 'none' }}></div>
        <Honeycomb cellSize={62} spacing={78} falloff={120} minScale={0.36} maxScale={1} onFocusChange={setFocus} onSelect={onSelect} renderCell={render} />
      </div>
      {/* readout */}
      <div style={{ flex: '0 0 auto', padding: '8px 16px 18px' }}>
        <div style={{ background: 'linear-gradient(180deg, ' + ARENA.cellHi + ', ' + ARENA.cell + ')', borderRadius: 22, padding: '12px 12px 12px 13px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid ' + ARENA.line, boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
          <div key={focus.id + '-i'} className="readout-swap" style={{ flex: '0 0 auto', width: 50, height: 50, borderRadius: 15, background: 'rgba(196,248,42,0.12)', border: '1px solid rgba(196,248,42,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ARENA.lime }}>
            <SportIcon id={focus.id} size={28} />
          </div>
          <div key={focus.id + '-t'} className="readout-swap" style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 10, color: ARENA.lime, letterSpacing: 1.4, fontWeight: 800, whiteSpace: 'nowrap' }}>{focus.tag.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: ARENA.inkDim, letterSpacing: 0.8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(idx + 1).padStart(2, '0')} / {SPORTS.length}</span>
            </div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: focus.name.length > 13 ? 17 : focus.name.length > 9 ? 20 : 24, color: ARENA.ink, letterSpacing: 0.4, lineHeight: 0.98, marginTop: 3, textWrap: 'balance' }}>{focus.name.toUpperCase()}</div>
          </div>
          <button onClick={() => onSelect(focus)} style={{ flex: '0 0 auto', height: 50, padding: '0 17px', borderRadius: 15, border: 'none', background: ARENA.lime, color: ARENA.navy0, fontFamily: 'Anton, sans-serif', fontSize: 15, letterSpacing: 0.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 8px 20px rgba(196,248,42,0.3)' }}>
            START
            <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor"><path d="M5 3.5v11l9-5.5z" /></svg>
          </button>
        </div>
      </div>
      {overlay}
    </PhoneScreen>
  );
}

// ─────────────────────────── V3 · PULSE ─────────────────────────────
function PickerPulse() {
  const { onSelect, overlay } = useArena();
  const [focus, setFocus] = useState(SPORTS[0]);
  const render = (c, { focused }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {c.featured && (
        <React.Fragment>
          <span className="pulse-ring" style={{ animationDelay: '0s' }}></span>
          <span className="pulse-ring" style={{ animationDelay: '1.1s' }}></span>
        </React.Fragment>
      )}
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: c.featured
          ? 'radial-gradient(circle at 50% 38%, rgba(196,248,42,0.30), ' + ARENA.cell + ' 70%)'
          : 'radial-gradient(circle at 50% 35%, rgba(196,248,42,0.10), ' + ARENA.cell + ' 72%)',
        border: '1px solid ' + (focused ? ARENA.lime : 'rgba(196,248,42,0.18)'),
        boxShadow: focused
          ? '0 0 22px rgba(196,248,42,0.5), inset 0 0 16px rgba(196,248,42,0.12)'
          : 'inset 0 0 10px rgba(196,248,42,0.05)',
        color: ARENA.lime, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'box-shadow .3s, border-color .3s', position: 'relative', zIndex: 1,
      }}>
        <SportIcon id={c.id} size={ICON(c)} />
      </div>
    </div>
  );
  return (
    <PhoneScreen bg={ARENA.navy0}>
      {/* lime vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 42% at 50% 60%, rgba(196,248,42,0.12), transparent 70%)', pointerEvents: 'none' }}></div>
      <TopBar />
      <ArenaTitle subtitle={false} />
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <Honeycomb cellSize={64} spacing={86} falloff={122} minScale={0.40} onFocusChange={setFocus} onSelect={onSelect} renderCell={render} />
        {/* glowing focus label */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', pointerEvents: 'none' }}>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 22, letterSpacing: 1.5, color: ARENA.lime, textShadow: '0 0 18px rgba(196,248,42,0.6)' }}>{focus.name.toUpperCase()}</span>
        </div>
      </div>
      {overlay}
    </PhoneScreen>
  );
}

// ─────────────────────────── V4 · PRO ───────────────────────────────
function PickerPro() {
  const { onSelect, overlay } = useArena();
  const [focus, setFocus] = useState(SPORTS[0]);
  const render = (c, { focused }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {c.featured && (
        <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: ARENA.lime, color: ARENA.navy0, fontFamily: 'Archivo, sans-serif', fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap', zIndex: 3 }}>FEATURED</div>
      )}
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: c.featured
          ? 'linear-gradient(160deg, #243425, ' + ARENA.cellHi + ')'
          : 'linear-gradient(160deg, ' + ARENA.cellHi + ', ' + ARENA.cell + ')',
        border: '1px solid ' + (focused ? ARENA.lime : 'rgba(255,255,255,0.07)'),
        boxShadow: focused
          ? '0 0 0 3px rgba(196,248,42,0.2), 0 14px 30px rgba(0,0,0,0.5)'
          : '0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        color: ARENA.lime, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color .25s, box-shadow .25s', position: 'relative',
      }}>
        <SportIcon id={c.id} size={ICON(c)} />
      </div>
    </div>
  );
  return (
    <PhoneScreen>
      <TopBar />
      <div style={{ padding: '12px 22px 6px', flex: '0 0 auto' }}>
        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 32, lineHeight: 1.0, color: ARENA.ink }}>CHOOSE YOUR <span style={{ color: ARENA.lime, fontStyle: 'italic' }}>ARENA</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: ARENA.cell, borderRadius: 13, padding: '9px 13px', border: '1px solid ' + ARENA.line }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={ARENA.inkDim} strokeWidth="1.8"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" strokeLinecap="round" /></svg>
          <span style={{ color: ARENA.inkDim, fontSize: 13 }}>Search 21 disciplines</span>
        </div>
      </div>
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <Honeycomb cellSize={64} spacing={88} falloff={124} minScale={0.42} onFocusChange={setFocus} onSelect={onSelect} renderCell={render} />
      </div>
      {/* focus chip */}
      <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', padding: '6px 0 16px' }}>
        <button onClick={() => onSelect(focus)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: ARENA.cell, border: '1px solid ' + ARENA.line, borderRadius: 30, padding: '8px 8px 8px 18px', cursor: 'pointer' }}>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, color: ARENA.ink, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{focus.name.toUpperCase()}</span>
          <span style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%', background: ARENA.lime, color: ARENA.navy0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8 3l5 5-5 5" /></svg>
          </span>
        </button>
      </div>
      {overlay}
    </PhoneScreen>
  );
}

const VARIANTS = [
  { id: 'classic', label: 'A · Classic', sub: 'Pure Apple-Watch honeycomb · icon-only', Comp: PickerClassic },
  { id: 'spotlight', label: 'B · Spotlight', sub: 'Snap-to-focus + readout + START', Comp: PickerSpotlight },
  { id: 'pulse', label: 'C · Pulse', sub: 'Neon energy · glowing focal Cricket', Comp: PickerPulse },
  { id: 'pro', label: 'D · Pro', sub: 'Depth glass · featured + search', Comp: PickerPro },
];

Object.assign(window, { useArena, PickerClassic, PickerSpotlight, PickerPulse, PickerPro, VARIANTS });
