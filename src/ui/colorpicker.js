// Sélecteur de couleur de Schémo. Remplace celui de Chromium, qui ouvre toujours en RGB et ne se règle pas :
// ici HEX par défaut, et le mode choisi (HEX / RGB / HSL) reste dans les préférences, comme les couleurs récentes.
import { tr } from '../i18n.js';
import { h } from './dom.js';
import { io } from '../io.js';

const MODES = ['hex', 'rgb', 'hsl'];
const RECENT_MAX = 10;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');

function hueOf(r, g, b, mx, d) {
  if (!d) return 0;
  let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh *= 60;
  return hh < 0 ? hh + 360 : hh;
}
export function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  return [hueOf(r, g, b, mx, d), mx ? d / mx : 0, mx];
}
export function hsvToRgb([hh, s, v]) {
  const f = (n) => { const k = (n + hh / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
  return [f(5), f(3), f(1)];
}
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  return [hueOf(r, g, b, mx, d), d ? (d / (1 - Math.abs(2 * l - 1))) * 100 : 0, l * 100];
}
export function hslToRgb([hh, s, l]) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + hh / 30) % 12; return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
  return [f(0), f(8), f(4)];
}

let current = null;
export const closeColorPicker = () => { if (current) current.close(); };
export const colorPickerOpen = () => !!current;

