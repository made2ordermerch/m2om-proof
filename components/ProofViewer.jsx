'use client';

import { useRef, useState } from 'react';

// Coordinates are stored as percentages of the image so pins land in the same
// spot at any screen size.
export default function ProofViewer({
  imageUrl,
  pins,            // [{ id, pin_number, pin_x, pin_y, resolved }]
  drawings,        // [{ id, points: [[x,y],...], resolved }]
  mode,            // 'browse' | 'pin'
  drawMode,        // boolean, only relevant in pin mode
  pendingPin,      // { x, y } | null
  activePinId,     // id of the pin whose thread is open
  onPlacePin,      // ({x, y}) => void
  onFinishDrawing, // (points) => void
  onSelectPin,     // (id) => void
}) {
  const frameRef = useRef(null);
  const [stroke, setStroke] = useState(null);

  function toPct(clientX, clientY) {
    const r = frameRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  }

  function handleClick(e) {
    if (mode !== 'pin' || drawMode) return;
    const { x, y } = toPct(e.clientX, e.clientY);
    onPlacePin({ x, y });
  }

  function pointerDown(e) {
    if (mode !== 'pin' || !drawMode) return;
    e.preventDefault();
    frameRef.current.setPointerCapture?.(e.pointerId);
    const { x, y } = toPct(e.clientX, e.clientY);
    setStroke([[x, y]]);
  }

  function pointerMove(e) {
    if (!stroke) return;
    e.preventDefault();
    const { x, y } = toPct(e.clientX, e.clientY);
    setStroke((s) => [...s, [x, y]]);
  }

  function pointerUp() {
    if (!stroke) return;
    if (stroke.length > 2) onFinishDrawing(stroke);
    setStroke(null);
  }

  const allDrawings = [...(drawings || [])];
  if (stroke) allDrawings.push({ id: 'live', points: stroke, live: true });

  return (
    <div
      ref={frameRef}
      className={`viewer-frame ${mode === 'pin' ? 'pin-mode' : ''}`}
      onClick={handleClick}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      style={drawMode ? { touchAction: 'none' } : undefined}
    >
      <img src={imageUrl} alt="Design proof" draggable={false} />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {allDrawings.map((d) => (
          <polyline
            key={d.id}
            points={(d.points || []).map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={d.live ? '#080808' : d.resolved ? 'rgba(8,8,8,0.3)' : '#080808'}
            strokeWidth="0.7"
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
          className={`pin-dot ${p.resolved ? 'resolved' : ''} ${
            activePinId === p.id ? 'active' : ''
          }`}
          style={{ left: `${Number(p.pin_x)}%`, top: `${Number(p.pin_y)}%` }}
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
          style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
        >
          +
        </div>
      )}
    </div>
  );
}
