// Drafter — Mode Animaux
// Postes selon le caractère/qualités de l'animal

window.ANIMALS = [
  // ===== Attaquants =====
  { id: 'lion',     name: 'Lion',      age: 8,  nat: 'Savane',   club: 'Roi de la jungle', league: 'Animaux', value: 200, positions: ['CF','ST'],          former: [], emoji: '🦁', bio: 'Le roi. Buteur dominant, présence physique et leadership.' },
  { id: 'tigre',    name: 'Tigre',     age: 9,  nat: 'Asie',     club: 'Bengale',          league: 'Animaux', value: 180, positions: ['ST','LW','CF'],     former: [], emoji: '🐯', bio: 'Embuscade et explosivité. Buteur ou ailier inversé.' },
  { id: 'panthere', name: 'Panthère',  age: 7,  nat: 'Afrique',  club: 'Noir',             league: 'Animaux', value: 160, positions: ['LW','RW','SS'],     former: [], emoji: '🐆', bio: 'Furtive, surgit en transition. Ailier gauche redoutable.' },
  { id: 'ours',     name: 'Ours',      age: 11, nat: 'Arctique', club: 'Polaire',          league: 'Animaux', value: 130, positions: ['ST','CF'],          former: [], emoji: '🐻', bio: 'Pivot massif, dos au but, finition lourde.' },
  { id: 'requin',   name: 'Requin',    age: 12, nat: 'Océan',    club: 'Blanc',            league: 'Animaux', value: 170, positions: ['CF','ST'],          former: [], emoji: '🦈', bio: 'Attaque sans pitié. Présent dans la surface.' },
  { id: 'kangourou',name: 'Kangourou', age: 5,  nat: 'Australie',club: 'Outback',          league: 'Animaux', value: 95,  positions: ['ST','CF'],          former: [], emoji: '🦘', bio: 'Détente folle, redoutable de la tête.' },
  { id: 'taureau',  name: 'Taureau',   age: 7,  nat: 'Pampa',    club: 'Arène',            league: 'Animaux', value: 110, positions: ['ST','CF'],          former: [], emoji: '🐂', bio: 'Charge violente, point d\'appui imbattable.' },

  // ===== Ailiers / vitesse =====
  { id: 'guepard',  name: 'Guépard',   age: 6,  nat: 'Savane',   club: 'Sprint Club',      league: 'Animaux', value: 220, positions: ['LW','RW','LM','RM','LB','RB'], former: [], emoji: '🐆', bio: 'L\'animal le plus rapide. Ailier ou latéral fusée.' },
  { id: 'faucon',   name: 'Faucon',    age: 6,  nat: 'Falaise',  club: 'Sky FC',           league: 'Animaux', value: 140, positions: ['RW','RM'],          former: [], emoji: '🦅', bio: 'Vision aérienne, plongée verticale.' },
  { id: 'hirondelle',name:'Hirondelle',age: 4,  nat: 'Migration',club: 'Aile',             league: 'Animaux', value: 90,  positions: ['LW','RW','LM','RM'],former: [], emoji: '🦅', bio: 'Insaisissable, change de direction au quart de tour.' },
  { id: 'gazelle',  name: 'Gazelle',   age: 5,  nat: 'Savane',   club: 'Plaine',           league: 'Animaux', value: 100, positions: ['LM','RM','AM'],     former: [], emoji: '🦌', bio: 'Course gracile, esquive tout, fragile au duel.' },

  // ===== Milieux créatifs =====
  { id: 'araignee', name: 'Araignée',  age: 3,  nat: 'Toile',    club: 'Web FC',           league: 'Animaux', value: 150, positions: ['AM','CM'],          former: [], emoji: '🕷️', bio: 'Tisse des passes invisibles. Le 10 absolu.' },
  { id: 'poulpe',   name: 'Poulpe',    age: 4,  nat: 'Récif',    club: 'Octopus',          league: 'Animaux', value: 140, positions: ['AM','CM','LM','RM'],former: [], emoji: '🐙', bio: '8 bras = touche le ballon partout. Polyvalent total.' },
  { id: 'renard',   name: 'Renard',    age: 5,  nat: 'Forêt',    club: 'Roux',             league: 'Animaux', value: 130, positions: ['AM','SS','RW'],     former: [], emoji: '🦊', bio: 'Rusé, lit les défenses, finition fine.' },
  { id: 'singe',    name: 'Singe',     age: 6,  nat: 'Jungle',   club: 'Canopée',          league: 'Animaux', value: 90,  positions: ['CM','AM','LM','RM'],former: [], emoji: '🐒', bio: 'Dribble extravagant, prend des risques.' },
  { id: 'cheval',   name: 'Cheval',    age: 7,  nat: 'Steppe',   club: 'Galop',            league: 'Animaux', value: 110, positions: ['CM','DM','RM','LM'],former: [], emoji: '🐴', bio: 'Box-to-box infatigable, course continue.' },
  { id: 'loup',     name: 'Loup',      age: 6,  nat: 'Toundra',  club: 'Meute',            league: 'Animaux', value: 120, positions: ['CM','DM'],          former: [], emoji: '🐺', bio: 'Joue en meute. Pressing collectif, dur sur l\'homme.' },

  // ===== Défenseurs / DM =====
  { id: 'rhinoceros',name:'Rhinocéros',age: 12, nat: 'Savane',   club: 'Corne',            league: 'Animaux', value: 90,  positions: ['CB','DM'],          former: [], emoji: '🦏', bio: 'Charge irrésistible, dur à passer dans l\'axe.' },
  { id: 'crocodile',name: 'Crocodile', age: 30, nat: 'Marais',   club: 'Nil',              league: 'Animaux', value: 100, positions: ['CB','DM'],          former: [], emoji: '🐊', bio: 'Attend l\'erreur, mâchoires en sortie de balle.' },
  { id: 'gorille',  name: 'Gorille',   age: 14, nat: 'Forêt',    club: 'Mountain',         league: 'Animaux', value: 110, positions: ['CB'],               former: [], emoji: '🦍', bio: 'Roc inamovible, dégage au cuir comme à la tête.' },
  { id: 'serpent',  name: 'Serpent',   age: 7,  nat: 'Désert',   club: 'Cobra',            league: 'Animaux', value: 95,  positions: ['DM','CB','CM'],     former: [], emoji: '🐍', bio: 'Frappe sec, intercepte avant l\'erreur adverse.' },
  { id: 'mangouste',name: 'Mangouste', age: 4,  nat: 'Bush',     club: 'Rapide',           league: 'Animaux', value: 75,  positions: ['DM','RB','LB'],     former: [], emoji: '🦡', bio: 'Petit mais venimeux, anticipe et récupère.' },
  { id: 'tortue',   name: 'Tortue',    age: 80, nat: 'Galápagos',club: 'Vétéran',          league: 'Animaux', value: 50,  positions: ['CB','GK'],          former: [], emoji: '🐢', bio: 'Lent mais blindé. Carapace = solidité défensive.' },
  { id: 'cerf',     name: 'Cerf',      age: 6,  nat: 'Forêt',    club: 'Bois',             league: 'Animaux', value: 70,  positions: ['CB','LB','RB'],     former: [], emoji: '🦌', bio: 'Bonds élégants, jeu de tête supérieur.' },

  // ===== Gardiens =====
  { id: 'aigle',    name: 'Aigle',     age: 12, nat: 'Aire',     club: 'Royal',            league: 'Animaux', value: 130, positions: ['GK'],               former: [], emoji: '🦅', bio: 'Vue à 8 km, plongée chirurgicale.' },
  { id: 'pingouin', name: 'Pingouin',  age: 7,  nat: 'Antarctique',club:'Glace',           league: 'Animaux', value: 80,  positions: ['GK'],               former: [], emoji: '🐧', bio: 'Réflexes au sol, peu mobile mais solide.' },
  { id: 'pieuvre',  name: 'Pieuvre',   age: 4,  nat: 'Abysses',  club: 'Encre',            league: 'Animaux', value: 100, positions: ['GK','AM'],          former: [], emoji: '🐙', bio: 'Tentacules partout, déjoue les attaquants.' },
  { id: 'caméléon', name: 'Caméléon',  age: 5,  nat: 'Forêt',    club: 'Caché',            league: 'Animaux', value: 85,  positions: ['GK','CB'],          former: [], emoji: '🦎', bio: 'Anticipe, lit le tireur, langue éclair.' },
];

window.ANIMALS = window.ANIMALS.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
console.log('[Drafter] Animaux chargés :', window.ANIMALS.length);
