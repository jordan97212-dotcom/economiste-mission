-- Recherche plein texte française sur la base de prix personnelle.
-- Objectif : à la frappe d'une désignation d'ouvrage, proposer les entrées
-- correspondantes même si l'utilisateur omet les accents ou écrit au pluriel.

-- L'extension unaccent retire les diacritiques. Sa fonction n'est pas marquée
-- immuable, donc elle ne peut pas servir telle quelle dans une colonne générée :
-- on l'enveloppe dans une fonction immuable, ce qui est l'usage recommandé.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.sans_accent(texte text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.unaccent('public.unaccent', texte) $$;

-- Colonne maintenue par PostgreSQL : elle ne peut jamais se désynchroniser
-- de la désignation, contrairement à un index applicatif qu'il faudrait penser
-- à rafraîchir.
ALTER TABLE "prix_reference"
  ADD COLUMN "recherche" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'french',
      public.sans_accent(coalesce("designation", '') || ' ' || coalesce("code", ''))
    )
  ) STORED;

CREATE INDEX "prix_reference_recherche_idx"
  ON "prix_reference" USING GIN ("recherche");
