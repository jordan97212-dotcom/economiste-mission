import JSZip from 'jszip'
import { analyserDocumentWord, type ParagrapheWord } from '../../domain/texte/import-word'

/**
 * Déballage d'un fichier Word — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Un `.docx` est une archive zip dont `word/document.xml` porte le corps du
 * document. Seule cette partie-là demande une bibliothèque ; toute la lecture du
 * XML et le découpage en articles vivent dans le domaine, donc se testent sans
 * fichier.
 */

/** Ce que l'application sait lire. Le reste se refuse en le disant. */
export class FichierWordInvalide extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = 'FichierWordInvalide'
  }
}

const CHEMIN_CORPS = 'word/document.xml'

export async function lireParagraphesDocx(
  donnees: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParagrapheWord[]> {
  let archive: JSZip
  try {
    archive = await JSZip.loadAsync(donnees)
  } catch {
    // Cas le plus fréquent : un .doc d'avant 2007, ou un PDF renommé.
    throw new FichierWordInvalide(
      'Ce fichier n’est pas un document Word moderne (.docx). Un .doc ancien doit être réenregistré au format .docx depuis Word.',
    )
  }

  const corps = archive.file(CHEMIN_CORPS)
  if (!corps) {
    throw new FichierWordInvalide(
      'Ce fichier est bien une archive, mais il ne contient pas de document Word. Vérifiez qu’il s’agit d’un .docx et non d’un autre format bureautique.',
    )
  }

  return analyserDocumentWord(await corps.async('string'))
}
