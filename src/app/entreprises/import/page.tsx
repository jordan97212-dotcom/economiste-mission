import Link from 'next/link'
import { contexte } from '../../session'
import { ImportEntreprises } from '../../../components/ImportEntreprises'

export default async function PageImportEntreprises() {
  await contexte()

  return (
    <main className="contenu-large">
      <div style={{ marginBottom: 18 }}>
        <p className="surtitre mono">
          <Link href="/entreprises">Répertoire</Link> · Import
        </p>
        <h1>Importer un répertoire d’entreprises</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 6, maxWidth: '76ch' }}>
          Depuis un fichier CSV — l’export d’un tableur, d’une messagerie ou d’un logiciel de
          gestion. Le séparateur et l’encodage sont reconnus tout seuls ; vous dites à quoi
          correspondent les colonnes, vous vérifiez, et rien n’est écrit avant votre accord.
        </p>
      </div>

      <ImportEntreprises />

      <div className="carte" style={{ marginTop: 8 }}>
        <div className="carte-entete">
          <h2>À quoi ressemble un fichier lisible</h2>
        </div>
        <div style={{ padding: 16 }}>
          <p className="attenue" style={{ marginTop: 0 }}>
            Une ligne d’intitulés, puis une entreprise par ligne. Seule la raison sociale est
            nécessaire ; le reste se complète quand vous l’avez.
          </p>
          <pre className="bloc-code">
{`Raison sociale;SIRET;Contact;E-mail;Téléphone;Corps d'état;Zone
Maçonnerie Créole;73282932000074;Jean Dupont;contact@mc.fr;0596 12 34 56;Gros œuvre, VRD;Nord Atlantique
Antilles Électricité;;Marie Léger;contact@ae.mq;0696 78 90 12;Électricité;Centre`}
          </pre>
          <p className="attenue" style={{ fontSize: 13, marginBottom: 0 }}>
            Les intitulés n’ont pas à être écrits ainsi : « Entreprise », « Société », « Mél »,
            « Tél » et bien d’autres sont reconnus, et vous corrigez ce qui ne l’est pas.
          </p>
        </div>
      </div>
    </main>
  )
}
