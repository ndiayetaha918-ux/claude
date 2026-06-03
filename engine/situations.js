/* ============================================================
   Drafter — Engine B.2
   Dictionnaire de situations + générateur de moments

   Le constat (point 6 du brief utilisateur) :
     "Le moteur génère des événements similaires en boucle.
      Je veux des situations émergentes, jamais identiques."

   Approche :
   1. SITUATION_TYPES : dictionnaire de ~14 types de situations
      (construction courte, récup haute, contre, centre, CPA, etc.)
   2. Chaque situation a :
      - une zone d'origine (où elle DÉMARRE)
      - une zone cible (où elle finit)
      - un casting (quels rôles/traits sont impliqués selon le type)
      - une probabilité de succès (basée sur matchup zone × profil)
   3. Le moteur tire un TYPE de situation selon le focus de la phase,
      puis CASTE les joueurs adaptés depuis l'équipe attaquante.

   → variété structurelle, pas tirage aléatoire de joueurs.
   ============================================================ */
(function () {
  'use strict';

  // -------- Dictionnaire des situations --------
  // Pour chaque type :
  //   - originZone(s)    : zone(s) où démarre la situation (relatives à l'attaquant)
  //   - targetZone(s)    : zone(s) finale(s) (où ça finit)
  //   - actorRoles       : 2-4 rôles d'acteurs avec traits requis
  //                        (ex: 'starter' = celui qui lance, 'linker' = celui qui relaye,
  //                              'finisher' = celui qui finit)
  //   - phaseFocus       : focus(s) de phase où cette situation est probable
  //   - threatLevel      : 0..1 = probabilité qu'une occasion soit créée
  //   - flavor           : pool de templates de phrase pour la narration

  const SITUATION_TYPES = {
    // ====== CONSTRUCTION & POSSESSION ======
    build_short: {
      label: 'Construction courte',
      originZone: ['axis-def', 'left-half-def', 'right-half-def'],
      targetZone: ['axis-mid'],
      actorRoles: [
        { role: 'starter',  preferTraits: ['distributor', 'sweeper'],  preferZones: ['axis-def'] },
        { role: 'linker',   preferTraits: ['playmaker', 'link_up'],     preferZones: ['axis-mid'] },
        { role: 'receiver', preferTraits: ['half_space', 'link_up'],    preferZones: ['axis-mid', 'left-half-mid', 'right-half-mid'] },
      ],
      phaseFocus: ['control', 'sustained', 'observation', 'adjustment'],
      threatLevel: 0.18,
      flavorPool: [
        '{starter} relance proprement, {linker} oriente le jeu',
        'Bloc bien organisé, {linker} reçoit dans les pieds',
        '{starter} cherche {linker} entre les lignes, possession assumée',
        '{linker} s\'oriente, contrôle vers {receiver}',
      ],
    },
    build_long: {
      label: 'Relance longue',
      originZone: ['axis-def'],
      targetZone: ['axis-att', 'left-att', 'right-att'],
      actorRoles: [
        { role: 'starter',  preferTraits: ['distributor'],              preferZones: ['axis-def'] },
        { role: 'receiver', preferTraits: ['target_man', 'runner'],     preferZones: ['axis-att'] },
      ],
      phaseFocus: ['control', 'urgency', 'desperation', 'transition'],
      threatLevel: 0.28,
      flavorPool: [
        '{starter} envoie un long ballon vers {receiver}',
        'Relance longue de {starter}, {receiver} décroche pour offrir une cible',
        '{starter} cherche directement la profondeur sur {receiver}',
      ],
    },
    high_press_recovery: {
      label: 'Récupération haute',
      originZone: ['axis-mid', 'left-mid', 'right-mid', 'left-half-mid', 'right-half-mid'],
      targetZone: ['axis-att', 'left-att', 'right-att'],
      actorRoles: [
        { role: 'presser',  preferTraits: ['presser', 'ball_winner'],   preferZones: ['axis-mid', 'left-mid', 'right-mid'] },
        { role: 'releaser', preferTraits: ['playmaker', 'half_space'],  preferZones: ['axis-mid'] },
        { role: 'finisher', preferTraits: ['finisher', 'runner'],       preferZones: ['axis-att'] },
      ],
      phaseFocus: ['pressure', 'push', 'urgency'],
      threatLevel: 0.42,
      flavorPool: [
        'Pressing haut payant : {presser} récupère, sert {releaser}, ouverture pour {finisher}',
        '{presser} étouffe la sortie, {releaser} accélère vers {finisher}',
        'Récupération haute de {presser}, transition éclair pour {finisher}',
      ],
    },
    counter_attack: {
      label: 'Contre-attaque',
      originZone: ['axis-def', 'axis-mid'],
      targetZone: ['axis-att', 'axis-box', 'left-att', 'right-att'],
      actorRoles: [
        { role: 'recover',  preferTraits: ['ball_winner', 'anchor'],     preferZones: ['axis-mid', 'axis-def'] },
        { role: 'carrier',  preferTraits: ['ball_carrier', 'runner'],    preferZones: ['axis-mid', 'left-mid', 'right-mid'] },
        { role: 'finisher', preferTraits: ['finisher', 'runner'],        preferZones: ['axis-att', 'axis-box'] },
      ],
      phaseFocus: ['transition', 'urgency', 'push', 'last-stand'],
      threatLevel: 0.55,
      flavorPool: [
        'Contre éclair ! {recover} récupère, {carrier} conduit, {finisher} en bout de course',
        'Transition fulgurante : {carrier} fonce vers {finisher}',
        'Trois passes pour une occasion, {finisher} se présente face au but',
      ],
    },
    slow_buildup: {
      label: 'Possession lente',
      originZone: ['axis-mid', 'left-half-mid', 'right-half-mid'],
      targetZone: ['axis-att', 'left-half-att', 'right-half-att'],
      actorRoles: [
        { role: 'metronome', preferTraits: ['playmaker', 'distributor'], preferZones: ['axis-mid'] },
        { role: 'creator',   preferTraits: ['creator', 'half_space'],    preferZones: ['left-half-att', 'right-half-att', 'axis-att'] },
        { role: 'receiver',  preferTraits: ['half_space', 'finisher'],   preferZones: ['axis-att', 'axis-box'] },
      ],
      phaseFocus: ['sustained', 'control'],
      threatLevel: 0.30,
      flavorPool: [
        '{metronome} ralentit le rythme, {creator} cherche l\'ouverture vers {receiver}',
        'Possession patiente, {creator} fixe la défense puis trouve {receiver}',
        '{metronome} → {creator} → {receiver}, la combinaison est en place',
      ],
    },
    wing_play: {
      label: 'Attaque par le couloir',
      originZone: ['left-mid', 'right-mid'],
      targetZone: ['left-att', 'right-att', 'axis-box'],
      actorRoles: [
        { role: 'supplier', preferTraits: ['wide', 'overlapping'],      preferZones: ['left-mid', 'right-mid'] },
        { role: 'winger',   preferTraits: ['dribbler', 'wide'],          preferZones: ['left-att', 'right-att'] },
        { role: 'crasher',  preferTraits: ['box_crasher', 'finisher'],   preferZones: ['axis-box', 'axis-att'] },
      ],
      phaseFocus: ['sustained', 'push', 'pressure'],
      threatLevel: 0.38,
      flavorPool: [
        '{winger} déborde par son couloir, centre vers {crasher}',
        '{supplier} surnumérique, {winger} provoque la défense',
        'Combinaison côté : {supplier} pour {winger}, centre dévié vers {crasher}',
      ],
    },
    half_space_combination: {
      label: 'Combinaison demi-espace',
      originZone: ['left-half-mid', 'right-half-mid'],
      targetZone: ['left-half-att', 'right-half-att', 'axis-att'],
      actorRoles: [
        { role: 'intp',     preferTraits: ['half_space', 'creator'],     preferZones: ['left-half-mid', 'right-half-mid'] },
        { role: 'underrun', preferTraits: ['underlapping', 'overlapping'],preferZones: ['left-half-att', 'right-half-att'] },
        { role: 'finisher', preferTraits: ['finisher', 'box_crasher'],   preferZones: ['axis-att', 'axis-box'] },
      ],
      phaseFocus: ['sustained', 'control', 'pressure'],
      threatLevel: 0.42,
      flavorPool: [
        '{intp} dans le demi-espace, libère {underrun} en surnombre',
        'Triangulation dans l\'intervalle : {intp} → {underrun} → {finisher}',
        '{intp} casse les lignes vers {finisher} en plein cœur de la surface',
      ],
    },
    through_ball: {
      label: 'Passe en profondeur',
      originZone: ['axis-mid', 'left-half-mid', 'right-half-mid'],
      targetZone: ['axis-att', 'axis-box'],
      actorRoles: [
        { role: 'passer',   preferTraits: ['playmaker', 'creator'],      preferZones: ['axis-mid', 'left-half-mid', 'right-half-mid'] },
        { role: 'runner',   preferTraits: ['runner', 'finisher'],        preferZones: ['axis-att', 'axis-box'] },
      ],
      phaseFocus: ['urgency', 'pressure', 'push'],
      threatLevel: 0.55,
      flavorPool: [
        '{passer} aperçoit la course de {runner}, ballon piqué entre les lignes',
        'Ouverture parfaite de {passer} pour {runner}, face au but',
        '{runner} sprinte dans le dos, {passer} le sert idéalement',
      ],
    },
    box_combination: {
      label: 'Combinaison dans la surface',
      originZone: ['left-half-att', 'right-half-att', 'axis-att'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'creator',  preferTraits: ['creator', 'finisher'],       preferZones: ['axis-att', 'left-half-att', 'right-half-att'] },
        { role: 'finisher', preferTraits: ['finisher', 'box_crasher'],   preferZones: ['axis-box', 'axis-att'] },
      ],
      phaseFocus: ['sustained', 'push', 'urgency', 'desperation'],
      threatLevel: 0.65,
      flavorPool: [
        '{creator} fixe puis sert {finisher} dans la surface',
        'Un-deux fatal : {creator} et {finisher} se trouvent dans le rectangle',
        '{creator} centre en retrait pour {finisher} qui surgit',
      ],
    },
    cross_from_byline: {
      label: 'Centre depuis la ligne',
      originZone: ['left-att', 'right-att'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'winger',   preferTraits: ['wide', 'dribbler'],          preferZones: ['left-att', 'right-att'] },
        { role: 'crasher',  preferTraits: ['box_crasher', 'target_man'], preferZones: ['axis-box'] },
      ],
      phaseFocus: ['pressure', 'push', 'urgency'],
      threatLevel: 0.40,
      flavorPool: [
        '{winger} centre depuis la ligne, {crasher} prend l\'aspiration',
        'Centre fort de {winger}, {crasher} est à l\'affût',
        '{winger} déborde et envoie un ballon piqué pour {crasher}',
      ],
    },
    set_piece_corner: {
      label: 'Corner',
      originZone: ['left-att', 'right-att'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'taker',    preferTraits: ['creator', 'distributor'],    preferZones: ['axis-mid', 'left-half-mid', 'right-half-mid'] },
        { role: 'header',   preferTraits: ['target_man', 'box_crasher'], preferZones: ['axis-box'] },
      ],
      phaseFocus: ['urgency', 'desperation', 'late-window'],
      threatLevel: 0.32,
      flavorPool: [
        'Corner tiré par {taker}, reprise de {header} dans la mêlée',
        '{taker} brosse le ballon, {header} décolle au point de penalty',
        'Coup de pied de coin de {taker}, défense en difficulté sur la tête de {header}',
      ],
    },
    set_piece_freekick: {
      label: 'Coup franc',
      originZone: ['axis-att', 'left-half-att', 'right-half-att'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'taker',    preferTraits: ['creator', 'distributor', 'finisher'], preferZones: ['axis-mid', 'axis-att'] },
      ],
      phaseFocus: ['urgency', 'desperation', 'late-window'],
      threatLevel: 0.28,
      flavorPool: [
        '{taker} prend ses repères et frappe directement',
        'Coup franc brossé de {taker}, le gardien doit s\'employer',
        '{taker} envoie un missile vers la lucarne',
      ],
    },
    long_range_shot: {
      label: 'Frappe lointaine',
      originZone: ['axis-mid', 'left-half-mid', 'right-half-mid'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'shooter',  preferTraits: ['finisher', 'playmaker'],     preferZones: ['axis-mid', 'left-half-mid', 'right-half-mid'] },
      ],
      phaseFocus: ['desperation', 'urgency'],
      threatLevel: 0.20,
      flavorPool: [
        '{shooter} arme sa frappe à 25m',
        'Tir lointain et puissant de {shooter}',
        '{shooter} prend sa chance de loin, ballon flottant',
      ],
    },
    individual_brilliance: {
      label: 'Action individuelle',
      originZone: ['left-att', 'right-att', 'left-half-att', 'right-half-att', 'axis-att'],
      targetZone: ['axis-box'],
      actorRoles: [
        { role: 'dribbler', preferTraits: ['dribbler', 'ball_carrier'],  preferZones: ['left-att', 'right-att', 'left-half-att', 'right-half-att', 'axis-att'] },
      ],
      phaseFocus: ['push', 'urgency', 'desperation'],
      threatLevel: 0.48,
      flavorPool: [
        '{dribbler} part en solo, élimine deux adversaires',
        'Geste technique de {dribbler}, défense dépassée',
        '{dribbler} provoque, accélère et s\'ouvre l\'angle',
      ],
    },
  };

  /**
   * pickSituationType(phaseFocus, dominance, rng) → situationTypeKey
   * Tire un type de situation en pondérant par compatibilité avec le focus.
   */
  function pickSituationType(phaseFocus, dominance, rng) {
    rng = rng || Math.random;
    const compatible = [];
    Object.entries(SITUATION_TYPES).forEach(([key, sit]) => {
      const compat = sit.phaseFocus.includes(phaseFocus) ? 1.0 : 0.25;
      compatible.push({ key, weight: compat });
    });
    // Pondération aléatoire
    const total = compatible.reduce((s, c) => s + c.weight, 0);
    let r = rng() * total;
    for (const c of compatible) {
      r -= c.weight;
      if (r <= 0) return c.key;
    }
    return compatible[0].key;
  }

  /**
   * castActors(attackingTeamPlayers, situationKey, attrs, traitScores) → { role: player, ... }
   *
   * Pour chaque rôle de la situation, choisit le meilleur joueur de l'équipe
   * attaquante selon :
   *   - traits préférés (trait scores)
   *   - zones préférées (présence dans la zone)
   *
   * Le casting est ÉMERGENT : pour une même situation, deux équipes
   * différentes auront un casting différent, et la même équipe peut
   * caster différemment selon les choix RNG.
   */
  function castActors(situationKey, teamPlayers, opts) {
    const Roles = window.Drafter && window.Drafter.Roles;
    const Attributes = window.Drafter && window.Drafter.Attributes;
    const Zones = window.Drafter && window.Drafter.Zones;
    if (!Roles || !Attributes || !Zones) return null;
    const sit = SITUATION_TYPES[situationKey];
    if (!sit) return null;
    opts = opts || {};
    const rng = opts.rng || Math.random;

    const cast = {};
    const used = new Set();

    sit.actorRoles.forEach(actorDef => {
      // Score chaque joueur disponible pour ce rôle
      const candidates = teamPlayers
        .filter(p => !used.has(p.player.id))
        .map(p => {
          // 1) Score sur les traits préférés
          let traitScore = 0;
          actorDef.preferTraits.forEach(t => {
            traitScore += (p.traitScores[t] || 0);
          });
          traitScore = traitScore / Math.max(1, actorDef.preferTraits.length);

          // 2) Bonus si présent dans une zone préférée
          let zoneBonus = 0;
          actorDef.preferZones.forEach(z => {
            const presence = p.zoneDistribution[z] || 0;
            zoneBonus += presence * 25;
          });

          return {
            playerEntry: p,
            score: traitScore + zoneBonus,
          };
        })
        .sort((a, b) => b.score - a.score);

      // Top 3 (variété : on ne prend pas toujours #1)
      const top = candidates.slice(0, 3).filter(c => c.score > 30);
      if (top.length === 0 && candidates.length) {
        cast[actorDef.role] = candidates[0].playerEntry;
        used.add(candidates[0].playerEntry.player.id);
        return;
      }
      // Tirage pondéré sur les 3 meilleurs (variété structurelle)
      const total = top.reduce((s, c) => s + c.score, 0);
      let r = rng() * total;
      let chosen = top[0];
      for (const c of top) {
        r -= c.score;
        if (r <= 0) { chosen = c; break; }
      }
      cast[actorDef.role] = chosen.playerEntry;
      used.add(chosen.playerEntry.player.id);
    });

    return cast;
  }

  /**
   * resolveSituationOutcome(sit, cast, defendingTeam, attackingZoneScore, defendingZoneScore, rng)
   * → { outcome: 'goal'|'save'|'miss'|'blocked'|'tackled', xg, shooter? }
   *
   * Issue de la situation : combine le threatLevel + la qualité offensive
   * du cast + la qualité défensive de la zone cible + GK adverse.
   */
  function resolveSituationOutcome(sit, cast, defendingTeamPlayers, attackingZoneScore, defendingZoneScore, rng) {
    rng = rng || Math.random;
    // Cherche le finisseur principal du cast (priorité : finisher > carrier > runner > autre)
    const finisher = cast.finisher || cast.crasher || cast.shooter || cast.header ||
                     cast.runner || cast.receiver || cast.dribbler || cast.taker ||
                     Object.values(cast).pop();
    if (!finisher) return { outcome: 'lost' };

    const fAttrs = finisher.attrs;
    // Probabilité de tir = threatLevel × qualité attaque vs défense locale
    const att = attackingZoneScore || 70;
    const def = defendingZoneScore || 70;
    const shootProb = sit.threatLevel *
                      (0.5 + (att - 50) / 100) *
                      (1.2 - (def - 50) / 100);
    const shoots = rng() < shootProb;
    if (!shoots) return { outcome: 'lost', cast, situation: sit };

    // shotQ = qualité de tir (0..1) = mix de finishing + technique + composante zone
    const shotQ = (
      (fAttrs.finishing || 60) * 0.50 +
      (fAttrs.anticipation || 60) * 0.20 +
      (fAttrs.power || 60) * 0.15 +
      att * 0.15
    ) / 100;

    // xG estimé
    const xg = +(0.05 + Math.pow(shotQ, 1.5) * 0.65).toFixed(2);

    // On-target probability (40-70% typique, calibré : top joueurs cadrent
    // souvent mais pas systématiquement)
    const onTargetProb = Math.max(0.20, Math.min(0.78, Math.pow(shotQ, 1.3) * 0.85));
    const onTarget = rng() < onTargetProb;
    if (!onTarget) return { outcome: 'miss', xg, shooter: finisher, cast, situation: sit };

    // GK adverse — chercher le GK dans les défenseurs
    const gk = defendingTeamPlayers.find(p => p.slotType === 'GK');
    const gkRating = gk ? ((gk.attrs.anticipation + gk.attrs.intelligence + gk.attrs.interception) / 3) : 65;

    // Goal probability (calibré : ~25-50% pour les tirs cadrés top joueurs)
    const goalProb = Math.max(0.03, Math.min(0.85,
      Math.pow(shotQ, 1.8) * (1 - gkRating / 135) * 1.10
    ));
    const isGoal = rng() < goalProb;

    return {
      outcome: isGoal ? 'goal' : 'save',
      xg,
      shooter: finisher,
      gk: isGoal ? null : gk,
      cast,
      situation: sit,
    };
  }

  /**
   * narrate(situation, cast, outcome) → string
   * Narration via templates (déterministe). On pioche un flavor du pool
   * et on substitue les {role} par les noms de joueurs.
   */
  function narrate(situation, cast, outcome, rng) {
    rng = rng || Math.random;
    const template = situation.flavorPool[Math.floor(rng() * situation.flavorPool.length)];
    let text = template.replace(/\{(\w+)\}/g, (_, key) => {
      const actor = cast[key];
      return actor ? actor.player.name.split(' ').slice(-1)[0] : '???';
    });
    if (outcome.outcome === 'goal') {
      const sh = outcome.shooter && outcome.shooter.player.name;
      text = '⚽ BUT ! ' + text + (sh ? ' — ' + sh + ' trouve la faille.' : '');
    } else if (outcome.outcome === 'save') {
      const gk = outcome.gk && outcome.gk.player.name;
      text = text + (gk ? ' — ' + gk + ' s\'interpose.' : ' — parade salvatrice.');
    } else if (outcome.outcome === 'miss') {
      text = text + ' — ça passe à côté.';
    } else if (outcome.outcome === 'lost') {
      text = text + ' — l\'action est étouffée.';
    }
    return text;
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Situations = {
    SITUATION_TYPES,
    pickSituationType,
    castActors,
    resolveSituationOutcome,
    narrate,
  };
})();
