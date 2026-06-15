import { useState } from "react";
import {
  Home, Crosshair, User, Trophy, Award, Zap, BarChart2,
  MapPin, Users, QrCode, Share2, Image, MessageCircle,
  X, CheckCircle, ChevronDown, Shield, Activity,
  Target, Minus, Star, TrendingUp, Clock,
  Wifi, AlertTriangle, Navigation, Layers, RotateCcw,
  Flame, Camera, ScanLine, Medal, Radio
} from "lucide-react";

// ─── Custom Sport SVG Icons — zero emojis ──────────────────────────
const SportIcons = {
  archery: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>
      <line x1="21" y1="3" x2="12" y2="12"/><polyline points="14,3 21,3 21,10"/>
    </svg>
  ),
  badminton: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="21" x2="10" y2="14"/><path d="M10 14l2-2 5-1 1-5 2-2a5 5 0 01-7 7l-1 5-2 2z"/>
      <circle cx="20" cy="4" r="1.5" fill="currentColor"/>
    </svg>
  ),
  basketball: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M4.9 4.9c4.2 4.2 2.4 11.2-3 11.4"/><path d="M19.1 4.9c-4.2 4.2-2.4 11.2 3 11.4"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  billiards: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="14" r="4"/><circle cx="15" cy="9" r="4"/>
      <line x1="2" y1="22" x2="6" y2="18"/><line x1="10" y1="18" x2="22" y2="6"/>
    </svg>
  ),
  boxing: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 7h11a2 2 0 012 2v6a2 2 0 01-2 2h-11a2 2 0 01-2-2V9a2 2 0 012-2z"/>
      <path d="M10 7V5a2 2 0 114 0v2"/>
      <line x1="4.5" y1="17" x2="4.5" y2="20"/><line x1="19.5" y1="17" x2="19.5" y2="20"/>
    </svg>
  ),
  cricket: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="21" x2="9" y2="15"/><path d="M9 15l8.5-11.5a2.1 2.1 0 013 3L9 15z"/>
      <circle cx="19.5" cy="4.5" r="1.2" fill="currentColor"/>
    </svg>
  ),
  football: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 7l3 5-3 5-3-5 3-5z" fill="currentColor" opacity="0.25" stroke="none"/>
      <path d="M12 7l3 5m-3 5l3-5m-6 0l3 5m0-10l-3 5"/>
    </svg>
  ),
  golf: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="20"/><path d="M12 2l7 4.5-7 4.5V2z"/>
      <line x1="6" y1="20" x2="18" y2="20"/><circle cx="5" cy="20" r="1" fill="currentColor"/>
    </svg>
  ),
  handball: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="5"/>
      <path d="M5 13l-2 8h18l-2-8"/>
      <line x1="8.5" y1="13" x2="8" y2="21"/><line x1="15.5" y1="13" x2="16" y2="21"/>
    </svg>
  ),
  hockey: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18L8 5l5 9"/>
      <path d="M13 14c2.5 2.5 4.5 4 7 4s3-2.5 3-4-1-4-3-4-4.5 1.5-7 4z"/>
    </svg>
  ),
  judo: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="3" r="2"/><circle cx="15" cy="3" r="2"/>
      <path d="M9 5v5l-4 5 5 5"/><path d="M15 5v5l4 5-5 5"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  ),
  kabaddi: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="3" r="2"/>
      <path d="M12 5v7l5 4-2 5"/><path d="M12 12l-5 4 2 5"/>
      <line x1="4" y1="10" x2="20" y2="10"/>
    </svg>
  ),
  karate: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="3" r="2"/>
      <line x1="12" y1="5" x2="12" y2="11"/>
      <line x1="7" y1="8" x2="17" y2="8"/>
      <path d="M12 11l5 4-2 6H9l-2-6 5-4z"/>
    </svg>
  ),
  khokho: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/>
      <path d="M7 6v6l5 4 5-4V6"/>
      <path d="M5 15l2 7"/><path d="M19 15l-2 7"/>
      <line x1="3" y1="22" x2="21" y2="22"/>
    </svg>
  ),
  pickleball: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="21" x2="8" y2="16"/>
      <ellipse cx="13.5" cy="10.5" rx="5" ry="7" transform="rotate(-45 13.5 10.5)"/>
      <circle cx="13.5" cy="10.5" r="2"/><circle cx="19" cy="5" r="2.5"/>
    </svg>
  ),
  snowboarding: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="3" r="2"/>
      <path d="M15 5l-5 6 3 1 2-3 2 3 3-1-5-6z"/>
      <path d="M3 19h18"/><path d="M5 19l3-6h8l3 6"/>
    </svg>
  ),
  squash: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="18" height="15" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/><line x1="12" y1="2" x2="12" y2="17"/>
      <path d="M7 20h10"/><path d="M9 17v3"/><path d="M15 17v3"/>
      <circle cx="18" cy="20" r="2"/>
    </svg>
  ),
  tabletennis: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="22" x2="8" y2="16"/>
      <ellipse cx="14" cy="10" rx="6.5" ry="4.5" transform="rotate(-35 14 10)"/>
      <circle cx="20" cy="4" r="2.5"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  tennis: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a15 15 0 014 10 15 15 0 01-4 10"/>
      <path d="M12 2a15 15 0 00-4 10 15 15 0 004 10"/>
    </svg>
  ),
  volleyball: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2c3 4 3 16 0 20"/><path d="M12 2c-3 4-3 16 0 20"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  wrestling: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="3" r="2"/><circle cx="17" cy="3" r="2"/>
      <path d="M7 5l3 5-5 5 6 6"/><path d="M17 5l-3 5 5 5-6 6"/>
      <line x1="10" y1="10" x2="14" y2="10"/>
    </svg>
  ),
};

