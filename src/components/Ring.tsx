import { useEffect, useState } from 'preact/hooks';

export function Ring({ value, goal, size = 148 }: { value: number; goal: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(Math.min(1, value / goal)));
    return () => cancelAnimationFrame(t);
  }, [value, goal]);

  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div class="ring" style={{ width: `${size}px`, height: `${size}px` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffd27a" />
            <stop offset="100%" stop-color="#ff6a4d" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.22)" stroke-width={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" stroke-width={stroke}
          stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style="transition: stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)"
        />
      </svg>
      <div class="ring-label">
        <b>{value}</b>
        <span>/ {goal} min</span>
      </div>
    </div>
  );
}
