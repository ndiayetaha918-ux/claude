/* ============================================================
   Drafter — Engine A.4
   Analyseur pré-match : produit un dossier tactique

   Pour chaque équipe :
   - Identité tactique détectée depuis la compo + rôles
   - Forces / faiblesses zone par zone
   - Synergies internes (paires de rôles complémentaires)
   - Contradictions internes (joueurs mal-fittés à leur rôle)
   - Plan probable (narration cohérente)

   Pour la confrontation :
   - Avantages exploitables par chaque équipe
   - Zones de bataille clés
   - Pronostic argumenté

   C'est le "rapport vidéo" qu'un coach lirait avant le match.
   ============================================================ */
(function () {
  'use strict';

  // -------- Détection d'identité tactique --------
  // L'identité émerge des rôles assignés + de la distribution zonale.
  // On ne hardcode pas "si tactique=possession alors identity=possession".
  // On calcule des scores par identité depuis les traits de l'équipe.
  const IDENTITIES = {
    'possession': {
      label: 'Possession',
      desc: 'Conservation longue, construction patiente, contrôle par le ballon',
      keyTraits: ['playmaker', 'link_up', 'distributor', 'creator'],
      keyZonePresence: ['axis-mid', 'left-half-mid', 'right-half-mid'],
    },
    'vertical': {
      label: 'Verticalité',
      desc: 'Transitions rapides, balles longues vers la profondeur',
      keyTraits: ['runner', 'distributor', 'box_crasher', 'target_man'],
      keyZonePresence: ['axis-att', 'axis-box'],
    },
    'wing-play': {
      label: 'Jeu de couloir',
      desc: 'Largeur, débordements, centres dans la surface',
      keyTraits: ['wide', 'overlapping', 'dribbler', 'finisher'],
      keyZonePresence: ['left-att', 'right-att', 'left-mid', 'right-mid'],
    },
    'half-spaces': {
      label: 'Demi-espaces',
      desc: 'Surcharges des couloirs intérieurs, jeu entre les lignes',
      keyTraits: ['half_space', 'creator', 'underlapping', 'mezzala'],
      keyZonePresence: ['left-half-mid', 'right-half-mid', 'left-half-att', 'right-half-att'],
    },
    'pressing': {
      label: 'Pressing haut',
      desc: 'Récupération haute agressive, blocage de la relance adverse',
      keyTraits: ['presser', 'ball_winner', 'stopper'],
      keyZonePresence: ['axis-mid', 'left-mid', 'right-mid'],
    },
    'counter': {
      label: 'Contre-attaque',
      desc: 'Bloc bas, récupération, transition explosive vers l\'avant',
      keyTraits: ['ball_winner', 'runner', 'finisher', 'anchor'],
      keyZonePresence: ['axis-def', 'axis-mid'],
    },
    'low-block': {
      label: 'Bloc bas',
      desc: 'Défense dense, peu d\'ambitions offensives, attente de l\'erreur',
      keyTraits: ['anchor', 'marker', 'stopper', 'sweeper'],
      keyZonePresence: ['axis-def', 'left-def', 'right-def'],
    },
  };

  /**
   * detectIdentity(team) → [{ identity, score, label, desc }] trié décroissant
   *
   * Pour chaque identité, score = somme des traitScores des joueurs sur les
   * keyTraits + présence zonale × force offensive sur les keyZonePresence.
   * Approche purement data-driven : aucune règle hardcodée style "si X alors Y".
   */
  function detectIdentity(team, zoneMap) {
    const Roles = window.Drafter && window.Drafter.Roles;
    const Attributes = window.Drafter && window.Drafter.Attributes;
    if (!Roles || !Attributes || !zoneMap) return [];

    // 1) Score des traits de l'équipe : pour chaque trait, somme des
    //    traitScores des joueurs (au-dessus de 70 pour ne compter que les
    //    joueurs qui INCARNENT vraiment le trait)
    const teamTraits = {};
    team.formationDef.slots.forEach(slotDef => {
      const pid = team.slots[slotDef.id];
      if (!pid) return;
      const player = team.playerById(pid);
      if (!player) return;
      const attrs = Attributes.build(player);
      const scores = Roles.traitScores(attrs);
      Object.entries(scores).forEach(([trait, s]) => {
        if (s >= 70) teamTraits[trait] = (teamTraits[trait] || 0) + (s - 70);
      });
    });

    // 2) Score par identité = somme normalisée des keyTraits + bonus zonal
    const results = Object.entries(IDENTITIES).map(([key, idDef]) => {
      let traitScore = 0;
      idDef.keyTraits.forEach(t => { traitScore += teamTraits[t] || 0; });
      // Normalisation par nombre de traits
      traitScore = traitScore / Math.max(1, idDef.keyTraits.length);

      // Bonus présence zonale × qualité offensive
      let zoneScore = 0;
      idDef.keyZonePresence.forEach(zid => {
        const z = zoneMap.zones[zid];
        if (z) zoneScore += z.presence * (z.attack + z.technique) / 2;
      });
      zoneScore = zoneScore / Math.max(1, idDef.keyZonePresence.length);

      return {
        identity: key,
        label: idDef.label,
        desc: idDef.desc,
        score: Math.round(traitScore * 0.65 + zoneScore * 0.35),
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * teamSynergies(team) → utilise Roles.synergies sur les rôles assignés
   * Retourne les complémentarités détectées + les conflits
   */
  function teamSynergies(team) {
    const Roles = window.Drafter && window.Drafter.Roles;
    if (!Roles) return null;
    const roleKeys = [];
    team.formationDef.slots.forEach(slotDef => {
      const rk = team.roles && team.roles[slotDef.id];
      if (rk) roleKeys.push(rk);
    });
    return Roles.synergies(roleKeys);
  }

  /**
   * teamContradictions(team) → [{slotId, player, role, fit}]
   * Liste les joueurs dont le rôle assigné ne leur convient pas (fit < 80).
   */
  function teamContradictions(team) {
    const Roles = window.Drafter && window.Drafter.Roles;
    if (!Roles) return [];
    const out = [];
    team.formationDef.slots.forEach(slotDef => {
      const pid = team.slots[slotDef.id];
      if (!pid) return;
      const player = team.playerById(pid);
      if (!player) return;
      const rk = team.roles && team.roles[slotDef.id];
      if (!rk) return;  // rôle non assigné = pas de contradiction
      const fit = Roles.fitScore(player, rk);
      if (fit && fit.score < 80) {
        out.push({
          slotId: slotDef.id, slotType: slotDef.type,
          player, role: rk, roleLabel: fit.role.label,
          fit: fit.score, attrFit: fit.attrFit, styleFit: fit.styleFit,
          weakTraits: fit.weakTraits, missingTraits: (fit.weakTraits||[]).map(w => w.trait),
        });
      }
    });
    return out.sort((a, b) => a.fit - b.fit);
  }

  /**
   * analyzeTeam(team) → dossier tactique complet d'UNE équipe
   *
   * Combine zone-mapping + identité + synergies + contradictions + résumé.
   * C'est ce qui est consommé par analyzeMatch() pour le pré-match.
   */
  function analyzeTeam(team, opts) {
    opts = opts || {};
    const Zones = window.Drafter && window.Drafter.Zones;
    if (!Zones) return null;
    const zoneMap = Zones.mapTeamToZones(team, { grid: opts.grid || '11v11' });

    const identities = detectIdentity(team, zoneMap);
    const top1 = identities[0];
    const top2 = identities[1];

    const synergies = teamSynergies(team);
    const contradictions = teamContradictions(team);

    // Zones fortes/faibles (par seuil de présence × qualité)
    const strongZones = Object.values(zoneMap.zones)
      .filter(z => z.presence > 0.4 && z.attack + z.defense > 150)
      .map(z => ({
        zone: z.cell.id, presence: z.presence,
        attack: z.attack, defense: z.defense, speed: z.speed,
      }))
      .sort((a, b) => (b.attack + b.defense + b.speed) - (a.attack + a.defense + a.speed))
      .slice(0, 5);
    const weakZones = Object.values(zoneMap.zones)
      .filter(z => z.presence < 0.3 || (z.presence > 0.3 && z.attack + z.defense < 130))
      .map(z => ({
        zone: z.cell.id, presence: z.presence,
        attack: z.attack || 0, defense: z.defense || 0,
      }))
      .sort((a, b) => (a.attack + a.defense) - (b.attack + b.defense))
      .slice(0, 4);

    return {
      team,
      zoneMap,
      identities,
      primaryIdentity: top1,
      secondaryIdentity: top2,
      synergies,
      contradictions,
      strongZones,
      weakZones,
      narrative: buildTeamNarrative({ team, top1, top2, synergies, contradictions, strongZones, weakZones }),
    };
  }

  /**
   * buildTeamNarrative(ctx) → string
   * Génère un paragraphe de description tactique de l'équipe.
   * Pour l'instant déterministe (pas de LLM). En B/C/D on pourra brancher
   * un LLM pour enrichir. Tout le contenu vient des données.
   */
  function buildTeamNarrative(ctx) {
    const lines = [];
    const t = ctx.team.name || 'L\'équipe';

    // Identité principale + secondaire
    if (ctx.top1 && ctx.top1.score > 30) {
      lines.push(t + ' s\'inscrit dans une logique de **' + ctx.top1.label.toLowerCase() + '** : ' + ctx.top1.desc.toLowerCase() + '.');
      if (ctx.top2 && ctx.top2.score > 25 && ctx.top2.score > ctx.top1.score * 0.7) {
        lines.push('Identité secondaire détectée : ' + ctx.top2.label.toLowerCase() + '.');
      }
    } else {
      lines.push(t + ' n\'a pas d\'identité tactique tranchée — composition équilibrée mais sans signature forte.');
    }

    // Synergies
    if (ctx.synergies && ctx.synergies.positive.length >= 2) {
      const best = ctx.synergies.positive.sort((a,b) => b.score - a.score).slice(0, 2);
      lines.push('Combinaisons fortes : ' + best.map(s => s.why).join(' ; ') + '.');
    }
    if (ctx.synergies && ctx.synergies.negative.length) {
      const worst = ctx.synergies.negative.sort((a,b) => a.score - b.score)[0];
      lines.push('⚠ Risque interne : ' + worst.why + '.');
    }

    // Contradictions
    if (ctx.contradictions && ctx.contradictions.length) {
      ctx.contradictions.slice(0, 2).forEach(c => {
        lines.push('⚠ ' + c.player.name + ' en ' + c.roleLabel + ' (fit ' + c.fit + ') — profil inadapté.');
      });
    }

    // Zones fortes
    if (ctx.strongZones && ctx.strongZones.length) {
      const z = ctx.strongZones[0];
      lines.push('Zone forte : ' + zoneLabel(z.zone) + ' (att ' + z.attack + ', def ' + z.defense + ', spd ' + z.speed + ').');
    }

    return lines.join(' ');
  }

  function zoneLabel(cellId) {
    const lookup = {
      'left-def':'flanc gauche défensif','left-mid':'côté gauche médian','left-att':'aile gauche offensive',
      'left-half-def':'demi-espace gauche défensif','left-half-mid':'demi-espace gauche médian','left-half-att':'demi-espace gauche offensif',
      'axis-def':'axe défensif','axis-mid':'milieu central','axis-att':'axe offensif','axis-box':'surface adverse',
      'right-half-def':'demi-espace droit défensif','right-half-mid':'demi-espace droit médian','right-half-att':'demi-espace droit offensif',
      'right-def':'flanc droit défensif','right-mid':'côté droit médian','right-att':'aile droite offensive',
    };
    return lookup[cellId] || cellId;
  }

  /**
   * analyzeMatch(teamA, teamB, opts) → dossier confrontation complet
   *
   * C'est le "rapport vidéo" pré-match. Combine :
   * - dossier tactique de chaque équipe
   * - matchups zone × zone (via Zones.compareZones)
   * - avantages exploitables par côté
   * - plan probable de la confrontation
   * - pronostic argumenté
   */
  function analyzeMatch(teamA, teamB, opts) {
    opts = opts || {};
    const Zones = window.Drafter && window.Drafter.Zones;
    if (!Zones) return null;

    const reportA = analyzeTeam(teamA, opts);
    const reportB = analyzeTeam(teamB, opts);
    const cmp = Zones.compareZones(reportA.zoneMap, reportB.zoneMap, opts);

    // Avantages classés par côté
    const advA = cmp.advantages.filter(a => a.side === 'A').sort((a,b) => b.magnitude - a.magnitude);
    const advB = cmp.advantages.filter(a => a.side === 'B').sort((a,b) => b.magnitude - a.magnitude);

    // Comptage dominance
    const domStats = {
      A: Object.values(cmp.dominance).filter(d => d === 'A').length,
      B: Object.values(cmp.dominance).filter(d => d === 'B').length,
      tied: Object.values(cmp.dominance).filter(d => d === '=').length,
    };

    // Pronostic : favorite + niveau de certitude
    let predictedWinner = null;
    let confidence = 'incertain';
    const dominanceDelta = domStats.A - domStats.B;
    if (Math.abs(dominanceDelta) >= 6) {
      predictedWinner = dominanceDelta > 0 ? 'A' : 'B';
      confidence = 'élevée';
    } else if (Math.abs(dominanceDelta) >= 3) {
      predictedWinner = dominanceDelta > 0 ? 'A' : 'B';
      confidence = 'modérée';
    } else {
      predictedWinner = 'équilibré';
      confidence = 'incertain';
    }

    // Conflits stylistiques entre équipes (qui peut exploiter qui)
    const styleClash = detectStyleClash(reportA, reportB);

    return {
      reportA, reportB,
      comparison: cmp,
      advantagesA: advA,
      advantagesB: advB,
      domStats,
      predictedWinner,
      confidence,
      styleClash,
      narrative: buildMatchNarrative({
        teamA, teamB, reportA, reportB, cmp, domStats, advA, advB,
        predictedWinner, confidence, styleClash,
      }),
    };
  }

  /**
   * detectStyleClash(rA, rB) → { aExploits, bExploits }
   * Détecte les confrontations de style problématiques :
   * - pressing haut vs construction courte = celle qui a plus de skill technique gagne
   * - jeu vertical vs bloc haut = la profondeur exploite les espaces
   * - jeu de couloir vs latéraux faibles = exploitation des ailes
   */
  function detectStyleClash(rA, rB) {
    const idA = rA.primaryIdentity ? rA.primaryIdentity.identity : null;
    const idB = rB.primaryIdentity ? rB.primaryIdentity.identity : null;
    const exploits = { aExploits: [], bExploits: [] };
    if (!idA || !idB) return exploits;

    // Matchups célèbres (data-driven mais avec quelques règles métier)
    // Note : on pourrait raffiner via une matrice. Ici quelques patterns clés.
    if (idA === 'pressing' && (idB === 'possession' || idB === 'half-spaces')) {
      exploits.aExploits.push('Pressing haut sur la sortie de balle adverse');
    }
    if (idB === 'pressing' && (idA === 'possession' || idA === 'half-spaces')) {
      exploits.bExploits.push('Pressing haut sur la sortie de balle adverse');
    }
    if (idA === 'vertical' && (idB === 'pressing' || idB === 'possession')) {
      exploits.aExploits.push('Saut du pressing par les ballons longs vers la profondeur');
    }
    if (idB === 'vertical' && (idA === 'pressing' || idA === 'possession')) {
      exploits.bExploits.push('Saut du pressing par les ballons longs vers la profondeur');
    }
    if (idA === 'counter' && idB === 'possession') {
      exploits.aExploits.push('Bloc bas + contre exploitant les espaces concédés');
    }
    if (idB === 'counter' && idA === 'possession') {
      exploits.bExploits.push('Bloc bas + contre exploitant les espaces concédés');
    }
    if (idA === 'wing-play' && idB === 'low-block') {
      exploits.aExploits.push('Centres dans une surface densément défendue (efficacité limitée)');
    }
    return exploits;
  }

  function buildMatchNarrative(ctx) {
    const lines = [];
    const nA = ctx.teamA.name || 'A';
    const nB = ctx.teamB.name || 'B';

    // Style de chaque équipe
    if (ctx.reportA.primaryIdentity) {
      lines.push(nA + ' devrait jouer en ' + ctx.reportA.primaryIdentity.label.toLowerCase() + '.');
    }
    if (ctx.reportB.primaryIdentity) {
      lines.push(nB + ' devrait jouer en ' + ctx.reportB.primaryIdentity.label.toLowerCase() + '.');
    }

    // Clash de style
    if (ctx.styleClash.aExploits.length) {
      lines.push(nA + ' pourra exploiter : ' + ctx.styleClash.aExploits.join(' ; ') + '.');
    }
    if (ctx.styleClash.bExploits.length) {
      lines.push(nB + ' pourra exploiter : ' + ctx.styleClash.bExploits.join(' ; ') + '.');
    }

    // Zones à exploiter
    if (ctx.advA.length) {
      const a = ctx.advA[0];
      lines.push(nA + ' a un avantage net en ' + zoneLabel(a.cellId) + ' (+' + a.magnitude + ').');
    }
    if (ctx.advB.length) {
      const b = ctx.advB[0];
      lines.push(nB + ' a un avantage net en ' + zoneLabel(b.cellId) + ' (+' + b.magnitude + ').');
    }

    // Pronostic
    if (ctx.predictedWinner === 'A') {
      lines.push('**Pronostic** : ' + nA + ' favori (confiance ' + ctx.confidence + ', ' + ctx.domStats.A + ' zones dominées contre ' + ctx.domStats.B + ').');
    } else if (ctx.predictedWinner === 'B') {
      lines.push('**Pronostic** : ' + nB + ' favori (confiance ' + ctx.confidence + ', ' + ctx.domStats.B + ' zones dominées contre ' + ctx.domStats.A + ').');
    } else {
      lines.push('**Pronostic** : confrontation équilibrée — issue indécise (' + ctx.domStats.A + ' vs ' + ctx.domStats.B + ' zones, ' + ctx.domStats.tied + ' équilibrées).');
    }

    return lines.join(' ');
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Analyzer = {
    IDENTITIES,
    detectIdentity,
    teamSynergies,
    teamContradictions,
    analyzeTeam,
    analyzeMatch,
    zoneLabel,
  };
})();
