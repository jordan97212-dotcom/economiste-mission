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

## Avant de proposer un changement

Signaler les ambiguïtés de la spécification plutôt que de trancher en silence.
Avancer par lots livrables et testables, dans l'ordre du tableau du README.

## Vérifier

```bash
npm run typecheck && npm test
```
