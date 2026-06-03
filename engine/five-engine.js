/* ============================================================
   Drafter — Engine Five (5v5)
   Moteur spécifique au foot à 5 — NE PAS être un 11v11 miniaturisé.

   Spécificités 5v5 :
   - Terrain plus petit, peu de couloirs, plus d'axe
   - Possessions courtes, transitions ultra-rapides
   - Plus de tirs (1 sur 2 vs 1 sur 3 en 11)
   - Importance des DUELS (chaque action est un mano-a-mano)
   - Importance technique (peu d'espace, contrôle indispensable)
   - GK joue plus haut, relance constante
   - Pas de hors-jeu → courses dans le dos très payantes
   - Le rythme : ~120 actions/match (vs 50 en 11v11), match court 15-20 min

   Différences vs 11v11 :
   - 4 phases (au lieu de 6) — match court
   - Dictionnaire situations adapté (pas de wing_play classique)
   - Casting réduit (2-3 acteurs max)
   - Pas de stamina contraignante (match court)
   - Importance accrue : finishing, dribbling, anticipation
   ============================================================ */
(function () {
  'use strict';

  // ===== Phases adaptées Five (4 phases pour un match court 15-20min) =====
  const FIVE_PHASE_TEMPLATE = [
    { id: 1, minStart: 0,  minEnd: 5,  label: 'observation',  intensity: 0.75, focusPool: ['feeling-out', 'press', 'duel'] },
    { id: 2, minStart: 5,  minEnd: 10, label: 'ascendant',    intensity: 0.95, focusPool: ['press', 'transition', 'duel'] },
    { id: 3, minStart: 10, minEnd: 14, label: 'tournant',     intensity: 1.0,  focusPool: ['transition', 'urgency', 'duel'] },
    { id: 4, minStart: 14, minEnd: 18, label: 'finale',       intensity: 1.0,  focusPool: ['urgency', 'desperation', 'all-or-nothing'] },
  ];

  // ===== Situations spécifiques Five =====
  // (variantes intensifiées des situations 11v11 + types propres Five)
  const FIVE_SITUATIONS = {
    // Le jeu Five : tout est duel et transition
    five_duel: {
      label: 'Duel 1v1',
      originZone: ['axis-mid', 'left-mid', 'right-mid'],
      targetZone: ['axis-att'],
      actorRoles: [
        { role: 'attacker', preferTraits: ['dribbler', 'ball_carrier'], preferZones: ['axis-mid'] },
      ],
      phaseFocus: ['duel', 'press', 'transition', 'urgency'],
      threatLevel: 0.48,
      flavorPool: [
        '{attacker} provoque le 1v1 face au défenseur',
        '{attacker} s\'élève au-dessus du duel et tente sa chance',
        'Duel intense — {attacker} essaie de passer',
      ],
    },
    five_recover_attack: {
      label: 'Récupération immédiate',
      originZone: ['axis-mid'],
      targetZone: ['axis-att', 'axis-box'],
      actorRoles: [
        { role: 'recover',  preferTraits: ['ball_winner', 'presser'],   preferZones: ['axis-mid'] },
        { role: 'finisher', preferTraits: ['finisher', 'runner'],       preferZones: ['axis-att'] },
      ],
      phaseFocus: ['press', 'transition', 'urgency'],
      threatLevel: 0.62,
      flavorPool: [
        '{recover} étouffe la sortie, sert immédiatement {finisher}',
        'Pressing puissant de {recover}, transition éclair vers {finisher}',
        '{recover} grattte le ballon, {finisher} se présente face au GK',
      ],
    },
    five_quick_transition: {
      label: 'Transition rapide',
      originZone: ['axis-mid'],
      targetZone: ['axis-att', 'axis-box'],
      actorRoles: [
        { role: 'carrier',  preferTraits: ['ball_carrier', 'runner'], preferZones: ['axis-mid'] },
        { role: 'finisher', preferTraits: ['finisher'],               preferZones: ['axis-att'] },
      ],
      phaseFocus: ['transition', 'urgency', 'all-or-nothing'],
      threatLevel: 0.58,
      flavorPool: [
        'Transition foudroyante — {carrier} ouvre pour {finisher}',
        '{carrier} se projette, sert {finisher} en bout de course',
        'Trois touches de balle pour une occasion : {carrier} → {finisher}',
      ],
    },
    five_gk_distribution: {
      label: 'Relance gardien',
      originZone: ['axis-def'],
      targetZone: ['axis-att'],
      actorRoles: [
        { role: 'gk',       preferTraits: ['distributor', 'sweeper'], preferZones: ['axis-def'] },
        { role: 'attacker', preferTraits: ['runner', 'finisher'],     preferZones: ['axis-att'] },
      ],
      phaseFocus: ['transition', 'feeling-out'],
      threatLevel: 0.32,
      flavorPool: [
        'Le gardien {gk} lance un ballon direct vers {attacker}',
        'Relance longue de {gk} cherchant {attacker} dans le dos',
        '{gk} engage rapidement vers {attacker} en pointe',
      ],
    },
    five_through_ball: {
      label: 'Passe lobée',
      originZone: ['axis-mid'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'passer',   preferTraits: ['playmaker', 'creator'], preferZones: ['axis-mid'] },
        { role: 'runner',   preferTraits: ['runner', 'finisher'],   preferZones: ['axis-att'] },
      ],
      phaseFocus: ['press', 'urgency', 'all-or-nothing'],
      threatLevel: 0.60,
      flavorPool: [
        '{passer} brosse une lobée pour {runner} qui sprinte',
        'Petit pont de {passer}, {runner} se présente seul',
        '{passer} pique le ballon dans le dos de la défense pour {runner}',
      ],
    },
    five_long_shot: {
      label: 'Frappe lointaine',
      originZone: ['axis-mid'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'shooter',  preferTraits: ['finisher', 'playmaker'], preferZones: ['axis-mid'] },
      ],
      phaseFocus: ['urgency', 'desperation', 'all-or-nothing'],
      threatLevel: 0.30,
      flavorPool: [
        '{shooter} arme depuis le milieu',
        'Frappe directe de {shooter} sans se poser de questions',
        '{shooter} tente sa chance de loin',
      ],
    },
    five_wing_breakthrough: {
      label: 'Percée latérale',
      originZone: ['left-mid', 'right-mid'],
      targetZone: ['axis-box', 'left-att', 'right-att'],
      actorRoles: [
        { role: 'winger',   preferTraits: ['dribbler', 'wide'],       preferZones: ['left-mid', 'right-mid'] },
        { role: 'finisher', preferTraits: ['finisher', 'box_crasher'], preferZones: ['axis-att'] },
      ],
      phaseFocus: ['press', 'transition', 'urgency'],
      threatLevel: 0.42,
      flavorPool: [
        '{winger} déborde et centre, {finisher} se jette',
        'Percée nette de {winger} sur le côté, ouverture vers {finisher}',
        '{winger} provoque, met le centre — {finisher} en attaque',
      ],
    },
    five_individual_run: {
      label: 'Action individuelle',
      originZone: ['axis-mid', 'left-mid', 'right-mid'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'soloist',  preferTraits: ['dribbler', 'finisher'], preferZones: ['axis-mid', 'left-mid', 'right-mid'] },
      ],
      phaseFocus: ['duel', 'urgency', 'all-or-nothing'],
      threatLevel: 0.55,
      flavorPool: [
        '{soloist} s\'élance en solo, enchaîne les crochets',
        'Action individuelle de {soloist}, défenseurs largués',
        '{soloist} pète tous les rideaux à lui seul',
      ],
    },
  };

  /**
   * buildFiveScenario : scénario 4 phases adapté Five
   * Diffère du builder 11v11 sur :
   * - Durée totale 18min au lieu de 90
   * - 4 phases (pas 6)
   * - Intensité plus élevée (toutes phases > 0.7)
   * - Plus d'actions / phase (transitions denses)
   */
  function buildFiveScenario(matchAnalysis, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const Scenario = window.Drafter && window.Drafter.Scenario;
    if (!Scenario) return null;

    // Calcul forceDiff (réutilise la logique 11v11)
    const { domStats, advantagesA, advantagesB } = matchAnalysis;
    let scoreA = domStats.A * 4 + advantagesA.reduce((s, a) => s + a.magnitude, 0) * 0.4;
    let scoreB = domStats.B * 4 + advantagesB.reduce((s, a) => s + a.magnitude, 0) * 0.4;
    if (opts.grade) {
      scoreA += (opts.grade.A || 70) * 0.6;
      scoreB += (opts.grade.B || 70) * 0.6;
    }
    const total = scoreA + scoreB;
    const forceRatioA = total > 0 ? scoreA / total : 0.5;
    const forceDiff = Math.round((forceRatioA - 0.5) * 200);

    // Surprise plus FRÉQUENTE en Five (rythme court = volatilité)
    const absDiff = Math.abs(forceDiff);
    let surpriseProb = 0.40;
    if (absDiff > 50) surpriseProb = 0.10;
    else if (absDiff > 25) surpriseProb = 0.20;
    else if (absDiff > 10) surpriseProb = 0.30;

    // Dominance plus VOLATILE (clamp 0.30-0.70)
    const baselineDomA = Math.max(0.30, Math.min(0.70, 0.5 + (forceRatioA - 0.5) * 0.5));
    const baselineDomB = 1 - baselineDomA;

    const phases = FIVE_PHASE_TEMPLATE.map((p, idx) => {
      let domA = baselineDomA, domB = baselineDomB;
      // Phase 4 : underdog pousse fort
      if (p.id === 4) {
        if (forceRatioA > 0.5) { domB = Math.min(0.65, domB + 0.15); domA = 1 - domB; }
        else                   { domA = Math.min(0.65, domA + 0.15); domB = 1 - domA; }
      }
      // Variation aléatoire bornée (5v5 plus aléatoire)
      const noise = (rng() - 0.5) * 0.22;
      domA = Math.max(0.20, Math.min(0.80, domA + noise));
      domB = 1 - domA;

      const focus = p.focusPool[Math.floor(rng() * p.focusPool.length)];
      const duration = p.minEnd - p.minStart;
      // Beaucoup plus d'actions par minute en Five
      const expectedActions = Math.round(duration * 4.5 * p.intensity);

      return {
        id: p.id, label: p.label,
        minStart: p.minStart, minEnd: p.minEnd, duration,
        dominanceA: +(domA).toFixed(3),
        dominanceB: +(domB).toFixed(3),
        neutralProb: 0.05,        // moins de neutres : plus de duels directs
        intensity: p.intensity,
        focus, expectedActions,
      };
    });

    // Surprise events (timing adapté Five)
    const surpriseEvents = [];
    if (rng() < surpriseProb) {
      const phase = phases[Math.floor(1 + rng() * 3)];  // phases 2-4
      const minute = phase.minStart + Math.floor(rng() * (phase.minEnd - phase.minStart));
      surpriseEvents.push({
        minute, phaseId: phase.id,
        side: forceRatioA < 0.5 ? 'A' : 'B',
        type: pickSurpriseType(rng),
        magnitude: rng() * 0.4 + 0.3,
      });
    }

    return {
      phases,
      surpriseEvents,
      surpriseLevel: surpriseProb,
      forceDiff, forceRatioA,
      favorite: forceRatioA > 0.55 ? 'A' : (forceRatioA < 0.45 ? 'B' : null),
      plot: 'Match Five : 4 phases courtes, duels intenses, transitions rapides.',
    };
  }

  function pickSurpriseType(rng) {
    const types = ['gk_blunder', 'goal_against_run', 'long_distance', 'csc'];
    return types[Math.floor(rng() * types.length)];
  }

  /**
   * runFiveMatch(teamA, teamB, opts) : moteur de match adapté Five
   * Utilise le pipeline existant (analyzer, gradeTeam, situations, match-engine)
   * mais avec :
   *   - buildFiveScenario à la place de Scenario.buildScenario
   *   - FIVE_SITUATIONS injectées dans le dictionnaire de situations
   *   - grid '5v5' pour le zoning
   */
  function runFiveMatch(teamA, teamB, opts) {
    opts = opts || {};
    const Drafter = window.Drafter;
    if (!Drafter.Analyzer || !Drafter.Situations || !Drafter.MatchEngine) return null;

    // === Hack data-driven : merge FIVE_SITUATIONS dans le dico des situations ===
    // Sauvegarde et restaure après pour ne pas polluer le runtime 11v11
    const orig = Object.assign({}, Drafter.Situations.SITUATION_TYPES);
    Object.assign(Drafter.Situations.SITUATION_TYPES, FIVE_SITUATIONS);

    // === Hack : utilise buildFiveScenario au lieu de buildScenario ===
    const origBuild = Drafter.Scenario.buildScenario;
    Drafter.Scenario.buildScenario = function(analysis, o) {
      return buildFiveScenario(analysis, o);
    };

    try {
      return Drafter.MatchEngine.runMatch(teamA, teamB,
        Object.assign({}, opts, { grid: '5v5' }));
    } finally {
      // Restaure le dico 11v11 et le builder original
      Drafter.Scenario.buildScenario = origBuild;
      Object.keys(FIVE_SITUATIONS).forEach(k => delete Drafter.Situations.SITUATION_TYPES[k]);
      Object.assign(Drafter.Situations.SITUATION_TYPES, orig);
    }
  }

  // ===== Export =====
  window.Drafter = window.Drafter || {};
  window.Drafter.FiveEngine = {
    FIVE_PHASE_TEMPLATE,
    FIVE_SITUATIONS,
    buildFiveScenario,
    runFiveMatch,
  };
})();
