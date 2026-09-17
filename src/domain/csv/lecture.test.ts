/**
 * Un CSV n'est pas un format, c'est une famille d'habitudes. Ces cas sont ceux
 * qu'on rencontre réellement : un export d'Excel français, un export UTF-8, une
 * adresse entre guillemets qui contient un point-virgule.
 */
import { describe, expect, it } from 'vitest'
import { analyserCsv, decoder, devinerSeparateur, lireCsv } from './lecture'

const octets = (texte: string): Uint8Array => new TextEncoder().encode(texte)

/**
 * Encode en Windows-1252. La plage 0x80–0x9F ne suit pas Unicode : c'est là que
 * vivent œ, €, les apostrophes et tirets typographiques — donc exactement ce
 * qu'un Excel français met dans « Gros œuvre ». Un encodeur naïf qui se
 * contenterait du code Unicode tronquerait « œ » en « S », et c'est arrivé.
 */
const SPECIAUX_1252 = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
])

function octets1252(texte: string): Uint8Array {
  return Uint8Array.from(
    [...texte].map((c) => SPECIAUX_1252.get(c.codePointAt(0) as number) ?? (c.codePointAt(0) as number)),
  )
}

describe('décodage', () => {
  it('lit un fichier UTF-8', () => {
    const { texte, encodage } = decoder(octets('Entreprise;Zone\nMaçonnerie Créole;Nord'))
    expect(encodage).toBe('utf-8')
    expect(texte).toContain('Maçonnerie Créole')
  })

  it('retire la marque d’ordre des octets', () => {
    const avecBom = new Uint8Array([0xef, 0xbb, 0xbf, ...octets('Nom;Ville')])
    expect(decoder(avecBom).texte).toBe('Nom;Ville')
  })

  it('bascule en Windows-1252 quand l’UTF-8 ne tient pas', () => {
    // C'est ce que produit « Enregistrer sous → CSV » d'un Excel français.
    const { texte, encodage } = decoder(octets1252('Maçonnerie Créole;Nord'))
    expect(encodage).toBe('windows-1252')
    expect(texte).toBe('Maçonnerie Créole;Nord')
  })

  it('restitue les caractères typographiques de la plage 0x80–0x9F', () => {
    // « Gros œuvre » est la désignation la plus courante du bâtiment : si la
    // ligature se perd, c'est tout le répertoire qui arrive abîmé.
    const { texte } = decoder(octets1252('Gros œuvre;Tarif 2026 — révisé;100 €'))
    expect(texte).toBe('Gros œuvre;Tarif 2026 — révisé;100 €')
  })
})

describe('séparateur', () => {
  it('reconnaît le point-virgule des exports français', () => {
    expect(devinerSeparateur('Nom;SIRET;Ville\nDupont;123;Fort-de-France')).toBe(';')
  })

  it('reconnaît la virgule', () => {
    expect(devinerSeparateur('Nom,SIRET,Ville\nDupont,123,Fort-de-France')).toBe(',')
  })

  it('reconnaît la tabulation', () => {
    expect(devinerSeparateur('Nom\tSIRET\nDupont\t123')).toBe('\t')
  })

  it('préfère la régularité à l’abondance', () => {
    // Les virgules sont plus nombreuses, mais irrégulières : elles sont dans
    // le texte, pas entre les colonnes.
    const texte = 'Nom;Activite\nDupont;Gros œuvre, maçonnerie, VRD\nMartin;Plomberie, chauffage'
    expect(devinerSeparateur(texte)).toBe(';')
  })

  it('retombe sur le point-virgule quand il n’y a qu’une colonne', () => {
    expect(devinerSeparateur('Dupont\nMartin')).toBe(';')
  })
})

describe('analyse', () => {
  it('découpe en lignes et colonnes', () => {
    expect(analyserCsv('a;b\nc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('protège un séparateur entre guillemets', () => {
    expect(analyserCsv('"Dupont ; Fils";Nord', ';')).toEqual([['Dupont ; Fils', 'Nord']])
  })

  it('garde une adresse écrite sur deux lignes dans une seule cellule', () => {
    const resultat = analyserCsv('Nom;Adresse\nDupont;"12 rue des Îles\n97200 Fort-de-France"', ';')
    expect(resultat[1]?.[1]).toBe('12 rue des Îles\n97200 Fort-de-France')
    expect(resultat).toHaveLength(2)
  })

  it('rend leur guillemet aux guillemets doublés', () => {
    expect(analyserCsv('"Ets ""Le Béton""";Nord', ';')).toEqual([['Ets "Le Béton"', 'Nord']])
  })

  it('ne prend pas pour une citation un guillemet en milieu de cellule', () => {
    // Un tuyau de 15" n'ouvre pas un champ.
    expect(analyserCsv('Tube 15";Plomberie', ';')).toEqual([['Tube 15"', 'Plomberie']])
  })

  it('accepte les trois façons de finir une ligne', () => {
    expect(analyserCsv('a;b\r\nc;d\re;f\ng;h', ';')).toHaveLength(4)
  })

  it('garde la dernière ligne même sans retour final', () => {
    expect(analyserCsv('a;b\nc;d', ';')).toHaveLength(2)
  })

  it('écarte les lignes entièrement vides', () => {
    expect(analyserCsv('a;b\n\n;\nc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('lecture complète', () => {
  it('rend une grille, le séparateur et l’encodage', () => {
    const lecture = lireCsv(octets('Raison sociale;SIRET\nMaçonnerie Créole;12345678901234'))
    expect(lecture.separateur).toBe(';')
    expect(lecture.encodage).toBe('utf-8')
    expect(lecture.grille).toEqual([
      ['Raison sociale', 'SIRET'],
      ['Maçonnerie Créole', '12345678901234'],
    ])
  })

  it('signale des colonnes irrégulières plutôt que de les rogner', () => {
    // Une ligne trop courte trahit souvent un point-virgule oublié dans un nom.
    const lecture = lireCsv(octets('Nom;SIRET;Ville\nDupont;123\nMartin;456;Schoelcher'))
    expect(lecture.colonnesIrregulieres).toBe(true)
    expect(lecture.grille[1]).toEqual(['Dupont', '123'])
  })

  it('ne signale rien quand tout est régulier', () => {
    expect(lireCsv(octets('a;b\nc;d')).colonnesIrregulieres).toBe(false)
  })

  it('accepte un fichier vide sans se plaindre', () => {
    const lecture = lireCsv(octets(''))
    expect(lecture.grille).toEqual([])
  })
})
