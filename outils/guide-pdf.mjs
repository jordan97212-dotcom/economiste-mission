/**
 * Fabrique le PDF du guide à partir de GUIDE.md.
 *
 * Le guide reste écrit en Markdown : c'est la source, lisible telle quelle sur
 * GitHub et modifiable sans outil. Le PDF en est une sortie, pas un second
 * original — il n'y a donc rien à tenir à jour en double.
 *
 * La mise en page reprend l'identité visuelle de l'application, pour que
 * l'outil et sa documentation se reconnaissent.
 *
 *   node outils/guide-pdf.mjs
 */
import { readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import MarkdownIt from 'markdown-it'
import { chromium } from 'playwright'

const RACINE = resolve(dirname(new URL(import.meta.url).pathname), '..')
const SOURCE = resolve(RACINE, 'GUIDE.md')
const SORTIE = resolve(RACINE, 'docs/Guide-utilisation.pdf')

const markdown = await readFile(SOURCE, 'utf8')
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })
let corps = md.render(markdown)

/**
 * Une image seule dans son paragraphe devient une figure, et son texte de
 * remplacement sa légende. Markdown n'a pas de notion de figure ; la
 * convention « un paragraphe, une image » suffit à la reconstituer.
 */
corps = corps.replace(
  /<p><img src="([^"]+)" alt="([^"]*)"[^>]*><\/p>/g,
  (_, src, alt) =>
    `<figure><img src="${src}" alt="${alt}">${
      alt ? `<figcaption>${alt}</figcaption>` : ''
    }</figure>`,
)

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Guide d'utilisation</title>
<style>
  :root {
    --fond: #ffffff;
    --surface-alt: #ecf0ee;
    --encre: #13211d;
    --encre-doux: #3d4e48;
    --attenue: #64736d;
    --filet: #d8dfda;
    --accent: #0f6e5a;
    --accent-encre: #0b5546;
    --accent-clair: #e2efe9;
  }

  @page {
    size: A4;
    margin: 18mm 16mm 20mm;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--fond);
    color: var(--encre);
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
  }

  /* --- Titres ------------------------------------------------------------ */

  h1 {
    font-size: 24pt;
    line-height: 1.15;
    margin: 0 0 4pt;
    letter-spacing: -0.01em;
  }

  /* Chaque partie commence sur sa page : on ne cherche pas un titre au bas
     d'une page précédente. */
  h2 {
    font-size: 15pt;
    margin: 0 0 10pt;
    padding-bottom: 5pt;
    border-bottom: 2px solid var(--accent);
    color: var(--accent-encre);
    break-before: page;
    break-after: avoid;
  }
  h2:first-of-type { break-before: auto; }

  h3 {
    font-size: 12pt;
    margin: 16pt 0 6pt;
    color: var(--encre);
    break-after: avoid;
  }

  p { margin: 0 0 7pt; orphans: 2; widows: 2; }

  strong { font-weight: 600; }

  a { color: var(--accent-encre); text-decoration: none; }

  code {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 9pt;
    background: var(--surface-alt);
    padding: 1pt 3pt;
    border-radius: 2pt;
  }

  pre {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 8.5pt;
    line-height: 1.5;
    background: var(--surface-alt);
    border: 1px solid var(--filet);
    border-radius: 3pt;
    padding: 8pt 10pt;
    overflow-x: hidden;
    white-space: pre-wrap;
    break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: inherit; }

  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }

  blockquote {
    margin: 9pt 0;
    padding: 8pt 12pt;
    background: var(--accent-clair);
    border-left: 3pt solid var(--accent);
    border-radius: 0 3pt 3pt 0;
    break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }

  /* --- Tableaux ---------------------------------------------------------- */

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
    font-size: 9.5pt;
    break-inside: avoid;
  }
  thead th {
    background: var(--encre);
    color: #fff;
    text-align: left;
    font-weight: 600;
    padding: 5pt 7pt;
  }
  tbody td {
    padding: 5pt 7pt;
    border-bottom: 1px solid var(--filet);
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #f7f9f8; }

  /* --- Figures ----------------------------------------------------------- */

  figure {
    margin: 12pt 0 14pt;
    break-inside: avoid;
  }
  figure img {
    width: 100%;
    /* Une capture d'écran entière est très haute : sans plafond, elle occupe
       une page à elle seule et laisse un grand blanc derrière elle. */
    max-height: 150mm;
    object-fit: contain;
    object-position: top;
    border: 1px solid var(--filet);
    border-radius: 3pt;
  }
  figcaption {
    margin-top: 4pt;
    font-size: 8.5pt;
    color: var(--attenue);
    font-style: italic;
  }

  hr {
    border: none;
    border-top: 1px solid var(--filet);
    margin: 14pt 0;
  }

  /* --- Page de garde ------------------------------------------------------ */

  .garde {
    break-after: page;
    padding-top: 55mm;
    text-align: left;
  }
  .garde .surtitre {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 9pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 10pt;
  }
  .garde h1 { font-size: 32pt; margin-bottom: 10pt; }
  .garde .sous-titre {
    font-size: 13pt;
    color: var(--encre-doux);
    max-width: 118mm;
    line-height: 1.5;
  }
  .garde .pied {
    margin-top: 22mm;
    font-size: 9.5pt;
    color: var(--attenue);
  }

  /* Le titre de niveau 1 du corps ne sert plus : la garde le porte. */
  body > h1 { display: none; }
  body > h1 + p { display: none; }
</style>
</head>
<body>
  <section class="garde">
    <p class="surtitre">Missions · économiste de la construction</p>
    <h1>Guide d’utilisation</h1>
    <p class="sous-titre">
      Comment se servir de l’application, dans l’ordre où une mission se
      déroule réellement — de la création de l’opération jusqu’à sa clôture.
    </p>
    <p class="pied">VERSION_ICI</p>
  </section>
  ${corps}
</body>
</html>`

const version = (await readFile(resolve(RACINE, 'VERSION'), 'utf8')).trim()

const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined })
const onglet = await navigateur.newPage()

// La page est écrite dans le dépôt puis ouverte par son adresse de fichier,
// plutôt que poussée dans un document vide : avec « setContent », le document
// reste « about:blank » et Chromium refuse d'y charger des images locales —
// le PDF sortait avec des figures vides, sans la moindre erreur.
const provisoire = resolve(RACINE, '.guide-provisoire.html')
await writeFile(provisoire, page.replace('VERSION_ICI', version), 'utf8')
await onglet.goto(pathToFileURL(provisoire).href, { waitUntil: 'networkidle' })

// Vérification explicite : une figure vide ne se rattrape pas après coup.
const imagesManquantes = await onglet.evaluate(() =>
  [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
)
if (imagesManquantes > 0) {
  throw new Error(`${imagesManquantes} illustration(s) n'ont pas pu être chargées.`)
}

const pdf = await onglet.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%;font-size:8pt;color:#64736d;padding:0 16mm;
                font-family:Helvetica,Arial,sans-serif;display:flex;
                justify-content:space-between;">
      <span>Guide d’utilisation · Missions</span>
      <span class="pageNumber"></span>
    </div>`,
})

await writeFile(SORTIE, pdf)
await rm(provisoire, { force: true })
await navigateur.close()

console.log(`${SORTIE} — ${(pdf.length / 1024 / 1024).toFixed(2)} Mo`)
