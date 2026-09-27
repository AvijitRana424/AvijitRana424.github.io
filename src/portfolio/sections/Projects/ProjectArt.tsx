import { memo, useId, type ReactNode } from 'react';
import s from './ProjectArt.module.css';

/**
 * Hand-made flat/ink illustrations for each project, drawn inside a browser (or phone)
 * mockup. viewBox is 360×200; the art panel keeps that aspect ratio.
 * Idle animations are pure CSS (killed globally for prefers-reduced-motion).
 */
// memo: the wall / deck re-render their cards whenever the front card changes; the SVG never does
export const ProjectArt = memo(function ProjectArt({ id, title }: { id: string; title: string }) {
  const uid = useId().replace(/:/g, '');
  let body: ReactNode;
  switch (id) {
    case 'ecommerce':
      body = <Ecommerce />;
      break;
    case 'memory-bank':
      body = <MemoryBank uid={uid} />;
      break;
    case 'order-platform':
      body = <OrderFlow />;
      break;
    case 'field-app':
      body = <FieldApp />;
      break;
    case 'job-radar':
      body = <Radar />;
      break;
    default:
      body = <Generic title={title} />;
  }
  return (
    <svg className={s.art} viewBox="0 0 360 200" role="img" aria-label={`Illustration for ${title}`} preserveAspectRatio="xMidYMid meet">
      {body}
    </svg>
  );
});

/* ── shared pieces ───────────────────────────────────────────────────────── */

function Browser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <g>
      <rect x="36" y="20" width="296" height="166" rx="10" className={s.shadow} />
      <rect x="32" y="16" width="296" height="166" rx="10" className={s.win} />
      <path d="M32 35.5 H328" className={s.ln} />
      <circle cx="45" cy="26" r="3" className={s.fAccent} />
      <circle cx="55" cy="26" r="3" className={s.fSticky} />
      <circle cx="65" cy="26" r="3" className={s.fGreen} />
      <rect x="122" y="21" width="116" height="10" rx="5" className={s.pill} />
      <text x="180" y="28.6" textAnchor="middle" className={s.url}>
        {url}
      </text>
      {children}
    </g>
  );
}

const Lock = () => (
  <g className={s.ln}>
    <rect x="0.5" y="5" width="11" height="8" rx="2" />
    <path d="M3 5 V3.6 a3 3 0 0 1 6 0 V5" />
  </g>
);
const Cart = () => (
  <g className={s.ln}>
    <path d="M0 1 H2.4 L4.4 8.5 H10.6 L12.4 3 H3.2" />
    <circle cx="5.2" cy="11.4" r="1.1" />
    <circle cx="10" cy="11.4" r="1.1" />
  </g>
);
const Mail = () => (
  <g className={s.ln}>
    <rect x="0" y="1.5" width="13" height="9.5" rx="1.6" />
    <path d="M0.8 2.6 L6.5 7 L12.2 2.6" />
  </g>
);
const Shield = () => (
  <g className={s.ln}>
    <path d="M4.5 0.5 L8.5 2 V5 C8.5 7.4, 6.8 9, 4.5 9.8 C2.2 9, 0.5 7.4, 0.5 5 V2 Z" />
  </g>
);

function Db({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 4 V19 C0 22.4, 22 22.4, 22 19 V4" className={s.dbBody} />
      <path d="M0 11.5 C0 14.9, 22 14.9, 22 11.5" className={s.ln} />
      <ellipse cx="11" cy="4" rx="11" ry="3.4" className={s.dbTop} />
    </g>
  );
}

function ServiceBox({ x, y, label, icon, w = 72 }: { x: number; y: number; label: string; icon: ReactNode; w?: number }) {
  return (
    <g>
      <rect x={x + 3} y={y + 3} width={w} height="28" rx="6" className={s.shadow} />
      <rect x={x} y={y} width={w} height="28" rx="6" className={s.card} />
      <g transform={`translate(${x + 9} ${y + 8})`}>{icon}</g>
      <text x={x + 28} y={y + 17.6} className={s.label}>
        {label}
      </text>
    </g>
  );
}

/* ── ecommerce: microservices around a Kafka stream ───────────────────────── */

