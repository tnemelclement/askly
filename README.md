# Askly

Questionnaires conversationnels assistés par IA. Le client ouvre son lien `/r/<token>` et
répond dans un chat : l'assistant pose les questions une à une, explique quand on lui
demande des précisions, et remplit au fur et à mesure le panneau « Vos réponses »
(à droite, corrigeable à la main). Un bouton « Envoyer mes réponses » verrouille le tout.

Monorepo pnpm + turbo, Biome, TypeScript strict :

- `apps/web` : Vite + React + TanStack Router/Query + Tailwind + shadcn/ui ;
- `apps/api` : Fastify + Zod + Drizzle, SDK Anthropic (`claude-haiku-5-5`, constante `AI_MODEL` dans `apps/api/src/ai.ts`) ;
- `packages/db` : schéma Drizzle et migrations (Postgres) ;
- `forms/` : questionnaires d'exemple en YAML, importés dans une base neuve au démarrage.

## Lancer en local

```sh
pnpm install
cp .env.example .env        # puis renseigner ANTHROPIC_API_KEY et ADMIN_PASSWORD
docker compose up -d        # Postgres sur le port 5436
pnpm db:migrate
pnpm dev                    # API sur :3400, front sur http://localhost:5190
```

## Créer un questionnaire

Les questionnaires vivent en base. Deux sortes : **réutilisable** (plusieurs personnes, un
lien chacune) ou **ponctuel** (`reusable: false`, écrit pour une seule personne).

Le plus simple : demander à Claude (skill `askly` des dotfiles, ou serveur MCP `askly`), par exemple
« fais-moi un questionnaire pour Dupont sur son projet de cuisine ». Il rédige les questions,
les publie et renvoie le lien à transmettre. Sous le capot, deux appels authentifiés par
`ADMIN_API_TOKEN` :

```sh
curl -X PUT -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"reusable": false, "definition": { …format ci-dessous, en JSON ou en texte YAML… }}' \
  https://ask.tnemelc.fr/api/admin/forms/projet-cuisine-dupont
curl -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name": "M. Dupont"}' https://ask.tnemelc.fr/api/admin/forms/projet-cuisine-dupont/respondents
# → { "link": "https://ask.tnemelc.fr/r/…", … }
```

### Serveur MCP

`https://ask.tnemelc.fr/mcp` (HTTP « streamable ») expose toute l'administration en outils :
`list_forms`, `get_form`, `create_form`, `update_form`, `delete_form`, `create_respondent`,
`update_respondent`, `delete_respondent`, `reopen_respondent`, `get_respondent`,
`get_answers`, `set_answer`. Code : `apps/api/src/mcp.ts`.

- **Claude Code** : jeton d'API en en-tête.
  `claude mcp add --transport http -s user askly https://ask.tnemelc.fr/mcp -H 'Authorization: Bearer ${PERSO_ASKLY_API_TOKEN}'`
- **claude.ai** (web et mobile) : Réglages → Connecteurs → Ajouter un connecteur
  personnalisé, adresse `https://ask.tnemelc.fr/mcp`. La connexion passe par OAuth : une page
  demande le mot de passe admin (`apps/api/src/oauth.ts`). Changer `ADMIN_PASSWORD` révoque
  tous les accès OAuth.

Depuis l'admin, on peut aussi ouvrir http://localhost:5190/admin, choisir un questionnaire, créer un répondant,
puis « Copier le lien » ou « Préparer le mail ». Ce dernier ouvre un brouillon dans votre
messagerie (`mailto:`) : l'application n'envoie jamais de mail elle-même.

Vérifications : `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Déploiement

En production sur https://ask.tnemelc.fr, via Dokploy (`admn.tnemelc.fr`, projet
`askly`) : une seule image (`Dockerfile` racine, l'API sert aussi le front),
Postgres 18 à côté, migrations au démarrage. Chaque push sur `main` qui touche `apps/`,
`packages/`, `forms/` ou le `Dockerfile` redéploie. Créer un questionnaire, lui, ne demande aucun
push : voir « Créer un questionnaire ».

Les variables de prod (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`,
`ADMIN_API_TOKEN`, `PUBLIC_URL`, `NODE_ENV=production`) sont dans Dokploy ; copie des
secrets dans le coffre iCloud (`Secrets/repos/askly/.env.production`).

## Variables d'environnement (`.env` à la racine, jamais versionné)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion Postgres (celle du `docker-compose.yml` par défaut). |
| `ANTHROPIC_API_KEY` | Clé de l'API Anthropic. |
| `ADMIN_PASSWORD` | Mot de passe de `/admin` (8 caractères minimum). Le changer déconnecte toutes les sessions. |
| `ADMIN_API_TOKEN` | Jeton (32 caractères min.) pour l'API admin en `Bearer`, utilisée par le skill. Absent : API admin par cookie seulement. |
| `PUBLIC_URL` | Adresse publique (ex. `https://ask.tnemelc.fr`) pour les liens renvoyés ; sinon déduite de la requête. |
| `API_PORT`, `WEB_PORT` | Ports de dev (3400 et 5190 par défaut). Le front relaie `/api` vers l'API. |

## Format des questionnaires

Même format en JSON (API) ou en YAML (`forms/<id>.yaml`, importé au démarrage s'il n'est
pas déjà en base). L'identifiant : minuscules, chiffres et tirets. Toute définition est
validée, avec un message qui pointe chaque erreur. Exemple complet :
`forms/cadrage-site-web.yaml`.

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
      - id: style
        label: Style recherché
        type: text
        suggestions: [Moderne, Campagne]   # réponses proposées en un clic (sans options)
```

Dans le chat, la question en cours s'affiche avec des réponses en un clic : les options
d'un choix, Oui / Non, des cases puis « Valider » pour un choix multiple, et pour une
question ouverte les `suggestions` du questionnaire complétées par celles de l'IA.

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

## Licence

MIT, voir [LICENSE](LICENSE).
