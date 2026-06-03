/* ============================================================
   Drafter — Engine A.3
   Grille zonale + mapper composition → présence/qualité par zone

   Le football est une bataille de contrôle d'espaces. Cette couche
   découpe le terrain en zones et calcule, pour chaque équipe :
   - la PRÉSENCE par zone (combien de joueurs y évoluent réellement)
   - la QUALITÉ par zone (offensive, défensive, vitesse, technique)
   - les zones FORTES et zones FAIBLES

   Multi-modèles : 11v11 et 5v5 ont des grilles différentes.
   ============================================================ */
(function () {
  'use strict';

  // -------- Grilles disponibles --------
  // Une grille = découpage du terrain en cellules.
  // Chaque cellule a un id, un couloir (left/left-half/axis/right-half/right)
  // et une profondeur (def/mid/att/box). Une cellule = un id unique.
  //
  // Format : { id, lane, depth, x, y } où x/y sont les coords du centre
  // en pourcentage (0-100) — utilisés pour mapper les positions des slots.

  const GRID_11V11 = {
    name: '11v11',
    lanes: ['left', 'left-half', 'axis', 'right-half', 'right'],
    depths: ['def', 'mid', 'att', 'box'],
    cells: [
      // === Couloir gauche (x ~ 0-20%) ===
      { id: 'left-def',       lane: 'left',       depth: 'def', x: 12, y: 80 },
      { id: 'left-mid',       lane: 'left',       depth: 'mid', x: 12, y: 50 },
      { id: 'left-att',       lane: 'left',       depth: 'att', x: 12, y: 22 },
      // === Demi-espace gauche (x ~ 20-40%) ===
      { id: 'left-half-def',  lane: 'left-half',  depth: 'def', x: 30, y: 80 },
      { id: 'left-half-mid',  lane: 'left-half',  depth: 'mid', x: 30, y: 50 },
      { id: 'left-half-att',  lane: 'left-half',  depth: 'att', x: 30, y: 22 },
      // === Axe (x ~ 40-60%) ===
      { id: 'axis-def',       lane: 'axis',       depth: 'def', x: 50, y: 85 },
      { id: 'axis-mid',       lane: 'axis',       depth: 'mid', x: 50, y: 50 },
      { id: 'axis-att',       lane: 'axis',       depth: 'att', x: 50, y: 22 },
      { id: 'axis-box',       lane: 'axis',       depth: 'box', x: 50, y: 8  },
      // === Demi-espace droit ===
      { id: 'right-half-def', lane: 'right-half', depth: 'def', x: 70, y: 80 },
      { id: 'right-half-mid', lane: 'right-half', depth: 'mid', x: 70, y: 50 },
      { id: 'right-half-att', lane: 'right-half', depth: 'att', x: 70, y: 22 },
      // === Couloir droit ===
      { id: 'right-def',      lane: 'right',      depth: 'def', x: 88, y: 80 },
      { id: 'right-mid',      lane: 'right',      depth: 'mid', x: 88, y: 50 },
      { id: 'right-att',      lane: 'right',      depth: 'att', x: 88, y: 22 },
    ],
  };

  // Grille Five — terrain plus petit, moins de couloirs, moins de profondeur
  const GRID_5V5 = {
    name: '5v5',
    lanes: ['left', 'axis', 'right'],
    depths: ['def', 'mid', 'att'],
    cells: [
      { id: 'left-def',  lane: 'left',  depth: 'def', x: 25, y: 78 },
      { id: 'left-mid',  lane: 'left',  depth: 'mid', x: 25, y: 50 },
      { id: 'left-att',  lane: 'left',  depth: 'att', x: 25, y: 22 },
      { id: 'axis-def',  lane: 'axis',  depth: 'def', x: 50, y: 78 },
      { id: 'axis-mid',  lane: 'axis',  depth: 'mid', x: 50, y: 50 },
      { id: 'axis-att',  lane: 'axis',  depth: 'att', x: 50, y: 22 },
      { id: 'right-def', lane: 'right', depth: 'def', x: 75, y: 78 },
      { id: 'right-mid', lane: 'right', depth: 'mid', x: 75, y: 50 },
      { id: 'right-att', lane: 'right', depth: 'att', x: 75, y: 22 },
    ],
  };

  const GRIDS = { '11v11': GRID_11V11, '5v5': GRID_5V5 };

  // -------- Miroir gauche/droite + att/def --------
  // Quand A attaque sa zone gauche-att, B défend dans son référentiel à
  // l'opposé : c'est sa zone droite-def. Pour comparer les zones, on mappe.
  const MIRROR_11V11 = {
    'left-def':       'right-att',
    'left-mid':       'right-mid',
    'left-att':       'right-def',
    'left-half-def':  'right-half-att',
    'left-half-mid':  'right-half-mid',
    'left-half-att':  'right-half-def',
    'axis-def':       'axis-att',
    'axis-mid':       'axis-mid',
    'axis-att':       'axis-def',
    'axis-box':       'axis-box',  // box adverse = pas de comparaison directe
    'right-half-def': 'left-half-att',
    'right-half-mid': 'left-half-mid',
    'right-half-att': 'left-half-def',
    'right-def':      'left-att',
    'right-mid':      'left-mid',
    'right-att':      'left-def',
  };
  const MIRROR_5V5 = {
    'left-def':  'right-att', 'left-mid':  'right-mid', 'left-att':  'right-def',
    'axis-def':  'axis-att',  'axis-mid':  'axis-mid',  'axis-att':  'axis-def',
    'right-def': 'left-att',  'right-mid': 'left-mid',  'right-att': 'left-def',
  };
  const MIRRORS = { '11v11': MIRROR_11V11, '5v5': MIRROR_5V5 };

  // -------- Mapping slot → zone(s) --------
  // Selon le poste, un joueur évolue principalement dans certaines zones.
  // Cette table décrit la distribution de présence par poste sur la grille.
  // Format : { posCode: [{ cellId, weight 0-1 }, ...] }
  // Somme des weights par poste = 1.0 (densité totale du joueur)
  // Note : on couvre les demi-espaces défensifs via les CB/FB/DM/CM pour
  // éviter qu'ils apparaissent comme zones "0 défense" alors qu'en réalité
  // ce sont les défenseurs adjacents qui les surveillent.
  const SLOT_TO_ZONES = {
    GK:  [{ cellId: 'axis-def', weight: 1.0 }],
    CB:  [{ cellId: 'axis-def', weight: 0.55 }, { cellId: 'axis-mid', weight: 0.15 }, { cellId: 'left-half-def', weight: 0.15 }, { cellId: 'right-half-def', weight: 0.15 }],
    LB:  [{ cellId: 'left-def', weight: 0.45 }, { cellId: 'left-mid', weight: 0.30 }, { cellId: 'left-half-def', weight: 0.15 }, { cellId: 'left-att', weight: 0.10 }],
    RB:  [{ cellId: 'right-def', weight: 0.45 }, { cellId: 'right-mid', weight: 0.30 }, { cellId: 'right-half-def', weight: 0.15 }, { cellId: 'right-att', weight: 0.10 }],
    LWB: [{ cellId: 'left-mid', weight: 0.4 }, { cellId: 'left-att', weight: 0.3 }, { cellId: 'left-def', weight: 0.15 }, { cellId: 'left-half-def', weight: 0.10 }, { cellId: 'left-half-att', weight: 0.05 }],
    RWB: [{ cellId: 'right-mid', weight: 0.4 }, { cellId: 'right-att', weight: 0.3 }, { cellId: 'right-def', weight: 0.15 }, { cellId: 'right-half-def', weight: 0.10 }, { cellId: 'right-half-att', weight: 0.05 }],
    DM:  [{ cellId: 'axis-mid', weight: 0.45 }, { cellId: 'axis-def', weight: 0.20 }, { cellId: 'left-half-mid', weight: 0.10 }, { cellId: 'right-half-mid', weight: 0.10 }, { cellId: 'left-half-def', weight: 0.075 }, { cellId: 'right-half-def', weight: 0.075 }],
    CM:  [{ cellId: 'axis-mid', weight: 0.35 }, { cellId: 'left-half-mid', weight: 0.18 }, { cellId: 'right-half-mid', weight: 0.18 }, { cellId: 'axis-att', weight: 0.10 }, { cellId: 'axis-def', weight: 0.07 }, { cellId: 'left-half-def', weight: 0.06 }, { cellId: 'right-half-def', weight: 0.06 }],
    AM:  [{ cellId: 'axis-att', weight: 0.40 }, { cellId: 'left-half-att', weight: 0.22 }, { cellId: 'right-half-att', weight: 0.22 }, { cellId: 'axis-mid', weight: 0.10 }, { cellId: 'left-half-mid', weight: 0.03 }, { cellId: 'right-half-mid', weight: 0.03 }],
    LM:  [{ cellId: 'left-mid', weight: 0.40 }, { cellId: 'left-att', weight: 0.30 }, { cellId: 'left-half-mid', weight: 0.15 }, { cellId: 'left-half-att', weight: 0.10 }, { cellId: 'left-def', weight: 0.05 }],
    RM:  [{ cellId: 'right-mid', weight: 0.40 }, { cellId: 'right-att', weight: 0.30 }, { cellId: 'right-half-mid', weight: 0.15 }, { cellId: 'right-half-att', weight: 0.10 }, { cellId: 'right-def', weight: 0.05 }],
    LW:  [{ cellId: 'left-att', weight: 0.50 }, { cellId: 'left-half-att', weight: 0.30 }, { cellId: 'axis-att', weight: 0.15 }, { cellId: 'left-mid', weight: 0.05 }],
    RW:  [{ cellId: 'right-att', weight: 0.50 }, { cellId: 'right-half-att', weight: 0.30 }, { cellId: 'axis-att', weight: 0.15 }, { cellId: 'right-mid', weight: 0.05 }],
    SS:  [{ cellId: 'axis-att', weight: 0.50 }, { cellId: 'left-half-att', weight: 0.22 }, { cellId: 'right-half-att', weight: 0.22 }, { cellId: 'axis-box', weight: 0.06 }],
    CF:  [{ cellId: 'axis-att', weight: 0.50 }, { cellId: 'axis-box', weight: 0.28 }, { cellId: 'left-half-att', weight: 0.11 }, { cellId: 'right-half-att', weight: 0.11 }],
    ST:  [{ cellId: 'axis-box', weight: 0.5 }, { cellId: 'axis-att', weight: 0.45 }, { cellId: 'left-half-att', weight: 0.025 }, { cellId: 'right-half-att', weight: 0.025 }],
  };

  // -------- Modifieurs par rôle --------
  // Certains rôles changent fortement où le joueur évolue, indépendamment du slot.
  // Format : { roleKey: distribution }
  // Si présent, écrase SLOT_TO_ZONES pour ce joueur.
  const ROLE_TO_ZONES_OVERRIDE = {
    LB_inverted:  [{ cellId: 'left-half-mid', weight: 0.5 }, { cellId: 'axis-mid', weight: 0.3 }, { cellId: 'left-def', weight: 0.2 }],
    RB_inverted:  [{ cellId: 'right-half-mid', weight: 0.5 }, { cellId: 'axis-mid', weight: 0.3 }, { cellId: 'right-def', weight: 0.2 }],
    LB_wingback:  [{ cellId: 'left-mid', weight: 0.4 }, { cellId: 'left-att', weight: 0.45 }, { cellId: 'left-def', weight: 0.15 }],
    RB_wingback:  [{ cellId: 'right-mid', weight: 0.4 }, { cellId: 'right-att', weight: 0.45 }, { cellId: 'right-def', weight: 0.15 }],
    LW_inverted:  [{ cellId: 'left-half-att', weight: 0.5 }, { cellId: 'axis-att', weight: 0.3 }, { cellId: 'left-att', weight: 0.2 }],
    RW_inverted:  [{ cellId: 'right-half-att', weight: 0.5 }, { cellId: 'axis-att', weight: 0.3 }, { cellId: 'right-att', weight: 0.2 }],
    LW_inside:    [{ cellId: 'left-half-mid', weight: 0.3 }, { cellId: 'left-half-att', weight: 0.4 }, { cellId: 'axis-att', weight: 0.3 }],
    RW_inside:    [{ cellId: 'right-half-mid', weight: 0.3 }, { cellId: 'right-half-att', weight: 0.4 }, { cellId: 'axis-att', weight: 0.3 }],
    CM_mezzala:   [{ cellId: 'left-half-mid', weight: 0.3 }, { cellId: 'left-half-att', weight: 0.3 }, { cellId: 'right-half-mid', weight: 0.15 }, { cellId: 'right-half-att', weight: 0.15 }, { cellId: 'axis-mid', weight: 0.1 }],
    CM_carrilero: [{ cellId: 'left-mid', weight: 0.4 }, { cellId: 'axis-mid', weight: 0.3 }, { cellId: 'left-att', weight: 0.2 }, { cellId: 'left-def', weight: 0.1 }],
    ST_false9:    [{ cellId: 'axis-att', weight: 0.4 }, { cellId: 'axis-mid', weight: 0.35 }, { cellId: 'left-half-att', weight: 0.125 }, { cellId: 'right-half-att', weight: 0.125 }],
    ST_target:    [{ cellId: 'axis-att', weight: 0.5 }, { cellId: 'axis-box', weight: 0.35 }, { cellId: 'left-half-att', weight: 0.075 }, { cellId: 'right-half-att', weight: 0.075 }],
    ST_poacher:   [{ cellId: 'axis-box', weight: 0.7 }, { cellId: 'axis-att', weight: 0.3 }],
    GK_sweeper:   [{ cellId: 'axis-def', weight: 0.85 }, { cellId: 'axis-mid', weight: 0.15 }],
    DM_regista:   [{ cellId: 'axis-def', weight: 0.4 }, { cellId: 'axis-mid', weight: 0.5 }, { cellId: 'left-half-mid', weight: 0.05 }, { cellId: 'right-half-mid', weight: 0.05 }],
    AM_shadow:    [{ cellId: 'axis-att', weight: 0.45 }, { cellId: 'axis-box', weight: 0.35 }, { cellId: 'left-half-att', weight: 0.1 }, { cellId: 'right-half-att', weight: 0.1 }],
    CB_libero:    [{ cellId: 'axis-def', weight: 0.55 }, { cellId: 'axis-mid', weight: 0.45 }],
  };

  /**
   * playerZoneDistribution(player, roleKey) → [{ cellId, weight }, …]
   * Distribution de présence d'un joueur sur les zones, selon son slot
   * et éventuellement son rôle (qui peut overrider).
   */
  function playerZoneDistribution(slotType, roleKey) {
    if (roleKey && ROLE_TO_ZONES_OVERRIDE[roleKey]) {
      return ROLE_TO_ZONES_OVERRIDE[roleKey];
    }
    return SLOT_TO_ZONES[slotType] || SLOT_TO_ZONES.CM;
  }

  /**
   * mapTeamToZones(team) → { zones: {cellId: {presence, attack, defense, speed, technique}}, …}
   * Pour chaque zone, calcule la présence cumulée + la qualité des joueurs qui
   * y évoluent (pondérée par leur weight de présence).
   *
   * team = {
   *   formation: '4-3-3',
   *   slots: { slotId: playerId },
   *   roles?: { slotId: roleKey },   // optionnel
   *   playerById: function,            // résolution joueur
   *   formationDef: { slots: [...] }   // FORMATIONS[formation]
   * }
   */
  function mapTeamToZones(team, opts) {
    opts = opts || {};
    const grid = GRIDS[opts.grid || '11v11'];
    if (!grid) return null;
    const Attributes = window.Drafter && window.Drafter.Attributes;
    if (!Attributes) return null;

    // Init zones
    const zones = {};
    grid.cells.forEach(c => {
      zones[c.id] = {
        cell: c,
        presence: 0,
        attack: 0, defense: 0, speed: 0, technique: 0, intelligence: 0,
        _attackSum: 0, _defenseSum: 0, _speedSum: 0, _techSum: 0, _intSum: 0,
        _weightSum: 0,
        players: [],
      };
    });

    // Pour chaque slot rempli : déduire le poste, le rôle, et la distribution
    team.formationDef.slots.forEach(slotDef => {
      const pid = team.slots[slotDef.id];
      if (!pid) return;
      const player = team.playerById(pid);
      if (!player) return;
      const attrs = Attributes.build(player);
      const roleKey = (team.roles && team.roles[slotDef.id]) || null;
      const distribution = playerZoneDistribution(slotDef.type, roleKey);

      // Qualités agrégées (4-5 indicateurs simples par zone)
      const att = (attrs.finishing + attrs.dribbling + attrs.vision) / 3;
      const def = (attrs.duel + attrs.interception + attrs.anticipation) / 3;
      const spd = attrs.speed;
      const tec = (attrs.passingShort + attrs.passingLong + attrs.dribbling) / 3;
      const intelligence = attrs.intelligence;

      distribution.forEach(d => {
        const z = zones[d.cellId];
        if (!z) return;
        z.presence += d.weight;
        z._attackSum   += att * d.weight;
        z._defenseSum  += def * d.weight;
        z._speedSum    += spd * d.weight;
        z._techSum     += tec * d.weight;
        z._intSum      += intelligence * d.weight;
        z._weightSum   += d.weight;
        z.players.push({ player, weight: d.weight, slot: slotDef.id, role: roleKey });
      });
    });

    // Moyennes pondérées par zone
    Object.values(zones).forEach(z => {
      if (z._weightSum > 0) {
        z.attack       = Math.round(z._attackSum / z._weightSum);
        z.defense      = Math.round(z._defenseSum / z._weightSum);
        z.speed        = Math.round(z._speedSum / z._weightSum);
        z.technique    = Math.round(z._techSum / z._weightSum);
        z.intelligence = Math.round(z._intSum / z._weightSum);
      }
      z.presence = +z.presence.toFixed(2);
    });

    return { zones, grid };
  }

  /**
   * compareZones(mapA, mapB) → { dominance: {cellId: 'A'|'B'|'='}, advantages: [...] }
   * Compare deux mappings et identifie les zones d'avantage.
   *
   * Logique : pour CHAQUE zone d'attaque d'A, on compare à la zone DEFENSIVE
   * MIROIR de B (côté opposé + tier inversé). Et vice-versa.
   */
  function compareZones(mapA, mapB, opts) {
    opts = opts || {};
    const mirror = MIRRORS[opts.grid || '11v11'];
    if (!mirror) return null;

    const dominance = {};
    const advantages = [];

    // Pour chaque zone, considérer A en attaque (réf A) vs B en défense (réf B miroir)
    Object.keys(mapA.zones).forEach(cid => {
      const zA = mapA.zones[cid];
      const cidMirror = mirror[cid];
      const zBmir = mapB.zones[cidMirror];
      if (!zBmir) { dominance[cid] = '='; return; }

      // Ne pas se prendre la tête sur les zones très peu occupées par les deux
      if (zA.presence < 0.15 && zBmir.presence < 0.15) {
        dominance[cid] = '=';
        return;
      }

      // Score A attaque cette zone : qualité offensive × densité de présence
      // Score B défend cette zone (miroir) : qualité défensive × densité
      const aAttackForce  = (zA.attack    * 0.55 + zA.speed * 0.25 + zA.technique * 0.20) *
                            (0.6 + Math.min(1.4, zA.presence) * 0.4);
      const bDefendForce  = (zBmir.defense * 0.65 + zBmir.intelligence * 0.20 + zBmir.speed * 0.15) *
                            (0.6 + Math.min(1.4, zBmir.presence) * 0.4);
      const gap = aAttackForce - bDefendForce;

      // Inversement, B peut attaquer (vu de B, c'est cidMirror chez B et cid chez A en défense)
      const bAttackForce  = (zBmir.attack * 0.55 + zBmir.speed * 0.25 + zBmir.technique * 0.20) *
                            (0.6 + Math.min(1.4, zBmir.presence) * 0.4);
      const aDefendForce  = (zA.defense   * 0.65 + zA.intelligence * 0.20 + zA.speed * 0.15) *
                            (0.6 + Math.min(1.4, zA.presence) * 0.4);
      const gapB = bAttackForce - aDefendForce;

      // Dominance globale de cette zone (attaque ou défense la plus marquée)
      if (Math.abs(gap - gapB) < 6) dominance[cid] = '=';
      else if (gap > gapB)          dominance[cid] = 'A';
      else                          dominance[cid] = 'B';

      // Avantages exploitables (gap significatif)
      if (gap > 12) advantages.push({
        cellId: cid, side: 'A', magnitude: Math.round(gap),
        reason: 'A peut attaquer ici (att '+zA.attack+', spd '+zA.speed+') face à défense '+zBmir.defense+' miroir '+cidMirror,
      });
      if (gapB > 12) advantages.push({
        cellId: cid, side: 'B', magnitude: Math.round(gapB),
        reason: 'B peut attaquer en miroir '+cidMirror+' (att '+zBmir.attack+', spd '+zBmir.speed+') face à défense '+zA.defense+' de A en '+cid,
      });
    });

    return { dominance, advantages };
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Zones = {
    GRID_11V11,
    GRID_5V5,
    GRIDS,
    SLOT_TO_ZONES,
    ROLE_TO_ZONES_OVERRIDE,
    playerZoneDistribution,
    mapTeamToZones,
    compareZones,
  };
})();
