import { describe, expect, it } from 'vitest'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { analyserFichier, analyserParagraphes } from './import-cctp'
import { FichierWordInvalide } from '../../infrastructure/docx/lecture-docx'
import type { ParagrapheWord } from '../../domain/texte/import-word'

/**
 * Aller-retour complet : on fabrique un vrai fichier Word avec la bibliothèque
 * d'écriture du projet, puis on le relit avec le lecteur d'import. C'est la
 * vérification la plus proche du réel possible sans document de l'économiste —
 * le fichier est un .docx authentique, pas une reconstitution de son format.
 */

const par = (texte: string, style: string | null = null, liste = false): ParagrapheWord => ({
  style,
  texte,
  liste,
})

async function fabriquerCctp(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'GROS ŒUVRE', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Fouilles en pleine masse', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Les fouilles sont exécutées en pleine masse.' }),
          new Paragraph({ text: 'Évacuation des terres à la décharge comprise.' }),
          new Paragraph({ text: 'Béton de propreté', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Béton dosé à 150 kg/m³, épaisseur 5 cm.' }),
        ],
      },
    ],
  })
  return Packer.toBuffer(document)
}

describe('aller-retour sur un vrai fichier Word', () => {
  it('relit un document produit par la bibliothèque d’écriture du projet', async () => {
    const analyse = await analyserFichier(await fabriquerCctp())

    expect(analyse.motifNonDecoupe).toBeUndefined()
    expect(analyse.articles.map((a) => a.intitule)).toEqual([
      'Fouilles en pleine masse',
      'Béton de propreté',
    ])
  })

  it('garde le texte de chaque article', async () => {
    const analyse = await analyserFichier(await fabriquerCctp())
    expect(analyse.articles[0]?.contenu).toBe(
      'Les fouilles sont exécutées en pleine masse.\n\nÉvacuation des terres à la décharge comprise.',
    )
    expect(analyse.articles[1]?.contenu).toBe('Béton dosé à 150 kg/m³, épaisseur 5 cm.')
  })

  it('n’érige pas le chapitre en article : il ne porte aucune prescription', async () => {
    const analyse = await analyserFichier(await fabriquerCctp())
    expect(analyse.articles.some((a) => a.intitule === 'GROS ŒUVRE')).toBe(false)
  })

  it('numérote les articles pour que l’écran puisse les cocher', async () => {
    const analyse = await analyserFichier(await fabriquerCctp())
    expect(analyse.articles.map((a) => a.index)).toEqual([0, 1])
  })
})

describe('fichiers qu’on ne sait pas lire', () => {
  it('refuse un fichier qui n’est pas une archive, en disant quoi faire', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n')
    await expect(analyserFichier(pdf)).rejects.toBeInstanceOf(FichierWordInvalide)
    await expect(analyserFichier(pdf)).rejects.toThrow(/\.docx/)
  })

  it('refuse une archive qui n’est pas un document Word', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('lisezmoi.txt', 'rien à voir')
    const donnees = await zip.generateAsync({ type: 'nodebuffer' })

    await expect(analyserFichier(donnees)).rejects.toThrow(/pas de document Word/)
  })
})

describe('documents sans structure exploitable', () => {
  it('propose le document entier quand aucun titre n’est reconnu', () => {
    const analyse = analyserParagraphes([
      par('Un CCTP tapé d’un seul bloc, sans le moindre titre.'),
      par('Deuxième paragraphe, tout aussi plat.'),
    ])

    expect(analyse.motifNonDecoupe).toBe('aucun_titre')
    expect(analyse.articles).toEqual([])
    // Le contenu n'est pas perdu : il part en une trame, à découper à la main.
    expect(analyse.texteComplet).toContain('Un CCTP tapé d’un seul bloc')
    expect(analyse.nbParagraphes).toBe(2)
  })

  it('signale un document vide pour ce qu’il est', () => {
    const analyse = analyserParagraphes([par(''), par('  ')])
    expect(analyse.motifNonDecoupe).toBe('document_vide')
    expect(analyse.texteComplet).toBe('')
  })

  it('ne signale rien quand le découpage a fonctionné', () => {
    const analyse = analyserParagraphes([par('2.1 Fondations'), par('Béton de propreté.')])
    expect(analyse.motifNonDecoupe).toBeUndefined()
    expect(analyse.articles).toHaveLength(1)
  })
})
