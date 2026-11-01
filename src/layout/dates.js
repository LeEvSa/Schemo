// Comprend une date ou une période écrite librement, pour classer une chronologie. Le texte affiché reste celui que la
// personne a écrit. Une date devient un nombre qui se trie (plus petit = plus tôt).

const MONTHS = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};
const SEASONS = { printemps: 3, spring: 3, ete: 6, summer: 6, automne: 9, fall: 9, autumn: 9, hiver: 12, winter: 12 };

const BCE = /\b(av\.?\s*j\.?\s*-?\s*c\.?|avant\s+j\.?\s*-?\s*c\.?|bce?)(?=\s|$)/;
const TIME = /\b(\d{1,2})\s*[h:]\s*(\d{2})?(?!\d)/;
const SEPARATOR = /\s+(?:a|au|aux|jusqu'a|jusqu'au|jusqu'en|to|until|till|through|thru)\s+|\s*(?:->|→|[–—]|\.{2,}|…)\s*|\s+-\s+/;
const NOW = /^(aujourd'?\s*hui|maintenant|present|nos jours|ce jour|now|today|\?)$/;

const key = (y, m, d) => y * 372 + (m - 1) * 31 + (d - 1);

const clean = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").replace(/−/g, '-').toLowerCase().trim();

// Lit une seule date : ce qui n'est pas écrit reste null (une période le prendra de son autre bout). Rend null si ce n'est pas une date.
function read(text) {
  const c = { y: null, m: null, d: null, t: null, lastM: null, bare: false, bce: false };
  let s = text.replace(/(\d)t(\d)/, '$1 $2');
  s = s.replace(TIME, (m, h, min) => { c.t = +h * 60 + +(min || 0); return ' '; }).trim();
  if (BCE.test(s)) { c.bce = true; s = s.replace(BCE, ' ').trim(); }
  const year = (y) => (c.bce ? -Math.abs(y) : y);
  // 2026-03-15, 2026/03, 2026.03
  let m = /^(-?\d{3,6})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) { c.y = year(+m[1]); c.m = +m[2]; if (m[3]) c.d = +m[3]; return c; }
  // 15/03/2026, et 03/15/2026 quand le deuxième nombre ne peut pas être un mois
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    c.y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    [c.m, c.d] = +m[2] > 12 ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return c;
  }
  const yearIn = (str) => { const n = /-?\d{3,6}/.exec(str); return n ? year(+n[0]) : null; };
  // T1 2026, Q3 2026
  m = /\b[tq]([1-4])\b/.exec(s);
  if (m) { c.m = (+m[1] - 1) * 3 + 1; c.lastM = +m[1] * 3; c.y = yearIn(s.replace(m[0], ' ')); return c; }
  const words = s.match(/[a-z]+/g) || [];
  // printemps 2026, été 2026
  const season = words.map((w) => SEASONS[w]).find(Boolean);
  if (season) { c.m = season; c.lastM = season + 2; c.y = yearIn(s); return c; }
  // 15 mars 2026, 1er mai 2026, March 15, 2026, sept. 2026
  const month = words.map((w) => MONTHS[w]).find(Boolean);
  if (month) {
    const nums = (s.match(/\d+/g) || []).map(Number);
    const y = nums.find((n) => n > 31);
    const d = nums.find((n) => n >= 1 && n <= 31);
    c.m = month;
    if (y !== undefined) c.y = year(y);
    if (d !== undefined) c.d = d;
    return c;
  }
  // 1967, l'an 2000, -500, Jour 3, Semaine 12
  m = /-?\d+/.exec(s);
  if (m) { c.y = year(+m[0]); c.bare = true; return c; }
  return c.t !== null ? c : null;
}

const timeOnly = (c) => c.y === null && c.m === null && c.d === null;
const startOf = (c) => (timeOnly(c) ? c.t / 1440 : key(c.y ?? 0, c.m ?? 1, c.d ?? 1) + (c.t ?? 0) / 1440);
// la fin d'une période va jusqu'au bout de ce qui est écrit : « 2010 » comprend toute l'année 2010
const endOf = (c) => (timeOnly(c) ? c.t / 1440 : key(c.y ?? 0, c.lastM ?? c.m ?? 12, c.d ?? 31) + (c.t ?? 1439) / 1440);