function Ecommerce() {
  return (
    <Browser url="api.shop / orders">
      <ServiceBox x={50} y={48} label="auth" icon={<Lock />} />
      <ServiceBox x={144} y={48} label="orders" icon={<Cart />} />
      <ServiceBox x={238} y={48} label="mail" icon={<Mail />} />

      {/* producers flow down into the topic, the mail consumer reads up out of it */}
      <path d="M86 80 V100" className={`${s.dash} ${s.flowDown}`} />
      <path d="M180 80 V100" className={`${s.dash} ${s.flowDown}`} />
      <path d="M274 100 V80" className={`${s.dash} ${s.flowDown}`} />
      <path d="M270.5 84 L274 79.5 L277.5 84" className={s.lnThin} />

      {/* kafka topic */}
      <rect x="50" y="102" width="260" height="22" rx="11" className={s.pipe} />
      {Array.from({ length: 15 }, (_, i) => (
        <path key={i} d={`M${68 + i * 16} 107 V119`} className={s.tick} />
      ))}
      <g className={s.stream}>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            cx="60"
            cy="113"
            r="4"
            className={i % 2 ? s.fInk : s.fAccent}
            style={{ animationDelay: `${-i * 0.72}s`, ['--i' as string]: 4 - i }}
          />
        ))}
      </g>

      {/* persistence */}
      <path d="M180 126 V138" className={`${s.dash} ${s.flowDown}`} />
      <Db x={169} y={139} />
      <text x="198" y="158" className={s.label}>
        mysql
      </text>

      <rect x="50" y="136" width="46" height="15" rx="7.5" className={s.fInk} />
      <text x="73" y="146.4" textAnchor="middle" className={s.labelOnInk}>
        kafka
      </text>

      <rect x="262" y="136" width="48" height="15" rx="7.5" className={s.chip} />
      <g transform="translate(270 139)">
        <Shield />
      </g>
      <text x="283" y="146.4" className={s.label}>
        jwt
      </text>
    </Browser>
  );
}

/* ── memory bank: photo grid + floating hearts ────────────────────────────── */

function MemoryBank({ uid }: { uid: string }) {
  const tiles = [
    { x: 48, y: 68, fill: s.tA, kind: 'land' },
    { x: 140, y: 68, fill: s.tB, kind: 'face' },
    { x: 232, y: 68, fill: s.tC, kind: 'lake' },
    { x: 48, y: 124, fill: s.tD, kind: 'face' },
    { x: 140, y: 124, fill: s.tE, kind: 'land' },
    { x: 232, y: 124, fill: s.tF, kind: 'sun' },
  ] as const;
  return (
    <Browser url="memorybank.app / feed">
      {/* search + actions */}
      <rect x="48" y="44" width="176" height="15" rx="7.5" className={s.field} />
      <g className={s.lnThin} transform="translate(55 47.5)">
        <circle cx="3.6" cy="3.6" r="3.2" />
        <path d="M6 6 L8.6 8.6" />
      </g>
      <path d="M69 51.5 H132" className={s.placeholder} />
      <rect x="238" y="44" width="46" height="15" rx="7.5" className={s.fAccent} />
      <text x="261" y="54.6" textAnchor="middle" className={s.labelOnInk}>
        + post
      </text>
      <circle cx="304" cy="51.5" r="7.5" className={s.avatar} />
      <circle cx="304" cy="49.6" r="2.4" className={s.fInk} />
      <path d="M299.6 56.2 C300.6 53.4, 307.4 53.4, 308.4 56.2" className={s.lnThin} />

      <defs>
        {tiles.map((t, i) => (
          <clipPath key={i} id={`${uid}-t${i}`}>
            <rect x={t.x} y={t.y} width="80" height="48" rx="6" />
          </clipPath>
        ))}
      </defs>

      {tiles.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.y} width="80" height="48" rx="6" className={t.fill} />
          <g clipPath={`url(#${uid}-t${i})`}>{tileArt(t.kind, t.x, t.y)}</g>
          <rect x={t.x} y={t.y} width="80" height="48" rx="6" className={s.tileEdge} />
        </g>
      ))}

      {/* like on the middle photo, hearts float up */}
      <g transform="translate(205 102)">
        <circle cx="5" cy="5" r="8" className={s.card} />
        <path d={HEART} className={s.fAccent} transform="translate(0.6 0.8) scale(0.85)" />
      </g>
      <g className={s.hearts}>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={HEART}
            className={s.fAccent}
            style={{ animationDelay: `${i * 0.9}s`, ['--hx' as string]: `${[0, -9, 8][i]}px` }}
            transform={`translate(${206 + i * 1.5} 96) scale(0.7)`}
          />
        ))}
      </g>

      {/* comment bubble on a lower photo */}
      <g transform="translate(106 156)">
        <path d="M0 3 a3 3 0 0 1 3 -3 h14 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 h-10 l-4 3 v-3 a3 3 0 0 1 -3 -3 z" className={s.card} />
        <circle cx="6" cy="6" r="1" className={s.fInk} />
        <circle cx="10" cy="6" r="1" className={s.fInk} />
        <circle cx="14" cy="6" r="1" className={s.fInk} />
      </g>
    </Browser>
  );
}

