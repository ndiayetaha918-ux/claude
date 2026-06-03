/* ============================================================
   Drafter — Engine B.1
   Scenario builder : génère la colonne vertébrale d'un match

   Avant la simulation, on écrit le scénario en 6 phases narratives.
   La phase A (analyseur) nous a donné l'écart de force et les avantages.
   On en dérive :
   - une dominance probabiliste PAR PHASE (pas figée)
   - une intensité (rythme, nb d'actions, chances de but)
   - un focus narratif (observation, pression, contre, etc.)

   L'aléa est contrôlé par "surpriseLevel" qui dépend de l'écart de
   force. Petit écart = très ouvert, écart énorme = surprise rare mais
   jamais impossible.

   Le scénario est une COLONNE VERTÉBRALE, pas un script figé. La sim
   peut le suivre, le contester, ou produire un déraillement.
   ============================================================ */
(function () {
  'use strict';

  // -------- Phases types et leur structure narrative --------
  // Un match standard se décompose en 6 phases avec des rôles narratifs.
  // Pour chaque phase : intensité de base + focus de jeu attendu.
  const PHASE_TEMPLATE = [
    { id: 1, minStart: 0,  minEnd: 18, label: 'observation',     intensity: 0.55, focusPool: ['feeling-out', 'control', 'observation'] },
    { id: 2, minStart: 18, minEnd: 40, label: 'ascendant',       intensity: 0.85, focusPool: ['pressure', 'sustained', 'control'] },
    { id: 3, minStart: 40, minEnd: 45, label: 'fin-mt',          intensity: 0.95, focusPool: ['urgency', 'transition', 'late-window'] },
    { id: 4, minStart: 45, minEnd: 62, label: 'reajustement',    intensity: 0.70, focusPool: ['adjustment', 'response', 'control'] },
    { id: 5, minStart: 62, minEnd: 78, label: 'tournant',        intensity: 0.90, focusPool: ['push', 'response', 'sustained'] },
    { id: 6, minStart: 78, minEnd: 90, label: 'finale',          intensity: 1.0,  focusPool: ['urgency', 'desperation', 'last-stand'] },
  ];

  /**
   * buildScenario(matchAnalysis, opts) → { phases, plot, surpriseLevel, forceDiff }
   *
   * matchAnalysis = sortie de window.Drafter.Analyzer.analyzeMatch(A, B)
   * opts.grade = { A: gradeA, B: gradeB } pour pondérer (sinon dérive de domStats)
   * opts.rng   = (seed?) → fonction random() ; null = Math.random
   */
  function buildScenario(matchAnalysis, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;

    // === 1) Calcul du dominanceBias (qui est favori, à quel point) ===
    // On combine plusieurs signaux :
    //   - domStats du analyzer (zones dominées)
    //   - grade (note d'équipe) si fourni
    //   - avantages exploitables (advantages)
    const { domStats, advantagesA, advantagesB } = matchAnalysis;
    let scoreA = domStats.A * 4 + advantagesA.reduce((s, a) => s + a.magnitude, 0) * 0.4;
    let scoreB = domStats.B * 4 + advantagesB.reduce((s, a) => s + a.magnitude, 0) * 0.4;
    if (opts.grade) {
      scoreA += (opts.grade.A || 70) * 0.6;
      scoreB += (opts.grade.B || 70) * 0.6;
    }
    const scoreTotal = scoreA + scoreB;
    // Force ratio brut : 0..1, 0.5 = équilibré
    const forceRatioA = scoreTotal > 0 ? scoreA / scoreTotal : 0.5;
    // Force diff signée : -100..+100
    const forceDiff = Math.round((forceRatioA - 0.5) * 200);

    // === 2) Niveau de surprise crédible ===
    // Écart 0-10 : très ouvert (surprise = ~30%)
    // Écart 10-25 : favori net mais surprise crédible (~15%)
    // Écart 25-50 : favori clair (~7%)
    // Écart 50+ : domination, surprise rare (~3%)
    const absDiff = Math.abs(forceDiff);
    let surpriseProb = 0.30;
    if (absDiff > 50) surpriseProb = 0.04;
    else if (absDiff > 25) surpriseProb = 0.10;
    else if (absDiff > 10) surpriseProb = 0.18;
    else if (absDiff > 0)  surpriseProb = 0.28;

    // === 3) Dominance théorique du favori (par phase) ===
    // Si A favori : sa dominanceProb baseline = 0.5 + biais en fonction de forceDiff
    // Avec un clamp pour rester réaliste (jamais plus de 75% de domination même
    // pour les écarts énormes — sinon la sim devient statique)
    const baselineDomA = 0.5 + (forceRatioA - 0.5) * 0.6;
    const baselineDomB = 1 - baselineDomA;
    const baselineDom = { A: Math.max(0.25, Math.min(0.72, baselineDomA)),
                          B: Math.max(0.25, Math.min(0.72, baselineDomB)) };

    // === 4) Genèse des 6 phases ===
    // Pour chaque phase : tirage de la dominance avec biais vers baselineDom,
    // mais avec variation pour créer de la narration (un tournant à mi-temps,
    // un sursaut en fin de match, etc.)
    const phases = PHASE_TEMPLATE.map((p, idx) => {
      // Modulateurs narratifs par phase :
      //  - Phase 1 (observation) : dominance moins marquée
      //  - Phase 2 (ascendant)   : dominance plus marquée vers le favori
      //  - Phase 3 (fin-mt)      : intensité élevée, peut renverser
      //  - Phase 4 (réajustement): l'équipe en retard tente quelque chose
      //  - Phase 5 (tournant)    : forte variation possible
      //  - Phase 6 (finale)      : la moins forte pousse pour égaliser
      let domA = baselineDom.A, domB = baselineDom.B;

      // Phase 1 : tout le monde se cherche, dominance lissée
      if (p.id === 1) {
        domA = lerp(domA, 0.5, 0.4);
        domB = lerp(domB, 0.5, 0.4);
      }
      // Phase 2 : le favori prend l'ascendant
      if (p.id === 2) {
        if (forceRatioA > 0.5) { domA = lerp(domA, 0.7, 0.3); domB = 1 - domA; }
        else                   { domB = lerp(domB, 0.7, 0.3); domA = 1 - domB; }
      }
      // Phase 4 : l'équipe en retard tente une réaction
      if (p.id === 4) {
        if (forceRatioA > 0.5) { domB = lerp(domB, 0.5, 0.35); domA = 1 - domB; }
        else                   { domA = lerp(domA, 0.5, 0.35); domB = 1 - domA; }
      }
      // Phase 6 : équipe en retard pousse (surtout si proche au score)
      if (p.id === 6) {
        if (forceRatioA > 0.5) { domB = lerp(domB, 0.55, 0.3); domA = 1 - domB; }
        else                   { domA = lerp(domA, 0.55, 0.3); domB = 1 - domA; }
      }

      // Variation aléatoire bornée pour éviter un scénario figé
      // (les phases ne sont pas une prophétie, c'est une tendance)
      const noise = (rng() - 0.5) * 0.18;
      domA = clamp(domA + noise, 0.20, 0.75);
      domB = 1 - domA;

      // Focus tiré du pool de la phase
      const focus = p.focusPool[Math.floor(rng() * p.focusPool.length)];

      // Nombre d'actions générées dans cette phase (5-12 selon durée + intensité)
      const duration = p.minEnd - p.minStart;
      const expectedActions = Math.round((duration * 0.55) * p.intensity);

      return {
        id: p.id,
        label: p.label,
        minStart: p.minStart,
        minEnd: p.minEnd,
        duration,
        dominanceA: +(domA).toFixed(3),
        dominanceB: +(domB).toFixed(3),
        neutralProb: 0.10,        // 10% des actions neutres (interruptions, transitions sans menace)
        intensity: p.intensity,
        focus,
        expectedActions,
      };
    });

    // === 5) Surprise event(s) ===
    // L'aléa contrôlé : 1-2 événements de surprise possibles dans le match.
    // Ces événements peuvent :
    //  - Faire pencher temporairement la dominance vers l'underdog
    //  - Produire un but contre le cours du jeu
    //  - Provoquer un carton rouge qui change la dynamique
    const surpriseEvents = generateSurpriseEvents(phases, surpriseProb, forceRatioA, rng);

    // === 6) Plot narratif global ===
    const plot = buildPlotSummary(phases, forceRatioA, surpriseEvents, matchAnalysis);

    return {
      phases,
      surpriseEvents,
      surpriseLevel: surpriseProb,
      forceDiff,
      forceRatioA,
      favorite: forceRatioA > 0.55 ? 'A' : (forceRatioA < 0.45 ? 'B' : null),
      plot,
    };
  }

  /**
   * Génère 0-2 surprise events possibles dans le match.
   * Chaque event a un timing, un type, et un effet sur la dominance.
   */
  function generateSurpriseEvents(phases, surpriseProb, forceRatioA, rng) {
    const events = [];
    // Premier tirage : y a-t-il une surprise ?
    if (rng() < surpriseProb) {
      // Privilégier les phases 3, 5, 6 — moments dramatiques (fin de mi-temps,
      // tournant, finale). Jamais en phase 1 (observation).
      const dramaticPhases = [phases[2], phases[4], phases[5]];
      const phase = dramaticPhases[Math.floor(rng() * dramaticPhases.length)];
      // Évite le tout début de phase — on laisse 30% écoulé minimum
      const phaseDur = phase.minEnd - phase.minStart;
      const minute = phase.minStart + Math.floor((0.3 + rng() * 0.7) * phaseDur);
      // Side : favorise l'underdog (celui qui est en désavantage)
      const underdog = forceRatioA < 0.5 ? 'A' : 'B';
      const surpriseType = pickSurpriseType(rng);
      events.push({
        minute,
        phaseId: phase.id,
        side: underdog,
        type: surpriseType,
        magnitude: rng() * 0.4 + 0.3,  // 0.3..0.7 — affecte la dominance résiduelle
      });
    }
    // Deuxième tirage (plus rare) : un deuxième événement de surprise possible
    // Jamais en phase 1 non plus
    if (rng() < surpriseProb * 0.3) {
      const phaseIdx = 1 + Math.floor(rng() * 5);  // phases 2-6
      const phase = phases[phaseIdx];
      const phaseDur = phase.minEnd - phase.minStart;
      const minute = phase.minStart + Math.floor((0.3 + rng() * 0.7) * phaseDur);
      const underdog = forceRatioA < 0.5 ? 'A' : 'B';
      events.push({
        minute,
        phaseId: phase.id,
        side: underdog,
        type: pickSurpriseType(rng),
        magnitude: rng() * 0.3 + 0.2,
      });
    }
    return events.sort((a, b) => a.minute - b.minute);
  }

  function pickSurpriseType(rng) {
    const types = [
      { key: 'goal_against_run',  label: 'But contre le cours du jeu' },
      { key: 'gk_blunder',         label: 'Erreur du gardien' },
      { key: 'red_card_opp',       label: 'Carton rouge adverse' },
      { key: 'set_piece_goal',     label: 'But sur coup de pied arrêté' },
      { key: 'long_distance',      label: 'Frappe lointaine décisive' },
      { key: 'csc',                label: 'But contre son camp' },
    ];
    return types[Math.floor(rng() * types.length)].key;
  }

  function buildPlotSummary(phases, forceRatioA, surprises, matchAnalysis) {
    const nA = (matchAnalysis.reportA.team.name) || 'A';
    const nB = (matchAnalysis.reportB.team.name) || 'B';
    const fav = forceRatioA > 0.55 ? nA : forceRatioA < 0.45 ? nB : null;
    const phases12 = phases[0].dominanceA > phases[0].dominanceB ? nA : nB;
    const phase3 = phases[2].dominanceA > phases[2].dominanceB ? nA : nB;
    const phase6 = phases[5].dominanceA > phases[5].dominanceB ? nA : nB;

    const lines = [];
    lines.push('Début de match dominé par ' + phases12 + '.');
    if (phase3 !== phases12) lines.push('Renversement en fin de première période : ' + phase3 + ' prend la main.');
    lines.push('Deuxième mi-temps disputée, ' + (phase6 === fav ? fav + ' presse en fin de match.' : phase6 + ' pousse pour faire douter le favori.'));
    if (surprises.length) {
      lines.push('⚠ Événement(s) de surprise prévu(s) : ' + surprises.map(s => 'min ' + s.minute + ' (' + s.type + ')').join(' ; '));
    }
    return lines.join(' ');
  }

  // -------- Utils --------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Scenario = {
    PHASE_TEMPLATE,
    buildScenario,
  };
})();