function SportSVG({ id, size = 20, color = "currentColor" }) {
  const Icon = SportIcons[id];
  if (!Icon) return <Target width={size} height={size} color={color} />;
  return <Icon width={size} height={size} style={{ color, display: "block" }} />;
}

// ─── Data ─────────────────────────────────────────────────────────────
const SPORTS = [
  { id: "archery",      name: "Archery & Shooting", color: "#6b3a2a", colorLight: "#f5ede9" },
  { id: "badminton",    name: "Badminton",           color: "#0d7c8f", colorLight: "#e3f6f9" },
  { id: "basketball",   name: "Basketball",          color: "#c2490d", colorLight: "#fdf0ea" },
  { id: "billiards",    name: "Bowling & Billiards", color: "#1e4d2b", colorLight: "#e8f5ec" },
  { id: "boxing",       name: "Boxing",              color: "#b91c1c", colorLight: "#fdeaea" },
  { id: "cricket",      name: "Cricket",             color: "#2d7a3a", colorLight: "#eaf5ec" },
  { id: "football",     name: "Football",            color: "#1a5fa8", colorLight: "#e8f0fb" },
  { id: "golf",         name: "Golf",                color: "#3a6b1a", colorLight: "#edf5e6" },
  { id: "handball",     name: "Handball",            color: "#b54d9e", colorLight: "#faedf8" },
  { id: "hockey",       name: "Hockey",              color: "#1a6b8a", colorLight: "#e3f4f9" },
  { id: "judo",         name: "Judo",                color: "#3b2f6e", colorLight: "#edeaf9" },
  { id: "kabaddi",      name: "Kabaddi",             color: "#b45309", colorLight: "#fef3e2" },
  { id: "karate",       name: "Karate",              color: "#7c1d1d", colorLight: "#fdeaea" },
  { id: "khokho",       name: "Kho-Kho",             color: "#a16207", colorLight: "#fefce8" },
  { id: "pickleball",   name: "Pickleball",          color: "#0f766e", colorLight: "#e6f7f6" },
  { id: "snowboarding", name: "Snowboarding",        color: "#1e40af", colorLight: "#eff6ff" },
  { id: "squash",       name: "Squash",              color: "#92400e", colorLight: "#fef3e2" },
  { id: "tabletennis",  name: "Table Tennis",        color: "#0e7490", colorLight: "#e0f6fa" },
  { id: "tennis",       name: "Tennis",              color: "#4d7c0f", colorLight: "#f1f8e6" },
  { id: "volleyball",   name: "Volleyball",          color: "#7c3aed", colorLight: "#f3eeff" },
  { id: "wrestling",    name: "Wrestling",           color: "#7f1d1d", colorLight: "#fef2f2" },
];

const PLAYERS = [
  { id: 1, name: "Suresh K.", initials: "SK", runs: 312, matches: 18, motm: 4, sr: 138.2, rank: 1 },
  { id: 2, name: "Arun M.",   initials: "AM", runs: 278, matches: 16, motm: 3, sr: 122.6, rank: 2 },
  { id: 3, name: "Priya R.",  initials: "PR", runs: 241, matches: 14, motm: 5, sr: 141.8, rank: 3 },
];

