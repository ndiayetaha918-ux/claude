/* ============================================================
   Drafter — Engine A.1
   Modèle joueur étendu : 12 attributs normalisés

   Conçu pour être compatible avec une future base de données réelle
   (Sofifa / FBref / WyScout) : les clés sont stables, en anglais,
   et les ranges sont 0-100 partout. Si demain on récupère des vraies
   data, on peut overrider player.attributes sans toucher le moteur.
   ============================================================ */
(function () {
  'use strict';

  // -------- Définition des 12 attributs --------
  // Catégories : OFF (offensif), DEF (défensif), PHY (physique), MEN (mental)
  // Chaque attribut a un range 0-100, une description, et une catégorie.
  const ATTRIBUTES = {
    // ===== Offensif (5) =====
    finishing:    { cat: 'OFF', label: 'Finition',    desc: 'Précision et sang-froid devant le but' },
    dribbling:    { cat: 'OFF', label: 'Dribble',     desc: 'Élimination en un contre un, conservation balle au pied' },
    vision:       { cat: 'OFF', label: 'Vision',      desc: 'Lecture des espaces, anticipation du jeu, dernière passe' },
    passingLong:  { cat: 'OFF', label: 'Passe longue',desc: 'Précision des ouvertures, ballons aériens, switch de jeu' },
    passingShort: { cat: 'OFF', label: 'Passe courte',desc: 'Conservation, jeu rapide en triangle, sortie de balle' },

    // ===== Défensif (3) =====
    duel:         { cat: 'DEF', label: 'Duel',         desc: 'Tacle au sol, contact, duel aérien défensif' },
    interception: { cat: 'DEF', label: 'Interception', desc: 'Couper les lignes de passe, intervenir avant la course' },
    anticipation: { cat: 'DEF', label: 'Anticipation', desc: 'Lecture défensive, positionnement préventif' },

    // ===== Physique (3) =====
    speed:        { cat: 'PHY', label: 'Vitesse',     desc: 'Sprint, vitesse de pointe, accélération' },
    stamina:      { cat: 'PHY', label: 'Endurance',   desc: 'Tenir 90 minutes au même rythme, courir tout le côté' },
    power:        { cat: 'PHY', label: 'Puissance',   desc: 'Force des appuis, force au tir, jeu aérien offensif' },

    // ===== Mental (1) =====
    intelligence: { cat: 'MEN', label: 'Intelligence',desc: 'Lecture du jeu, prise de décision, positionnement collectif' },
  };

  const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES);

  // -------- Profil idéal par poste (sert de base à l'extrapolation) --------
  // Chaque valeur est un coefficient 0-100 qui représente l'importance moyenne
  // de cet attribut pour ce poste. Les valeurs absolues d'un joueur dépendent
  // de son niveau global (sa valeur marchande / archetype) modulé par ce profil.
  const POSITION_PROFILE = {
    GK:  { finishing:5,  dribbling:20, vision:55, passingLong:75, passingShort:70, duel:60, interception:80, anticipation:88, speed:35, stamina:60, power:70, intelligence:78 },
    CB:  { finishing:22, dribbling:40, vision:50, passingLong:60, passingShort:65, duel:88, interception:85, anticipation:80, speed:55, stamina:75, power:85, intelligence:72 },
    LB:  { finishing:38, dribbling:65, vision:60, passingLong:60, passingShort:68, duel:70, interception:65, anticipation:65, speed:80, stamina:88, power:65, intelligence:65 },
    RB:  { finishing:38, dribbling:65, vision:60, passingLong:60, passingShort:68, duel:70, interception:65, anticipation:65, speed:80, stamina:88, power:65, intelligence:65 },
    LWB: { finishing:45, dribbling:72, vision:65, passingLong:65, passingShort:70, duel:65, interception:60, anticipation:62, speed:85, stamina:92, power:65, intelligence:68 },
    RWB: { finishing:45, dribbling:72, vision:65, passingLong:65, passingShort:70, duel:65, interception:60, anticipation:62, speed:85, stamina:92, power:65, intelligence:68 },
    DM:  { finishing:35, dribbling:50, vision:75, passingLong:72, passingShort:78, duel:78, interception:82, anticipation:80, speed:55, stamina:80, power:70, intelligence:82 },
    CM:  { finishing:55, dribbling:65, vision:80, passingLong:70, passingShort:82, duel:65, interception:65, anticipation:70, speed:65, stamina:82, power:60, intelligence:80 },
    AM:  { finishing:72, dribbling:80, vision:88, passingLong:75, passingShort:88, duel:50, interception:50, anticipation:60, speed:70, stamina:75, power:50, intelligence:85 },
    LM:  { finishing:62, dribbling:75, vision:70, passingLong:65, passingShort:75, duel:55, interception:55, anticipation:55, speed:78, stamina:82, power:55, intelligence:72 },
    RM:  { finishing:62, dribbling:75, vision:70, passingLong:65, passingShort:75, duel:55, interception:55, anticipation:55, speed:78, stamina:82, power:55, intelligence:72 },
    LW:  { finishing:75, dribbling:88, vision:72, passingLong:60, passingShort:78, duel:45, interception:40, anticipation:55, speed:88, stamina:75, power:50, intelligence:78 },
    RW:  { finishing:75, dribbling:88, vision:72, passingLong:60, passingShort:78, duel:45, interception:40, anticipation:55, speed:88, stamina:75, power:50, intelligence:78 },
    SS:  { finishing:82, dribbling:78, vision:80, passingLong:65, passingShort:80, duel:55, interception:45, anticipation:72, speed:75, stamina:75, power:60, intelligence:82 },
    CF:  { finishing:85, dribbling:70, vision:70, passingLong:55, passingShort:70, duel:75, interception:35, anticipation:78, speed:70, stamina:70, power:78, intelligence:78 },
    ST:  { finishing:92, dribbling:62, vision:55, passingLong:40, passingShort:60, duel:75, interception:30, anticipation:85, speed:78, stamina:70, power:78, intelligence:75 },
  };

  // -------- Builder principal --------
  // À partir d'un objet player (du PLAYERS array) → retourne un objet avec les 12 attributs.
  // Si player.attributes existe déjà (cas futur DB réelle), on l'utilise tel quel.
  function buildAttributes(player) {
    if (!player) return null;
    if (player.attributes && typeof player.attributes === 'object') {
      // Future DB réelle : on respecte les valeurs explicites et on complète les manquantes
      return mergeAttributes(player.attributes, deriveFromArchetype(player));
    }
    return deriveFromArchetype(player);
  }

  // Dérive les 12 attributs depuis l'archetype du joueur (poste principal + valeur + âge)
  function deriveFromArchetype(player) {
    const pos = (player.posMain && player.posMain[0]) || (player.positions && player.positions[0]) || 'CM';
    const profile = POSITION_PROFILE[pos] || POSITION_PROFILE.CM;

    // Niveau global du joueur déduit de sa valeur marchande (log scale)
    const v = player.value || 5;
    const baseLevel = Math.max(45, Math.min(96, 46 + Math.log10(v + 1) * 16));

    // Modulateur âge : pic ~26-28, déclin après 31, immaturité < 21
    const age = player.age || 26;
    const speedFactor   = age <= 24 ? 1.06 : age >= 32 ? 0.86 : age >= 30 ? 0.93 : 1.0;
    const staminaFactor = age <= 22 ? 0.96 : age >= 33 ? 0.88 : 1.0;
    const expFactor     = age >= 29 ? 1.05 : age <= 20 ? 0.94 : 1.0;
    const powerFactor   = age <= 21 ? 0.94 : age >= 32 ? 0.94 : 1.0;

    const out = {};
    ATTRIBUTE_KEYS.forEach(k => {
      const weight = profile[k] || 60;
      // Formule additive : un top joueur dépasse 90 sur son attribut clé,
      // tombe à ~70 sur ses faiblesses. Un joueur moyen oscille autour de 60.
      //   baseLevel = niveau global déduit de la valeur marchande (46..96)
      //   weight = importance de l'attribut pour le poste (typ. 30..92)
      //   spread = (weight - 60) × 0.45 → écart entre attributs clés et faibles
      let v = baseLevel + (weight - 60) * 0.45;
      // Application âge selon famille d'attribut
      if (k === 'speed')         v *= speedFactor;
      else if (k === 'stamina')  v *= staminaFactor;
      else if (k === 'power')    v *= powerFactor;
      else if (k === 'vision' || k === 'anticipation' || k === 'intelligence') v *= expFactor;
      out[k] = Math.round(Math.max(28, Math.min(99, v)));
    });
    return out;
  }

  // Si on a des attributs partiels (ex : 3 attrs depuis DB) on complète avec dérivation
  function mergeAttributes(explicit, derived) {
    const out = {};
    ATTRIBUTE_KEYS.forEach(k => {
      out[k] = (explicit && typeof explicit[k] === 'number') ? explicit[k] : derived[k];
    });
    return out;
  }

  // -------- Utilitaires de catégorie --------
  function avgCategory(attrs, cat) {
    if (!attrs) return 0;
    const keys = ATTRIBUTE_KEYS.filter(k => ATTRIBUTES[k].cat === cat);
    if (!keys.length) return 0;
    return keys.reduce((s, k) => s + (attrs[k] || 0), 0) / keys.length;
  }

  // OVR cohérent : moyenne pondérée des 12 attributs (poids égal par défaut)
  // Pour un OVR plus pertinent par poste, voir engine/role-fitter.js (A.2)
  function overall(attrs) {
    if (!attrs) return 0;
    return Math.round(ATTRIBUTE_KEYS.reduce((s, k) => s + (attrs[k] || 0), 0) / ATTRIBUTE_KEYS.length);
  }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Attributes = {
    KEYS:          ATTRIBUTE_KEYS,
    DEF:           ATTRIBUTES,
    POSITION_PROFILE,
    build:         buildAttributes,
    derive:        deriveFromArchetype,
    merge:         mergeAttributes,
    avgCategory,
    overall,
  };
})();
