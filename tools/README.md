# Drafter — Tools

Outils internes pour maintenir la base de données joueurs.

## `scrape-tm.js` — Sync depuis Transfermarkt

Récupère les **vraies valeurs marchandes** (pas FIFA arcade comme Sofifa) +
postes + photos HD depuis les pages profil Transfermarkt.

### Usage

```bash
# Audit seul (dry-run, aucune écriture)
node tools/scrape-tm.js --check

# Update top 200 (par défaut)
node tools/scrape-tm.js

# Update top 50
node tools/scrape-tm.js --limit 50

# Update tous les joueurs avec tmid (~1500, prend ~40 min)
node tools/scrape-tm.js --all
```

### Champs synchronisés

Pour chaque joueur qui a un `tmid` dans `scripts/players.js` :

| Champ DB     | Source TM                              |
|--------------|-----------------------------------------|
| `value`      | `data-header__market-value-wrapper` (en M€) |
| `posMain[0]` | Hauptposition (mappé vers nos codes GK/CB/…) |
| `photo`      | `img.data-header__profile-image` (URL HD) |
| `club`       | `data-header__club a` (libellé) |

### Anti-throttle

- User-agent réaliste
- 1.5s entre requêtes (~40 req/min)
- 30s pause + retry si HTTP 403/429
- Stop après 3 throttles consécutifs

### Workflow GitHub Actions

Le scraper tourne **automatiquement 2× par semaine** (lundi/jeudi 6h UTC)
via `.github/workflows/scrape-tm.yml`. Il commit ses changements sur la
branche courante avec le message `chore(data): sync TM values YYYY-MM-DD`.

Déclenchement manuel :
1. GitHub → Actions → `Sync Transfermarkt values` → `Run workflow`
2. Choisir `check` / `update200` / `updateAll`

### Pourquoi pas Sofifa ?

Sofifa expose les valeurs **du jeu FIFA**, calibrées pour le gameplay, pas
le marché réel. Un joueur "OVR 88" dans FIFA peut avoir une valeur TM
totalement différente. La base de Drafter doit refléter les **vraies
valeurs Transfermarkt** pour que le système de budget soit crédible.

Photos Sofifa restent OK (c'est juste un CDN d'images de profil), mais les
valeurs et postes viennent de Transfermarkt.
