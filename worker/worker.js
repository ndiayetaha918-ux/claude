/* ============================================================
   Drafter — Cloudflare Worker (LLM proxy + Transfermarkt cache)
   Déploiement : `wrangler deploy` (voir worker/README.md)
   ============================================================ */

const ALLOW_ORIGINS = [
  'https://raw.githack.com',
  'https://rawcdn.githack.com',
  'https://gistcdn.githack.com',
  // ton domaine custom si tu en as un
];

function cors(req, body, status = 200) {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOW_ORIGINS.some(o => origin.startsWith(o)) ? origin : ALLOW_ORIGINS[0];
  return new Response(body, {
    status,
    headers: {
      'access-control-allow-origin': allow,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-drafter-key',
      'content-type': 'application/json',
    },
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return cors(req, '', 204);
    const url = new URL(req.url);

    // ----- LLM PROXY (analyse tactique) -----
    if (url.pathname === '/ai/analyze' && req.method === 'POST') {
      try {
        const payload = await req.json();
        const prompt = buildPrompt(payload);
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-7',
            max_tokens: 2400,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          return cors(req, JSON.stringify({ error: 'anthropic ' + r.status, detail: t.slice(0, 400) }), 502);
        }
        const data = await r.json();
        const text = (data.content || []).map(c => c.text || '').join('\n');
        return cors(req, JSON.stringify({ text }));
      } catch (e) {
        return cors(req, JSON.stringify({ error: 'server', detail: String(e) }), 500);
      }
    }

    // ----- TM PROXY (cache valeurs marchandes, fiche joueur) -----
    if (url.pathname.startsWith('/tm/player') && req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) return cors(req, JSON.stringify({ error: 'missing id' }), 400);
      // cache 24h via Workers KV (binding TM_CACHE) ou cache API
      const cacheKey = 'tm-player-' + id;
      if (env.TM_CACHE) {
        const hit = await env.TM_CACHE.get(cacheKey, { type: 'json' });
        if (hit) return cors(req, JSON.stringify(hit));
      }
      try {
        const resp = await fetch('https://www.transfermarkt.com/no/profil/spieler/' + encodeURIComponent(id), {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; DrafterBot/1.0)',
            'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
          },
        });
        const html = await resp.text();
        const data = parsePlayerPage(html);
        if (env.TM_CACHE) await env.TM_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 });
        return cors(req, JSON.stringify(data));
      } catch (e) {
        return cors(req, JSON.stringify({ error: 'tm fetch', detail: String(e) }), 502);
      }
    }

    return cors(req, JSON.stringify({ ok: true, routes: ['/ai/analyze', '/tm/player?id='] }));
  },
};

function buildPrompt(payload) {
  const { teams, context } = payload;
  let p = 'Tu es un analyste tactique de football professionnel. ';
  p += 'Voici ' + teams.length + ' équipes draftées qui vont s\'affronter.\n\n';
  teams.forEach((t, i) => {
    p += '## Équipe ' + (i+1) + ' — ' + t.drafter + '\n';
    p += 'Formation : ' + t.formation + '\n';
    p += 'Tactique : possession=' + t.phases.possession + ', transition=' + t.phases.transition + ', défense=' + t.phases.defense + '\n';
    p += 'Compo :\n';
    t.lineup.forEach(l => {
      p += '- ' + l.slot + ' : ' + l.player + ' (' + l.role + ')\n';
    });
    p += '\n';
  });
  p += '\nPour chaque équipe :\n';
  p += '1) Identité tactique en 1 phrase\n';
  p += '2) 2-3 forces réelles (joueurs clés et rôles qui se complètent)\n';
  p += '3) 2-3 failles concrètes que l\'adversaire peut exploiter\n';
  p += '4) Un joueur dont le rôle assigné ne lui convient PAS, et pourquoi\n\n';
  p += 'Puis : pour chaque MATCHUP, 3 phrases sur comment le match se déroulerait probablement.\n';
  p += 'Sois technique, concret, pas générique. Pas de bullshit. Format markdown ## Équipe X.';
  return p;
}

// Parser HTML TM ultra-simple (pas de DOM dans CF Worker, donc regex)
function parsePlayerPage(html) {
  function pick(re) { const m = html.match(re); return m ? m[1].trim() : null; }
  const name = pick(/<h1[^>]*itemprop="name"[^>]*>([^<]+)</);
  const value = pick(/<a[^>]*class="data-header__market-value-wrapper"[^>]*>([^<]+)</);
  const club = pick(/<span[^>]*itemprop="affiliation"[^>]*>\s*<a[^>]*>([^<]+)</);
  const pos = pick(/Hauptposition[\s\S]*?<dd[^>]*>([^<]+)</);
  return { name, value, club, position: pos };
}
