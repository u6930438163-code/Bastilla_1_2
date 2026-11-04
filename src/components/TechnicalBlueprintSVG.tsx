import React from 'react';

interface TechnicalBlueprintSVGProps {
  style?: string;
  prompt?: string;
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function extractPromptText(raw?: string): string {
  if (!raw) return '';
  let decoded = raw;
  try {
    if (raw.includes('prompt=')) {
      const u = new URL(raw, 'http://localhost');
      const p = u.searchParams.get('prompt');
      if (p) decoded = decodeURIComponent(p);
    } else if (raw.includes('/prompt/')) {
      const part = raw.split('/prompt/')[1]?.split('?')[0] || '';
      decoded = decodeURIComponent(part);
    }
  } catch {}
  return decoded.replace(/[+_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function selectVariant(cleanPrompt: string, hash: number): number {
  const lower = cleanPrompt.toLowerCase();
  if (lower.includes('cybernetic') || lower.includes('gold')) return 5;
  if (lower.includes('holographic')) return 2;
  if (lower.includes('ram optimization') || lower.includes('computing')) return 0;
  if (lower.includes('core interface') || lower.includes('operating system')) return 3;
  if (lower.includes('clean-data-flow') || lower.includes('clean data flow') || lower.includes('white-lines')) return 1;
  if (lower.includes('nodes') || lower.includes('minimalist tech')) return 4;
  return hash % 6;
}

const PALETTES = [
  { primary: '#06b6d4', secondary: '#3b82f6', accent: '#f59e0b', bg: '#020617', label: 'CYBER-CORE MATRIX' },
  { primary: '#10b981', secondary: '#14b8a6', accent: '#38bdf8', bg: '#02100d', label: 'RAM & TMPFS TOPOLOGY' },
  { primary: '#a855f7', secondary: '#ec4899', accent: '#22d3ee', bg: '#090314', label: 'NEURAL TENSOR FIELD' },
  { primary: '#f59e0b', secondary: '#ef4444', accent: '#10b981', bg: '#110702', label: 'HIGH-THROUGHPUT BUS' },
  { primary: '#38bdf8', secondary: '#6366f1', accent: '#a855f7', bg: '#03071e', label: 'HOLOGRAPHIC RACK CLUSTER' },
  { primary: '#34d399', secondary: '#eab308', accent: '#60a5fa', bg: '#040d12', label: 'QUANTUM KERNEL PIPELINE' },
];

export const TechnicalBlueprintSVG: React.FC<TechnicalBlueprintSVGProps> = ({ style, prompt }) => {
  const cleanPrompt = extractPromptText(prompt) || style || 'Sovereign Neural Core Matrix';
  const seedKey = `${style || ''}::${cleanPrompt}`;
  const hash = hashSeed(seedKey);
  const variant = selectVariant(cleanPrompt, hash);
  const paletteIdx = (variant + ((hash >>> 5) % 5) + 1) % PALETTES.length;
  const palette = PALETTES[paletteIdx];
  const keywords = cleanPrompt
    .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  const metricA = ((hash % 890) / 10 + 11).toFixed(1);
  const metricB = (((hash >>> 4) % 950) / 10 + 4.2).toFixed(1);
  const gridId = `grid-${hash % 99991}`;
  const glowId = `glow-${hash % 99991}`;

  return (
    <div className="my-3 p-3 sm:p-4 rounded-xl bg-slate-950 border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col items-center backdrop-blur-md">
      <div className="w-full max-w-[460px] aspect-[16/10] relative rounded-lg overflow-hidden border border-slate-800/90">
        <svg viewBox="0 0 480 300" className="w-full h-full" style={{ backgroundColor: palette.bg }}>
          <defs>
            <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke={palette.primary} strokeOpacity="0.12" strokeWidth="0.6" />
            </pattern>
            <radialGradient id={glowId} cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={palette.primary} stopOpacity="0.24" />
              <stop offset="60%" stopColor={palette.secondary} stopOpacity="0.08" />
              <stop offset="100%" stopColor={palette.bg} stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="480" height="300" fill={`url(#${gridId})`} />
          <rect width="480" height="300" fill={`url(#${glowId})`} />

          {/* Variant 0: Server Room & High-Performance RAM Rack Architecture */}
          {variant === 0 && (
            <g>
              {[0, 1, 2, 3].map((rackIdx) => {
                const rx = 55 + rackIdx * 98;
                const activeSlot = (hash + rackIdx * 3) % 6;
                return (
                  <g key={rackIdx}>
                    <rect x={rx} y="42" width="76" height="190" rx="6" fill="#060d1a" stroke={palette.primary} strokeWidth="1.4" strokeOpacity="0.75" />
                    {[0, 1, 2, 3, 4, 5].map((slot) => (
                      <g key={slot}>
                        <rect
                          x={rx + 8}
                          y={54 + slot * 28}
                          width="60"
                          height="20"
                          rx="3"
                          fill={slot === activeSlot ? palette.primary : '#0b172a'}
                          fillOpacity={slot === activeSlot ? '0.28' : '0.9'}
                          stroke={slot === activeSlot ? palette.accent : palette.secondary}
                          strokeWidth="1"
                          strokeOpacity="0.6"
                        />
                        <circle
                          cx={rx + 17}
                          cy={64 + slot * 28}
                          r="2.5"
                          fill={slot === activeSlot ? palette.accent : palette.primary}
                        />
                        <line
                          x1={rx + 26}
                          y1={64 + slot * 28}
                          x2={rx + 60}
                          y2={64 + slot * 28}
                          stroke={palette.primary}
                          strokeWidth="2"
                          strokeOpacity="0.45"
                        />
                      </g>
                    ))}
                    <text x={rx + 38} y="248" textAnchor="middle" fill={palette.primary} fontSize="9" fontFamily="monospace">
                      NODE-{rackIdx + 1} [{ keywords[rackIdx]?.toUpperCase().slice(0, 6) || `RAM${rackIdx}` }]
                    </text>
                  </g>
                );
              })}
              <path d="M 40 265 Q 240 230 440 265" fill="none" stroke={palette.accent} strokeWidth="1.5" strokeDasharray="4,4" />
            </g>
          )}

          {/* Variant 1: Multi-Layer Data Stream & Waveform Spectrum */}
          {variant === 1 && (
            <g>
              {[0, 1, 2, 3, 4].map((waveIdx) => {
                const amp = 18 + ((hash >>> (waveIdx * 2)) % 35);
                const yBase = 75 + waveIdx * 36;
                const d = `M 24 ${yBase} C 120 ${yBase - amp}, 200 ${yBase + amp}, 280 ${yBase - amp * 0.7} S 390 ${yBase + amp}, 456 ${yBase}`;
                return (
                  <g key={waveIdx}>
                    <path
                      d={d}
                      fill="none"
                      stroke={waveIdx % 2 === 0 ? palette.primary : waveIdx === 1 ? palette.accent : palette.secondary}
                      strokeWidth={waveIdx === 2 ? '2.6' : '1.5'}
                      strokeOpacity={0.85 - waveIdx * 0.1}
                    />
                    <circle cx={90 + waveIdx * 72} cy={yBase - amp * 0.3} r="4" fill={palette.accent} />
                    <text x={90 + waveIdx * 72} y={yBase - amp * 0.3 - 8} textAnchor="middle" fill="#e2e8f0" fontSize="8" fontFamily="monospace">
                      {keywords[waveIdx]?.toUpperCase().slice(0, 8) || `STREAM_${waveIdx}`}
                    </text>
                  </g>
                );
              })}
              <rect x="34" y="232" width="412" height="32" rx="6" fill="#050b16" stroke={palette.primary} strokeOpacity="0.4" />
              <text x="240" y="252" textAnchor="middle" fill={palette.primary} fontSize="10" fontFamily="monospace">
                THROUGHPUT: {metricA} GB/s · LATENCY: {metricB} ms · SEED #{hash % 10000}
              </text>
            </g>
          )}

          {/* Variant 2: Isometric Kernel Layers & Memory Mapping */}
          {variant === 2 && (
            <g>
              {[0, 1, 2].map((layer) => {
                const cy = 82 + layer * 58;
                const strokeCol = layer === 0 ? palette.accent : layer === 1 ? palette.primary : palette.secondary;
                return (
                  <g key={layer}>
                    <polygon
                      points={`240,${cy - 36} 390,${cy} 240,${cy + 36} 90,${cy}`}
                      fill="#071120"
                      fillOpacity="0.82"
                      stroke={strokeCol}
                      strokeWidth="2"
                    />
                    <text x="240" y={cy + 4} textAnchor="middle" fill={strokeCol} fontSize="10" fontWeight="bold" fontFamily="monospace">
                      {keywords[layer]?.toUpperCase() || `RING-${layer}`} · {(layer + 1) * 4} GiB
                    </text>
                  </g>
                );
              })}
              <line x1="240" y1="46" x2="240" y2="234" stroke={palette.accent} strokeWidth="1.5" strokeDasharray="3,3" />
              <line x1="90" y1="82" x2="90" y2="198" stroke={palette.primary} strokeWidth="1.2" strokeOpacity="0.5" />
              <line x1="390" y1="82" x2="390" y2="198" stroke={palette.primary} strokeWidth="1.2" strokeOpacity="0.5" />
            </g>
          )}

          {/* Variant 3: Cybernetic Constellation & Mesh Topology */}
          {variant === 3 && (
            <g>
              {Array.from({ length: 7 }).map((_, i) => {
                const angle = (i / 7) * Math.PI * 2 + (hash % 10) * 0.2;
                const rad = 82 + (i % 2) * 26;
                const nx = Math.round(240 + Math.cos(angle) * rad);
                const ny = Math.round(145 + Math.sin(angle) * (rad * 0.72));
                return (
                  <g key={i}>
                    <line x1="240" y1="145" x2={nx} y2={ny} stroke={palette.secondary} strokeWidth="1.4" strokeOpacity="0.6" />
                    <circle cx={nx} cy={ny} r="18" fill="#06101e" stroke={i % 2 === 0 ? palette.primary : palette.accent} strokeWidth="1.8" />
                    <text x={nx} y={ny + 3} textAnchor="middle" fill="#f8fafc" fontSize="8" fontFamily="monospace">
                      {(keywords[i] || `N${i + 1}`).slice(0, 5).toUpperCase()}
                    </text>
                  </g>
                );
              })}
              <circle cx="240" cy="145" r="30" fill="#040b16" stroke={palette.accent} strokeWidth="2.5" />
              <text x="240" y="142" textAnchor="middle" fill={palette.accent} fontSize="9" fontWeight="bold" fontFamily="monospace">
                CORE
              </text>
              <text x="240" y="154" textAnchor="middle" fill={palette.primary} fontSize="8" fontFamily="monospace">
                {metricA}%
              </text>
            </g>
          )}

          {/* Variant 4: Telemetry Histogram & Real-Time Resource Matrix */}
          {variant === 4 && (
            <g>
              {Array.from({ length: 12 }).map((_, barIdx) => {
                const h = 35 + Math.abs(((hash >>> (barIdx % 8)) * (barIdx + 3)) % 145);
                const bx = 48 + barIdx * 32;
                const by = 225 - h;
                const col = barIdx % 3 === 0 ? palette.primary : barIdx % 3 === 1 ? palette.secondary : palette.accent;
                return (
                  <g key={barIdx}>
                    <rect x={bx} y={by} width="22" height={h} rx="3" fill={col} fillOpacity="0.35" stroke={col} strokeWidth="1.4" />
                    <text x={bx + 11} y={by - 6} textAnchor="middle" fill={col} fontSize="8" fontFamily="monospace">
                      {Math.round(h / 2)}
                    </text>
                  </g>
                );
              })}
              <line x1="36" y1="226" x2="444" y2="226" stroke={palette.primary} strokeWidth="1.5" />
              <text x="240" y="252" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
                {[keywords[0], keywords[1], keywords[2]].filter(Boolean).join(' · ').toUpperCase() || 'RESOURCE TELEMETRY'}
              </text>
            </g>
          )}

          {/* Variant 5: Quantum Torus & Phase Attractor */}
          {variant === 5 && (
            <g>
              {[0, 1, 2, 3, 4].map((ring) => (
                <ellipse
                  key={ring}
                  cx="240"
                  cy="145"
                  rx={135 - ring * 16}
                  ry={48 + ring * 10}
                  transform={`rotate(${ring * 28 + (hash % 25)} 240 145)`}
                  fill="none"
                  stroke={ring % 2 === 0 ? palette.primary : palette.accent}
                  strokeWidth="1.5"
                  strokeOpacity="0.75"
                />
              ))}
              <circle cx="240" cy="145" r="14" fill={palette.accent} fillOpacity="0.3" stroke={palette.accent} strokeWidth="2" />
              <text x="240" y="256" textAnchor="middle" fill={palette.primary} fontSize="9" fontFamily="monospace">
                PHASE ATTRACTOR · ΔE={metricB} · {[keywords[0], keywords[1]].filter(Boolean).join(' / ').toUpperCase()}
              </text>
            </g>
          )}

          {/* Top HUD Header inside SVG */}
          <rect x="12" y="10" width="456" height="22" rx="4" fill="#020617" fillOpacity="0.8" stroke={palette.primary} strokeOpacity="0.3" />
          <text x="22" y="24" fill={palette.primary} fontSize="9" fontWeight="bold" fontFamily="monospace">
            {palette.label} #{String(hash % 9000 + 1000)}
          </text>
          <text x="458" y="24" textAnchor="end" fill={palette.accent} fontSize="9" fontFamily="monospace">
            {style || 'SVL-VISION'}
          </text>
        </svg>
      </div>
      <div className="mt-2.5 text-center max-w-md px-2">
        <div className="text-cyan-300 font-bold text-[11px] uppercase tracking-wider">
          {style || palette.label}
        </div>
        <div className="text-slate-400 text-[10px] mt-0.5 line-clamp-2 font-mono">
          {cleanPrompt}
        </div>
      </div>
    </div>
  );
};

