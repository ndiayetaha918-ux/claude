/* ==========================================================================
   Drafter — Mode Saison
   Simule un championnat de 20 équipes (l'équipe du user + 19 adversaires
   générés depuis la base, plus une coupe nationale en parallèle).
   ========================================================================== */
(function () {
  'use strict';

  const Season = window.Season = {
    state: null,

    // Construit 19 équipes adversaires en piochant des grappes cohérentes
    init(myTeam, myProfile, PLAYERS, FORMATIONS, SLOT_RULES, playerById, opts) {
      opts = opts || {};
      const Sim = window.Sim;
      const formationKeys = Object.keys(FORMATIONS);
      // pool : top 600 par valeur, filtré sur ligues 5
      const TOP5 = ['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'];
      const pool = PLAYERS.filter(p => TOP5.includes(p.league)).sort((a,b) => b.value - a.value).slice(0, 600);
      const teams = [];
      teams.push({ id: 'me', name: opts.myName || 'Mon équipe', isUser: true,
                   participant: myTeam, profile: myProfile, tactics: opts.tactics });
      // Génère 19 équipes par tirage stratifié
      const tiers = [
        { count: 4, valMin: 50, valMax: 250, label: 'Top' },
        { count: 6, valMin: 30, valMax: 70,  label: 'Concurrent' },
        { count: 6, valMin: 15, valMax: 45,  label: 'Maintien' },
        { count: 3, valMin: 5,  valMax: 25,  label: 'Promu' },
      ];
      let teamIdx = 1;
      tiers.forEach(t => {
        for (let i = 0; i < t.count; i++) {
          const fk = formationKeys[Math.floor(Math.random() * formationKeys.length)];
          const formation = fk;
          const slots = pickXIWithinValue(pool, FORMATIONS[fk], SLOT_RULES, t.valMin, t.valMax);
          const part = { id: 'cpu' + teamIdx, formation, slots };
          const tactics = pickRandomTactics();
          const profile = Sim.teamProfile(part, FORMATIONS, playerById, tactics);
          teams.push({ id: part.id, name: makeName(t.label, teamIdx), isUser: false,
                       participant: part, profile, tactics });
          teamIdx++;
        }
      });

      // Calendrier double round-robin
      const fixtures = roundRobin(teams.length); // chaque round = liste de paires [i,j]
      this.state = {
        teams,
        fixtures,
        played: 0,
        table: teams.map(() => ({ p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0, form: [] })),
        results: [],   // {round, home, away, hg, ag}
        cup: { round: 0, bracket: roundOf(teams.length), eliminated: new Set() }, // simplifié
        myIdx: 0,
        currentRound: 0,
        title: opts.title || 'Saison 2025/26',
      };
      return this.state;
    },

    playNextRound() {
      const s = this.state;
      if (!s) return null;
      const round = s.currentRound;
      const total = (s.teams.length - 1) * 2; // double round-robin
      if (round >= total) return { finished: true };
      const half = s.teams.length - 1;
      const pairs = s.fixtures[round % half];
      // 2e moitié = retour (inverser home/away)
      const isReturn = round >= half;
      const results = [];
      pairs.forEach(([a, b]) => {
        const home = isReturn ? b : a;
        const away = isReturn ? a : b;
        const homeTeam = s.teams[home], awayTeam = s.teams[away];
        const r = window.Sim.simulateMatch(homeTeam.profile, awayTeam.profile,
                                          homeTeam.tactics, awayTeam.tactics, { five: false });
        applyResult(s, home, away, r.scoreA, r.scoreB);
        results.push({ round, home, away, hg: r.scoreA, ag: r.scoreB,
                       userInvolved: homeTeam.isUser || awayTeam.isUser });
      });
      s.results.push.apply(s.results, results);
      s.currentRound++;
      return { round, results, table: getStandings(s), finished: s.currentRound >= total };
    },

    playFullSeason() {
      let last = null;
      while (true) {
        const r = this.playNextRound();
        last = r;
        if (!r || r.finished) break;
      }
      return last;
    },

    standings() { return getStandings(this.state); },
  };

  // ============================================================
  // helpers
  // ============================================================
  function pickXIWithinValue(pool, formation, SLOT_RULES, vMin, vMax) {
    const slots = {};
    const used = new Set();
    const candidates = pool.filter(p => p.value >= vMin && p.value <= vMax);
    formation.slots.forEach(s => {
      let pick = null;
      const acc = SLOT_RULES[s.type] || [];
      const sub = candidates.filter(p => !used.has(p.id) && p.positions.some(pp => acc.includes(pp)));
      if (sub.length) pick = sub[Math.floor(Math.random() * Math.min(sub.length, 18))];
      else {
        // fallback : permissif sur pool global
        const sub2 = pool.filter(p => !used.has(p.id) && p.positions.some(pp => acc.includes(pp)));
        pick = sub2[Math.floor(Math.random() * Math.min(sub2.length, 18))];
      }
      if (pick) { slots[s.id] = pick.id; used.add(pick.id); }
    });
    return slots;
  }
  function pickRandomTactics() {
    const ranges = { lineHeight: [25, 75], tempo: [40, 80], press: [30, 80], width: [40, 70], directness: [30, 75] };
    const t = {};
    Object.keys(ranges).forEach(k => { const [lo, hi] = ranges[k]; t[k] = Math.round(lo + Math.random() * (hi - lo)); });
    return t;
  }
  const CITY_NAMES = ['FC Aurora','Real Tempest','Atletico Vanguard','SC Mistral','Olympique Drift',
    'Inter Reverie','AS Verdant','Sporting Nightfall','Royal Eclipse','FC Wraith','Union Borealis',
    'AC Pulsar','RC Halcyon','SD Marauder','TSV Solstice','VfL Carillon','HC Tornado',
    'CD Phoenix','UD Sirocco','PCS Lupine','BSC Onyx','FC Quasar'];
  function makeName(tier, i) {
    const n = CITY_NAMES[(i*7+3) % CITY_NAMES.length];
    return n;
  }
  function roundRobin(n) {
    // circle method, n pair
    const pairs = [];
    const teams = [];
    for (let i = 0; i < n; i++) teams.push(i);
    if (teams.length % 2 === 1) teams.push(-1); // bye
    const m = teams.length;
    for (let r = 0; r < m - 1; r++) {
      const round = [];
      for (let i = 0; i < m / 2; i++) {
        const a = teams[i], b = teams[m - 1 - i];
        if (a !== -1 && b !== -1) round.push([a, b]);
      }
      pairs.push(round);
      // rotate
      const fixed = teams[0];
      const rest = teams.slice(1);
      rest.unshift(rest.pop());
      teams.length = 0; teams.push(fixed, ...rest);
    }
    return pairs;
  }
  function applyResult(s, home, away, hg, ag) {
    const tH = s.table[home], tA = s.table[away];
    tH.p++; tA.p++; tH.gf += hg; tH.ga += ag; tA.gf += ag; tA.ga += hg;
    if (hg > ag) { tH.w++; tH.pts += 3; tA.l++; tH.form.push('W'); tA.form.push('L'); }
    else if (hg < ag) { tA.w++; tA.pts += 3; tH.l++; tA.form.push('W'); tH.form.push('L'); }
    else { tH.d++; tA.d++; tH.pts++; tA.pts++; tH.form.push('D'); tA.form.push('D'); }
    if (tH.form.length > 5) tH.form.shift();
    if (tA.form.length > 5) tA.form.shift();
  }
  function getStandings(s) {
    return s.teams.map((t, i) => Object.assign({ idx: i, name: t.name, isUser: t.isUser }, s.table[i]))
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }
  function roundOf(n) { let v = 1; while (v < n) v *= 2; return v / 2; }

})();
