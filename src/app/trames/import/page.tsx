import Link from 'next/link'
import { contexte } from '../../session'
import { ImportWord } from './import-word'

export default async function PageImportCctp() {
  const { db } = await contexte()

  const corpsEtats = await db.corpsEtat.findMany({
    where: { masque: false },
    orderBy: { ordre: 'asc' },
    select: { id: true, code: true, libelle: true },
  })

  return (
    <main className="contenu">
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">
          <Link href="/trames">Bibliothèque de trames</Link> · Import
        </p>
        <h1>Importer un CCTP Word</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '76ch' }}>
          Vos CCTP déjà rédigés n’ont pas à être ressaisis. L’application lit un document Word, le
          découpe en articles — un par ouvrage — et vous laisse choisir lesquels rejoignent votre
          bibliothèque. Rien n’est enregistré tant que vous n’avez pas coché.
        </p>
      </div>

      <ImportWord corpsEtats={corpsEtats} />
    </main>
  )
}