const HEART = 'M6 10.6 C2.2 7.8, 0 5.8, 0 3.4 C0 1.5, 1.4 0, 3.2 0 C4.4 0, 5.4 0.7, 6 1.6 C6.6 0.7, 7.6 0, 8.8 0 C10.6 0, 12 1.5, 12 3.4 C12 5.8, 9.8 7.8, 6 10.6 Z';

function tileArt(kind: string, x: number, y: number) {
  switch (kind) {
    case 'land':
      return (
        <>
          <circle cx={x + 62} cy={y + 13} r="5" className={s.sun} />
          <path d={`M${x - 2} ${y + 50} L${x + 20} ${y + 24} L${x + 32} ${y + 36} L${x + 48} ${y + 18} L${x + 82} ${y + 50} Z`} className={s.hill} />
        </>
      );
    case 'lake':
      return (
        <>
          <path d={`M${x - 2} ${y + 36} C${x + 18} ${y + 22}, ${x + 40} ${y + 24}, ${x + 82} ${y + 34} V${y + 50} H${x - 2} Z`} className={s.hill} />
          <path d={`M${x + 16} ${y + 42} h14 M${x + 44} ${y + 44} h18`} className={s.lnThin} />
          <path d={`M${x + 54} ${y + 10} l3 3 l3 -3 M${x + 62} ${y + 15} l2.4 2.4 l2.4 -2.4`} className={s.lnThin} />
        </>
      );
    case 'face':
      return (
        <>
          <circle cx={x + 40} cy={y + 19} r="8" className={s.skin} />
          <path d={`M${x + 21} ${y + 50} C${x + 23} ${y + 32}, ${x + 57} ${y + 32}, ${x + 59} ${y + 50} Z`} className={s.shirt} />
        </>
      );
    default:
      return (
        <>
          <circle cx={x + 40} cy={y + 30} r="11" className={s.sun} />
          <path d={`M${x + 40} ${y + 8} v5 M${x + 22} ${y + 18} l4 3 M${x + 58} ${y + 18} l-4 3`} className={s.lnThin} />
          <path d={`M${x - 2} ${y + 42} H${x + 82} V${y + 50} H${x - 2} Z`} className={s.hill} />
        </>
      );
  }
}

/* ── order engine: cart → order → inventory ───────────────────────────────── */

function Node({ cx, cy, children }: { cx: number; cy: number; children: ReactNode }) {
  return (
    <g>
      <circle cx={cx + 3} cy={cy + 3} r="21" className={s.shadow} />
      <circle cx={cx} cy={cy} r="21" className={s.card} />
      {children}
    </g>
  );
}

