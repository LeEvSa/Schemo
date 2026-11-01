// Markdown de la description d'une case, sans dépendance. Chaque ligne écrite reste une ligne : dans une case, on veut
// voir ses retours à la ligne (les lignes voisines ne sont pas fusionnées en paragraphe comme en Markdown strict).
// Pris en charge : **gras**, *italique*, `code`, ~~barré~~, [lien](url), # titres, listes (-, 1., - [ ]), > citation,
// --- ligne, ``` bloc de code. Le texte finit toujours en textContent : rien de ce qui est écrit ne peut s'exécuter.

const MARKS = [['**', 'bold'], ['__', 'bold'], ['~~', 'strike'], ['*', 'italic'], ['_', 'italic']];

// Position du marqueur fermant, ou -1. Pas d'espace juste à l'intérieur : « 2 * 3 * 4 » reste du texte.
function closing(src, m, from) {
  const ch = m[0];
  if (from >= src.length || /\s/.test(src[from])) return -1;
  for (let j = src.indexOf(m, from); j >= 0; j = src.indexOf(m, j + 1)) {
    if (m.length === 1 && src[j + 1] === ch) { j++; continue; } // un ** à l'intérieur d'un *…*
    if (j === from || /\s/.test(src[j - 1])) continue;
    if (m.length > 1) while (src[j + m.length] === ch) j++; // ***gras et italique***
    if (ch === '_' && /\w/.test(src[j + m.length] || '')) continue;
    return j;
  }
  return -1;
}

// Styles en ligne → morceaux { text, bold?, italic?, code?, strike?, link? }.
export function parseInline(src, style = {}) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ text: buf, ...style }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && /[\\`*_[\]()#+\-.!~>]/.test(src[i + 1] || '')) { buf += src[i + 1]; i += 2; continue; }
    if (c === '`') {
      const j = src.indexOf('`', i + 1);
      if (j > i + 1) { flush(); out.push({ text: src.slice(i + 1, j), ...style, code: true }); i = j + 1; continue; }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\([^)]*\)/.exec(src.slice(i));
      if (m) { flush(); out.push(...parseInline(m[1], { ...style, link: true })); i += m[0].length; continue; }
    }
    const mark = MARKS.find(([m]) => src.startsWith(m, i));
    if (mark && !(mark[0][0] === '_' && /\w/.test(src[i - 1] || ''))) {
      const [m, key] = mark;
      const j = closing(src, m, i + m.length);
      if (j > 0) {
        flush();
        out.push(...parseInline(src.slice(i + m.length, j), { ...style, [key]: true }));
        i = j + m.length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

function parseBlocks(src) {
  const blocks = [];
  let fence = null;
  for (const raw of String(src || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    const f = /^\s*(```|~~~)/.exec(line);
    if (f && (!fence || fence === f[1])) { fence = fence ? null : f[1]; continue; }
    if (fence) {
      blocks.push(line.trim() ? { kind: 'code', runs: [{ text: line.trim(), code: true }] } : { kind: 'gap' });
      continue;
    }
    if (!line.trim()) { blocks.push({ kind: 'gap' }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ kind: 'rule' }); continue; }
    let m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) { blocks.push({ kind: 'h', level: m[1].length, runs: parseInline(m[2]) }); continue; }
    m = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (m) {
      const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
      const ordered = /\d/.test(m[2]);
      blocks.push({
        kind: 'li', level: Math.min(4, Math.floor(m[1].length / 2)),
        marker: task ? (task[1] === ' ' ? '☐' : '☑') : ordered ? m[2].replace(')', '.') : 'dot',
        runs: parseInline(task ? task[2] : m[3]),
      });
      continue;
    }
    m = /^\s*>\s?(.*)$/.exec(line);
    if (m) { blocks.push({ kind: 'quote', runs: parseInline(m[1], { italic: true }) }); continue; }
    blocks.push({ kind: 'p', runs: parseInline(line.trim()) });
  }
  // pas d'espace vide au début, à la fin, ni de grands trous
  const out = blocks.filter((b, i) => b.kind !== 'gap' || (i > 0 && blocks[i - 1].kind !== 'gap'));
  while (out.length && out[out.length - 1].kind === 'gap') out.pop();
  while (out.length && out[0].kind === 'gap') out.shift();
  return out;
}

// La disposition relit le même texte des dizaines de fois : on garde le résultat (qui n'est jamais modifié).
const cache = new Map();
export function parseMarkdown(src) {
  const key = String(src || '');
  let blocks = cache.get(key);
  if (!blocks) {
    if (cache.size > 5000) cache.clear();
    blocks = parseBlocks(key);
    cache.set(key, blocks);
  }
  return blocks;
}

// Le texte sans sa mise en forme (recherche).
export function markdownPlain(src) {
  return parseMarkdown(src).map((b) => (b.runs || []).map((r) => r.text).join('')).filter(Boolean).join(' ');
}
