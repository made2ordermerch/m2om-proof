'use client';

import { useEffect, useRef, useState } from 'react';

// Zoomable proof viewer.
// - Browse: double-tap or +/- to zoom, drag to pan when zoomed, pinch on touch,
//   scroll wheel on desktop. Page scrolling stays normal at 1x.
// - Pin mode: a single tap places a pin at that exact spot (works at any zoom).
// - Draw mode: freehand markup captured as percentage points.
// Pin coordinates are stored as percentages of the image, so they land in the
// same spot at every screen size and zoom level.
export default function ZoomViewer({
  imageUrl,
  pins,
  drawings,
  pinMode,
  drawMode,
  pendingPin,
  activePinId,
  onPlacePin,
  onFinishDrawing,
  onSelectPin,
}) {
  const frameRef = useRef(null);
  const layerRef = useRef(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const [stroke, setStroke] = useState(null);
  const strokeRef = useRef(null);

  function clampT(next) {
    const s = Math.min(6, Math.max(1, next.s));
    const layer = layerRef.current;
    if (!layer) return { s, x: 0, y: 0 };
    const w = layer.offsetWidth;
    const h = layer.offsetHeight;
    const minX = w - w * s;
    const minY = h - h * s;
    return {
      s,
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y)),
    };
  }

  function zoomAt(clientX, clientY, targetS) {
    const frame = frameRef.current.getBoundingClientRect();
    const cur = tRef.current;
    const s = Math.min(6, Math.max(1, targetS));
    const cx = clientX - frame.left;
    const cy = clientY - frame.top;
    const x = cx - ((cx - cur.x) * s) / cur.s;
    const y = cy - ((cy - cur.y) * s) / cur.s;
    setT(clampT({ s, x, y }));
  }

  function pct(clientX, clientY) {
    const r = layerRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  }

  // Wheel zoom (desktop). Attached manually so preventDefault works.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const cur = tRef.current;
      zoomAt(e.clientX, e.clientY, cur.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function pointerDown(e) {
    frameRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinMode && drawMode && pointers.current.size === 1) {
      e.preventDefault();
      const p = pct(e.clientX, e.clientY);
      strokeRef.current = [[p.x, p.y]];
      setStroke(strokeRef.current);
      gesture.current = { type: 'draw' };
      return;
    }

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      gesture.current = {
        type: 'pinch',
        d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        m0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        t0: { ...tRef.current },
      };
      return;
    }

    gesture.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      t0: { ...tRef.current },
      moved: 0,
      time: Date.now(),
    };
  }

  function pointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === 'draw') {
      e.preventDefault();
      const p = pct(e.clientX, e.clientY);
      strokeRef.current = [...strokeRef.current, [p.x, p.y]];
      setStroke(strokeRef.current);
      return;
    }

    if (g.type === 'pinch' && pointers.current.size === 2) {
      e.preventDefault();
      const pts = [...pointers.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const frame = frameRef.current.getBoundingClientRect();
      const s = Math.min(6, Math.max(1, g.t0.s * (d / g.d0)));
      const cx0 = g.m0.x - frame.left;
      const cy0 = g.m0.y - frame.top;
      const cx = m.x - frame.left;
      const cy = m.y - frame.top;
      const x = cx - ((cx0 - g.t0.x) * s) / g.t0.s;
      const y = cy - ((cy0 - g.t0.y) * s) / g.t0.s;
      setT(clampT({ s, x, y }));
      return;
    }

    if (g.type === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      if (tRef.current.s > 1) {
        e.preventDefault();
        setT(clampT({ s: g.t0.s, x: g.t0.x + dx, y: g.t0.y + dy }));
      }
    }
  }

  function pointerUp(e) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const cancelled = e.type === 'pointercancel';

    if (g?.type === 'draw') {
      gesture.current = null;
      const points = strokeRef.current || [];
      strokeRef.current = null;
      setStroke(null);
      if (points.length > 2) onFinishDrawing(points);
      return;
    }

    if (pointers.current.size > 0) return;

    if (!cancelled && g?.type === 'pan' && g.moved < 8 && Date.now() - g.time < 500) {
      // Treated as a tap.
      if (pinMode && !drawMode) {
        onPlacePin(pct(e.clientX, e.clientY));
      } else {
        const now = Date.now();
        const prev = lastTap.current;
        if (prev && now - prev.time < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
          lastTap.current = null;
          if (tRef.current.s > 1.05) setT({ s: 1, x: 0, y: 0 });
          else zoomAt(e.clientX, e.clientY, 2.5);
        } else {
          lastTap.current = { time: now, x: e.clientX, y: e.clientY };
        }
      }
    }
    gesture.current = null;
  }

  const zoomed = t.s > 1.02;
  const allDrawings = [...(drawings || [])];
  if (stroke) allDrawings.push({ id: 'live', points: stroke, live: true });

  return (
    <div
      ref={frameRef}
      className={`zoom-frame ${pinMode ? 'pinning' : ''}`}
      style={{ touchAction: pinMode || zoomed ? 'none' : 'pan-y' }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <div
        ref={layerRef}
        className="zoom-layer"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
      >
        <img src={imageUrl} alt="Design proof" draggable={false} />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {allDrawings.map((d) => (
            <polyline
              key={d.id}
              points={(d.points || []).map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={d.resolved ? 'rgba(8,8,8,0.3)' : '#080808'}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 3 }}
            />
          ))}
        </svg>

        {(pins || []).map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pin-dot ${p.resolved ? 'resolved' : ''} ${activePinId === p.id ? 'active' : ''}`}
            style={{
              left: `${Number(p.pin_x)}%`,
              top: `${Number(p.pin_y)}%`,
              transform: `translate(-50%, -50%) scale(${1 / t.s})`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPin(p.id);
            }}
            aria-label={`Comment pin ${p.pin_number}`}
          >
            {p.pin_number}
          </button>
        ))}

        {pendingPin && (
          <div
            className="pin-dot pending"
            style={{
              left: `${pendingPin.x}%`,
              top: `${pendingPin.y}%`,
              transform: `translate(-50%, -50%) scale(${1 / t.s})`,
              animation: 'popIn 0.15s ease both',
            }}
          >
            +
          </div>
        )}
      </div>

      <div className="zoom-controls">
        <button className="icon-btn" type="button" aria-label="Zoom in"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); const f = frameRef.current.getBoundingClientRect(); zoomAt(f.left + f.width / 2, f.top + f.height / 2, tRef.current.s * 1.5); }}>
          +
        </button>
        <button className="icon-btn" type="button" aria-label="Zoom out"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); const f = frameRef.current.getBoundingClientRect(); zoomAt(f.left + f.width / 2, f.top + f.height / 2, tRef.current.s / 1.5); }}>
          −
        </button>
        {zoomed && (
          <button className="icon-btn" type="button" aria-label="Reset zoom"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setT({ s: 1, x: 0, y: 0 }); }}>
            ⤢
          </button>
        )}
      </div>

      {!zoomed && !pinMode && <div className="zoom-hint">DOUBLE-TAP TO ZOOM</div>}
    </div>
  );
}
