# Image de l'application — voir LANCER-SUR-MON-PC.md
#
# Trois étages : on installe les dépendances une fois, on construit, puis on
# n'emporte dans l'image finale que ce que l'application utilise vraiment.
# LibreOffice n'est présent qu'au dernier étage, là où les PDF se fabriquent.

# --- 1. Dépendances ---------------------------------------------------------
FROM node:22-bookworm-slim AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- 2. Construction --------------------------------------------------------
FROM node:22-bookworm-slim AS construction
WORKDIR /app
COPY --from=dependances /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Les polices sont récupérées ici, une fois pour toutes : l'application servie
# n'appellera aucun service extérieur à l'affichage.
# Le jeu initial est compilé en JavaScript simple : l'image d'exécution n'a
# alors besoin d'aucun outil TypeScript.
RUN npx prisma generate \
 && npm run build \
 && npx esbuild prisma/seed.ts --bundle --platform=node --format=esm \
      --external:@prisma/client --outfile=prisma/seed.mjs \
 && node outils/rassembler-prisma.mjs /app/outils-prisma/node_modules

# --- 3. Exécution -----------------------------------------------------------
FROM node:22-bookworm-slim AS execution
WORKDIR /app

# Writer convertit le Word en PDF. Sans lui l'application reste utilisable :
# elle masque les boutons PDF et continue de produire le Word.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# L'application elle-même, en sortie autonome.
COPY --from=construction /app/.next/standalone ./
COPY --from=construction /app/.next/static ./.next/static

# De quoi appliquer les migrations et poser la nomenclature au démarrage : le
# schéma et ses migrations, puis la ligne de commande Prisma avec la totalité
# de ses dépendances.
#
# Ces dépendances étaient recopiées à la main — prisma, @prisma, .prisma — et
# la liste était incomplète : @prisma/config réclame « effect », qui ne s'y
# trouvait pas. La CLI mourait au démarrage, dix fois de suite, et le conteneur
# redémarrait en boucle derrière un port ouvert. Un script calcule désormais la
# fermeture réelle de l'arbre installé, ce qui survit aux montées de version.
#
# Le client Prisma, lui, n'est pas ici : la sortie autonome de Next l'emporte
# déjà, moteur compris.
COPY --from=construction /app/prisma ./prisma
COPY --from=construction /app/outils-prisma ./outils-prisma
COPY --from=construction /app/outils ./outils

# La version embarquee dans l'image. Diagnostic.bat la compare a celle du
# dossier : deux valeurs differentes veulent dire que l'image n'a pas ete
# reconstruite apres une mise a jour, et cela se voit d'un coup d'oeil.
COPY VERSION ./VERSION

COPY demarrage.sh ./demarrage.sh
RUN chmod +x ./demarrage.sh

EXPOSE 3000
ENTRYPOINT ["./demarrage.sh"]
