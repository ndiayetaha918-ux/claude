#!/usr/bin/env node
/* ============================================================
   Drafter — Pipeline scraping Transfermarkt
   Mets à jour les VRAIES valeurs marchandes + postes + photos.
   PAS Sofifa (qui sert des valeurs FIFA arcade).

   Utilisation :
     node tools/scrape-tm.js              # update top 200
     node tools/scrape-tm.js --all        # update tous les ~2500
     node tools/scrape-tm.js --check      # dry-run (juste audit)
     node tools/scrape-tm.js --limit 50   # limit N

   Sources :
   - Page profil TM : https://www.transfermarkt.com/<slug>/profil/spieler/<tmid>
   - Champ data-header__market-value-wrapper (valeur en €)
   - Champ Position info (hauptposition)
   - Champ img.data-header__profile-image (photo HD)

   Anti-bot :
   - User-agent réaliste
   - Délai 1.5s entre requêtes (~40/min, sûr)
   - Si HTTP 403/429 : pause 30s puis retry
   ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PLAYERS_PATH = path.join(__dirname, '..', 'scripts', 'players.js');
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--check');
const ALL = ARGS.includes('--all');
const LIMIT_IDX = ARGS.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(ARGS[LIMIT_IDX + 1], 10) : (ALL ? Infinity : 200);

const DELAY_MS = 1500;          // 1.5s entre requêtes
const RETRY_DELAY_MS = 30000;   // 30s si throttle

// -------- HTTP --------
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 403 || res.statusCode === 429) {
        res.resume();
        return reject(new Error('THROTTLED:' + res.statusCode));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', d => chunks += d);
      res.on('end', () => resolve(chunks));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -------- Parsing TM --------
function parseTM(html) {
  const out = { value: null, position: null, photo: null, club: null };
  // Valeur marchande — format "€200.00m" ou "€85.00m" ou "200.00m €"
  const valMatch = html.match(/class="data-header__market-value-wrapper"[^>]*>([\s\S]*?)<\/a>/i);
  if (valMatch) {
    const raw = valMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const m = raw.match(/€?\s*([\d.]+)\s*m/i) || raw.match(/([\d.]+)\s*M/i);
    if (m) out.value = Math.round(parseFloat(m[1]));
    // Pourrait être 'k' (joueur peu connu, < 1M)
    if (!out.value) {
      const mk = raw.match(/([\d.]+)\s*k/i);
      if (mk) out.value = 0;  // négligeable, on ne change pas
    }
  }
  // Poste principal — TM format "Position: <pos>" ou "Main position: <pos>"
  const posMatch = html.match(/Main position:[\s\S]{0,200}?<span[^>]*>([^<]+)<\/span>/i)
                || html.match(/Position:<\/span>[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i);
  if (posMatch) {
    out.position = mapTMPosToCode(posMatch[1].trim());
  }
  // Photo joueur HD
  const photoMatch = html.match(/<img[^>]+class="data-header__profile-image"[^>]+src="([^"]+)"/i);
  if (photoMatch) out.photo = photoMatch[1];
  // Club actuel
  const clubMatch = html.match(/class="data-header__club"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (clubMatch) out.club = clubMatch[1].trim();
  return out;
}

// Map des libellés TM vers nos codes (matchent FORMATIONS)
function mapTMPosToCode(label) {
  const L = label.toLowerCase();
  if (/goalkeeper/.test(L)) return 'GK';
  if (/centre-back|center-back/.test(L)) return 'CB';
  if (/left-back/.test(L))  return 'LB';
  if (/right-back/.test(L)) return 'RB';
  if (/defensive midfield/.test(L)) return 'DM';
  if (/central midfield/.test(L))   return 'CM';
  if (/attacking midfield/.test(L)) return 'AM';
  if (/left winger|left wing/.test(L))   return 'LW';
  if (/right winger|right wing/.test(L)) return 'RW';
  if (/left midfield/.test(L))  return 'LM';
  if (/right midfield/.test(L)) return 'RM';
  if (/second striker/.test(L)) return 'SS';
  if (/centre-forward|center-forward|striker/.test(L)) return 'ST';
  return null;
}

// -------- Slug TM depuis le nom (heuristique) --------
function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// -------- Main --------
async function main() {
  // Charge la DB actuelle (window.PLAYERS via eval contextuel)
  global.window = {};
  require(PLAYERS_PATH);
  const PLAYERS = global.window.PLAYERS;
  console.log('Total joueurs DB:', PLAYERS.length);

  // Trie par valeur, ne traite que ceux avec un tmid (sinon on ne sait pas l'URL fiable)
  const targets = PLAYERS
    .filter(p => p.tmid)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, LIMIT);

  console.log('Joueurs à update (avec tmid):', targets.length, DRY ? '(DRY RUN)' : '');

  const updates = [];
  let throttleCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const slug = toSlug(p.name);
    const url = 'https://www.transfermarkt.com/' + slug + '/profil/spieler/' + p.tmid;
    process.stdout.write(`[${i+1}/${targets.length}] ${p.name} (tmid ${p.tmid}) ... `);
    try {
      const html = await fetchHTML(url);
      const parsed = parseTM(html);
      const changes = {};
      if (parsed.value != null && parsed.value !== p.value) {
        changes.value = { old: p.value, new: parsed.value };
      }
      if (parsed.position && p.posMain && p.posMain[0] !== parsed.position) {
        changes.posMain = { old: p.posMain[0], new: parsed.position };
      }
      if (parsed.photo && parsed.photo !== p.photo) {
        changes.photo = { old: p.photo || '(none)', new: parsed.photo };
      }
      if (parsed.club && parsed.club !== p.club) {
        changes.club = { old: p.club, new: parsed.club };
      }
      const nbChanges = Object.keys(changes).length;
      process.stdout.write(nbChanges ? `${nbChanges} change(s)` : 'OK');
      if (nbChanges) {
        updates.push({ id: p.id, name: p.name, changes });
        if (!DRY) {
          if (changes.value) p.value = changes.value.new;
          if (changes.posMain) {
            p.posMain = [changes.posMain.new].concat((p.posMain || []).slice(1));
            p.positions = [...(p.posMain || []), ...(p.posSec || [])];
          }
          if (changes.photo) p.photo = changes.photo.new;
          if (changes.club) p.club = changes.club.new;
        }
      }
      process.stdout.write('\n');
      throttleCount = 0;
    } catch (e) {
      if (e.message.startsWith('THROTTLED')) {
        process.stdout.write(`⚠ ${e.message} — pause ${RETRY_DELAY_MS/1000}s\n`);
        throttleCount++;
        if (throttleCount >= 3) {
          console.error('Trop de throttling. Arrêt.');
          break;
        }
        await sleep(RETRY_DELAY_MS);
        i--;  // retry
        continue;
      }
      process.stdout.write(`✗ ${e.message}\n`);
    }
    await sleep(DELAY_MS);
  }

  console.log();
  console.log('====== RÉSUMÉ ======');
  console.log('Joueurs updatés:', updates.length);
  updates.forEach(u => {
    console.log(` - ${u.name}:`,
      Object.entries(u.changes).map(([k, v]) => `${k} ${v.old} → ${v.new}`).join(' | ')
    );
  });

  if (!DRY && updates.length) {
    // Écrit players.js
    let src = fs.readFileSync(PLAYERS_PATH, 'utf8');
    const json = JSON.stringify(PLAYERS, null, 0);
    src = src.replace(/window\.PLAYERS = \[[\s\S]*?\];/, 'window.PLAYERS = ' + json + ';');
    fs.writeFileSync(PLAYERS_PATH, src);
    console.log('players.js réécrit.');
  } else if (DRY) {
    console.log('(DRY RUN — aucune modification écrite)');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
