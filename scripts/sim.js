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
  // Génère une séquence chronologique d'événements garantissant
  // EXACTEMENT outcome.goalsA buts pour A et outcome.goalsB pour B.
  function generateMatchSequence(teamA, teamB, scoreA, scoreB, styleA, styleB, outcome) {
    const events = [];
    const totalEvents = 32; // ~32 actions sur 90 min (plus de temps pour respirer)
    const goalsAFinal = outcome.goalsA;
    const goalsBFinal = outcome.goalsB;

    // ====== Étape 1 : Construction de la timeline de possession ======
    // Probabilité que A ait le ballon à un moment donné, dérivée du diff + style
    const possessionA = 0.5 + (outcome.diff / 220);
    const slots = [];
    for (let i = 0; i < totalEvents; i++) {
      const minute = Math.min(89, 2 + Math.floor((i + 1) / totalEvents * 88));
      const inPossA = Math.random() < possessionA;
      slots.push({ idx: i, minute, team: inPossA ? 'A' : 'B', type: 'pass' });
    }

    // ====== Étape 2 : Allouer EXACTEMENT le bon nombre de buts ======
    function placeGoals(team, count) {
      const eligible = slots.filter(s => s.team === team && s.type === 'pass');
      // Si pas assez de slots pour cette équipe, forcer
      let candidatePool = eligible.slice();
      if (candidatePool.length < count) {
        // Forcer des slots de l'autre équipe à basculer (ex: contre-attaque)
        const others = slots.filter(s => s.team !== team && s.type === 'pass').slice().sort(() => Math.random() - 0.5);
        while (candidatePool.length < count && others.length > 0) {
          const o = others.shift();
          o.team = team;
          candidatePool.push(o);
        }
      }
      // Mélanger + prendre `count`, en évitant de coller plusieurs buts à la suite
      candidatePool.sort(() => Math.random() - 0.5);
      const picked = [];
      for (const s of candidatePool) {
        if (picked.length >= count) break;
        // Pas 2 buts dans la même minute ±3
        if (picked.some(p => Math.abs(p.minute - s.minute) < 4)) continue;
        picked.push(s);
      }
      // Si on n'a toujours pas assez (très improbable), accepter le restant
      while (picked.length < count && candidatePool.length > picked.length) {
        for (const s of candidatePool) {
          if (!picked.includes(s)) { picked.push(s); break; }
        }
      }
      picked.forEach(s => { s.type = 'goal'; });
    }
    placeGoals('A', goalsAFinal);
    placeGoals('B', goalsBFinal);

    // ====== Étape 3 : Construire les événements ======
    events.push({ minute: 0, type: 'kickoff', team: null, text: 'Coup d\'envoi' });

    const halfIdx = Math.floor(totalEvents / 2);
    slots.forEach((s, i) => {
      const teamData = s.team === 'A' ? teamA : teamB;
      const oppData = s.team === 'A' ? teamB : teamA;

      if (s.type === 'goal') {
        const scorer = pickAttacker(teamData.players);
        const assist = pickAssister(teamData.players, scorer);
        events.push({
          minute: s.minute, type: 'goal', team: s.team,
          scorer: scorer.name,
          scorerId: scorer.id,
          assistId: assist ? assist.id : null,
          text: assist
            ? `⚽ BUT ! ${scorer.name} (passe ${assist.name}) — ${s.team === 'A' ? teamA.name : teamB.name}`
            : `⚽ BUT ! ${scorer.name} — ${s.team === 'A' ? teamA.name : teamB.name}`,
        });
      } else {
        // Pass ou shot raté — varier
        const players = teamData.players;
        const totalW = players.reduce((sum, p) => sum + Math.sqrt(p.value || 1), 0);
        let r = Math.random() * totalW, fromPlayer = players[0];
        for (const p of players) { r -= Math.sqrt(p.value || 1); if (r <= 0) { fromPlayer = p; break; } }
        let toPlayer = players[Math.floor(Math.random() * players.length)];
        while (toPlayer === fromPlayer && players.length > 1) {
          toPlayer = players[Math.floor(Math.random() * players.length)];
        }

        // Mix d'événements pour variété
        const variety = Math.random();
        let evType = 'pass';
        let evText = `${fromPlayer.name} → ${toPlayer.name}`;
        if (variety < 0.08) {
          // Tir raté (1 chance sur 12)
          const shooter = pickAttacker(teamData.players);
          evType = 'shot';
          evText = `Tir de ${shooter.name} — repoussé !`;
          fromPlayer = shooter;
          toPlayer = shooter; // ball stays near attacker
        } else if (variety < 0.18) {
          // Interception (1 chance sur 10)
          const defender = pickDefender(oppData.players);
          if (defender) {
            evType = 'interception';
            evText = `${defender.name} intercepte !`;
            fromPlayer = defender;
          }
        }

        events.push({
          minute: s.minute, type: evType, team: s.team,
          from: fromPlayer.name, to: toPlayer.name,
          fromId: fromPlayer.id, toId: toPlayer.id,
          text: evText,
        });
      }

      if (i === halfIdx - 1) {
        events.push({ minute: 45, type: 'half', team: null, text: '— Mi-temps —' });
      }
    });
    events.push({ minute: 90, type: 'end', team: null,
      text: `Coup de sifflet final — ${teamA.name} ${outcome.goalsA} – ${outcome.goalsB} ${teamB.name}` });
    return events;
  }

  function pickAttacker(players) {
    const attackers = players.filter(p => ['CF','ST','LW','RW','AM','SS'].includes(p.positions[0]));
    const pool = attackers.length ? attackers : players;
    const totalW = pool.reduce((s, p) => s + (p.value || 1), 0);
    let r = Math.random() * totalW;
    for (const p of pool) { r -= (p.value || 1); if (r <= 0) return p; }
    return pool[pool.length - 1];
  }

  function pickAssister(players, scorer) {
    // Assistant : milieu créatif ou ailier, exclure le buteur
    const creatives = players.filter(p =>
      p !== scorer && ['AM','CM','LW','RW','LM','RM'].includes(p.positions[0]));
    if (creatives.length === 0) return null;
    if (Math.random() < 0.3) return null; // 30% : pas d'assistant (frappe directe)
    return creatives[Math.floor(Math.random() * creatives.length)];
  }

  function pickDefender(players) {
    const defs = players.filter(p => ['CB','LB','RB','DM','LWB','RWB'].includes(p.positions[0]));
    if (defs.length === 0) return null;
    return defs[Math.floor(Math.random() * defs.length)];
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