function OrderFlow() {
  const steps = ['placed', 'validated', 'packed', 'shipped'];
  return (
    <Browser url="orders / lifecycle">
      {/* cache + notification side-cars */}
      <rect x="152" y="44" width="56" height="16" rx="8" className={s.fSticky} />
      <rect x="152" y="44" width="56" height="16" rx="8" className={s.tileEdge} />
      <path d="M163 47 L159.4 53 H163 L161.6 57.6 L166.4 51 H162.8 Z" className={s.fInk} />
      <text x="170" y="55.2" className={s.label}>
        cache
      </text>
      <path d="M180 61 V73" className={`${s.dash} ${s.flowUp}`} />

      <g transform="translate(282 44)" className={s.bell}>
        <path d="M2 12 C2 5, 4 2.5, 8 2.5 C12 2.5, 14 5, 14 12 L15.5 14 H0.5 Z" className={s.fSticky} />
        <path d="M2 12 C2 5, 4 2.5, 8 2.5 C12 2.5, 14 5, 14 12 L15.5 14 H0.5 Z" className={s.ln} />
        <path d="M6 16.5 a2 2 0 0 0 4 0" className={s.ln} />
      </g>
      <circle cx="290" cy="52" r="10" className={s.ring} />
      <circle cx="290" cy="52" r="10" className={s.ring} style={{ animationDelay: '1.1s' }} />
      <path d="M198 84 C 232 70, 256 66, 280 60" className={`${s.dash} ${s.flowRight}`} />

      <Node cx={88} cy={96}>
        <g transform="translate(78 86) scale(1.55)">
          <Cart />
        </g>
      </Node>
      <Node cx={180} cy={96}>
        <g className={s.ln}>
          <path d="M172 84 H188 V107 L185.3 105 L182.6 107 L180 105 L177.4 107 L174.7 105 L172 107 Z" className={s.receipt} />
          <path d="M175.5 90 H184.5 M175.5 94.5 H184.5 M175.5 99 H181" />
        </g>
      </Node>
      <Node cx={272} cy={96}>
        <g>
          <rect x="262" y="96" width="10" height="10" rx="1.5" className={s.boxA} />
          <rect x="273" y="96" width="10" height="10" rx="1.5" className={s.boxB} />
          <rect x="267.5" y="85" width="10" height="10" rx="1.5" className={s.boxA} />
        </g>
      </Node>

      <path d="M111 96 H153" className={s.ln} />
      <path d="M149 92 L154 96 L149 100" className={s.ln} />
      <path d="M203 96 H245" className={s.ln} />
      <path d="M241 92 L246 96 L241 100" className={s.ln} />
      <rect x="112" y="91.5" width="9" height="9" rx="1.5" className={`${s.fAccent} ${s.token}`} />
      <rect x="204" y="91.5" width="9" height="9" rx="1.5" className={`${s.fAccent} ${s.token}`} style={{ animationDelay: '-1.3s' }} />

      <text x="88" y="130" textAnchor="middle" className={s.label}>
        cart
      </text>
      <text x="180" y="130" textAnchor="middle" className={s.label}>
        order
      </text>
      <text x="272" y="130" textAnchor="middle" className={s.label}>
        inventory
      </text>

      {/* lifecycle timeline */}
      <path d="M74 152 H286" className={s.track} />
      <path d="M74 152 H286" className={s.trackFill} />
      {steps.map((st, i) => {
        const x = 74 + i * (212 / 3);
        return (
          <g key={st}>
            <circle cx={x} cy="152" r="5" className={i < 2 ? `${s.stepDot} ${s.stepDone}` : s.stepDot} style={{ animationDelay: `${i * 0.7}s` }} />
            <text x={x} y="171" textAnchor="middle" className={s.labelSm}>
              {st}
            </text>
          </g>
        );
      })}
    </Browser>
  );
}

/* ── field app: phone with offline store + delta sync ─────────────────────── */

