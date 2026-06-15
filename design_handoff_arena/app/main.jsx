// main.jsx — single Option-B experience inside a centered iPhone frame.
const { PickerSpotlight, ARENA } = window;
const { useState, useEffect } = React;

function PhoneFrame({ children }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const s = Math.min(1, (window.innerHeight - 40) / 844, (window.innerWidth - 32) / 412);
      setScale(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(120% 90% at 50% -10%, #141c2c 0%, #080b13 60%, #05070d 100%)' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center', transition: 'transform .15s' }}>
        <div style={{ width: 390, height: 844, borderRadius: 56, background: 'linear-gradient(160deg,#2a3346,#10151f)', padding: 12,
          boxShadow: '0 50px 120px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(120,150,200,0.12)' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 45, overflow: 'hidden', background: ARENA.navy0,
            boxShadow: 'inset 0 0 0 2px #05070d' }}>
            {children}
            {/* dynamic island */}
            <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 102, height: 29, borderRadius: 16, background: '#000', zIndex: 70 }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return <PhoneFrame><PickerSpotlight /></PhoneFrame>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
