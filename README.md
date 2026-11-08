# questionnaire

Questionnaires conversationnels assistés par IA. Le client ouvre son lien `/r/<token>` et
répond dans un chat : l'assistant pose les questions une à une, explique quand on lui
demande des précisions, et remplit au fur et à mesure le panneau « Vos réponses »
(à droite, corrigeable à la main). Un bouton « Envoyer mes réponses » verrouille le tout.

Monorepo pnpm + turbo, Biome, TypeScript strict :

- `apps/web` : Vite + React + TanStack Router/Query + Tailwind + shadcn/ui ;
- `apps/api` : Fastify + Zod + Drizzle, SDK Anthropic (`claude-haiku-5-5`, constante `AI_MODEL` dans `apps/api/src/ai.ts`) ;
- `packages/db` : schéma Drizzle et migrations (Postgres) ;
- `forms/` : les questionnaires, un fichier YAML chacun.

## Lancer en local

```sh
pnpm install
cp .env.example .env        # puis renseigner ANTHROPIC_API_KEY et ADMIN_PASSWORD
docker compose up -d        # Postgres sur le port 5436
pnpm db:migrate
pnpm dev                    # API sur :3400, front sur http://localhost:5190
```

Ensuite, ouvrir http://localhost:5190/admin, choisir un questionnaire, créer un répondant,
puis « Copier le lien » ou « Préparer le mail ». Ce dernier ouvre un brouillon dans votre
messagerie (`mailto:`) : l'application n'envoie jamais de mail elle-même.

Vérifications : `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Déploiement

En production sur https://ask.tnemelc.fr, via Dokploy (`admn.tnemelc.fr`, projet
`questionnaire`) : une seule image (`Dockerfile` racine, l'API sert aussi le front),
Postgres 18 à côté, migrations au démarrage. Chaque push sur `main` qui touche `apps/`,
`packages/`, `forms/` ou le `Dockerfile` redéploie. Ajouter un questionnaire en prod, c'est
donc committer son YAML dans `forms/`.

Les variables de prod (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`,
`NODE_ENV=production`) sont dans Dokploy ; copie des secrets dans le coffre iCloud
(`Secrets/repos/questionnaire/.env.production`).

## Variables d'environnement (`.env` à la racine, jamais versionné)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion Postgres (celle du `docker-compose.yml` par défaut). |
| `ANTHROPIC_API_KEY` | Clé de l'API Anthropic. |
| `ADMIN_PASSWORD` | Mot de passe de `/admin` (8 caractères minimum). Le changer déconnecte toutes les sessions. |
| `API_PORT`, `WEB_PORT` | Ports de dev (3400 et 5190 par défaut). Le front relaie `/api` vers l'API. |

## Format des questionnaires

Un fichier `forms/<id>.yaml` par questionnaire, l'`<id>` étant le nom du fichier. Le
fichier est validé au démarrage de l'API, et un YAML invalide l'empêche de démarrer avec
un message qui pointe l'erreur. Exemple complet : `forms/cadrage-site-web.yaml`.

```yaml
title: Titre affiché au répondant
intro: Texte d'accueil, affiché en tête de la conversation.
context: >            # facultatif : consignes pour l'IA, jamais montrées telles quelles
  Le répondant n'est pas technicien, évitez le jargon…
sections:
  - title: Votre activité
    questions:
      - id: entreprise              # minuscules, chiffres et _ ; unique dans le fichier
        label: Nom de votre entreprise
        type: text
      - id: objectif
        label: Objectif principal du site
        type: choice
        options: [Présenter mon activité, Vendre en ligne]
        help: Aide pour l'IA, pour expliquer la question si on lui demande.
        required: false             # true par défaut
```

| `type` | Valeur enregistrée |
| --- | --- |
| `text` | texte court (500 caractères max) |
| `longtext` | texte libre (5 000 caractères max) |
| `choice` | une des `options` (obligatoires pour ce type) |
| `multichoice` | une ou plusieurs `options` |
| `number` | nombre (« 1 500,5 » est accepté) |
| `date` | date `AAAA-MM-JJ` |
| `yesno` | oui / non |

Chaque réponse, qu'elle vienne de l'IA (outil `record_answer`) ou d'une correction à la
main, est revalidée côté serveur contre le type de sa question. Une valeur invalide est
refusée, tout comme un id de question inconnu.