function FieldApp() {
  const rows = [0, 1, 2, 3];
  return (
    <g>
      {/* phone */}
      <rect x="68" y="16" width="92" height="172" rx="17" className={s.shadow} />
      <rect x="64" y="12" width="92" height="172" rx="17" className={s.phone} />
      <rect x="70" y="24" width="80" height="150" rx="9" className={s.screen} />
      <rect x="98" y="16.5" width="24" height="4" rx="2" className={s.speaker} />

      {/* status bar: weak signal + offline badge */}
      <g transform="translate(76 29)">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 3.2} y={6 - i * 1.6} width="2.2" height={2 + i * 1.6} rx="0.6" className={i < 2 ? s.fInk : s.barOff} />
        ))}
      </g>
      <rect x="120" y="28" width="25" height="9" rx="4.5" className={s.offline} />
      <text x="132.5" y="34.8" textAnchor="middle" className={s.labelTiny}>
        offline
      </text>

      {/* app header */}
      <rect x="74" y="42" width="72" height="16" rx="4" className={s.appBar} />
      <path d="M80 50 H108" className={s.lnPaper} />
      <circle cx="139" cy="50" r="3" className={s.lnPaper} />

      {rows.map((r) => {
        const y = 64 + r * 22;
        const queued = r >= 2;
        return (
          <g key={r} className={s.row} style={{ animationDelay: `${r * 0.25}s` }}>
            <rect x="74" y={y} width="72" height="18" rx="4" className={s.rowBg} />
            <circle cx="82" cy={y + 9} r="4" className={[s.fGreenSoft, s.fStickySoft, s.fBlueSoft, s.fTintSoft][r]} />
            <path d={`M90 ${y + 6.5} H${118 - r * 4}`} className={s.textLine} />
            <path d={`M90 ${y + 11.5} H${128 - r * 3}`} className={s.textLineSoft} />
            {queued ? (
              <g className={s.lnThin}>
                <circle cx="139" cy={y + 9} r="3.4" />
                <path d={`M139 ${y + 7} V${y + 9} L140.4 ${y + 10}`} />
              </g>
            ) : (
              <path d={`M136.4 ${y + 9} l2 2 l3.6 -4`} className={s.check} />
            )}
          </g>
        );
      })}

      <rect x="86" y="156" width="48" height="12" rx="6" className={s.fAccent} />
      <g className={s.spinSmall}>
        <path d="M97.5 159.4 a2.8 2.8 0 1 1 -1.2 3.8" className={s.lnPaper} />
        <path d="M95.4 161.4 l0.9 1.9 l1.9 -0.9" className={s.lnPaper} />
      </g>
      <text x="115" y="164.6" textAnchor="middle" className={s.labelOnInk}>
        sync
      </text>

      {/* local store */}
      <path d="M160 140 H176" className={`${s.dash} ${s.flowRight}`} />
      <Db x={179} y={128} />
      <text x="190" y="164" textAnchor="middle" className={s.label}>
        hive
      </text>

      {/* cloud + delta sync loop */}
      <path
        d="M234 82 C222 82, 218 70, 228 64 C226 50, 244 44, 252 54 C258 40, 282 42, 284 58 C298 56, 304 72, 292 82 Z"
        className={s.cloudShadow}
        transform="translate(3 3)"
      />
      <path d="M234 82 C222 82, 218 70, 228 64 C226 50, 244 44, 252 54 C258 40, 282 42, 284 58 C298 56, 304 72, 292 82 Z" className={s.cloud} />
      <text x="262" y="74" textAnchor="middle" className={s.label}>
        cloud
      </text>

      <path d="M166 70 C184 42, 204 40, 222 56" className={`${s.dashAccent} ${s.flowRight}`} />
      <path d="M216 52.6 L222.6 56.6 L220 49.6" className={s.lnAccent} />
      <path d="M244 92 C232 118, 196 124, 168 100" className={`${s.dashInk} ${s.flowRight}`} />
      <path d="M173.4 98.6 L167.4 99.6 L170 105.6" className={s.ln} />
      <g transform="translate(196 36)">
        <rect width="20" height="13" rx="3" className={s.delta} />
        <text x="10" y="9.8" textAnchor="middle" className={s.labelOnInk}>
          Δ
        </text>
      </g>
      <g transform="translate(206 116)">
        <rect width="20" height="13" rx="3" className={s.chip} />
        <text x="10" y="9.8" textAnchor="middle" className={s.label}>
          Δ
        </text>
      </g>

      {/* signal meter */}
      <g transform="translate(270 104)">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 7} y={18 - i * 5} width="5" height={4 + i * 5} rx="1.2" className={i < 2 ? s.fInk : s.barDashed} />
        ))}
        <text x="13" y="36" textAnchor="middle" className={s.labelSm}>
          low signal
        </text>
      </g>
    </g>
  );
}

/* ── job radar: sweep with blips + matches list ───────────────────────────── */

const RCX = 110;
const RCY = 110;
const SWEEP_S = 4.8;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [RCX + r * Math.sin(a), RCY - r * Math.cos(a)] as const;
};
const wedge = (from: number, to: number, r: number) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${RCX} ${RCY} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
};

