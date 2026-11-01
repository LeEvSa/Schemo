// Tests du Markdown des descriptions (hors navigateur).
import { parseInline, parseMarkdown, markdownPlain } from '../src/layout/markdown.js';
import { textBlock, approxMeasurer } from '../src/layout/sizing.js';
import { normalizeDoc } from '../src/model.js';

let failures = 0;
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.log(`  ÉCHEC : ${msg}\n    obtenu : ${g}\n    voulu  : ${w}`); }
};
const inl = (s) => parseInline(s);

eq(inl('du **gras** ici'), [{ text: 'du ' }, { text: 'gras', bold: true }, { text: ' ici' }], 'gras');
eq(inl('*a* _b_'), [{ text: 'a', italic: true }, { text: ' ' }, { text: 'b', italic: true }], 'italique');
eq(inl('***x***'), [{ text: 'x', bold: true, italic: true }], 'gras et italique');
eq(inl('*a **b** c*'), [{ text: 'a ', italic: true }, { text: 'b', italic: true, bold: true }, { text: ' c', italic: true }], 'gras dans italique');
eq(inl('`a*b*c`'), [{ text: 'a*b*c', code: true }], 'code : rien dedans n’est interprété');
eq(inl('~~non~~'), [{ text: 'non', strike: true }], 'barré');
eq(inl('[site](https://x.ca)'), [{ text: 'site', link: true }], 'lien');
eq(inl('2 * 3 * 4'), [{ text: '2 * 3 * 4' }], 'multiplication');
eq(inl('nom_de_fichier'), [{ text: 'nom_de_fichier' }], 'souligné dans un mot');
eq(inl('\\*pas italique\\*'), [{ text: '*pas italique*' }], 'échappement');
eq(inl('**pas fermé'), [{ text: '**pas fermé' }], 'marqueur pas fermé');
eq(inl('<b onclick="x">'), [{ text: '<b onclick="x">' }], 'HTML gardé comme du texte');

const kinds = (s) => parseMarkdown(s).map((b) => b.kind + (b.level !== undefined ? b.level : '') + (b.marker ? ':' + b.marker : ''));
eq(kinds('# T\n## U\ntexte'), ['h1', 'h2', 'p'], 'titres');
eq(kinds('- a\n  - b\n* c\n1. d\n10) e'), ['li0:dot', 'li1:dot', 'li0:dot', 'li0:1.', 'li0:10.'], 'listes');
eq(kinds('- [ ] a\n- [x] b'), ['li0:☐', 'li0:☑'], 'cases à cocher');
eq(kinds('> c\n---\ntexte'), ['quote', 'rule', 'p'], 'citation et ligne');
eq(kinds('\n\na\n\n\n\nb\n\n'), ['p', 'gap', 'p'], 'lignes vides');
eq(kinds('```\n# pas un titre\n```'), ['code'], 'bloc de code');
eq(kinds('**gras** au début'), ['p'], 'gras au début ≠ liste');
eq(markdownPlain('# Titre\n- **un** deux'), 'Titre un deux', 'texte sans mise en forme');

// retour à la ligne et mesure
const m = approxMeasurer();
const tb = textBlock({ title: 'T', desc: 'un **deux trois** quatre cinq six sept huit neuf dix\n- item' }, 100, 1, m);
for (const l of tb.lines) if (l.w > 100.01 + 1) { failures++; console.log('  ÉCHEC : ligne trop large', l.w, l.text); }
eq(tb.lines.filter((l) => l.marker === 'dot').length, 1, 'une seule puce par élément');
eq(tb.centered, false, 'description : aligné à gauche');
eq(textBlock({ title: 'T', desc: '' }, 100, 1, m).centered, true, 'titre seul : centré');
const long = textBlock({ title: '', desc: 'x'.repeat(80) }, 100, 1, m);
for (const l of long.lines) if (l.w > 101) { failures++; console.log('  ÉCHEC : mot long pas coupé', l.w); }
eq(long.lines.map((l) => l.text).join(''), 'x'.repeat(80), 'mot long : aucun caractère perdu');

// anciens fichiers : les sous-points deviennent une liste
const doc = normalizeDoc({ tabs: [{ name: 'v', nodes: { n1: { id: 'n1', title: 'A', bullets: ['un', ' ', 'deux'] }, n2: { id: 'n2', title: 'B', desc: 'd', bullets: ['ignoré'] }, n3: { id: 'n3', title: 'C' } } }] });
eq(doc.tabs[0].nodes.n1.desc, '- un\n- deux', 'sous-points convertis');
eq(doc.tabs[0].nodes.n2.desc, 'd', 'description déjà là');
eq(doc.tabs[0].nodes.n3.desc, '', 'sans description');
eq('bullets' in doc.tabs[0].nodes.n1, false, 'plus de sous-points');

console.log(failures ? `\n${failures} échec(s)` : 'Markdown : tous les tests passent.');
process.exit(failures ? 1 : 0);
