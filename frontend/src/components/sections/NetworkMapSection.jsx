import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import IconByName from '../common/IconByName';
import Reveal from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';
import { US_CITIES, US_LINKS, US_MAP_VIEWBOX, US_STATES } from '../../content/usMap';

const ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
// A state's full name is written when it fits inside the state; small states in the north-east show their two-letter code instead.
const STATE_LABELS = US_STATES.filter((st) => ABBR[st.name]).map((st) => ({ name: st.name, x: st.x, y: st.y, text: st.w >= st.name.length * 6.4 ? st.name : ABBR[st.name] }));

const CITY = Object.fromEntries(US_CITIES.map((c) => [c.id, c]));

// Every link joins two cities; the curve bows slightly (alternating sides) so crossing lanes stay readable.
const ROUTES = US_LINKS.map(([from, to], i) => {
  const A = CITY[from], B = CITY[to];
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  const bow = Math.min(len * 0.12, 22) * (i % 2 ? 1 : -1);
  return { d: `M${A.x} ${A.y} Q${(mx - (dy / len) * bow).toFixed(1)} ${(my + (dx / len) * bow).toFixed(1)} ${B.x} ${B.y}`, len };
});
// Longer lanes carry a travelling marker (a shipment on its way); the rest only draw.
const DOT_ROUTES = ROUTES.filter((r) => r.len > 110).slice(0, 16);

const PILLARS = [
  { icon: 'shield', title: 'Experience', text: 'A team that coordinates pickup, transit and delivery so you are not chasing details.' },
  { icon: 'network', title: 'Capacity', text: 'A carrier network built around dependable coverage across the U.S.' },
  { icon: 'route', title: 'Flexibility', text: 'Full truckload, LTL and specialized equipment to suit the shipment in front of you.' },
];

// Animation lives in this scoped stylesheet. Motion only runs when the visitor has not asked for reduced motion; otherwise the
// map is shown complete and still (routes fully drawn, hubs marked, no travelling markers).
const CSS = `
.nm-dot{display:none}
@media (prefers-reduced-motion: no-preference){
  .nm-route{stroke-dasharray:1;stroke-dashoffset:1}
  [data-visible='true'] .nm-route{animation:nm-draw 3.2s cubic-bezier(.65,0,.35,1) forwards}
  .nm-dot{display:block;offset-rotate:0deg;animation:nm-travel 7s linear infinite;opacity:0}
  .nm-ring{transform-box:fill-box;transform-origin:center;animation:nm-pulse 3.2s ease-out infinite}
}
@keyframes nm-draw{to{stroke-dashoffset:0}}
@keyframes nm-travel{0%{offset-distance:0%;opacity:0}8%{opacity:1}92%{opacity:1}100%{offset-distance:100%;opacity:0}}
@keyframes nm-pulse{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.4);opacity:0}}
`;

function NetworkMap() {
  return (
    <svg viewBox={US_MAP_VIEWBOX} role="img" aria-label="Map of the United States showing freight routes connecting major cities across all states" className="h-full w-full">
      <style>{CSS}</style>
      <defs>
        <radialGradient id="nm-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#d8ad54" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#d8ad54" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="6" y="2" width="963" height="617" fill="url(#nm-glow)" />
      <g fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.9" strokeLinejoin="round">
        {US_STATES.map((st) => <path key={st.name} d={st.d}><title>{st.name}</title></path>)}
      </g>
      <g fill="rgba(255,255,255,0.62)" fontSize="11" fontWeight="600" textAnchor="middle" pointerEvents="none" letterSpacing="0.3">
        {STATE_LABELS.map((st) => <text key={st.name} x={st.x} y={st.y + 4}>{st.text}</text>)}
      </g>
      <g fill="none" stroke="rgba(216,173,84,0.2)" strokeWidth="1.2" strokeDasharray="3 5" strokeLinecap="round">
        {ROUTES.map((r) => <path key={`track-${r.d}`} d={r.d} />)}
      </g>
      <g fill="none" stroke="#d8ad54" strokeWidth="1.8" strokeLinecap="round" opacity="0.8">
        {ROUTES.map((r, i) => <path key={r.d} d={r.d} pathLength="1" className="nm-route" style={{ animationDelay: `${(i % 24) * 0.2}s` }} />)}
      </g>
      {DOT_ROUTES.map((r, i) => (
        <circle key={`dot-${r.d}`} r="4.5" cx="0" cy="0" fill="#f2d28a" className="nm-dot" style={{ offsetPath: `path('${r.d}')`, animationDelay: `${4 + i * 0.7}s`, animationDuration: `${6 + (i % 4)}s`, filter: 'drop-shadow(0 0 4px #d8ad54)' }} />
      ))}
      {US_CITIES.map((c, i) => (
        <g key={c.id}>
          {c.label ? <circle cx={c.x} cy={c.y} r="6" fill="none" stroke="#d8ad54" strokeWidth="1.2" className="nm-ring" style={{ animationDelay: `${i * 0.3}s` }} /> : null}
          <circle cx={c.x} cy={c.y} r={c.label ? 5.5 : 3.6} fill="#d8ad54" stroke="#111" strokeWidth="1" />
          {c.label ? <text x={c.x + 9} y={c.y - 9} fontSize="17" fontWeight="700" fill="#fff" stroke="#111" strokeWidth="3.5" paintOrder="stroke">{c.name}</text> : null}
        </g>
      ))}
    </svg>
  );
}

export default function NetworkMapSection({ id = 'network', headingAs }) {
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone="darker" labelledBy={headingId}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <Reveal variant="zoom" className="aspect-[963/617] w-full overflow-hidden rounded-3xl border border-white/10 bg-black/30">
          <NetworkMap />
        </Reveal>
        <div>
          <SectionHeading id={headingId} eyebrow="Our Network" title="Experience. Capacity. Flexibility." description="Hashimi Logistics coordinates freight across the United States and between the U.S., Canada and Mexico, matching each shipment with suitable carriers and equipment." dark as={headingAs} className="mb-8 sm:mb-8" />
          <ul className="mb-8 grid gap-5">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <IconByName name={p.icon} className="mt-1 size-6 shrink-0 text-signal-400" />
                <div>
                  <h3 className="text-lg font-bold">{p.title}</h3>
                  <p className="text-base text-steel-200">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            to={PATHS.about}
            className="group/cta inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-signal-400 bg-black/45 px-5 text-sm font-bold tracking-wide text-white backdrop-blur-sm transition-[background-color,color,transform] duration-300 ease-out hover:bg-signal-400 hover:text-ink-950 focus-visible:bg-signal-400 focus-visible:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400 active:translate-y-px motion-reduce:transition-none"
          >
            Learn more
            <ArrowRight className="size-4 text-signal-400 transition-transform duration-300 group-hover/cta:translate-x-1 group-hover/cta:text-ink-950 group-focus-visible/cta:translate-x-1 group-focus-visible/cta:text-ink-950 motion-reduce:transition-none" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </SectionShell>
  );
}