function Radar() {
  const blips = [
    { deg: 38, r: 32 },
    { deg: 128, r: 44 },
    { deg: 214, r: 24 },
    { deg: 302, r: 40 },
  ];
  const lead = 64;
  const [ax, ay] = polar(lead, 56);
  const rows = [
    { y: 62, logo: 'circle', status: s.stNew, fresh: true },
    { y: 98, logo: 'tri', status: s.stApplied, fresh: false },
    { y: 134, logo: 'sq', status: s.stInterview, fresh: false },
  ];
  return (
    <Browser url="job-radar / today">
      <circle cx={RCX} cy={RCY} r="56" className={s.scope} />
      <circle cx={RCX} cy={RCY} r="38" className={s.ringLine} />
      <circle cx={RCX} cy={RCY} r="20" className={s.ringLine} />
      <path d={`M${RCX - 56} ${RCY} H${RCX + 56} M${RCX} ${RCY - 56} V${RCY + 56}`} className={s.cross} />

      <g className={s.sweep} style={{ transformOrigin: `${RCX}px ${RCY}px`, animationDuration: `${SWEEP_S}s` }}>
        <path d={wedge(lead - 70, lead, 56)} className={s.sweepA} />
        <path d={wedge(lead - 36, lead, 56)} className={s.sweepB} />
        <path d={wedge(lead - 14, lead, 56)} className={s.sweepC} />
        <path d={`M${RCX} ${RCY} L${ax.toFixed(2)} ${ay.toFixed(2)}`} className={s.lnAccent} />
      </g>

      {blips.map((b, i) => {
        const [x, y] = polar(b.deg, b.r);
        const delay = ((((b.deg - lead) % 360) + 360) % 360) / 360 * SWEEP_S;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="7" className={s.blipRing} style={{ animationDelay: `${delay}s`, animationDuration: `${SWEEP_S}s` }} />
            <circle cx={x} cy={y} r="3.2" className={s.blip} style={{ animationDelay: `${delay}s`, animationDuration: `${SWEEP_S}s` }} />
          </g>
        );
      })}
      <circle cx={RCX} cy={RCY} r="2.6" className={s.fInk} />

      {/* matches list */}
      <text x="186" y="54" className={s.labelSm}>
        new matches
      </text>
      <g transform="translate(298 45)">
        <Mail />
        <circle cx="13" cy="1.6" r="3" className={`${s.fAccent} ${s.ping}`} />
      </g>
      {rows.map((r, i) => (
        <g key={i} className={i === 0 ? s.matchNew : undefined}>
          <rect x="186" y={r.y} width="130" height="28" rx="6" className={s.card} />
          <rect x="192" y={r.y + 5} width="18" height="18" rx="4" className={[s.fBlueSoft, s.fStickySoft, s.fGreenSoft][i]} />
          {r.logo === 'circle' && <circle cx="201" cy={r.y + 14} r="4.2" className={s.lnThin} />}
          {r.logo === 'tri' && <path d={`M201 ${r.y + 9.5} L205.4 ${r.y + 17.5} H196.6 Z`} className={s.lnThin} />}
          {r.logo === 'sq' && <rect x="197" y={r.y + 10} width="8" height="8" rx="1.5" className={s.lnThin} />}
          <path d={`M216 ${r.y + 10.5} H${262 - i * 8}`} className={s.textLine} />
          <path d={`M216 ${r.y + 17.5} H${248 + i * 6}`} className={s.textLineSoft} />
          {r.fresh ? (
            <g className={s.ping}>
              <rect x="282" y={r.y + 8} width="26" height="12" rx="6" className={s.fAccent} />
              <text x="295" y={r.y + 16.8} textAnchor="middle" className={s.labelOnInk}>
                new
              </text>
            </g>
          ) : (
            <circle cx="302" cy={r.y + 14} r="3.6" className={r.status} />
          )}
        </g>
      ))}
    </Browser>
  );
}

function Generic({ title }: { title: string }) {
  return (
    <Browser url="project">
      <text x="180" y="112" textAnchor="middle" className={s.label}>
        {title}
      </text>
    </Browser>
  );
}
