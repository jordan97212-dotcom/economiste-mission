# Instructions de travail sur ce dépôt

Lire `SPEC_APP_ECONOMISTE.md` avant toute intervention. C'est la source de vérité
métier. `ARCHITECTURE.md` porte les décisions techniques validées et la liste des
points tranchés.

## Règles non négociables

1. **Jamais de flottant sur un montant.** `Money` est un entier de centimes,
   `PrixUnitaire` un entier de dix-millièmes d'euro. Quantités et coefficients
   sont des `Decimal`. Toute conversion depuis un `number` se fait aux frontières
   seulement : saisie utilisateur et lecture de fichier.
2. **Le prix unitaire est arrondi avant la multiplication par la quantité**, à la
   précision de la mission. Le DPGF imprimé fait foi.
3. **Arrondi commercial**, jamais bancaire.
4. **`src/domain` reste pur.** Aucun import de Prisma, de React ou du système de
   fichiers. Si une fonction a besoin d'une I/O, elle appartient à
   `src/application` ou `src/infrastructure`.
5. **Tout calcul financier nouveau arrive avec ses tests**, y compris les cas
   limites : zéro, valeurs négatives, équidistance d'arrondi, absence de donnée.
6. **Toute suggestion automatique est un brouillon modifiable**, jamais une valeur
   imposée. L'économiste engage sa responsabilité professionnelle.

7. **Une valeur illisible se signale, elle ne se devine pas.** À l'import comme
   au collage, un nombre qu'on ne sait pas lire produit une anomalie, jamais un
   zéro silencieux.
8. **Rien ne sort vers un tiers sans être voulu.** Le prix de base et le
   coefficient d'ajustement restent internes : les exports ne portent que le prix
   unitaire final.

9. **Aucune norme ne s'aspire.** Le contenu des DTU est vendu par l'AFNOR et le
   CSTB ; le catalogue Norm'Info est protégé par le droit d'auteur et par le
   droit *sui generis* des bases de données, et son extraction systématique est
   interdite sans accord écrit. L'application tient le référentiel que
   l'économiste entretient et signale ce qui doit être revu ; elle ne télécharge
   rien et ne réécrit jamais un texte de CCTP à sa place.

## Avant de proposer un changement

Signaler les ambiguïtés de la spécification plutôt que de trancher en silence.
Avancer par lots livrables et testables, dans l'ordre du tableau du README.

## Vérifier

```bash
npm run typecheck && npm test
```
