/**
 * Captures d'écran du guide.
 *
 * Les illustrations du guide montrent l'application réelle : elles sont prises
 * dans un vrai navigateur, sur un vrai serveur, contre le jeu de démonstration
 * d'`outils/demo-guide.ts`. Une maquette dessinée à la main mentirait dès la
 * première modification de l'écran ; une capture, non — il suffit de relancer
 * ce script.
 *
 *   npm run start                      (dans une autre fenêtre)
 *   npx tsx outils/demo-guide.ts       → rend un jeton
 *   JETON=… MISSION=… LOT=… node outils/captures-guide.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000'
const SORTIE = 'docs/captures'
const { JETON, MISSION, LOT } = process.env

if (!JETON || !MISSION || !LOT) {
  console.error('JETON, MISSION et LOT sont nécessaires. Voir l’en-tête du fichier.')
  process.exit(1)
}

await mkdir(SORTIE, { recursive: true })

const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
})
const contexte = await navigateur.newContext({
  viewport: { width: 1440, height: 900 },
  // Deux fois la densité : le PDF reste net à l'impression.
  deviceScaleFactor: 2,
})
await contexte.addCookies([
  { name: 'session_economiste', value: JETON, domain: '127.0.0.1', path: '/' },
])
const page = await contexte.newPage()

/** Entoure un élément d'un liseré, pour désigner sans avoir à décrire. */
const SOULIGNEMENT = `
  .capture-repere {
    outline: 3px solid #0f6e5a !important;
    outline-offset: 3px !important;
    border-radius: 3px !important;
    box-shadow: 0 0 0 6px rgba(15, 110, 90, 0.18) !important;
  }
`

async function aller(chemin) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: SOULIGNEMENT })
}

async function designer(locator) {
  await locator.evaluate((element) => element.classList.add('capture-repere'))
}

async function capturer(nom, options = {}) {
  const chemin = `${SORTIE}/${nom}.png`
  if (options.element) await options.element.screenshot({ path: chemin })
  else await page.screenshot({ path: chemin, fullPage: options.pleinePage ?? false })
  console.log(`  ${chemin}`)
}

console.log('Captures :')

/* --- La barre du haut ---------------------------------------------------- */
await aller('/')
await capturer('01-barre-du-haut', { element: page.locator('nav, header, .bandeau').first() })

/* --- Le tableau de bord --------------------------------------------------- */
// Cadré sur le contenu : une fenêtre entière pour deux missions ne montrerait
// guère que du vide.
await capturer('02-tableau-de-bord', { element: page.locator('main').first() })

/* --- La fiche de mission, et le bouton Consultation ----------------------- */
await aller(`/missions/${MISSION}`)
const boutonConsultation = page.getByRole('link', { name: 'Consultation' }).first()
await designer(boutonConsultation)
await boutonConsultation.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await capturer('03-fiche-mission-consultation')

/* --- La grille de chiffrage ----------------------------------------------- */
await aller(`/missions/${MISSION}/chiffrage`)
await page.waitForTimeout(600)
await designer(page.getByRole('button', { name: 'Feuille de métré' }).first())
await capturer('04-chiffrage')

/* --- La feuille de métré -------------------------------------------------- */
await aller(`/missions/${MISSION}/chiffrage`)
await page.waitForTimeout(600)
// Le voile béton est le troisième ouvrage : c'est lui qui porte un métré.
await page.getByRole('button', { name: 'Feuille de métré' }).nth(2).click()
await page.waitForTimeout(1200)
await capturer('05-metre', { element: page.locator('.rangee-metre') })

/* --- Les repères ---------------------------------------------------------- */
await aller(`/missions/${MISSION}/metre`)
await page.getByRole('button', { name: 'Mesures' }).first().click()
await page.waitForTimeout(500)
await capturer('06-reperes', { pleinePage: true })

/* --- Les pièces du dossier ------------------------------------------------ */
await aller(`/missions/${MISSION}/pieces`)
await page.waitForTimeout(400)
await capturer('07-pieces', { pleinePage: true })

/* --- La consultation d'un lot --------------------------------------------- */
await aller(`/missions/${MISSION}/consultation/${LOT}`)
await page.waitForTimeout(600)
await designer(page.getByRole('link', { name: /Télécharger le dossier/ }).first())
await capturer('08-consultation')

/* --- Le comparatif des offres --------------------------------------------- */
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(500)
await capturer('09-comparatif', { pleinePage: true })

/* --- L'import du répertoire ----------------------------------------------- */
await aller('/entreprises')
await page.waitForTimeout(300)
await capturer('10-repertoire', { pleinePage: true })

console.log('Terminé.')
await navigateur.close()