// anchor : l'élément cliqué (la fenêtre s'ouvre dessous). onInput(hex) à chaque changement ; onDone(hex | null) à la
// fermeture (null : rien n'a changé ou Échap). Clic ailleurs ou Entrée : on garde la couleur ; Échap : on revient au départ.
export function openColorPicker(app, anchor, value, { onInput, onDone } = {}) {
  if (current && current.anchor === anchor) { current.close(); return; }
  closeColorPicker();
  const prefs = app.prefs || (app.prefs = {});
  let mode = MODES.includes(prefs.colorMode) ? prefs.colorMode : 'hex';
  const startRgb = hexToRgb(value) || hexToRgb('#2f6fde');
  const start = rgbToHex(startRgb);
  let hsv = rgbToHsv(startRgb);
  let hex = start;

  const svThumb = h('div', { class: 'cp-thumb' });
  const sv = h('div', { class: 'cp-sv', tabindex: 0, 'aria-label': tr('Saturation et luminosité') }, svThumb);
  const hueThumb = h('div', { class: 'cp-thumb' });
  const hue = h('div', { class: 'cp-hue', tabindex: 0, 'aria-label': tr('Teinte') }, hueThumb);
  const preview = h('div', { class: 'cp-preview', title: tr('Couleur de départ / nouvelle couleur') },
    h('span', { style: { background: start }, onclick: () => setRgb(startRgb, 'all') }), h('span', { class: 'cp-new' }));
  const modeSeg = h('div', { class: 'seg cp-modes' });
  const fields = h('div', { class: 'cp-fields' });
  const recent = h('div', { class: 'cp-recent' });
  const el = h('div', { class: 'cpick', role: 'dialog', 'aria-label': tr('Choisir une couleur') },
    sv, h('div', { class: 'cp-row' }, preview, hue), modeSeg, fields, recent);

  // ---- état → affichage
  let inputs = [];
  function fieldValues() {
    const rgb = hexToRgb(hex);
    if (mode === 'hex') return [hex.toUpperCase()];
    if (mode === 'rgb') return rgb.map(Math.round);
    const [hh, s, l] = rgbToHsl(rgb);
    return [Math.round(hsv[1] && hsv[2] ? hh : hsv[0]) % 360, Math.round(s), Math.round(l)];
  }
  // exact : la couleur tapée ou choisie telle quelle (sinon celle du carré, qui passe par un arrondi)
  function paint(source, exact) {
    const next = exact || rgbToHex(hsvToRgb(hsv));
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]}, 100%, 50%))`;
    svThumb.style.left = hsv[1] * 100 + '%';
    svThumb.style.top = (1 - hsv[2]) * 100 + '%';
    svThumb.style.background = next;
    hueThumb.style.left = (hsv[0] / 360) * 100 + '%';
    hueThumb.style.background = `hsl(${hsv[0]}, 100%, 50%)`;
    preview.lastChild.style.background = next;
    const changed = next !== hex;
    hex = next;
    if (source !== 'field') fieldValues().forEach((v, i) => { if (inputs[i]) inputs[i].value = v; });
    if (changed && onInput) onInput(hex);
  }
  // Une couleur venue d'un champ ou d'une pastille : on garde la teinte (et la saturation) quand elles disparaissent (gris, noir).
  function setRgb(rgb, source) {
    const n = rgbToHsv(rgb);
    if (!n[2]) n[1] = hsv[1];
    if (!n[1] || !n[2]) n[0] = hsv[0];
    hsv = n;
    paint(source, rgbToHex(rgb));
  }

  // ---- champs
  function buildModes() {
    modeSeg.replaceChildren(...MODES.map((m) => h('button', {
      type: 'button', class: 'seg-btn' + (m === mode ? ' on' : ''),
      onclick: () => { if (m === mode) return; mode = m; prefs.colorMode = m; io.prefsSet({ colorMode: m }); buildModes(); buildFields(); },
    }, m.toUpperCase())));
  }
  function buildFields() {
    const spec = mode === 'hex' ? [['HEX']] : mode === 'rgb' ? [['R', 255], ['G', 255], ['B', 255]] : [['H', 359], ['S', 100], ['L', 100]];
    inputs = spec.map(([, max]) => h('input', mode === 'hex'
      ? { class: 'cp-inp', type: 'text', maxlength: 7, spellcheck: 'false' }
      : { class: 'cp-inp', type: 'number', min: 0, max, step: 1 }));
    const read = () => {
      if (mode === 'hex') return hexToRgb(inputs[0].value);
      const v = inputs.map((i) => Number(i.value));
      if (inputs.some((i) => i.value.trim() === '') || v.some((x) => !Number.isFinite(x))) return null;
      return mode === 'rgb' ? v.map((x) => clamp(x, 0, 255)) : hslToRgb([clamp(v[0], 0, 360) % 360, clamp(v[1], 0, 100), clamp(v[2], 0, 100)]);
    };
    for (const inp of inputs) {
      inp.addEventListener('input', () => { const rgb = read(); if (rgb) setRgb(rgb, 'field'); });
      inp.addEventListener('change', () => fieldValues().forEach((v, i) => { inputs[i].value = v; }));
      inp.addEventListener('focus', () => inp.select());
    }
    fields.replaceChildren(...spec.map(([label], i) => h('label', { class: 'cp-field' + (mode === 'hex' ? ' wide' : '') }, inputs[i], h('span', null, label))));
    fieldValues().forEach((v, i) => { inputs[i].value = v; });
  }
  function buildRecent() {
    const list = (Array.isArray(prefs.recentColors) ? prefs.recentColors : []).filter((c) => hexToRgb(c));
    recent.replaceChildren(
      h('div', { class: 'cp-recent-title' }, tr('Couleurs récentes')),
      list.length
        ? h('div', { class: 'cp-recent-row' }, list.map((c) => h('button', { type: 'button', class: 'cp-chip', title: c.toUpperCase(), style: { background: c }, onclick: () => setRgb(hexToRgb(c), 'all') })))
        : h('div', { class: 'cp-recent-none' }, tr('Aucune pour l’instant')));
  }

  // ---- glisser dans le carré et la barre
  function drag(target, apply) {
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      target.focus();
      target.setPointerCapture(e.pointerId);
      const move = (ev) => { const r = target.getBoundingClientRect(); apply(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); paint('all'); };
      const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
      move(e);
    });
  }
  drag(sv, (x, y) => { hsv = [hsv[0], x, 1 - y]; });
  drag(hue, (x) => { hsv = [Math.min(x * 360, 359.9), hsv[1], hsv[2]]; });
  sv.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const st = e.shiftKey ? 0.1 : 0.01;
    hsv = [hsv[0], clamp(hsv[1] + d[0] * st, 0, 1), clamp(hsv[2] + d[1] * st, 0, 1)];
    paint('all');
  });
  hue.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    hsv = [(hsv[0] + d * (e.shiftKey ? 10 : 1) + 360) % 360, hsv[1], hsv[2]];
    paint('all');
  });

  // ---- ouverture / fermeture
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(true); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
  };
  // le panneau qui défile : la fenêtre suit sa pastille
  const onScroll = (e) => { if (!el.contains(e.target)) place(); };
  const onBlur = () => close(true);
  function close(keep) {
    if (current !== api) return;
    current = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onBlur);
    window.removeEventListener('blur', onBlur);
    el.remove();
    if (!keep && hex !== start) { hex = start; if (onInput) onInput(start); }
    const changed = keep && hex !== start;
    if (changed) {
      const list = (Array.isArray(prefs.recentColors) ? prefs.recentColors : []).filter((c) => c.toLowerCase() !== hex);
      prefs.recentColors = [hex, ...list].slice(0, RECENT_MAX);
      io.prefsSet({ recentColors: prefs.recentColors });
    }
    if (onDone) onDone(changed ? hex : null);
  }
  function place() {
    if (!anchor.isConnected) return;
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
    let top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8) top = Math.max(8, r.top - ht - 6);
    el.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
    el.style.top = top + 'px';
  }
  const api = { anchor, close: () => close(true) };
  current = api;

  buildModes();
  buildFields();
  buildRecent();
  document.body.appendChild(el);
  paint('all');
  place();
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onBlur);
  window.addEventListener('blur', onBlur);
  (inputs[0] || sv).focus();
  return api;
}
