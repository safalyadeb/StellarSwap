import { useId } from 'react';
import { TokenMeta } from '../../lib/constants';

export function TokenIcon({ token, size = 28 }: { token: TokenMeta; size?: number }) {
  const sym = token.symbol.toUpperCase();
  if (sym === 'XLM')  return <XLMIcon size={size} />;
  if (sym === 'USDC') return <USDCIcon size={size} />;
  if (sym === 'EURC') return <EURCIcon size={size} />;
  return <FallbackIcon token={token} size={size} />;
}

// ── Stellar XLM ──────────────────────────────────────────────────────────────
// Faithful recreation of the SDF logo:
//   • A ring (circle stroke) with 4 gap-points where two diagonal bars cross it
//   • Both bars extend beyond the ring on each side
//   • Angle ~37 °, bar spacing ≈ 1.25× bar width
function XLMIcon({ size }: { size: number }) {
  const uid = useId().replace(/:/g, 'x');
  const mid = `xlm-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="XLM">
      <defs>
        {/*
          Mask punches two diagonal rectangular slots through the ring,
          creating the 4 gap-points that define the Stellar S-mark.
          Slot height = bar strokeWidth + 2px buffer each side.
        */}
        <mask id={mid}>
          <rect width="100" height="100" fill="white"/>
          <g transform="rotate(-37 50 50)">
            <rect x="-25" y="36" width="150" height="10" fill="black"/>
            <rect x="-25" y="54" width="150" height="10" fill="black"/>
          </g>
        </mask>
      </defs>

      {/* Black disc background */}
      <circle cx="50" cy="50" r="50" fill="#000"/>

      {/* Ring — radius 32, same stroke as the bars, gaps cut by mask */}
      <circle
        cx="50" cy="50" r="32"
        fill="none" stroke="white" strokeWidth="8"
        mask={`url(#${mid})`}
      />

      {/* Two diagonal bars at same rotation, extending well beyond ring */}
      <g transform="rotate(-37 50 50)">
        <line x1="-25" y1="41" x2="125" y2="41" stroke="white" strokeWidth="8" strokeLinecap="round"/>
        <line x1="-25" y1="59" x2="125" y2="59" stroke="white" strokeWidth="8" strokeLinecap="round"/>
      </g>
    </svg>
  );
}

// ── Circle USDC ───────────────────────────────────────────────────────────────
// Blue disc, white ring, white dollar sign — Circle brand
function USDCIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="USDC">
      {/* Blue disc */}
      <circle cx="50" cy="50" r="50" fill="#2775CA"/>
      {/* White outer ring */}
      <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeWidth="5" opacity="0.35"/>
      {/* Dollar sign */}
      <text
        x="50" y="66"
        textAnchor="middle"
        fill="white"
        fontSize="46"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
      >$</text>
      {/* Thin vertical stem through $ sign */}
      <line x1="50" y1="22" x2="50" y2="30" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <line x1="50" y1="70" x2="50" y2="78" stroke="white" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  );
}

// ── EURC ─────────────────────────────────────────────────────────────────────
// Blue disc, euro sign — styled like USDC
function EURCIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="EURC">
      <circle cx="50" cy="50" r="50" fill="#1A4FBF"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeWidth="5" opacity="0.35"/>
      <text
        x="50" y="66"
        textAnchor="middle"
        fill="white"
        fontSize="46"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
      >€</text>
    </svg>
  );
}

// ── Fallback (text initial) ────────────────────────────────────────────────────
function FallbackIcon({ token, size }: { token: TokenMeta; size: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0 ring-1 ring-white/10"
      style={{ width: size, height: size, background: token.color, fontSize: size * 0.42 }}
      title={token.name}
    >
      {token.symbol.slice(0, 1)}
    </div>
  );
}
