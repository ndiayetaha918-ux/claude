/* ==========================================================================
   Drafter — Phase B : scoring + simulation tactique
   ========================================================================== */
(function () {
  'use strict';

  // ===== Styles de jeu =====
  // Rock-paper-scissors :
  //   possession bat pressing (le press recule devant le jeu court)
  //   pressing bat contre (récup haute coupe les transitions)
  //   contre bat possession (les longs ballons exploitent la ligne haute)
  //   bloc bas = neutre (défensif, dur à battre mais ne crée pas beaucoup)
  const STYLES = {
    possession: {
      key: 'possession', label: 'Possession',
      icon: '◐',
      desc: 'Conservation, jeu court, contrôle du tempo.',
      counter: 'pressing',
      attack: 1.0, defense: 1.0, tempo: 0.8, creation: 1.2,
    },
    contre: {
      key: 'contre', label: 'Contre-attaque',
      icon: '↯',
      desc: 'Bloc médian, récup puis projection rapide vers l\'avant.',
      counter: 'possession',
      attack: 1.1, defense: 1.05, tempo: 1.3, creation: 1.0,
    },
    pressing: {
      key: 'pressing', label: 'Pressing haut',
      icon: '↥',
      desc: 'Récupération haute, intensité maximale, gegenpressing.',
      counter: 'contre',
      attack: 1.15, defense: 0.95, tempo: 1.2, creation: 1.1,
    },
    bloc: {
      key: 'bloc', label: 'Bloc bas',
      icon: '▤',
      desc: 'Défense compacte, lignes serrées, jeu direct sur l\'attaquant.',
      counter: null,
      attack: 0.85, defense: 1.25, tempo: 0.9, creation: 0.8,
    },
  };

  // ============================================================
  // SCORING
  // ============================================================
  function computeTeamScore(participant, FORMATIONS, SLOT_RULES, playerById) {
    const players = Object.values(participant.slots).filter(Boolean).map(id => playerById(id)).filter(Boolean);
    if (players.length === 0) {
      return { quality: 0, chemistry: 0, fit: 0, ageBalance: 0, overall: 0, players: [], topPlayers: [], totalValue: 0, avgAge: 0, filled: 0 };
    }

    // Qualité : moyenne pondérée des valeurs (log) + bonus stars
    const totalValue = players.reduce((s, p) => s + (p.value || 0), 0);
    const avgValue = totalValue / players.length;
    let quality = 30 + Math.log10(Math.max(1, avgValue)) * 22;
    // Bonus stars (>= 80M)
    const stars = players.filter(p => p.value >= 80).length;
    quality += stars * 2;
    quality = Math.min(99, Math.max(20, quality));

    // Chimie : pairs même championnat / même nationalité
    let sameLeague = 0, sameNation = 0;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        if (players[i].league && players[i].league === players[j].league) sameLeague++;
        if (players[i].nat && players[i].nat === players[j].nat) sameNation++;
      }
    }
    const maxPairs = players.length * (players.length - 1) / 2;
    const chemistry = Math.min(99, Math.max(20,
      35 + (sameLeague / maxPairs) * 45 + (sameNation / maxPairs) * 25
    ));

    // Adéquation tactique : poste primaire vs slot
    const F = FORMATIONS[participant.formation];
    let posFit = 0, totalSlots = 0;
    F.slots.forEach(slot => {
      const pid = participant.slots[slot.id];
      if (!pid) return;
      const p = playerById(pid); if (!p) return;
      totalSlots++;
      const accepted = SLOT_RULES[slot.type] || [];
      if (p.positions[0] === slot.type) posFit += 3;
      else if (accepted.includes(p.positions[0])) posFit += 2;
      else if (p.positions.some(pos => accepted.includes(pos))) posFit += 1.5;
      else posFit += 0.5;
    });
    const fit = totalSlots > 0 ? Math.min(99, (posFit / (totalSlots * 3)) * 100) : 0;

    // Equilibre d'âge : optimum autour de 26
    const ages = players.map(p => p.age || 26);
    const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
    const ageBalance = Math.min(99, Math.max(20, 100 - Math.abs(avgAge - 26) * 4.5));

    // Overall pondéré
    const overall = Math.round(quality * 0.45 + chemistry * 0.20 + fit * 0.20 + ageBalance * 0.15);

    // Top 3 joueurs par valeur
    const topPlayers = players.slice().sort((a, b) => b.value - a.value).slice(0, 3);

    return {
      quality: Math.round(quality),
      chemistry: Math.round(chemistry),
      fit: Math.round(fit),
      ageBalance: Math.round(ageBalance),
      overall,
      players, topPlayers, totalValue, avgAge: Math.round(avgAge * 10) / 10,
      filled: players.length,
    };
  }

  // ============================================================
  // MATCH SIMULATION
  // ============================================================
  // Poisson sampling pour les buts
  function poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  // Avantage de style : +8 si tu counter l'autre, -8 si tu te fais counter, 0 sinon
  function styleAdvantage(myStyle, oppStyle) {
    if (!myStyle || !oppStyle) return 0;
    const myDef = STYLES[myStyle];
    if (myDef.counter === oppStyle) return 8;
    const oppDef = STYLES[oppStyle];
    if (oppDef.counter === myStyle) return -8;
    return 0;
  }

  function simulateMatchOutcome(scoreA, scoreB, styleA, styleB) {
    const diff = scoreA.overall - scoreB.overall + styleAdvantage(styleA, styleB);
    const styleAdef = STYLES[styleA] || STYLES.possession;
    const styleBdef = STYLES[styleB] || STYLES.possession;
    const baseAttackA = (scoreA.quality / 100) * styleAdef.attack * (1 / styleBdef.defense);
    const baseAttackB = (scoreB.quality / 100) * styleBdef.attack * (1 / styleAdef.defense);
    let lambdaA = 0.6 + baseAttackA * 1.6 + Math.max(0, diff) * 0.035;
    let lambdaB = 0.6 + baseAttackB * 1.6 + Math.max(0, -diff) * 0.035;
    lambdaA = Math.max(0.2, Math.min(5, lambdaA));
    lambdaB = Math.max(0.2, Math.min(5, lambdaB));
    return {
      goalsA: poisson(lambdaA),
      goalsB: poisson(lambdaB),
      diff,
      lambdaA, lambdaB,
    };
  }

  // ============================================================
  // SIMULATION ANIMÉE — séquence d'événements pour le SVG
  // ============================================================
  // Génère une séquence chronologique d'événements pour le rendu :
  //   { minute, team: 'A'|'B', type: 'pass'|'shot'|'goal'|'kickoff'|'half', from, to, text }
  function generateMatchSequence(teamA, teamB, scoreA, scoreB, styleA, styleB, outcome) {
    const events = [];
    const totalEvents = 26; // ~26 actions sur 90 minutes virtuelles
    const goalsAFinal = outcome.goalsA;
    const goalsBFinal = outcome.goalsB;
    let scoredA = 0, scoredB = 0;

    // Distribuer les buts de façon plausible (pas tous au début/fin)
    const goalMinutes = [];
    function pickGoalMinute() {
      let m;
      do { m = 2 + Math.floor(Math.random() * 88); } while (goalMinutes.some(g => Math.abs(g - m) < 5));
      goalMinutes.push(m); return m;
    }
    const aMinutes = Array.from({length: goalsAFinal}, () => pickGoalMinute()).sort((x,y)=>x-y);
    const bMinutes = Array.from({length: goalsBFinal}, () => pickGoalMinute()).sort((x,y)=>x-y);

    events.push({ minute: 0, type: 'kickoff', team: null, text: 'Coup d\'envoi' });

    // Générer N moments où le jeu bascule entre les 2 équipes
    const possessionA = 0.5 + (outcome.diff / 200); // 0-1 prob A en posession
    let minute = 1;
    for (let i = 0; i < totalEvents; i++) {
      minute = Math.min(89, 2 + Math.floor((i + 1) / totalEvents * 88));
      const inPossA = Math.random() < possessionA;
      const team = inPossA ? 'A' : 'B';
      const teamData = inPossA ? teamA : teamB;

      // Choisir un joueur (poids = valeur)
      const players = teamData.players;
      const totalW = players.reduce((s, p) => s + Math.sqrt(p.value || 1), 0);
      let r = Math.random() * totalW, fromPlayer = players[0];
      for (const p of players) { r -= Math.sqrt(p.value || 1); if (r <= 0) { fromPlayer = p; break; } }
      let toPlayer = players[Math.floor(Math.random() * players.length)];
      while (toPlayer === fromPlayer && players.length > 1) {
        toPlayer = players[Math.floor(Math.random() * players.length)];
      }

      // Tirer un but ?
      const goalThisMinute = inPossA
        ? aMinutes.includes(minute) && scoredA < goalsAFinal
        : bMinutes.includes(minute) && scoredB < goalsBFinal;

      if (goalThisMinute) {
        const scorer = pickAttacker(teamData.players);
        events.push({
          minute, type: 'goal', team,
          scorer: scorer.name,
          text: `BUT ! ${scorer.name} marque pour ${team === 'A' ? teamA.name : teamB.name}`,
        });
        if (inPossA) scoredA++; else scoredB++;
      } else {
        events.push({
          minute, type: 'pass', team,
          from: fromPlayer.name, to: toPlayer.name,
          text: `${fromPlayer.name} → ${toPlayer.name}`,
        });
      }
      // Halftime
      if (i === Math.floor(totalEvents / 2) - 1) {
        events.push({ minute: 45, type: 'half', team: null, text: 'Mi-temps' });
      }
    }
    events.push({ minute: 90, type: 'end', team: null,
      text: `Coup de sifflet final · ${teamA.name} ${outcome.goalsA} – ${outcome.goalsB} ${teamB.name}` });
    return events;
  }

  function pickAttacker(players) {
    // Préférer les CF/ST/LW/RW/AM
    const attackers = players.filter(p => ['CF','ST','LW','RW','AM','SS'].includes(p.positions[0]));
    const pool = attackers.length ? attackers : players;
    // Pondérer par valeur
    const totalW = pool.reduce((s, p) => s + p.value, 0);
    let r = Math.random() * totalW;
    for (const p of pool) { r -= p.value; if (r <= 0) return p; }
    return pool[pool.length - 1];
  }

  // ============================================================
  // BRACKET — qui joue contre qui
  // ============================================================
  function buildBracket(participants, scores) {
    // 2 joueurs : 1 match
    // 3 joueurs : round-robin (3 matches)
    // 4 joueurs : semis + finale + 3e place (par overall : 1v4, 2v3)
    const n = participants.length;
    if (n === 2) {
      return [{ a: 0, b: 1, type: 'final' }];
    }
    if (n === 3) {
      return [
        { a: 0, b: 1, type: 'rr' },
        { a: 0, b: 2, type: 'rr' },
        { a: 1, b: 2, type: 'rr' },
      ];
    }
    // n === 4 : tri par overall décroissant
    const ranked = participants.map((p, i) => ({ idx: i, overall: scores[i].overall }))
      .sort((x, y) => y.overall - x.overall);
    return [
      { a: ranked[0].idx, b: ranked[3].idx, type: 'semi' },
      { a: ranked[1].idx, b: ranked[2].idx, type: 'semi' },
      // Finale & 3e place ajoutées dynamiquement après les semis
    ];
  }

  // Compute standings from played matches
  function computeStandings(participants, matches) {
    const stats = participants.map((p, i) => ({
      idx: i, name: p.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, color: p.color,
    }));
    matches.forEach(m => {
      if (!m.played) return;
      const A = stats[m.a], B = stats[m.b];
      A.p++; B.p++;
      A.gf += m.result.goalsA; A.ga += m.result.goalsB;
      B.gf += m.result.goalsB; B.ga += m.result.goalsA;
      if (m.result.goalsA > m.result.goalsB) { A.w++; A.pts += 3; B.l++; }
      else if (m.result.goalsA < m.result.goalsB) { B.w++; B.pts += 3; A.l++; }
      else { A.d++; A.pts++; B.d++; B.pts++; }
    });
    return stats.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  }

  // ============================================================
  // Export
  // ============================================================
  window.Sim = {
    STYLES,
    computeTeamScore,
    simulateMatchOutcome,
    generateMatchSequence,
    buildBracket,
    computeStandings,
  };
})();