export default function LocalLegends() {
  const [sport, setSport]                     = useState(SPORTS[5]);
  const [screen, setScreen]                   = useState("feed");
  const [showSportPicker, setShowSportPicker] = useState(false);
  const [guestMode, setGuestMode]             = useState(false);
  const [showGuestQR, setShowGuestQR]         = useState(false);
  const [showShare, setShowShare]             = useState(false);
  const [sharedMilestone, setSharedMilestone] = useState("");
  const [runs, setRuns]                       = useState(65);
  const [wickets, setWickets]                 = useState(4);
  const [balls, setBalls]                     = useState(50);
  const [activePlayer, setActivePlayer]       = useState(PLAYERS[0]);

  const overs      = `${Math.floor(balls / 6)}.${balls % 6}`;
  const sportColor = sport.color;
  const sportLight = sport.colorLight;
  const need       = Math.max(0, 94 - runs);
  const ballsLeft  = Math.max(1, 72 - balls);
  const rrr        = ((need * 6) / ballsLeft).toFixed(1);

  function addRun(n) {
    const nr = runs + n;
    setRuns(nr); setBalls(b => b + 1);
    if (nr === 50 || nr === 100) {
      setSharedMilestone(`${activePlayer.name} just hit a ${nr === 50 ? "half-century" : "century"}! Amazing innings!`);
      setShowShare(true);
    }
  }
  function addWicket() { if (wickets < 10) { setWickets(w => w + 1); setBalls(b => b + 1); } }
  function addExtra()  { setRuns(r => r + 1); }

  const scoreBtn = (bg, border, col, full) => ({
    background: bg, border, borderRadius: 16, minHeight: 72,
    width: full ? "100%" : undefined, fontSize: 17, fontWeight: 800,
    color: col, cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, padding: "0 6px",
  });

  const tabs = [
    { id: "feed",    label: "Feed",    Icon: Home      },
    { id: "score",   label: "Score",   Icon: Crosshair },
    { id: "profile", label: "Profile", Icon: User      },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#f7f8f3", paddingBottom: 80 }}>

      {/* ══ HEADER ══ */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8ebe0", padding: "13px 18px 11px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: sportColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: -0.5 }}>Local</span>
          <span style={{ fontSize: 20, fontWeight: 800, background: sportColor, color: "#fff", borderRadius: 8, padding: "1px 9px" }}>Legends</span>
        </div>
        <button onClick={() => setShowSportPicker(p => !p)} style={{ display: "flex", alignItems: "center", gap: 6, background: sportLight, border: `1.5px solid ${sportColor}33`, borderRadius: 12, padding: "7px 11px", fontSize: 13, fontWeight: 700, color: sportColor, cursor: "pointer" }}>
          <SportSVG id={sport.id} size={17} color={sportColor} />
          <span style={{ maxWidth: 82, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sport.name}</span>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* ══ SPORT PICKER SHEET ══ */}
      {showSportPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 250 }} onClick={() => setShowSportPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: "#fff", borderRadius: "22px 22px 0 0", maxHeight: "78vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={17} color="#555" />
                <span style={{ fontWeight: 800, fontSize: 17 }}>Choose Sport</span>
              </div>
              <button onClick={() => setShowSportPicker(false)} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={15} color="#444" />
              </button>
            </div>
            <div style={{ overflowY: "auto" }}>
              {SPORTS.map(s => (
                <button key={s.id} onClick={() => { setSport(s); setShowSportPicker(false); }} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "12px 20px", border: "none", background: sport.id === s.id ? s.colorLight : "#fff", cursor: "pointer", textAlign: "left", borderLeft: sport.id === s.id ? `3px solid ${s.color}` : "3px solid transparent" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: sport.id === s.id ? s.color : "#f2f2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <SportSVG id={s.id} size={19} color={sport.id === s.id ? "#fff" : "#777"} />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: sport.id === s.id ? 700 : 500, color: sport.id === s.id ? s.color : "#1a1a1a", flex: 1 }}>{s.name}</span>
                  {sport.id === s.id && <CheckCircle size={16} color={s.color} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ GUEST BANNER ══ */}
      {guestMode && (
        <div style={{ background: "#fef3c7", borderBottom: "1px solid #fbbf24", padding: "9px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ScanLine size={15} color="#92400e" />
            <span style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>Guest Umpire Mode — Suresh's match</span>
          </div>
          <button onClick={() => setGuestMode(false)} style={{ fontSize: 12, color: "#92400e", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Exit</button>
        </div>
      )}

      {/* ══════════════════════════
          FEED
      ══════════════════════════ */}
      {screen === "feed" && (
        <div style={{ padding: "16px 16px 0" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Radio size={12} color="#888" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Live Near You</span>
          </div>

          {/* Live Match Card */}
          <div style={{ background: "#fff", borderRadius: 20, border: `2px solid ${sportColor}33`, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: sportColor, padding: "8px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#e53e3e", borderRadius: 5, padding: "2px 7px" }}>
                  <Wifi size={10} color="#fff" />
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>LIVE</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={12} color="rgba(255,255,255,0.85)" />
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Kalakshetra Ground</span>
                </div>
              </div>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>2nd Innings</span>
            </div>

            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>Marina Blasters</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Activity size={12} color="#888" />
                    <span style={{ fontSize: 13, color: "#666" }}>batting</span>
                  </div>
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: sportColor, letterSpacing: -1 }}>{runs}/{wickets}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <Shield size={13} color="#aaa" />
                <span style={{ fontSize: 14, color: "#555" }}>vs <strong>City Strikers</strong> · Target: 94</span>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Overs", value: overs, Icon: Clock,      col: sportColor },
                  { label: "Need",  value: need,  Icon: Target,     col: "#c0392b"  },
                  { label: "RRR",   value: rrr,   Icon: TrendingUp, col: "#111"     },
                ].map(({ label, value, Icon, col }) => (
                  <div key={label} style={{ background: sportLight, borderRadius: 10, padding: "7px 8px", flex: 1, textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 2 }}>
                      <Icon size={11} color="#777" />
                      <span style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: col }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setScreen("score")} style={{ flex: 1, background: sportColor, color: "#fff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <Crosshair size={17} color="#fff" /> Score Live
                </button>
                <button onClick={() => { setSharedMilestone(`${runs}/${wickets} in ${overs} Ov — Marina Blasters vs City Strikers`); setShowShare(true); }} style={{ flex: 1, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <MessageCircle size={17} color="#fff" /> WhatsApp
                </button>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Trophy size={12} color="#888" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Colony Cup 2025</span>
          </div>
          <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
            {[
              { team: "Marina Blasters", p: 4, w: 3, pts: 6 },
              { team: "City Strikers",   p: 4, w: 2, pts: 4 },
              { team: "Beach Boys XI",   p: 3, w: 1, pts: 2 },
            ].map((t, i) => (
              <div key={t.team} style={{ display: "flex", alignItems: "center", padding: "13px 18px", borderBottom: i < 2 ? "1px solid #f0f0f0" : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? "#fef3c7" : "#f5f5f5", marginRight: 12, flexShrink: 0 }}>
                  {i === 0 ? <Medal size={14} color="#92400e" /> : <span style={{ fontSize: 13, fontWeight: 700, color: "#999" }}>{i + 1}</span>}
                </div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{t.team}</span>
                <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#777" }}>
                  <span>{t.p}P</span><span>{t.w}W</span>
                  <span style={{ color: sportColor, fontWeight: 700 }}>{t.pts}pts</span>
                </div>
              </div>
            ))}
          </div>

          {/* Guest Umpire */}
          <div style={{ background: "#fffbea", border: "1.5px dashed #f59e0b", borderRadius: 16, padding: "15px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <QrCode size={15} color="#92400e" />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>Join as Guest Umpire</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <ScanLine size={12} color="#888" />
                <span style={{ fontSize: 13, color: "#666" }}>Scan QR from captain's phone</span>
              </div>
            </div>
            <button onClick={() => setShowGuestQR(true)} style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 12, padding: "11px 15px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Camera size={15} color="#fff" /> Scan QR
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════
          SCORE SCREEN
      ══════════════════════════ */}
      {screen === "score" && (
        <div style={{ padding: "16px" }}>

          {/* Hero */}
          <div style={{ background: sportColor, borderRadius: 20, padding: "20px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Activity size={13} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Marina Blasters · Batting</span>
            </div>
            <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: -2, color: "#fff", lineHeight: 1 }}>
              {runs}<span style={{ fontSize: 26, opacity: 0.65 }}>/{wickets}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Clock size={13} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>{overs} Overs · Need {need} off {ballsLeft} balls</span>
            </div>
          </div>

          {/* Batsman Selector */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "13px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
              <User size={12} color="#888" />
              <span style={{ fontSize: 12, color: "#888", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>On Strike</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {PLAYERS.slice(0, 2).map((p, i) => (
                <button key={p.id} onClick={() => setActivePlayer(p)} style={{ flex: 1, background: activePlayer.id === p.id ? sportLight : "#f5f5f5", border: activePlayer.id === p.id ? `2px solid ${sportColor}` : "2px solid transparent", borderRadius: 12, padding: "11px 10px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{p.name}</span>
                    {i === 0 && <Crosshair size={12} color={sportColor} />}
                  </div>
                  <div style={{ fontSize: 12, color: sportColor, fontWeight: 600 }}>{p.runs % 50} runs · {p.sr.toFixed(0)} SR</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Target size={12} color="#888" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Tap to Score</span>
          </div>

          {/* +1 to +4 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => addRun(n)} style={scoreBtn("#fff", `2px solid ${sportColor}44`, sportColor)}>+{n}</button>
            ))}
          </div>

          {/* 6, Wide, Dot */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <button onClick={() => addRun(6)} style={scoreBtn(sportColor, "none", "#fff")}>
              <Star size={18} color="#fff" strokeWidth={2.5} /> 6
            </button>
            <button onClick={addExtra} style={scoreBtn("#fff", "2px solid #f59e0b", "#92400e")}>
              <AlertTriangle size={16} color="#f59e0b" /> Wide
            </button>
            <button onClick={() => addRun(0)} style={scoreBtn("#f0f0f0", "2px solid #ddd", "#888")}>
              <Minus size={18} color="#888" /> Dot
            </button>
          </div>

          {/* Wicket */}
          <button onClick={addWicket} style={{ ...scoreBtn("#c0392b", "none", "#fff", true), marginBottom: 10, boxShadow: "0 4px 18px rgba(192,57,43,0.28)" }}>
            <Shield size={22} color="#fff" strokeWidth={2.5} /> WICKET
          </button>

          {/* Undo */}
          <button style={{ width: "100%", background: "#f0f0f0", border: "2px solid #e0e0e0", borderRadius: 16, padding: "14px 0", fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
            <RotateCcw size={16} color="#888" /> Undo Last Ball
          </button>

          {/* Share */}
          <button onClick={() => { setSharedMilestone(`${runs}/${wickets} in ${overs} — Marina vs City Strikers`); setShowShare(true); }} style={{ width: "100%", background: "#25D366", border: "none", borderRadius: 16, padding: "16px 0", fontSize: 16, fontWeight: 700, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MessageCircle size={18} color="#fff" /> Share Score to WhatsApp
          </button>
        </div>
      )}

      {/* ══════════════════════════
          PROFILE SCREEN
      ══════════════════════════ */}
      {screen === "profile" && (
        <div style={{ padding: "16px" }}>

          {/* Player Header */}
          <div style={{ background: "#fff", borderRadius: 20, padding: "22px 18px", display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: sportLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: sportColor, border: `2px solid ${sportColor}33`, flexShrink: 0 }}>
              {PLAYERS[0].initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>{PLAYERS[0].name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fef3c7", borderRadius: 8, padding: "3px 9px" }}>
                  <Medal size={12} color="#92400e" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>#1 Colony</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Users size={12} color="#aaa" />
                  <span style={{ fontSize: 13, color: "#888" }}>Marina Blasters</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bento Row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Total Matches", value: 18,  Icon: BarChart2 },
              { label: "Man of Match",  value: 4,   Icon: Award     },
            ].map(({ label, value, Icon }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 18, padding: "20px 16px", border: `1px solid ${sportColor}22` }}>
                <Icon size={22} color={sportColor} strokeWidth={2} />
                <div style={{ fontSize: 32, fontWeight: 900, color: sportColor, marginTop: 8, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 5, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Bento Row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total Runs",  value: 312,     Icon: TrendingUp },
              { label: "Strike Rate", value: "138.2",  Icon: Zap        },
            ].map(({ label, value, Icon }) => (
              <div key={label} style={{ background: sportLight, borderRadius: 18, padding: "20px 16px", border: `1px solid ${sportColor}22` }}>
                <Icon size={22} color={sportColor} strokeWidth={2} />
                <div style={{ fontSize: 32, fontWeight: 900, color: sportColor, marginTop: 8, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 5, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Recent Form */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Activity size={12} color="#888" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>Recent Form</span>
          </div>
          <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
            {[
              { match: "vs City Strikers", runs: 47, wkt: 2, motm: true  },
              { match: "vs Beach Boys",    runs: 62, wkt: 0, motm: true  },
              { match: "vs Velachery XI",  runs: 18, wkt: 1, motm: false },
            ].map((m, i) => (
              <div key={i} style={{ display: "flex", padding: "14px 18px", borderBottom: i < 2 ? "1px solid #f0f0f0" : "none", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.match}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Shield size={11} color="#ccc" />
                    <span style={{ fontSize: 12, color: "#888" }}>{m.wkt}W · {m.runs} runs</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: sportColor }}>{m.runs}</span>
                  {m.motm && (
                    <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#fef3c7", borderRadius: 6, padding: "2px 7px" }}>
                      <Star size={10} color="#92400e" fill="#92400e" />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e" }}>MOM</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => { setSharedMilestone(`Suresh K. — 312 runs · SR 138.2 · 4x MOM. Check him out on Local Legends!`); setShowShare(true); }} style={{ width: "100%", background: "#25D366", border: "none", borderRadius: 16, padding: "16px 0", fontSize: 16, fontWeight: 700, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Share2 size={18} color="#fff" /> Share Profile
          </button>
        </div>
      )}

      {/* ══ BOTTOM NAV ══ */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: "#fff", borderTop: "1px solid #e8ebe0", display: "flex", zIndex: 100 }}>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setScreen(id)} style={{ flex: 1, background: "none", border: "none", padding: "13px 0 17px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: screen === id ? sportColor : "#ccc" }}>
            <Icon size={22} strokeWidth={screen === id ? 2.5 : 1.8} />
            <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ══ SHARE MODAL ══ */}
      {showShare && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowShare(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "26px 22px 40px", width: "100%", maxWidth: 420 }}>
            <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Flame size={18} color={sportColor} />
              <span style={{ fontSize: 18, fontWeight: 800 }}>Share this moment</span>
            </div>
            <div style={{ background: sportLight, borderRadius: 14, padding: "13px 16px", fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 20, lineHeight: 1.5 }}>
              {sharedMilestone}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ flex: 1, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <MessageCircle size={17} color="#fff" /> WhatsApp
              </button>
              <button style={{ flex: 1, background: sportColor, color: "#fff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Image size={17} color="#fff" /> Save Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ GUEST QR MODAL ══ */}
      {showGuestQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowGuestQR(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, padding: "30px 26px", width: "100%", maxWidth: 340, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
              <QrCode size={20} color={sportColor} />
              <span style={{ fontSize: 18, fontWeight: 800 }}>Guest Umpire Mode</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 20 }}>
              <ScanLine size={14} color="#888" />
              <span style={{ fontSize: 14, color: "#666" }}>Scan this QR with scorer's phone</span>
            </div>
            {/* QR visual */}
            <div style={{ width: 180, height: 180, margin: "0 auto 20px", background: "#f5f5f5", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", border: `3px solid ${sportColor}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 2, padding: 14 }}>
                {[1,1,1,1,1,1,1,1,1,1,0,0,0,1,0,0,0,1,1,0,1,0,1,0,1,0,1,1,0,1,0,0,0,1,0,1,1,0,0,0,1,0,0,0,1,1,1,1,0,0,0,1,1,1,0,0,1,1,0,1,1,0,0,1,0,0,1,1,0,0,0,1,1,1,0,0,1,1,0,1,1].map((v, i) => (
                  <div key={i} style={{ width: 11, height: 11, background: v ? "#111" : "#f5f5f5", borderRadius: 1 }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 20 }}>
              <Navigation size={13} color="#888" />
              <span style={{ fontSize: 13, color: "#888" }}>No account needed — join instantly</span>
            </div>
            <button onClick={() => { setShowGuestQR(false); setGuestMode(true); }} style={{ width: "100%", background: sportColor, color: "#fff", border: "none", borderRadius: 14, padding: "16px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Users size={17} color="#fff" /> Join as Guest Umpire
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
