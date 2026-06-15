// phone.jsx — Android-style screen shell + shared chrome bits.

const { ARENA } = window;

function StatusBar({ tone = '#eaf0fb' }) {
  return (
    <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', color: tone, flex: '0 0 auto' }}>
      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>9:28</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill={tone}><path d="M8 11.2 0.6 3.8a10.4 10.4 0 0 1 14.8 0L8 11.2Z" opacity="0.95" /></svg>
        {/* signal */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill={tone}><rect x="0" y="8" width="3" height="4" rx="0.6" /><rect x="4.3" y="6" width="3" height="6" rx="0.6" /><rect x="8.6" y="3.5" width="3" height="8.5" rx="0.6" /><rect x="12.9" y="1" width="3" height="11" rx="0.6" opacity="0.4" /></svg>
        {/* battery */}
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none"><rect x="0.6" y="0.6" width="18" height="10.8" rx="2.6" stroke={tone} strokeWidth="1.1" opacity="0.55" /><rect x="2.2" y="2.2" width="13" height="7.6" rx="1.4" fill={tone} /><rect x="20" y="3.6" width="1.6" height="4.8" rx="0.8" fill={tone} opacity="0.55" /></svg>
      </div>
    </div>
  );
}

function HomeIndicator({ tone = 'rgba(255,255,255,0.85)' }) {
  return (
    <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <div style={{ width: 128, height: 5, borderRadius: 3, background: tone }}></div>
    </div>
  );
}

function TopBar({ onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 18px 0', flex: '0 0 auto' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: ARENA.ink, cursor: 'pointer', padding: 6, marginLeft: -6, display: 'flex' }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4 7 11l7 7" /></svg>
      </button>
      <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 1, color: ARENA.ink, marginLeft: 8, whiteSpace: 'nowrap' }}>LOCAL LEGENDS</span>
      <div style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: '50%', background: ARENA.cellHi, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ARENA.inkDim }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="7" r="3.4" /><path d="M3.5 18a6.5 6.5 0 0 1 13 0Z" /></svg>
      </div>
    </div>
  );
}

// Title block — "CHOOSE YOUR ARENA" with the lime accent word.
function ArenaTitle({ subtitle = true, compact = false }) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? '8px 24px 6px' : '14px 24px 8px', flex: '0 0 auto' }}>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: compact ? 30 : 36, lineHeight: 0.92, color: ARENA.ink, letterSpacing: 0.5 }}>
        CHOOSE YOUR
      </div>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: compact ? 40 : 50, lineHeight: 0.9, color: ARENA.lime, letterSpacing: 1, fontStyle: 'italic' }}>
        ARENA
      </div>
      {subtitle && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12.5, color: ARENA.inkDim, marginTop: 8, lineHeight: 1.45, maxWidth: 240, marginInline: 'auto' }}>Pan the grid · tap a discipline to begin your ascent to legendary status.</div>}
    </div>
  );
}

// The device screen wrapper used inside every artboard.
function PhoneScreen({ children, bg = ARENA.navy1 }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Archivo, sans-serif', color: ARENA.ink }}>
      <StatusBar />
      <div style={{ position: 'relative', flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
      <HomeIndicator />
    </div>
  );
}

Object.assign(window, { StatusBar, HomeIndicator, TopBar, ArenaTitle, PhoneScreen });
