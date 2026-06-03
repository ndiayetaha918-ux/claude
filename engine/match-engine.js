/* ============================================================
   Drafter — Engine B.3
   Moteur de match : assemble scénario + situations → match complet

   Pipeline complet :
   1. Analyse pré-match (A.4) → dossier tactique
   2. Notes d'équipe (A.5) pour forceDiff
   3. Scénario (B.1) → colonne vertébrale en 6 phases
   4. Pour chaque phase :
      - Tire N actions selon expectedActions + dominanceA/B + neutralProb
      - Pour chaque action : situation type → cast → outcome → narrate
   5. Surprise events injectés au timing prévu
   6. Agrégation des moments → score, stats, log

   Sortie : compatible avec l'animateur existant (path / moments / scoreA/B).
   ============================================================ */
(function () {
  'use strict';

  /**
   * runMatch(teamA, teamB, opts) → {
   *   scoreA, scoreB,
   *   moments: [{ t, type, team, text, situation, cast, outcome, xg, scorer }],
   *   stats: { A: {poss, shots, onTarget, xg, corners, ...}, B: {...} },
   *   scenario,
   *   analysis,
   *   gradeA, gradeB,
   * }
   *
   * teamA / teamB = { name, formation, formationDef, slots, roles, playerById }
   */
  function runMatch(teamA, teamB, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const grid = opts.grid || '11v11';

    const Drafter = window.Drafter;
    if (!Drafter || !Drafter.Analyzer || !Drafter.TeamGrade ||
        !Drafter.Scenario || !Drafter.Situations || !Drafter.Zones ||
        !Drafter.Attributes || !Drafter.Roles) {
      console.error('match-engine: composants manquants');
      return null;
    }

    // === 1) Pré-match : analyse + notes ===
    const analysis = Drafter.Analyzer.analyzeMatch(teamA, teamB, { grid });
    const gradeA = Drafter.TeamGrade.gradeTeam(teamA, { grid });
    const gradeB = Drafter.TeamGrade.gradeTeam(teamB, { grid });

    // === 2) Scénario ===
    const scenario = Drafter.Scenario.buildScenario(analysis, {
      rng,
      grade: { A: gradeA.grade, B: gradeB.grade },
    });

    // === 3) Préparer les "team players enrichis" (réutilisés pour le casting) ===
    const playersA = enrichTeam(teamA, analysis.reportA.zoneMap);
    const playersB = enrichTeam(teamB, analysis.reportB.zoneMap);

    // === 4) Stats initiales ===
    const stats = {
      A: { possessions: 0, shots: 0, onTarget: 0, xg: 0, corners: 0, fouls: 0, situationCounts: {} },
      B: { possessions: 0, shots: 0, onTarget: 0, xg: 0, corners: 0, fouls: 0, situationCounts: {} },
    };
    const contributions = {};   // playerId → { goals, assists, key, recoveries }
    const moments = [];
    let scoreA = 0, scoreB = 0;

    moments.push({ t: 0, type: 'kickoff', team: null, text: 'Coup d\'envoi' });

    // === 5) Boucler sur les 6 phases ===
    scenario.phases.forEach((phase, phaseIdx) => {
      // Marqueur narratif de début de phase (optionnel mais utile pour le rapport)
      if (phaseIdx > 0) {
        moments.push({
          t: phase.minStart,
          type: 'phase',
          team: null,
          text: phaseMarkerText(phase),
          phaseId: phase.id,
          phaseLabel: phase.label,
          phaseFocus: phase.focus,
        });
      }

      // Surprise event programmé pour cette phase ?
      const surprises = scenario.surpriseEvents.filter(s => s.phaseId === phase.id);

      // Génération des actions de la phase
      for (let i = 0; i < phase.expectedActions; i++) {
        const tMinute = phase.minStart + Math.floor((i + 0.5) / phase.expectedActions * (phase.minEnd - phase.minStart));

        // Surprise event qui s'active maintenant ?
        const dueSurprise = surprises.find(s => !s._consumed && Math.abs(s.minute - tMinute) < 2);
        if (dueSurprise) {
          dueSurprise._consumed = true;
          const surMoment = injectSurprise(dueSurprise, playersA, playersB, tMinute, rng);
          if (surMoment) {
            moments.push(surMoment);
            if (surMoment.type === 'goal') {
              if (surMoment.team === 'A') scoreA++; else scoreB++;
            }
          }
        }

        // Qui attaque ? Tirage selon dominanceA / dominanceB / neutralProb
        const r = rng();
        let attackingSide = null;
        if (r < phase.dominanceA) attackingSide = 'A';
        else if (r < phase.dominanceA + phase.dominanceB) attackingSide = 'B';
        else {
          // action neutre (interruption, transition courte)
          moments.push({
            t: tMinute,
            type: 'transition',
            team: null,
            text: 'Le ballon transite au milieu, peu de menace',
          });
          continue;
        }

        // Génère la situation
        const moment = generateMoment({
          attackingSide,
          attackingTeam: attackingSide === 'A' ? teamA : teamB,
          defendingTeam: attackingSide === 'A' ? teamB : teamA,
          attackingPlayers: attackingSide === 'A' ? playersA : playersB,
          defendingPlayers: attackingSide === 'A' ? playersB : playersA,
          attackingZoneMap: attackingSide === 'A' ? analysis.reportA.zoneMap : analysis.reportB.zoneMap,
          defendingZoneMap: attackingSide === 'A' ? analysis.reportB.zoneMap : analysis.reportA.zoneMap,
          comparison: analysis.comparison,
          phase,
          tMinute,
          rng,
        });

        if (!moment) continue;

        moments.push(moment);
        stats[attackingSide].possessions++;
        if (stats[attackingSide].situationCounts[moment.situationKey] == null) {
          stats[attackingSide].situationCounts[moment.situationKey] = 0;
        }
        stats[attackingSide].situationCounts[moment.situationKey]++;

        if (moment.type === 'shot' || moment.type === 'save' || moment.type === 'goal' || moment.type === 'miss') {
          stats[attackingSide].shots++;
          stats[attackingSide].xg += moment.xg || 0;
          if (moment.type === 'save' || moment.type === 'goal') stats[attackingSide].onTarget++;
        }
        if (moment.type === 'goal') {
          if (attackingSide === 'A') scoreA++; else scoreB++;
          bump(contributions, moment.scorer && moment.scorer.player.id, 'goals');
          if (moment.cast && moment.cast.passer) bump(contributions, moment.cast.passer.player.id, 'assists');
          if (moment.cast && moment.cast.releaser) bump(contributions, moment.cast.releaser.player.id, 'assists');
          if (moment.cast && moment.cast.creator) bump(contributions, moment.cast.creator.player.id, 'assists');
        }
        if (moment.type === 'save' || moment.type === 'miss') {
          // Quelques corners émergent des saves
          if (rng() < 0.35) {
            stats[attackingSide].corners++;
            moments.push({ t: tMinute, type: 'corner', team: attackingSide,
              text: 'Corner pour ' + (attackingSide === 'A' ? teamA.name : teamB.name) });
          }
        }
      }

      // Mi-temps (entre phase 3 et 4)
      if (phase.id === 3) {
        moments.push({ t: 45, type: 'halftime', team: null, text: 'Mi-temps' });
      }
    });

    moments.push({ t: 90, type: 'fulltime', team: null,
      text: 'Coup de sifflet final — ' + scoreA + ' – ' + scoreB });

    // === 6) Possession en % depuis le ratio des possessions ===
    const totalPoss = stats.A.possessions + stats.B.possessions;
    const possA = totalPoss > 0 ? Math.round(stats.A.possessions / totalPoss * 100) : 50;
    stats.A.possession = possA;
    stats.B.possession = 100 - possA;
    stats.A.xg = +stats.A.xg.toFixed(2);
    stats.B.xg = +stats.B.xg.toFixed(2);

    return {
      scoreA, scoreB,
      moments,
      stats,
      contributions,
      scenario,
      analysis,
      gradeA, gradeB,
    };
  }

  // ---- Sous-helpers ----

  function enrichTeam(team, zoneMap) {
    const Attributes = window.Drafter.Attributes;
    const Roles = window.Drafter.Roles;
    const Zones = window.Drafter.Zones;
    return team.formationDef.slots.map(s => {
      const pid = team.slots[s.id];
      if (!pid) return null;
      const player = team.playerById(pid);
      if (!player) return null;
      const attrs = Attributes.build(player);
      const traitScores = Roles.traitScores(attrs);
      const dist = Zones.playerZoneDistribution(s.type, team.roles && team.roles[s.id]);
      const zoneDistribution = {};
      dist.forEach(d => zoneDistribution[d.cellId] = d.weight);
      return { player, attrs, traitScores, zoneDistribution, slotType: s.type, slotId: s.id, roleKey: team.roles && team.roles[s.id] };
    }).filter(Boolean);
  }

  function bump(contributions, pid, kind) {
    if (!pid) return;
    if (!contributions[pid]) contributions[pid] = { goals: 0, assists: 0, key: 0, recoveries: 0 };
    contributions[pid][kind] = (contributions[pid][kind] || 0) + 1;
  }

  function phaseMarkerText(phase) {
    const map = {
      observation: 'Les deux équipes prennent leurs marques',
      ascendant:   'Une équipe pose son emprise',
      'fin-mt':    'Dernières minutes avant la pause',
      reajustement:'Reprise — ajustements tactiques',
      tournant:    'Le tournant du match approche',
      finale:      'Dernières minutes, intensité maximale',
    };
    return map[phase.label] || 'Nouvelle phase de jeu';
  }

  function generateMoment(ctx) {
    const Situations = window.Drafter.Situations;
    const sitKey = Situations.pickSituationType(ctx.phase.focus, ctx.attackingSide === 'A' ? ctx.phase.dominanceA : ctx.phase.dominanceB, ctx.rng);
    const sit = Situations.SITUATION_TYPES[sitKey];
    if (!sit) return null;

    const cast = Situations.castActors(sitKey, ctx.attackingPlayers, { rng: ctx.rng });
    if (!cast) return null;

    // Détermine la zone d'origine et la zone cible (selon la situation)
    const originZoneId = pickArr(sit.originZone, ctx.rng);
    const targetZoneId = pickArr(sit.targetZone, ctx.rng);

    // Qualité des zones depuis le mapping
    const attZone = ctx.attackingZoneMap.zones[targetZoneId] || { attack: 65 };
    const defZone = ctx.defendingZoneMap.zones[mirrorOf(targetZoneId)] || { defense: 65 };
    const attackingZoneScore = attZone.attack + (attZone.speed * 0.3) + (attZone.technique * 0.2);
    const defendingZoneScore = defZone.defense + (defZone.intelligence * 0.2);

    const outcome = Situations.resolveSituationOutcome(
      sit, cast, ctx.defendingPlayers, attackingZoneScore, defendingZoneScore, ctx.rng
    );
    const text = Situations.narrate(sit, cast, outcome, ctx.rng);

    let type = 'situation';
    if (outcome.outcome === 'goal') type = 'goal';
    else if (outcome.outcome === 'save') type = 'save';
    else if (outcome.outcome === 'miss') type = 'miss';
    else if (outcome.outcome === 'lost') type = 'attempt';

    // Construit un path (sequence de joueurs) pour l'animation existante
    const path = Object.values(cast).map(c => ({
      id: c.player.id,
      name: c.player.name,
      slotId: c.slotId,
    }));

    return {
      t: ctx.tMinute,
      type,
      team: ctx.attackingSide,
      text,
      situationKey: ctx.attackingSide && ctx.phase ? sitKey : sitKey,
      situationLabel: sit.label,
      phaseId: ctx.phase.id,
      phaseFocus: ctx.phase.focus,
      originZone: originZoneId,
      targetZone: targetZoneId,
      xg: outcome.xg || 0,
      scorer: outcome.shooter,
      cast,
      path,
    };
  }

  function injectSurprise(surprise, playersA, playersB, tMinute, rng) {
    const Situations = window.Drafter.Situations;
    const attackingSide = surprise.side;
    const attackingPlayers = attackingSide === 'A' ? playersA : playersB;
    const defendingPlayers = attackingSide === 'A' ? playersB : playersA;

    // Mappe le type de surprise vers une situation appropriée
    let sitKey;
    let forceOutcome = null;
    switch (surprise.type) {
      case 'gk_blunder':
        sitKey = 'long_range_shot';   // un tir lointain qui surprend le GK
        forceOutcome = 'goal';
        break;
      case 'csc':
        sitKey = 'wing_play';
        forceOutcome = 'csc';   // narration spéciale
        break;
      case 'set_piece_goal':
        sitKey = rng() < 0.5 ? 'set_piece_corner' : 'set_piece_freekick';
        forceOutcome = 'goal';
        break;
      case 'long_distance':
        sitKey = 'long_range_shot';
        forceOutcome = 'goal';
        break;
      case 'goal_against_run':
        sitKey = 'counter_attack';
        forceOutcome = 'goal';
        break;
      case 'red_card_opp':
        // pas de but, mais l'équipe adverse perd un joueur (effet narratif)
        return {
          t: tMinute, type: 'card',
          team: attackingSide === 'A' ? 'B' : 'A',
          card: 'red',
          text: '🟥 Carton rouge ! Un défenseur prend le chemin des vestiaires.',
          isSurprise: true,
        };
      default:
        sitKey = 'long_range_shot';
        forceOutcome = 'goal';
    }

    const sit = Situations.SITUATION_TYPES[sitKey];
    const cast = Situations.castActors(sitKey, attackingPlayers, { rng });
    if (!cast) return null;
    const text = Situations.narrate(sit, cast, { outcome: 'goal' }, rng);
    return {
      t: tMinute,
      type: 'goal',
      team: attackingSide,
      text: '⚡ ' + text,
      situationKey: sitKey,
      situationLabel: sit.label,
      surpriseType: surprise.type,
      isSurprise: true,
      cast,
      scorer: cast.shooter || cast.finisher || cast.taker || Object.values(cast)[0],
      xg: 0.2,
    };
  }

  function pickArr(arr, rng) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(rng() * arr.length)];
  }

  function mirrorOf(cellId) {
    const Zones = window.Drafter.Zones;
    if (!Zones) return cellId;
    // Le miroir 11v11 est dans Zones.MIRRORS (exporté indirectement via compareZones)
    // On reconstruit ici les paires essentielles :
    const MIRROR = {
      'left-def':'right-att','left-mid':'right-mid','left-att':'right-def',
      'left-half-def':'right-half-att','left-half-mid':'right-half-mid','left-half-att':'right-half-def',
      'axis-def':'axis-att','axis-mid':'axis-mid','axis-att':'axis-def','axis-box':'axis-box',
      'right-half-def':'left-half-att','right-half-mid':'left-half-mid','right-half-att':'left-half-def',
      'right-def':'left-att','right-mid':'left-mid','right-att':'left-def',
    };
    return MIRROR[cellId] || cellId;
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.MatchEngine = {
    runMatch,
  };
})();