// Chaque bout d'une période prend à l'autre ce qui lui manque : « du 3 au 15 mars 2026 », « mars à juin 2026 », « 1990 à 95 ».
function complete(a, b) {
  if (a.y !== null && b.bare && Math.abs(b.y) < 100 && Math.abs(a.y) >= 1000) {
    const y = Math.floor(a.y / 100) * 100 + Math.abs(b.y);
    b.y = y < a.y ? y + 100 : y;
    b.bare = false;
  }
  const toDay = (c, other) => { if (c.bare && c.y >= 1 && c.y <= 31 && other.m !== null) { c.d = c.y; c.y = null; c.bare = false; } };
  toDay(a, b);
  toDay(b, a);
  if (b.bce && !a.bce && a.y !== null) { a.y = -Math.abs(a.y); a.bce = true; }
  for (const [c, o] of [[a, b], [b, a]]) {
    if (timeOnly(c) && !timeOnly(o)) { c.y = o.y; c.m = o.m; c.d = o.d; continue; }
    if (c.y === null) c.y = o.y;
    if (c.m === null && c.d !== null) c.m = o.m;
  }
}

function splitRange(s) {
  let m = /^(?:entre|between)\s+(.+?)\s+(?:et|and)\s+(.+)$/.exec(s);
  if (m) return [m[1], m[2]];
  // 1990-95, sans confondre avec 2026-03 (mars 2026)
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return +m[2] > 12 ? [m[1], m[2]] : null;
  m = /^(-?\d{3,6})-(\d{3,6})$/.exec(s);
  if (m) return [m[1], m[2]];
  // mars-juin 2026
  m = /^([a-z.]+)-([a-z.]+)(\s.*)?$/.exec(s);
  const isMonth = (w) => MONTHS[w.replace(/\./g, '')];
  if (m && isMonth(m[1]) && isMonth(m[2])) return [m[1], m[2] + (m[3] || '')];
  const sep = SEPARATOR.exec(s);
  return sep ? [s.slice(0, sep.index), s.slice(sep.index + sep[0].length)] : null;
}

// Années 1990, 1990s, XXe siècle : une période en deux ou trois mots.
function namedPeriod(s) {
  let m = /\b(?:annees|decennie)\s+(\d{4}|\d{2})\b/.exec(s) || /\b(\d{4}|\d{2})'?s\b/.exec(s);
  if (m) {
    const y = m[1].length === 2 ? 1900 + +m[1] : +m[1];
    return { start: key(y, 1, 1), end: key(y + 9, 12, 31) + 1439 / 1440 };
  }
  m = /\b(\d{1,2})\s*(?:e|eme|ieme|er|th|st|nd|rd)?\s+(?:siecle|century)\b/.exec(s) || /\b([ivxlc]+?)(?:e|eme|ieme|er)?\s+siecle\b/.exec(s);
  if (!m) return null;
  const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  const n = /\d/.test(m[1]) ? +m[1] : [...m[1]].reduce((sum, ch, i, all) => sum + (ROMAN[all[i + 1]] > ROMAN[ch] ? -ROMAN[ch] : ROMAN[ch]), 0);
  if (BCE.test(s)) return { start: key(-n * 100, 1, 1), end: key(-(n - 1) * 100 - 1, 12, 31) };
  return { start: key((n - 1) * 100 + 1, 1, 1), end: key(n * 100, 12, 31) + 1439 / 1440 };
}

// { start, end } : `end` vaut null pour une date simple et Infinity pour une période encore en cours. null si ce n'est pas une date.
export function parseSpan(text) {
  const s = clean(text);
  if (!s) return null;
  // depuis 2010, 2010 -
  const since = /^(?:depuis|since)\s+(.+)$/.exec(s) || /^(.+?)\s*[-–—]$/.exec(s);
  if (since) {
    const a = read(since[1]);
    return a ? { start: startOf(a), end: Infinity } : null;
  }
  const pair = splitRange(s);
  if (pair) {
    const a = read(pair[0]);
    if (a && NOW.test(pair[1].trim())) return { start: startOf(a), end: Infinity };
    const b = read(pair[1]);
    if (a && b) {
      complete(a, b);
      const [start, end] = [startOf(a), endOf(b)];
      return end < start ? { start: startOf(b), end: endOf(a) } : { start, end };
    }
  }
  const named = namedPeriod(s);
  if (named) return named;
  const one = read(s);
  return one ? { start: startOf(one), end: null } : null;
}

export function parseDate(text) {
  const span = parseSpan(text);
  return span ? span.start : null;
}

// Classe par début, puis par fin (la période la plus courte d'abord). Une case sans date reste juste après celle qui la précède dans `base`.
export function chronoOrder(base, dateOf) {
  let prev = { start: -Infinity, end: null };
  return base
    .map((id, i) => {
      const span = parseSpan(dateOf(id));
      if (span) prev = span;
      return { id, i, k: prev.start, e: prev.end ?? prev.start };
    })
    .sort((a, b) => a.k - b.k || a.e - b.e || a.i - b.i)
    .map((x) => x.id);
}
