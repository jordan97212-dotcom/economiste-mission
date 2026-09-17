/**
 * Ce qu'on accepte de recevoir, et sous quel nom on le range.
 *
 * Les noms de fichiers arrivent de l'extérieur — d'un architecte, d'un bureau
 * d'études, parfois d'un disque Windows. Ils ne sont jamais de confiance.
 */
import { describe, expect, it } from 'vitest'
import {
  assainirNomFichier,
  estCategorie,
  extensionDe,
  formaterTaille,
  nomDansArchive,
  refuserDepot,
  TAILLE_MAXIMALE_OCTETS,
} from './validation'

describe('extension', () => {
  it('lit la dernière extension, en minuscules', () => {
    expect(extensionDe('Plan de masse.PDF')).toBe('pdf')
    expect(extensionDe('archive.tar.gz')).toBe('gz')
  })

  it('ne confond pas un point de tête avec une extension', () => {
    expect(extensionDe('.gitignore')).toBeNull()
    expect(extensionDe('sans-extension')).toBeNull()
    expect(extensionDe('finit-par-un-point.')).toBeNull()
  })
})

describe('assainissement du nom', () => {
  it('ne garde que le nom, jamais le chemin', () => {
    expect(assainirNomFichier('C:\\Projets\\2026\\Plan RDC.pdf')).toBe('Plan RDC.pdf')
    expect(assainirNomFichier('/home/archi/plans/coupe AA.pdf')).toBe('coupe AA.pdf')
  })

  it('désamorce une tentative de remontée de dossier', () => {
    // Le chemin réel est dérivé des identifiants, mais on ne compte pas
    // là-dessus seul : le nom ne doit pas pouvoir désigner un dossier parent.
    expect(assainirNomFichier('../../.env')).toBe('env')
    expect(assainirNomFichier('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe')
  })

  it('remplace les caractères que Windows refuse', () => {
    expect(assainirNomFichier('Plan <RDC> : niveau ?.pdf')).toBe('Plan RDC niveau .pdf')
  })

  it('accepte les accents, qui font partie des noms français', () => {
    expect(assainirNomFichier('Étude de sol — sondages.pdf')).toBe('Étude de sol — sondages.pdf')
  })
})

describe('refus de dépôt', () => {
  const piece = (nomFichier: string, tailleOctets = 1024) => ({ nomFichier, tailleOctets })

  it('accepte un plan PDF ordinaire', () => {
    expect(refuserDepot(piece('Plan de masse.pdf'))).toBeNull()
  })

  it('accepte les formats de dessin du bâtiment', () => {
    for (const nom of ['coupe.dwg', 'facade.dxf', 'maquette.ifc']) {
      expect(refuserDepot(piece(nom))).toBeNull()
    }
  })

  it('refuse ce qui n’a rien à faire dans un dossier de consultation', () => {
    expect(refuserDepot(piece('installeur.exe'))?.code).toBe('extension_refusee')
    expect(refuserDepot(piece('script.sh'))?.code).toBe('extension_refusee')
    // Liste blanche : même une extension inoffensive mais imprévue est refusée.
    expect(refuserDepot(piece('notes.md'))?.code).toBe('extension_refusee')
  })

  it('refuse un fichier sans extension', () => {
    expect(refuserDepot(piece('plan'))?.code).toBe('extension_absente')
  })

  it('refuse un fichier vide', () => {
    expect(refuserDepot(piece('plan.pdf', 0))?.code).toBe('fichier_vide')
  })

  it('refuse au-delà du plafond, et le dit en mégaoctets', () => {
    const refus = refuserDepot(piece('plan.pdf', TAILLE_MAXIMALE_OCTETS + 1))
    expect(refus?.code).toBe('trop_volumineux')
    expect(refus?.message).toContain('200.0 Mo')
  })

  it('accepte pile à la limite', () => {
    expect(refuserDepot(piece('plan.pdf', TAILLE_MAXIMALE_OCTETS))).toBeNull()
  })

  it('refuse un nom qui ne laisse rien après nettoyage', () => {
    expect(refuserDepot(piece('...'))?.code).toBe('nom_vide')
  })
})

describe('nom dans l’archive', () => {
  it('reprend le nom du fichier quand il n’y a rien de mieux', () => {
    expect(nomDansArchive({ nomFichier: 'PL-002.pdf', libelle: null, indice: null })).toBe(
      'PL-002.pdf',
    )
  })

  it('préfère le libellé donné par l’économiste', () => {
    expect(
      nomDansArchive({ nomFichier: 'PL-002.pdf', libelle: 'Plan de masse', indice: null }),
    ).toBe('Plan de masse.pdf')
  })

  it('porte l’indice, sans quoi deux envois ne se distinguent pas', () => {
    expect(
      nomDansArchive({ nomFichier: 'PL-002.pdf', libelle: 'Plan de masse', indice: 'C' }),
    ).toBe('Plan de masse - Ind C.pdf')
  })

  it('garde l’extension même sans libellé ni indice', () => {
    expect(nomDansArchive({ nomFichier: 'sondages.dwg', libelle: '  ', indice: '  ' })).toBe(
      'sondages.dwg',
    )
  })
})

describe('catégories', () => {
  it('reconnaît les siennes et rejette le reste', () => {
    expect(estCategorie('PLAN')).toBe(true)
    expect(estCategorie('plan')).toBe(false)
    expect(estCategorie('N’IMPORTE QUOI')).toBe(false)
  })
})

describe('affichage des tailles', () => {
  it('passe de l’octet au gigaoctet sans mentir sur l’ordre de grandeur', () => {
    expect(formaterTaille(512)).toBe('512 o')
    expect(formaterTaille(2048)).toBe('2 Ko')
    expect(formaterTaille(5 * 1024 * 1024)).toBe('5.0 Mo')
    expect(formaterTaille(3 * 1024 * 1024 * 1024)).toBe('3.00 Go')
  })
})
