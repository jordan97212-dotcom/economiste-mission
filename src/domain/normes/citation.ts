/**
 * Détection des références normatives citées dans un texte de CCTP.
 *
 * Une pièce écrite cite des normes : « conformément au NF DTU 20.1 », « selon
 * la NF EN 1992-1-1 ». Ces citations engagent le marché. Encore faut-il savoir
 * lesquelles sont citées, et sous quelle forme : l'économiste écrit tantôt
 * « NF DTU 20.1 », tantôt « DTU 20-1 », tantôt « NF-DTU 20.1 P1-1 ».
 *
 * Ce module ne connaît aucune norme et n'en juge aucune : il lit un texte et
 * rend les références qu'il y trouve, sous une écriture canonique. Le contenu
 * des normes appartient à l'AFNOR et au CSTB, il n'a rien à faire ici.
 *
 * Fonction pure : aucune I/O, aucun appel réseau.
 */

export type FamilleNorme = 'NF_DTU' | 'NF_EN' | 'NF_EN_ISO' | 'NF_NATIONALE' | 'EUROCODE'

export interface Citation {
  /** Écriture canonique, celle sous laquelle le référentiel range la norme. */
  readonly reference: string
  readonly famille: FamilleNorme
  /** Le texte exact trouvé, pour pouvoir le pointer à l'écran. */
  readonly tel_quel: string
  readonly position: number
}

/**
 * Un seul balayage, alternatives ordonnées de la plus spécifique à la plus
 * générale : « NF EN ISO » doit gagner sur « NF EN », et « NF DTU » sur « DTU ».
 */
const MOTIF = new RegExp(
  [
    // NF DTU 20.1 P1-1, NF-DTU 13.3, DTU 21
    String.raw`\b(?:NF\s*-?\s*)?DTU\s*(\d{1,2}(?:[.\-]\d{1,2})?)(?:\s*P\s*(\d)(?:\s*-\s*(\d))?)?`,
    // NF EN ISO 9001, NF EN ISO 13788
    String.raw`\bNF\s*EN\s*ISO\s*(\d{2,5}(?:\s*-\s*\d{1,3})*)`,
    // NF EN 1992-1-1, NF EN 206/CN
    String.raw`\bNF\s*EN\s*(\d{2,5}(?:\s*-\s*\d{1,3})*(?:\s*\/\s*CN)?)`,
    // NF P 18-201, NF C 15-100, NF A 35-080-1
    String.raw`\bNF\s*([A-Z])\s*(\d{2})\s*-\s*(\d{3}(?:\s*-\s*\d{1,3})?)`,
    // Eurocode 2, Eurocode 8-1
    String.raw`\bEurocode\s*(\d)(?:\s*-\s*(\d))?`,
  ].join('|'),
  'gi',
)

/** Ramène les séparateurs à une forme unique : espaces simples, tirets nets. */
function resserrer(texte: string): string {
  return texte.replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
}

function canoniser(brut: RegExpExecArray): { reference: string; famille: FamilleNorme } {
  const [, dtu, dtuPartie, dtuSousPartie, eniso, en, lettre, cahier, rang, euro, euroPartie] = brut

  if (dtu !== undefined) {
    // Le numéro de DTU s'écrit avec un point : 20.1, jamais 20-1.
    const numero = dtu.replace('-', '.')
    const partie = dtuPartie ? ` P${dtuPartie}${dtuSousPartie ? `-${dtuSousPartie}` : ''}` : ''
    return { reference: `NF DTU ${numero}${partie}`, famille: 'NF_DTU' }
  }
  if (eniso !== undefined) {
    return { reference: `NF EN ISO ${resserrer(eniso)}`, famille: 'NF_EN_ISO' }
  }
  if (en !== undefined) {
    return { reference: `NF EN ${resserrer(en).toUpperCase()}`, famille: 'NF_EN' }
  }
  if (lettre !== undefined) {
    return {
      reference: `NF ${lettre.toUpperCase()} ${cahier!}-${resserrer(rang!)}`,
      famille: 'NF_NATIONALE',
    }
  }
  return {
    reference: `Eurocode ${euro}${euroPartie ? `-${euroPartie}` : ''}`,
    famille: 'EUROCODE',
  }
}

/**
 * Rend les références citées dans le texte, dédoublonnées, dans l'ordre
 * d'apparition. La première occurrence l'emporte : c'est celle qu'on pointe.
 */
export function detecterCitations(texte: string): readonly Citation[] {
  if (!texte) return []

  const trouvees = new Map<string, Citation>()
  MOTIF.lastIndex = 0

  let brut: RegExpExecArray | null
  while ((brut = MOTIF.exec(texte)) !== null) {
    const { reference, famille } = canoniser(brut)
    if (!trouvees.has(reference)) {
      trouvees.set(reference, {
        reference,
        famille,
        tel_quel: brut[0].trim(),
        position: brut.index,
      })
    }
  }

  return [...trouvees.values()]
}

/**
 * Ramène une référence saisie à la main — dans le référentiel, dans un fichier
 * importé — à la même écriture que celle des citations, pour que les deux se
 * rencontrent. Une saisie qu'on ne sait pas lire est rendue telle quelle,
 * seulement resserrée : on ne devine pas, on signalera qu'elle est inconnue.
 */
export function canoniserReference(saisie: string): string {
  const citations = detecterCitations(saisie)
  return citations.length === 1 ? citations[0]!.reference : resserrer(saisie).toUpperCase()
}
