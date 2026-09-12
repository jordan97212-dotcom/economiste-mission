// Les tests d'intégration parlent à une vraie base PostgreSQL.
// En local, l'adresse vient de .env ; en intégration continue, de l'environnement.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Pas de fichier .env : on laissera le test échouer avec un message clair.
  }
}
