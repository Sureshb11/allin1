// honeycomb.jsx — Apple-Watch-style honeycomb engine.
// Free pan + inertia + fisheye scale falloff (centre = largest, edges shrink
// & fade). Cricket sits at the origin. Tap a cell to centre + select it.
//
// <Honeycomb spacing cellSize minScale falloff fade snap renderCell
//            onFocusChange onSelect />
// renderCell(cell, { focused }) returns the inner cell markup.

const { useRef, useState, useEffect, useMemo, useCallback } = React;
const { ARENA, layoutHoney, SportIcon } = window;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function Honeycomb({
  spacing = 86, cellSize = 66, minScale = 0.40, maxScale = 1, falloff = 128,
  fade = true, snap = false, interactive = true, renderCell, onFocusChange, onSelect, behind,
}) {
  const wrapRef = useRef(null);
  const worldRef = useRef(null);
  const cellEls = useRef({});
  const pan = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const anim = useRef(null);
  const focusRef = useRef('cricket');
  const [focusId, setFocusId] = useState('cricket');
  const [dim, setDim] = useState({ w: 340, h: 560 });

  const cells = useMemo(() => layoutHoney(spacing), [spacing]);

  // pan clamp bounds: every cell must be reachable to the centre (+margin).
  const bounds = useMemo(() => {
    const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
    const m = spacing * 0.55;
    return {
      x: [-Math.max(...xs) - m, -Math.min(...xs) + m],
      y: [-Math.max(...ys) - m, -Math.min(...ys) + m],
    };
  }, [cells, spacing]);

  const clampPan = useCallback((p) => ({
    x: clamp(p.x, bounds.x[0], bounds.x[1]),
    y: clamp(p.y, bounds.y[0], bounds.y[1]),
  }), [bounds]);

  // ── the fisheye pass — direct DOM writes, runs every frame ──
  const apply = useCallback(() => {
    const cx = dim.w / 2, cy = dim.h / 2;
    const world = worldRef.current;
    if (world) world.style.transform = `translate(${pan.current.x}px, ${pan.current.y}px)`;
    let best = null, bestD = Infinity;
    for (const c of cells) {
      const sx = pan.current.x + c.x;
      const sy = pan.current.y + c.y;
      const d = Math.hypot(sx, sy);
      const t = d / falloff;
      let s = minScale + (maxScale - minScale) / (1 + t * t * 1.35);
      if (c.featured) s = Math.min(maxScale * 1.16, s * 1.14);
      const el = cellEls.current[c.id];
      if (el) {
        el.style.transform = `translate(-50%,-50%) translate(${c.x}px,${c.y}px) scale(${s.toFixed(3)})`;
        if (fade) el.style.opacity = clamp((s - minScale) / (maxScale - minScale) * 1.1 + 0.32, 0.32, 1).toFixed(3);
        el.style.zIndex = String(1000 + Math.round(s * 100));
        el.style.setProperty('--s', s.toFixed(3));
      }
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best && best.id !== focusRef.current) {
      focusRef.current = best.id;
      setFocusId(best.id);
      onFocusChange && onFocusChange(best);
    }
  }, [cells, dim, falloff, minScale, maxScale, fade, onFocusChange]);

  // measure container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDim({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDim({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => { apply(); }, [apply]);

  // ── inertia ──
  const stopInertia = () => { cancelAnimationFrame(raf.current); raf.current = 0; };
  const startInertia = useCallback(() => {
    stopInertia();
    const step = () => {
      vel.current.x *= 0.92; vel.current.y *= 0.92;
      let np = { x: pan.current.x + vel.current.x, y: pan.current.y + vel.current.y };
      const cl = clampPan(np);
      if (cl.x !== np.x) vel.current.x = 0;
      if (cl.y !== np.y) vel.current.y = 0;
      pan.current = cl;
      apply();
      if (snap && Math.hypot(vel.current.x, vel.current.y) < 0.6) {
        return settleSnap();
      }
      if (Math.hypot(vel.current.x, vel.current.y) > 0.25) raf.current = requestAnimationFrame(step);
      else raf.current = 0;
    };
    raf.current = requestAnimationFrame(step);
  }, [apply, clampPan, snap]);

  // soft snap: glide nearest cell to exact centre
  const settleSnap = useCallback(() => {
    let near = null, nd = Infinity;
    for (const c of cells) {
      const d = Math.hypot(pan.current.x + c.x, pan.current.y + c.y);
      if (d < nd) { nd = d; near = c; }
    }
    if (near) animateTo({ x: -near.x, y: -near.y }, 260);
  }, [cells]);

  // ── eased pan animation ──
  const animateTo = useCallback((target, dur = 280, cb) => {
    stopInertia();
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = { ...pan.current };
    const t0 = performance.now();
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const tick = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = ease(k);
      pan.current = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      apply();
      if (k < 1) anim.current = requestAnimationFrame(tick);
      else { anim.current = null; cb && cb(); }
    };
    anim.current = requestAnimationFrame(tick);
  }, [apply]);

  // ── pointer drag ──
  useEffect(() => {
    if (!interactive) return;
    const el = wrapRef.current;
    if (!el) return;
    let drag = null;
    const down = (e) => {
      if (e.button != null && e.button !== 0) return;
      stopInertia();
      if (anim.current) { cancelAnimationFrame(anim.current); anim.current = null; }
      try { el.setPointerCapture(e.pointerId); } catch {}
      drag = { id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() };
      vel.current = { x: 0, y: 0 };
    };
    // rubber-band: let pan drift past bounds with resistance (Apple-Watch edge bounce)
    const rb = (v, lo, hi) => (v < lo ? lo + (v - lo) * 0.42 : v > hi ? hi + (v - hi) * 0.42 : v);
    const rubber = (p) => ({ x: rb(p.x, bounds.x[0], bounds.x[1]), y: rb(p.y, bounds.y[0], bounds.y[1]) });
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
      drag.lx = e.clientX; drag.ly = e.clientY;
      drag.moved += Math.hypot(dx, dy);
      pan.current = rubber({ x: pan.current.x + dx, y: pan.current.y + dy });
      // velocity ema
      vel.current.x = vel.current.x * 0.6 + dx * 0.4;
      vel.current.y = vel.current.y * 0.6 + dy * 0.4;
      apply();
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      try { el.releasePointerCapture(e.pointerId); } catch {}
      const tapped = drag.moved < 6;
      if (tapped) {
        const node = e.target.closest && e.target.closest('[data-cell-id]');
        const id = node && node.getAttribute('data-cell-id');
        const cell = cells.find((c) => c.id === id);
        if (cell) selectCell(cell);
      } else {
        const cl = clampPan(pan.current);
        if (cl.x !== pan.current.x || cl.y !== pan.current.y) {
          animateTo(cl, 320, () => { if (snap) settleSnap(); });   // spring back from overscroll
        } else {
          startInertia();
        }
      }
      drag = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [interactive, apply, clampPan, startInertia, cells, bounds, animateTo, settleSnap, snap]);

  const selectCell = useCallback((cell) => {
    animateTo({ x: -cell.x, y: -cell.y }, 300, () => onSelect && onSelect(cell));
  }, [animateTo, onSelect]);

  return (
    <div ref={wrapRef} className="hc-wrap"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: interactive ? 'grab' : 'default' }}>
      <div ref={worldRef} className="hc-world"
        style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, willChange: 'transform' }}>
        {behind}
        {cells.map((c) => (
          <div key={c.id} ref={(n) => { cellEls.current[c.id] = n; }}
            data-cell-id={c.id} data-sport={c.name}
            className={'hc-cell' + (c.id === focusId ? ' is-focus' : '') + (c.featured ? ' is-featured' : '')}
            style={{ position: 'absolute', left: 0, top: 0, width: cellSize, height: cellSize, marginLeft: -cellSize / 2, marginTop: -cellSize / 2, willChange: 'transform, opacity', animationDelay: (c.ring * 0.06) + 's' }}>
            {renderCell ? renderCell(c, { focused: c.id === focusId }) : (
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: ARENA.cell, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ARENA.lime }}>
                <SportIcon id={c.id} size={cellSize * 0.5} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Honeycomb, clamp });
