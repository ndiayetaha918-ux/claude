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

## `scrape-logos.js` — Écussons de clubs depuis Wikipedia

Télécharge les **vrais écussons** des clubs depuis l'API MediaWiki de
Wikipedia (`prop=pageimages`, l'image principale d'un article de club = son
écusson) et les stocke **localement** dans `assets/logos/`. Génère ensuite
`scripts/club-logos.js` (`window.CLUB_LOGOS = { "Club": "assets/logos/…" }`).

Utilisés par le mode **Guess The Team** (variante *Sélection*) : chaque
joueur est masqué par l'écusson de son club, à toi de deviner la sélection.
Si un club n'a pas de logo, fallback automatique sur les initiales.

### Usage

```bash
node tools/scrape-logos.js            # télécharge la liste curée
node tools/scrape-logos.js --check    # dry-run : résout les URLs, n'écrit rien
node tools/scrape-logos.js --force    # re-télécharge même si déjà présent
```

Pour ajouter un club : édite la liste `CLUBS` en haut du fichier
(`{ name: 'Nom dans players.js', title: 'Titre Wikipédia', aliases: [...] }`).

### Pourquoi local et pas hotlink ?

Wikimedia rate-limit le hotlink massif et le jeu doit marcher sans dépendance
réseau au runtime. Tout est commité → le lien de visualisation reste stable.

### Workflow GitHub Actions

`.github/workflows/scrape-logos.yml` — déclenchement manuel (Actions → *Sync
club logos* → *Run workflow*). Commit les écussons + le mapping sur la branche
courante. **Indispensable** : le scraping doit tourner en CI (réseau complet),
pas dans le sandbox de l'agent où Wikipedia est bloqué.
