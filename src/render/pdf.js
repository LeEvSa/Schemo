// PDF sans Electron (Android) : chaque page est une image JPEG du SVG, posée sur une page de la bonne taille.
// Electron, lui, imprime le SVG en vectoriel (electron/main.cjs, export:pdf) ; mêmes tailles de page et marges.
import { svgToPngBase64 } from './export.js';

const PAGE_INCHES = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17] };
const enc = new TextEncoder();
const fx = (v) => (Math.round(v * 100) / 100).toString();

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '') ? hex : '#ffffff';
  return [1, 3, 5].map((i) => fx(parseInt(m.slice(i, i + 2), 16) / 255)).join(' ');
}

// pages : [{ svg, w, h }] (pixels CSS) → PDF en base64
export async function pdfFromPages({ pages, pageSize, background }) {
  const bg = /^#[0-9a-f]{6}$/i.test(background || '') ? background : '#ffffff';
  const fixed = PAGE_INCHES[pageSize];
  let pw, ph, margin = 0;
  if (fixed) {
    const landscape = pages.reduce((s, x) => s + (x.w >= x.h ? 1 : -1), 0) >= 0;
    [pw, ph] = (landscape ? [fixed[1], fixed[0]] : fixed).map((v) => v * 72);
    margin = 0.4 * 72;
  }
  const chunks = [];
  let size = 0;
  const offsets = [];
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; put(`${n} 0 obj\n`); for (const b of [].concat(body)) put(b); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const kids = [];
  let n = 3;
  for (const pg of pages) {
    const W = fixed ? pw : pg.w * 0.75, H = fixed ? ph : pg.h * 0.75;
    const scale = Math.max(1, Math.min(3, 4200 / Math.max(pg.w, pg.h)));
    const b64 = await svgToPngBase64(pg.svg, pg.w, pg.h, scale, { type: 'image/jpeg', quality: 0.92, background: bg });
    const jpg = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iw = Math.round(pg.w * scale), ih = Math.round(pg.h * scale);
    // l'image garde ses proportions, centrée dans la page (moins les marges)
    const k = Math.min((W - 2 * margin) / pg.w, (H - 2 * margin) / pg.h);
    const dw = pg.w * k, dh = pg.h * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
    const content = `${rgb(bg)} rg 0 0 ${fx(W)} ${fx(H)} re f q ${fx(dw)} 0 0 ${fx(dh)} ${fx(dx)} ${fx(dy)} cm /Im0 Do Q`;
    const pageN = n, contN = n + 1, imgN = n + 2;
    n += 3;
    kids.push(pageN);
    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fx(W)} ${fx(H)}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`);
    obj(contN, [`<< /Length ${enc.encode(content).length} >>\nstream\n`, content, '\nendstream']);
    obj(imgN, [`<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
  const xref = size;
  put(`xref\n0 ${n}\n0000000000 65535 f \n`);
  for (let i = 1; i < n; i++) put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  let s = '';
  for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
  return btoa(s);
}
