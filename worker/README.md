# Drafter Worker — déploiement en 5 minutes

Ce dossier contient un **Cloudflare Worker** qui sert deux choses :

1. **Proxy LLM** (`POST /ai/analyze`) — appelle Claude API avec ta clé qui reste **côté serveur**. Drafter envoie juste la compo, le worker répond avec l'analyse tactique.
2. **Proxy Transfermarkt** (`GET /tm/player?id=…`) — récupère la fiche live d'un joueur, met en cache 24h via Workers KV. Valeurs marchandes toujours à jour.

---

## Setup (10 min montre en main)

### 1. Compte Cloudflare gratuit
- Crée un compte sur https://dash.cloudflare.com/
- Workers & Pages → tu as 100 000 requêtes/jour gratuites, largement assez

### 2. Installer Wrangler (le CLI Cloudflare)
```bash
npm install -g wrangler
wrangler login
```

### 3. Récupérer une clé Anthropic
- https://console.anthropic.com/ → API keys → Create key
- Copie la clé `sk-ant-...`
- Mets ~5$ de crédit (largement suffisant pour des semaines de tests)

### 4. Déployer le worker
Depuis le dossier `worker/` du repo :
```bash
wrangler secret put ANTHROPIC_API_KEY
# Colle la clé sk-ant-... quand demandé
wrangler deploy
```

À la fin tu auras une URL du style `https://drafter-worker.<ton-compte>.workers.dev/`.

### 5. (Optionnel) Cache TM via Workers KV
Pour que les fiches Transfermarkt soient mises en cache 24h et éviter le scraping répété :
- Workers → KV → Create a namespace, nomme-le `drafter-cache`
- Copie son ID
- Décommente le bloc `[[kv_namespaces]]` dans `wrangler.toml` et colle l'ID
- Re-déploie : `wrangler deploy`

### 6. Brancher Drafter sur ton worker
Dans Drafter (écran de setup, champ "Analyse IA"), au lieu de coller une clé Claude, **colle l'URL de ton worker** (ex: `https://drafter-worker.tonpseudo.workers.dev`). Drafter détectera que c'est une URL et l'utilisera automatiquement.

---

## Coûts attendus
- **Cloudflare Worker** : gratuit jusqu'à 100k requêtes/jour (tu seras à 50/jour max)
- **KV** : 1k reads + 1k writes/jour gratuits
- **Anthropic** : ~0,5¢ par analyse de match avec Claude Opus, donc ~5$ = 1000 analyses

## Sécurité
La clé Anthropic reste **côté Cloudflare**, jamais exposée au navigateur. Le worker est ouvert publiquement (anyone peut appeler `/ai/analyze`) — si tu veux limiter aux utilisateurs de Drafter, ajoute un header secret partagé et vérifie-le dans `cors()`.

## Désactiver le proxy ?
Drafter marche **sans** le worker. Le moteur de raisonnement déterministe (ai_reasoner.js) reste actif et fournit une analyse instantanée. Le worker est un bonus pour l'analyse LLM enrichie et les données TM live.
