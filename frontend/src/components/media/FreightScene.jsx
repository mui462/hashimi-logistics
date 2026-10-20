import { useId } from 'react';

// Original, illustrated freight scenes used wherever a photograph has not yet been supplied.
// They are decorative (aria-hidden) placeholders; real photography replaces them via MediaImage.

function Wheels({ xs, y }) {
  return xs.map((x) => (
    <g key={x}>
      <circle cx={x} cy={y} r="13" fill="#111111" />
      <circle cx={x} cy={y} r="5" fill="#c4c4c2" />
    </g>
  ));
}

function Trailer({ x, y, type }) {
  const w = 300;
  if (type === 'flatbed') {
    return (
      <g>
        <rect x={x} y={y + 52} width={w} height="10" fill="#6b6b6b" />
        <rect x={x + 18} y={y + 22} width="92" height="30" fill="#c4c4c2" />
        <rect x={x + 120} y={y + 12} width="70" height="40" fill="#d6d6d4" />
        <rect x={x + 200} y={y + 28} width="80" height="24" fill="#c4c4c2" />
        <Wheels xs={[x + 220, x + 252, x + 284]} y={y + 76} />
      </g>
    );
  }
  const reefer = type === 'reefer';
  return (
    <g>
      <rect x={x} y={y} width={w} height="62" fill={reefer ? '#ffffff' : '#ebebea'} />
      <rect x={x} y={y + 40} width={w} height="6" fill="#c49a3f" />
      {reefer && <rect x={x + w - 6} y={y + 6} width="6" height="34" fill="#6b6b6b" />}
      {reefer && <rect x={x} y={y + 6} width="26" height="30" fill="#c4c4c2" />}
      <rect x={x} y={y + 62} width={w} height="8" fill="#4a4a4a" />
      <Wheels xs={[x + 220, x + 252, x + 284]} y={y + 76} />
    </g>
  );
}

function Truck({ x, y, type = 'dryvan' }) {
  return (
    <g>
      <Trailer x={x} y={y} type={type} />
      <path d={`M${x + 306} ${y + 6} h42 l22 28 v36 h-64z`} fill="#c49a3f" />
      <path d={`M${x + 318} ${y + 14} h26 l14 20 h-40z`} fill="#1a1a1a" opacity="0.85" />
      <rect x={x + 306} y={y + 70} width="64" height="6" fill="#111111" />
      <Wheels xs={[x + 335, x + 358]} y={y + 76} />
    </g>
  );
}

function Hills() {
  return (
    <g>
      <path d="M0 260 L120 215 L240 250 L380 200 L520 245 L660 205 L800 250 V300 H0z" fill="#3a3a3a" />
      <path d="M0 285 L140 255 L300 280 L460 250 L620 278 L800 258 V320 H0z" fill="#4a4a4a" />
    </g>
  );
}

function Road() {
  return (
    <g>
      <rect y="300" width="800" height="150" fill="#1a1a1a" />
      <rect y="300" width="800" height="4" fill="#4a4a4a" />
      <path d="M0 395 H800" stroke="#d8ad54" strokeWidth="5" strokeDasharray="40 30" />
      <rect y="440" width="800" height="10" fill="#1a1a1a" />
    </g>
  );
}

function Warehouse({ doors = 4 }) {
  return (
    <g>
      <rect x="40" y="150" width="720" height="150" fill="#3a3a3a" />
      <rect x="40" y="140" width="720" height="14" fill="#4a4a4a" />
      {Array.from({ length: doors }).map((_, i) => (
        <g key={i}>
          <rect x={80 + i * 170} y="205" width="110" height="95" fill="#111111" />
          {[0, 1, 2, 3].map((n) => (
            <rect key={n} x={80 + i * 170} y={205 + n * 8} width="110" height="3" fill="#6b6b6b" />
          ))}
        </g>
      ))}
    </g>
  );
}

function Canopy() {
  return (
    <g>
      <rect x="0" y="120" width="800" height="26" fill="#1a1a1a" />
      <rect x="0" y="146" width="800" height="6" fill="#c49a3f" />
      {[110, 400, 690].map((x) => (
        <rect key={x} x={x} y="152" width="16" height="148" fill="#4a4a4a" />
      ))}
      <rect x="520" y="230" width="90" height="70" fill="#3a3a3a" />
      <rect x="530" y="244" width="70" height="22" fill="#c4c4c2" opacity="0.6" />
    </g>
  );
}

const SCENES = {
  highway: { truck: 'dryvan', back: <Hills /> },
  dryvan: { truck: 'dryvan', back: <Hills /> },
  reefer: { truck: 'reefer', back: <Hills /> },
  flatbed: { truck: 'flatbed', back: <Hills /> },
  warehouse: { truck: 'dryvan', back: <Warehouse /> },
  loading: { truck: 'dryvan', back: <Warehouse doors={3} /> },
  border: { truck: 'dryvan', back: <><Hills /><Canopy /></> },
};

export default function FreightScene({ scene = 'highway', className }) {
  const gradientId = useId();
  const config = SCENES[scene] || SCENES.highway;

  return (
    <svg
      viewBox="0 0 800 450"
      preserveAspectRatio="xMaxYMax slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#6b6b6b" />
        </linearGradient>
      </defs>
      <rect width="800" height="450" fill={`url(#${gradientId})`} />
      {config.back}
      <Road />
      <ellipse cx="560" cy="396" rx="250" ry="9" fill="#111111" opacity="0.5" />
      <g transform="translate(330 284) scale(1.25)">
        <Truck x={0} y={0} type={config.truck} />
      </g>
    </svg>
  );
}
