/* ============================================================
   Drafter — Engine A.5
   Note d'équipe intelligente

   Aujourd'hui : la note est une somme pondérée plate (qualité brute).
   Demain : la note combine 4 dimensions qui reflètent ce qui fait
   vraiment une bonne équipe :

   1. RAW       — qualité individuelle moyenne (sur les attrs clés par poste)
   2. COHESION  — synergies internes entre rôles
   3. FIT       — adéquation joueur/rôle (moyenne fitScore)
   4. BALANCE   — couverture zonale + équilibre off/def/mid

   Une équipe de stars sans cohésion peut être moins bien notée qu'une
   équipe construite. C'est la philosophie du produit.
   ============================================================ */
(function () {
  'use strict';

  /**
   * gradeTeam(team, opts) → { grade: 0-100, dimensions: {raw, cohesion, fit, balance}, breakdown }
   *
   * team format : voir engine/zones.js
   *   { name, formation, slots, formationDef, playerById, roles? }
   */
  function gradeTeam(team, opts) {
    opts = opts || {};
    const Attributes = window.Drafter && window.Drafter.Attributes;
    const Roles = window.Drafter && window.Drafter.Roles;
    const Zones = window.Drafter && window.Drafter.Zones;
    const Analyzer = window.Drafter && window.Drafter.Analyzer;
    if (!Attributes || !Roles || !Zones) return null;

    // ============================================================
    // Dimension 1 — RAW (qualité individuelle pondérée par poste)
    // ============================================================
    // Pour chaque slot, on évalue le joueur sur les attributs clés du
    // POSTE (pas une moyenne plate). Un attaquant est noté sur finishing/
    // anticipation/speed, un défenseur sur duel/intercept/anticipation.
    let rawSum = 0, rawN = 0;
    const playerNotes = [];
    team.formationDef.slots.forEach(slotDef => {
      const pid = team.slots[slotDef.id];
      if (!pid) return;
      const player = team.playerById(pid);
      if (!player) return;
      const attrs = Attributes.build(player);
      const note = positionalRating(attrs, slotDef.type);
      rawSum += note;
      rawN += 1;
      playerNotes.push({ slotId: slotDef.id, slotType: slotDef.type, player, note });
    });
    const raw = rawN > 0 ? rawSum / rawN : 0;

    // ============================================================
    // Dimension 2 — COHESION (synergies entre rôles)
    // ============================================================
    let cohesion = 60; // baseline neutre
    if (team.roles) {
      const roleKeys = [];
      team.formationDef.slots.forEach(slotDef => {
        const rk = team.roles[slotDef.id];
        if (rk) roleKeys.push(rk);
      });
      if (roleKeys.length) {
        const syn = Roles.synergies(roleKeys);
        // Mappe le totalScore (-30..+50) vers 30..95
        const synScore = Math.max(-30, Math.min(50, syn.totalScore));
        cohesion = 60 + (synScore / 50) * 35;
        cohesion = Math.max(20, Math.min(95, cohesion));
      }
    }

    // ============================================================
    // Dimension 3 — FIT (adéquation joueur/rôle)
    // ============================================================
    let fitSum = 0, fitN = 0;
    if (team.roles) {
      team.formationDef.slots.forEach(slotDef => {
        const pid = team.slots[slotDef.id];
        const rk = team.roles[slotDef.id];
        if (!pid || !rk) return;
        const player = team.playerById(pid);
        const f = Roles.fitScore(player, rk);
        if (f) { fitSum += f.score; fitN += 1; }
      });
    }
    const fit = fitN > 0 ? fitSum / fitN : 75;

    // ============================================================
    // Dimension 4 — BALANCE (couverture zonale + équilibre off/def/mid)
    // ============================================================
    const zoneMap = Zones.mapTeamToZones(team, { grid: opts.grid || '11v11' });
    const balance = computeBalance(zoneMap);

    // ============================================================
    // Score global = combinaison pondérée
    // ============================================================
    const grade = Math.round(
      raw      * 0.40 +
      fit      * 0.25 +
      cohesion * 0.20 +
      balance  * 0.15
    );

    return {
      grade,
      dimensions: {
        raw: Math.round(raw),
        fit: Math.round(fit),
        cohesion: Math.round(cohesion),
        balance: Math.round(balance),
      },
      playerNotes: playerNotes.sort((a, b) => b.note - a.note),
      zoneMap,
    };
  }

  // -------- Rating positionnel : un attaquant noté sur ses attrs offensifs --------
  // Attribute weights par poste (importance pour évaluer la performance attendue)
  const RATING_WEIGHTS = {
    GK:  { interception:0.20, anticipation:0.25, intelligence:0.20, duel:0.10, passingLong:0.10, passingShort:0.10, power:0.05 },
    CB:  { duel:0.22, interception:0.20, anticipation:0.20, intelligence:0.10, power:0.10, passingShort:0.08, passingLong:0.05, speed:0.05 },
    LB:  { speed:0.18, stamina:0.18, duel:0.15, interception:0.12, dribbling:0.10, passingShort:0.10, anticipation:0.08, intelligence:0.05, vision:0.04 },
    RB:  { speed:0.18, stamina:0.18, duel:0.15, interception:0.12, dribbling:0.10, passingShort:0.10, anticipation:0.08, intelligence:0.05, vision:0.04 },
    LWB: { stamina:0.20, speed:0.18, dribbling:0.15, passingShort:0.12, duel:0.10, intelligence:0.08, vision:0.10, anticipation:0.07 },
    RWB: { stamina:0.20, speed:0.18, dribbling:0.15, passingShort:0.12, duel:0.10, intelligence:0.08, vision:0.10, anticipation:0.07 },
    DM:  { interception:0.20, duel:0.18, anticipation:0.15, intelligence:0.15, passingShort:0.12, passingLong:0.08, stamina:0.07, vision:0.05 },
    CM:  { passingShort:0.18, vision:0.15, intelligence:0.15, stamina:0.12, duel:0.10, interception:0.08, dribbling:0.08, finishing:0.07, passingLong:0.07 },
    AM:  { vision:0.22, passingShort:0.18, dribbling:0.15, intelligence:0.15, finishing:0.10, passingLong:0.08, speed:0.07, anticipation:0.05 },
    LM:  { speed:0.18, stamina:0.18, dribbling:0.15, passingShort:0.12, vision:0.10, finishing:0.10, intelligence:0.10, duel:0.07 },
    RM:  { speed:0.18, stamina:0.18, dribbling:0.15, passingShort:0.12, vision:0.10, finishing:0.10, intelligence:0.10, duel:0.07 },
    LW:  { dribbling:0.25, speed:0.20, finishing:0.18, passingShort:0.10, vision:0.10, anticipation:0.07, intelligence:0.05, stamina:0.05 },
    RW:  { dribbling:0.25, speed:0.20, finishing:0.18, passingShort:0.10, vision:0.10, anticipation:0.07, intelligence:0.05, stamina:0.05 },
    SS:  { finishing:0.25, anticipation:0.18, vision:0.15, dribbling:0.12, passingShort:0.10, speed:0.10, intelligence:0.07, power:0.03 },
    CF:  { finishing:0.25, anticipation:0.18, power:0.15, intelligence:0.10, duel:0.10, vision:0.10, dribbling:0.07, speed:0.05 },
    ST:  { finishing:0.32, anticipation:0.20, power:0.15, duel:0.10, speed:0.10, intelligence:0.08, dribbling:0.05 },
  };

  function positionalRating(attrs, posType) {
    const w = RATING_WEIGHTS[posType] || RATING_WEIGHTS.CM;
    let sum = 0, total = 0;
    Object.entries(w).forEach(([attr, weight]) => {
      sum += (attrs[attr] || 0) * weight;
      total += weight;
    });
    return total > 0 ? sum / total : 60;
  }

  // -------- Score de balance : couverture zones + équilibre off/def/mid --------
  function computeBalance(zoneMap) {
    if (!zoneMap) return 50;

    // 1. Couverture : nombre de zones avec présence > 0.4
    const covered = Object.values(zoneMap.zones).filter(z => z.presence > 0.4).length;
    const totalCells = Object.values(zoneMap.zones).length;
    const coverageScore = (covered / totalCells) * 100;

    // 2. Équilibre att/def/mid : pour chaque tier de profondeur, calculer
    //    la présence totale, comparer aux autres
    const tierPresence = { def: 0, mid: 0, att: 0, box: 0 };
    Object.values(zoneMap.zones).forEach(z => {
      const tier = z.cell.depth;
      tierPresence[tier] = (tierPresence[tier] || 0) + z.presence;
    });
    // Score d'équilibre : écart-type faible = équipe équilibrée
    const values = [tierPresence.def, tierPresence.mid, tierPresence.att];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);
    // stddev typique : 0.5 (équilibré) à 3.0 (déséquilibré)
    const balanceScore = Math.max(40, 100 - stddev * 25);

    // 3. Largeur : présence sur les 5 couloirs
    const laneP = { left:0, 'left-half':0, axis:0, 'right-half':0, right:0 };
    Object.values(zoneMap.zones).forEach(z => {
      const lane = z.cell.lane;
      laneP[lane] = (laneP[lane] || 0) + z.presence;
    });
    // Détecte l'absence de couloir (un 4-2-3-1 sans ailier = couloirs vides)
    const lanes = Object.values(laneP);
    const widthScore = lanes.every(l => l > 0.3) ? 90 : 70;

    return Math.round(coverageScore * 0.35 + balanceScore * 0.45 + widthScore * 0.20);
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.TeamGrade = {
    gradeTeam,
    positionalRating,
    computeBalance,
    RATING_WEIGHTS,
  };
})();
