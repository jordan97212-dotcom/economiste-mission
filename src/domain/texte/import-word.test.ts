import { describe, expect, it } from 'vitest'
import {
  analyserDocumentWord,
  decouperEnArticles,
  niveauTitre,
  replierEnUnSeulTexte,
  type ParagrapheWord,
} from './import-word'

/** Fabrique un `word/document.xml` minimal mais conforme. */
const document = (...paragraphes: string[]): string =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphes.join('')}</w:body></w:document>`

const p = (texte: string, style?: string, numPr = false): string =>
  `<w:p>${style || numPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${numPr ? '<w:numPr><w:ilvl w:val="0"/></w:numPr>' : ''}</w:pPr>` : ''}<w:r><w:t>${texte}</w:t></w:r></w:p>`

const par = (texte: string, style: string | null = null, liste = false): ParagrapheWord => ({
  style,
  texte,
  liste,
})

describe('lecture du XML de Word', () => {
  it('rend le texte de chaque paragraphe, avec son style', () => {
    const lus = analyserDocumentWord(document(p('Gros œuvre', 'Heading1'), p('Le béton est dosé.')))
    expect(lus).toHaveLength(2)
    expect(lus[0]).toEqual({ style: 'Heading1', texte: 'Gros œuvre', liste: false })
    expect(lus[1]?.texte).toBe('Le béton est dosé.')
  })

  it('recolle les fragments qu’un correcteur orthographique a découpés', () => {
    // Word éclate un paragraphe en plusieurs w:r dès qu'un mot est souligné.
    const xml = document(
      '<w:p><w:r><w:t xml:space="preserve">Béton dosé à </w:t></w:r><w:r><w:t>350 kg/m³</w:t></w:r></w:p>',
    )
    expect(analyserDocumentWord(xml)[0]?.texte).toBe('Béton dosé à 350 kg/m³')
  })

  it('décode les entités XML', () => {
    expect(analyserDocumentWord(document(p('Fers &amp; aciers &lt; 12 mm')))[0]?.texte).toBe(
      'Fers & aciers < 12 mm',
    )
    expect(analyserDocumentWord(document(p('Tol&#233;rance')))[0]?.texte).toBe('Tolérance')
  })

  it('laisse dehors le texte supprimé en révision', () => {
    // Le texte barré vit dans w:delText : on importe le document tel qu'il se
    // lit, pas son historique.
    const xml = document(
      '<w:p><w:r><w:t>Béton armé</w:t></w:r><w:del><w:r><w:delText> et précontraint</w:delText></w:r></w:del></w:p>',
    )
    expect(analyserDocumentWord(xml)[0]?.texte).toBe('Béton armé')
  })

  it('reconnaît une numérotation automatique', () => {
    expect(analyserDocumentWord(document(p('Nettoyage', 'ListParagraph', true)))[0]?.liste).toBe(true)
  })

  it('transforme tabulations et sauts de ligne en espaces', () => {
    const xml = document('<w:p><w:r><w:t>Épaisseur</w:t><w:tab/><w:t>20 cm</w:t></w:r></w:p>')
    expect(analyserDocumentWord(xml)[0]?.texte).toBe('Épaisseur 20 cm')
  })

  it('rend une liste vide sur un document vide', () => {
    expect(analyserDocumentWord(document())).toEqual([])
  })
})

describe('reconnaissance des titres', () => {
  it('lit les styles de titre, quelle que soit la langue de Word', () => {
    expect(niveauTitre(par('Gros œuvre', 'Heading1'))).toBe(1)
    expect(niveauTitre(par('Fondations', 'Titre2'))).toBe(2)
    expect(niveauTitre(par('Fondations', 'Titre 2'))).toBe(2)
    expect(niveauTitre(par('Couverture', 'Title'))).toBe(1)
  })

  it('accepte une numérotation tapée à la main, faute de style', () => {
    // La moitié des CCTP réels n'utilisent aucun style Word.
    expect(niveauTitre(par('2 GROS ŒUVRE'))).toBe(1)
    expect(niveauTitre(par('2.1 Fondations'))).toBe(2)
    expect(niveauTitre(par('2.1.3 Voile béton banché'))).toBe(3)
  })

  it('ne prend pas une phrase ordinaire pour un titre', () => {
    expect(niveauTitre(par('Le béton est dosé à 350 kg/m³.'))).toBe(null)
    expect(niveauTitre(par(''))).toBe(null)
  })

  it('ne prend pas une phrase longue pour un titre, même numérotée', () => {
    const longue = `3.2 ${'Prescription très détaillée '.repeat(8)}`
    expect(niveauTitre(par(longue))).toBe(null)
  })

  it('ne prend pas un élément de liste numéroté par Word pour un titre', () => {
    expect(niveauTitre(par('1. Nettoyage du support', 'ListParagraph', true))).toBe(null)
  })
})

describe('découpage en articles', () => {
  const cctp = [
    par('2 GROS ŒUVRE'),
    par('2.1 Fondations'),
    par('2.1.1 Fouilles en pleine masse'),
    par('Les fouilles sont exécutées en pleine masse.'),
    par('Évacuation des terres comprise.'),
    par('2.1.2 Béton de propreté'),
    par('Béton dosé à 150 kg/m³.'),
  ]

  it('produit un article par ouvrage, pas par chapitre', () => {
    const articles = decouperEnArticles(cctp)
    expect(articles.map((a) => a.intitule)).toEqual([
      'Fouilles en pleine masse',
      'Béton de propreté',
    ])
  })

  it('écarte les titres qui ne portent aucune prescription', () => {
    // « 2 GROS ŒUVRE » et « 2.1 Fondations » ne contiennent que d'autres titres.
    const articles = decouperEnArticles(cctp)
    expect(articles.some((a) => /GROS ŒUVRE|Fondations/.test(a.intitule))).toBe(false)
  })

  it('retire la numérotation de l’intitulé', () => {
    expect(decouperEnArticles(cctp)[0]?.intitule).toBe('Fouilles en pleine masse')
  })

  it('garde le texte de l’article, paragraphes séparés', () => {
    expect(decouperEnArticles(cctp)[0]?.contenu).toBe(
      'Les fouilles sont exécutées en pleine masse.\n\nÉvacuation des terres comprise.',
    )
  })

  it('compte les lignes, pour que l’écran montre le poids de l’article', () => {
    expect(decouperEnArticles(cctp)[0]?.nbLignes).toBe(2)
  })

  it('replie les sous-titres d’un article dans son contenu', () => {
    const articles = decouperEnArticles([
      par('3.1 Voile béton', 'Heading2'),
      par('Prescriptions générales du voile.'),
      par('Mise en œuvre', 'Heading3'),
      par('Coulage en une seule levée.'),
    ])
    expect(articles).toHaveLength(1)
    expect(articles[0]?.contenu).toBe(
      'Prescriptions générales du voile.\n\n## Mise en œuvre\n\nCoulage en une seule levée.',
    )
  })

  it('convertit les listes en puces', () => {
    const articles = decouperEnArticles([
      par('4.1 Enduit', 'Heading2'),
      par('Le support est préparé :'),
      par('dépoussiérage', 'ListParagraph', true),
      par('rebouchage des fissures', 'ListParagraph', true),
    ])
    expect(articles[0]?.contenu).toBe(
      'Le support est préparé :\n\n- dépoussiérage\n\n- rebouchage des fissures',
    )
  })

  it('reconnaît une puce tapée à la main', () => {
    const articles = decouperEnArticles([
      par('4.1 Enduit', 'Heading2'),
      par('— dépoussiérage du support'),
    ])
    expect(articles[0]?.contenu).toBe('- dépoussiérage du support')
  })

  it('ne rend aucun article quand le document n’a pas de titre', () => {
    expect(decouperEnArticles([par('Un texte sans la moindre structure.')])).toEqual([])
  })

  it('rend une liste vide sur un document vide', () => {
    expect(decouperEnArticles([])).toEqual([])
  })

  it('ignore les paragraphes vides', () => {
    const articles = decouperEnArticles([
      par('5.1 Peinture', 'Heading2'),
      par(''),
      par('Deux couches.'),
    ])
    expect(articles[0]?.contenu).toBe('Deux couches.')
    expect(articles[0]?.nbLignes).toBe(1)
  })
})

describe('repli en un seul texte', () => {
  it('garde titres, puces et paragraphes quand le découpage ne donne rien', () => {
    const texte = replierEnUnSeulTexte([
      par('2.1 Fondations'),
      par('Béton de propreté.'),
      par('dépoussiérage', 'ListParagraph', true),
    ])
    expect(texte).toBe('## Fondations\n\nBéton de propreté.\n\n- dépoussiérage')
  })

  it('rend une chaîne vide sur un document vide', () => {
    expect(replierEnUnSeulTexte([])).toBe('')
  })
})
