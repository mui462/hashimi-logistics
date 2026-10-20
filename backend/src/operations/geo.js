/**
 * Service-area matching. Carriers describe where they run as free text (`operatingRegions`), so matching is a
 * normalised text comparison, not geometry. A region matches a stop when it names the stop's country, state or
 * province (by name or abbreviation), city, or ZIP/postal prefix, or is a wildcard such as "Nationwide".
 * This is deliberately approximate; the result says which kind of match was found so staff can judge it.
 */

const pairs = (text) => Object.fromEntries(text.split(',').map((entry) => entry.trim().split('=')));

const US = pairs(
  'AL=Alabama,AK=Alaska,AZ=Arizona,AR=Arkansas,CA=California,CO=Colorado,CT=Connecticut,DE=Delaware,DC=District of Columbia,FL=Florida,GA=Georgia,HI=Hawaii,ID=Idaho,IL=Illinois,IN=Indiana,IA=Iowa,KS=Kansas,KY=Kentucky,LA=Louisiana,ME=Maine,MD=Maryland,MA=Massachusetts,MI=Michigan,MN=Minnesota,MS=Mississippi,MO=Missouri,MT=Montana,NE=Nebraska,NV=Nevada,NH=New Hampshire,NJ=New Jersey,NM=New Mexico,NY=New York,NC=North Carolina,ND=North Dakota,OH=Ohio,OK=Oklahoma,OR=Oregon,PA=Pennsylvania,RI=Rhode Island,SC=South Carolina,SD=South Dakota,TN=Tennessee,TX=Texas,UT=Utah,VT=Vermont,VA=Virginia,WA=Washington,WV=West Virginia,WI=Wisconsin,WY=Wyoming'
);
const CA = pairs(
  'AB=Alberta,BC=British Columbia,MB=Manitoba,NB=New Brunswick,NL=Newfoundland and Labrador,NS=Nova Scotia,NT=Northwest Territories,NU=Nunavut,ON=Ontario,PE=Prince Edward Island,QC=Quebec,SK=Saskatchewan,YT=Yukon'
);
const MX = pairs(
  'AGU=Aguascalientes,BCN=Baja California,BCS=Baja California Sur,CAM=Campeche,CHP=Chiapas,CHH=Chihuahua,CMX=Ciudad de Mexico,COA=Coahuila,COL=Colima,DUR=Durango,GUA=Guanajuato,GRO=Guerrero,HID=Hidalgo,JAL=Jalisco,MEX=Estado de Mexico,MIC=Michoacan,MOR=Morelos,NAY=Nayarit,NLE=Nuevo Leon,OAX=Oaxaca,PUE=Puebla,QUE=Queretaro,ROO=Quintana Roo,SLP=San Luis Potosi,SIN=Sinaloa,SON=Sonora,TAB=Tabasco,TAM=Tamaulipas,TLA=Tlaxcala,VER=Veracruz,YUC=Yucatan,ZAC=Zacatecas'
);

const STATES_BY_COUNTRY = { US, CA, MX };

export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COUNTRY_NAMES = {
  US: ['us', 'usa', 'united states', 'united states of america', 'america'],
  CA: ['ca', 'can', 'canada'],
  MX: ['mx', 'mex', 'mexico'],
};
const WILDCARDS = ['nationwide', 'north america', 'all', 'anywhere', 'continental us', 'lower 48'];

/** Everything a stop can be called, normalised. */
export function stopTokens(stop) {
  const country = stop?.country;
  const stateRaw = stop?.state ? String(stop.state).trim() : '';
  const table = STATES_BY_COUNTRY[country] ?? {};
  const abbreviation = Object.keys(table).find((code) => code.toLowerCase() === stateRaw.toLowerCase());
  const stateName = abbreviation ? table[abbreviation] : Object.values(table).find((name) => normalizeText(name) === normalizeText(stateRaw));
  const stateCode = abbreviation ?? Object.keys(table).find((code) => table[code] === stateName);
  return {
    country: new Set(COUNTRY_NAMES[country] ?? []),
    state: new Set([stateRaw && normalizeText(stateRaw), stateName && normalizeText(stateName), stateCode && normalizeText(stateCode)].filter(Boolean)),
    city: normalizeText(stop?.city),
    zip: normalizeText(stop?.zipCode).replace(/ /g, ''),
  };
}

/**
 * How a carrier's regions cover one stop: 'city' | 'zip' | 'state' | 'country' | 'wildcard' | null.
 * The most specific match wins.
 */
export function regionCoverage(regions, stop) {
  const tokens = stopTokens(stop);
  let best = null;
  const rank = { wildcard: 1, country: 2, state: 3, zip: 4, city: 5 };
  const consider = (kind) => {
    if (!best || rank[kind] > rank[best]) best = kind;
  };
  for (const raw of regions ?? []) {
    const region = normalizeText(raw);
    if (!region) continue;
    if (WILDCARDS.includes(region)) consider('wildcard');
    if (tokens.country.has(region)) consider('country');
    if (tokens.state.has(region)) consider('state');
    if (tokens.city && (region === tokens.city || region === `${tokens.city} ${[...tokens.state][0] ?? ''}`.trim())) consider('city');
    if (tokens.zip && /^\d{3,5}$/.test(region.replace(/ /g, '')) && tokens.zip.startsWith(region.replace(/ /g, ''))) consider('zip');
  }
  return best;
}
