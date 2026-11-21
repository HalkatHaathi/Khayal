import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { clampOffset, fitFrame, minScale, outputSize, sourceRect, zoomAt } from './crop';

const SHAPES = [['1:1', 1], ['4:5', 4 / 5], ['3:2', 3 / 2], ['16:9', 16 / 9], ['3:1', 3]];

/**
 * Choose which part of a photo to keep before it is uploaded: drag to move, slide or scroll to zoom, pick a shape.
 * `ratio` is the shape the spot on the website wants; the person may pick another. onDone(file) gets the cropped file.
 */
export default function Cropper({ file, ratio = 4 / 5, onDone, onOriginal, onCancel }) {
  const dlg = useRef(), stage = useRef(), imgEl = useRef();
  const [src, setSrc] = useState('');
  const [nat, setNat] = useState(null);                 // the photo's own size once loaded
  const [r, setR] = useState(ratio);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  useEffect(() => { const u = URL.createObjectURL(file); setSrc(u); return () => URL.revokeObjectURL(u); }, [file]);
  useEffect(() => { dlg.current.showModal(); }, []);

  const box = { w: Math.min(560, window.innerWidth - 56), h: Math.min(Math.round(window.innerHeight * 0.5), 460) };
  const frame = fitFrame(r, box.w, box.h);
  const min = nat ? minScale(nat.w, nat.h, frame.w, frame.h) : 1;

  // a new photo or a new shape: start centred, as zoomed out as allowed
  useEffect(() => {
    if (!nat) return;
    const s = minScale(nat.w, nat.h, frame.w, frame.h);
    setView({ s, ...clampOffset((frame.w - nat.w * s) / 2, (frame.h - nat.h * s) / 2, nat.w, nat.h, s, frame.w, frame.h) });
  }, [nat, r]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dx, dy) => setView((v) => ({ ...v, ...clampOffset(v.x + dx, v.y + dy, nat.w, nat.h, v.s, frame.w, frame.h) }));
  const zoom = (z) => setView((v) => zoomAt(v, min * Math.min(4, Math.max(1, z)), nat.w, nat.h, frame.w, frame.h));
  const z = view.s / min;

  useEffect(() => { // wheel needs a non-passive listener to stop the page scrolling behind the window
    const el = stage.current; if (!el || !nat) return;
    const f = (e) => { e.preventDefault(); zoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  });

  const down = (e) => { stage.current.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; };
  const moveP = (e) => { if (!drag.current) return; move(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; };
  const key = (e) => {
    const step = e.shiftKey ? 40 : 10; const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (k) { e.preventDefault(); move(...k); } else if (e.key === '+' || e.key === '=') zoom(z * 1.1); else if (e.key === '-') zoom(z / 1.1);
  };

  const done = async () => {
    setBusy(true);
    const { sx, sy, sw, sh } = sourceRect(view.x, view.y, view.s, frame.w, frame.h);
    const { w, h } = outputSize(sw, sh);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    c.getContext('2d').drawImage(imgEl.current, sx, sy, sw, sh, 0, 0, w, h);
    const blob = (type) => new Promise((res) => c.toBlob(res, type, 0.9));
    let b = await blob('image/webp'); if (!b || b.type !== 'image/webp') b = await blob('image/jpeg'); // older Safari cannot write WebP
    const ext = b.type === 'image/webp' ? 'webp' : 'jpg';
    onDone(new File([b], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: b.type }));
  };

  const shapes = [...(SHAPES.some(([, v]) => Math.abs(v - ratio) < 0.01) ? [] : [['Recommended', ratio]]), ...SHAPES, ...(nat ? [['Original', nat.w / nat.h]] : [])];

  return (
    <dialog ref={dlg} className="crop" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-label="Position your photo">
      <div className="crop__head"><h2>Position your photo</h2><button className="icon-btn" onClick={onCancel} aria-label="Cancel"><Icon.Close size={18} /></button></div>
      <p className="hint crop__hint">Drag to choose the part you want. Scroll or use the slider to zoom. What is inside the frame is what gets uploaded.</p>
      <div className="crop__stage" ref={stage} style={{ width: frame.w, height: frame.h }} tabIndex={0} role="application" aria-label="Crop area: arrow keys move the photo, plus and minus zoom"
        onPointerDown={down} onPointerMove={moveP} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={key}>
        {src && <img ref={imgEl} src={src} alt="" draggable="false" onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={nat ? { width: nat.w * view.s, height: nat.h * view.s, transform: `translate(${view.x}px, ${view.y}px)` } : { visibility: 'hidden' }} />}
      </div>
      <div className="crop__zoom"><Icon.Minus size={14} /><input type="range" min="1" max="4" step="0.01" value={Math.min(4, z)} onChange={(e) => zoom(Number(e.target.value))} aria-label="Zoom" disabled={!nat} /><Icon.Plus size={14} /></div>
      <div className="crop__shapes" role="radiogroup" aria-label="Shape">
        {shapes.map(([name, v]) => <button key={name} role="radio" aria-checked={Math.abs(r - v) < 0.01} className={Math.abs(r - v) < 0.01 ? 'is-on' : ''} onClick={() => setR(v)}>{name}</button>)}
      </div>
      <div className="crop__act">
        <button className="btn btn--ghost" onClick={onOriginal} disabled={busy}>Use the whole photo</button>
        <button className="btn btn--line" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn" onClick={done} disabled={!nat || busy}>{busy ? 'Preparing…' : 'Use this crop'}</button>
      </div>
    </dialog>
  );
}
