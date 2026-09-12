import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Document, Packer, Paragraph } from 'docx'

const executer = promisify(execFile)

/**
 * Conversion Word vers PDF par LibreOffice sans interface.
 *
 * C'est le même moteur qui met en page le document dans les deux formats : le
 * sommaire et la pagination du PDF ne peuvent donc pas différer de ceux du
 * fichier Word remis au maître d'ouvrage. C'est aussi LibreOffice qui recalcule
 * les champs du sommaire à la conversion, puisque le document les marque comme
 * à rafraîchir.
 */

const DELAI_MAX_MS = 120_000

export class ConversionPdfIndisponible extends Error {
  constructor(detail: string) {
    super(
      `Conversion PDF impossible : ${detail}. Vérifiez que LibreOffice est installé sur le serveur (paquet libreoffice-writer).`,
    )
    this.name = 'ConversionPdfIndisponible'
  }
}

export async function convertirEnPdf(docx: Buffer, nomBase = 'document'): Promise<Buffer> {
  const dossier = await mkdtemp(join(tmpdir(), 'piece-ecrite-'))
  const profil = join(dossier, 'profil')
  const chemin = join(dossier, `${nomBase}.docx`)

  try {
    await writeFile(chemin, docx)

    await executer(
      'soffice',
      [
        '--headless',
        '--norestore',
        '--invisible',
        // Un profil jetable par conversion : sans lui, deux conversions
        // simultanées se disputent le profil par défaut et l'une échoue.
        `-env:UserInstallation=file://${profil}`,
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        dossier,
        chemin,
      ],
      { timeout: DELAI_MAX_MS, maxBuffer: 32 * 1024 * 1024 },
    )

    return await readFile(join(dossier, `${nomBase}.pdf`))
  } catch (erreur) {
    const detail =
      erreur instanceof Error ? erreur.message.split('\n')[0] ?? erreur.message : String(erreur)
    throw new ConversionPdfIndisponible(detail)
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => undefined)
  }
}

let sonde: { valeur: boolean; expire: number } | null = null
const DUREE_CACHE_SONDE_MS = 5 * 60_000

/**
 * Vrai si ce serveur sait réellement produire un PDF.
 *
 * On convertit un document minimal plutôt que d'interroger la version : une
 * installation réduite de LibreOffice répond à `--version` sans embarquer le
 * module Writer, et toute conversion échoue alors au premier vrai document.
 * Le résultat est mis en cache quelques minutes, la sonde prenant une seconde.
 */
export async function conversionDisponible(): Promise<boolean> {
  if (sonde && sonde.expire > Date.now()) return sonde.valeur

  let valeur = false
  try {
    const minimal = new Document({
      sections: [{ children: [new Paragraph({ text: 'sonde' })] }],
    })
    await convertirEnPdf(Buffer.from(await Packer.toBuffer(minimal)), 'sonde')
    valeur = true
  } catch {
    valeur = false
  }

  sonde = { valeur, expire: Date.now() + DUREE_CACHE_SONDE_MS }
  return valeur
}
