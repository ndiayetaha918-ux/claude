#!/usr/bin/env node
/* ============================================================
   Drafter — Pipeline scraping LOGOS / écussons de clubs
   Récupère les vrais écussons depuis Wikipedia (MediaWiki API)
   et les stocke localement dans assets/logos/.

   Pourquoi local et pas hotlink ?
   - Pas de dépendance réseau au runtime (le jeu marche hors-ligne)
   - Wikimedia n'aime pas le hotlink massif (rate-limit)
   - Le lien de visualisation reste stable : tout est commité.

   Utilisation :
     node tools/scrape-logos.js            # télécharge la liste curée
     node tools/scrape-logos.js --check    # dry-run : résout les URLs, n'écrit rien
     node tools/scrape-logos.js --force    # re-télécharge même si déjà présent

   Sortie :
   - assets/logos/<slug>.(svg|png)   les écussons
   - scripts/club-logos.js            window.CLUB_LOGOS = { "Club": "assets/logos/.." }

   Source : https://en.wikipedia.org/w/api.php (prop=pageimages, piprop=original)
   L'image principale d'un article de club = son écusson dans 99% des cas.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const LOGOS_DIR = path.join(ROOT, 'assets', 'logos');
const MAP_PATH = path.join(ROOT, 'scripts', 'club-logos.js');

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--check');
const FORCE = ARGS.includes('--force');

const UA = 'DrafterLogoBot/1.0 (https://github.com/ndiayetaha918-ux/claude; football drafter game)';
const DELAY_MS = 800;

// -------- Liste curée : nom utilisé dans players.js -> titre Wikipédia + alias éventuels --------
// (couvre les clubs des compos de "Guess The Team" + clubs des stars Ronaldo/Messi/etc.)
const CLUBS = [
  { name: 'Real Madrid',       title: 'Real Madrid CF' },
  { name: 'FC Barcelona',      title: 'FC Barcelona' },
  { name: 'Atlético Madrid',   title: 'Atlético Madrid' },
  { name: 'Athletic Bilbao',   title: 'Athletic Bilbao' },
  { name: 'Real Sociedad',     title: 'Real Sociedad' },
  { name: 'Manchester City',   title: 'Manchester City F.C.' },
  { name: 'Manchester United', title: 'Manchester United F.C.' },
  { name: 'Arsenal',           title: 'Arsenal F.C.' },
  { name: 'Liverpool',         title: 'Liverpool F.C.' },
  { name: 'Chelsea',           title: 'Chelsea F.C.' },
  { name: 'Tottenham',         title: 'Tottenham Hotspur F.C.' },
  { name: 'Newcastle',         title: 'Newcastle United F.C.' },
  { name: 'Aston Villa',       title: 'Aston Villa F.C.' },
  { name: 'West Ham',          title: 'West Ham United F.C.' },
  { name: 'Crystal Palace',    title: 'Crystal Palace F.C.' },
  { name: 'Burnley FC',        title: 'Burnley F.C.', aliases: ['Burnley'] },
  { name: 'Paris SG',          title: 'Paris Saint-Germain F.C.', aliases: ['PSG', 'Paris Saint-Germain'] },
  { name: 'Marseille',         title: 'Olympique de Marseille', aliases: ['Olympique Marseille'] },
  { name: 'Lyon',              title: 'Olympique Lyonnais' },
  { name: 'Bayern Munich',     title: 'FC Bayern Munich', aliases: ['Bayern München'] },
  { name: 'Bayer Leverkusen',  title: 'Bayer 04 Leverkusen' },
  { name: 'RB Leipzig',        title: 'RB Leipzig' },
  { name: 'Borussia Dortmund', title: 'Borussia Dortmund' },
  { name: 'Inter',             title: 'Inter Milan', aliases: ['Inter Milan', 'Internazionale'] },
  { name: 'AC Milan',          title: 'AC Milan' },
  { name: 'Juventus',          title: 'Juventus FC' },
  { name: 'Atalanta',          title: 'Atalanta BC' },
  { name: 'Lazio',             title: 'S.S. Lazio' },
  { name: 'Napoli',            title: 'S.S.C. Napoli' },
  { name: 'AS Roma',           title: 'A.S. Roma', aliases: ['Roma'] },
  { name: 'Como 1907',         title: 'Como 1907' },
  { name: 'FC Porto',          title: 'FC Porto', aliases: ['Porto'] },
  { name: 'Sporting CP',       title: 'Sporting CP' },
  { name: 'Benfica',           title: 'S.L. Benfica' },
  { name: 'Al-Nassr',          title: 'Al-Nassr FC', aliases: ['Al Nassr', 'Al-Nassr FC'] },
  { name: 'Al-Hilal',          title: 'Al-Hilal SFC', aliases: ['Al Hilal'] },
  { name: 'Inter Miami',       title: 'Inter Miami CF', aliases: ['Inter Miami CF'] },
];

// -------- helpers --------
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url, binary = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': binary ? '*/*' : 'application/json' },
      timeout: 20000,
    }, (res) => {
      // suivre les redirections (upload.wikimedia renvoie parfois 301/302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, binary));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
  });
}

async function resolveImage(title) {
  const api = 'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
    + '&prop=pageimages&piprop=original|name&titles=' + encodeURIComponent(title);
  const json = JSON.parse(await get(api));
  const pages = json.query && json.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || !page.original || !page.original.source) return null;
  return page.original.source; // URL directe upload.wikimedia.org
}

async function main() {
  if (!DRY && !fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

  const map = {};
  let ok = 0, fail = 0;

  for (const club of CLUBS) {
    try {
      const src = await resolveImage(club.title);
      if (!src) { console.log('✗ pas d\'image  ', club.name, '(' + club.title + ')'); fail++; await sleep(DELAY_MS); continue; }

      const ext = (src.split('.').pop().split('?')[0] || 'png').toLowerCase();
      const safeExt = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
      const rel = 'assets/logos/' + slugify(club.name) + '.' + safeExt;

      if (DRY) {
        console.log('→', club.name.padEnd(20), src);
      } else {
        const existing = path.join(ROOT, rel);
        if (FORCE || !fs.existsSync(existing)) {
          const buf = await get(src, true);
          fs.writeFileSync(existing, buf);
        }
        console.log('✓', club.name.padEnd(20), rel);
      }

      map[club.name] = rel;
      for (const a of (club.aliases || [])) map[a] = rel;
      ok++;
    } catch (e) {
      console.log('✗ erreur     ', club.name, '—', e.message);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n${ok} OK · ${fail} échecs`);

  if (!DRY) {
    const lines = Object.keys(map).sort().map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]) + ',');
    const out = '// Drafter — écussons de clubs (généré par tools/scrape-logos.js)\n'
      + '// Ne pas éditer à la main : relance `node tools/scrape-logos.js`.\n'
      + 'window.CLUB_LOGOS = {\n' + lines.join('\n') + '\n};\n';
    fs.writeFileSync(MAP_PATH, out);
    console.log('Écrit', path.relative(ROOT, MAP_PATH), '(' + Object.keys(map).length + ' entrées)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
