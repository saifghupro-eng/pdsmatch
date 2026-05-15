// lib/score.js
// Score is calculated as AVERAGE per match to be fair to occasional players

export function calcScore(pos, stats) {
  const buts      = parseInt(stats.buts || 0);
  const passD     = parseInt(stats.pass_d || 0);
  const cs        = parseInt(stats.clean_sheet || 0);
  const note      = parseFloat(stats.note || 5);
  const victoire  = stats.victoire ? 1 : 0;
  const nul       = stats.nul ? 1 : 0;
  const mvp       = parseInt(stats.mvp_bonus || 0);
  const presence  = parseFloat(stats.presence_bonus ?? 0.5);
  const resultBonus = victoire ? 3 : nul ? 1 : 0;

  if (pos === 'ATQ') return buts * 3 + passD * 2 + note + resultBonus + mvp + presence;
  if (pos === 'MIL') return buts * 2 + passD * 3 + note + resultBonus + mvp + presence;
  if (pos === 'DEF') return cs * 3 + note * 1.5 + resultBonus + mvp + presence;
  return 0;
}

/**
 * Returns both totalScore and avgScore (per match).
 * The leaderboard ranks by avgScore to be fair to occasional players.
 */
export function playerSeasonStats(allStats, pid, pos) {
  const myStats = allStats.filter(s => s.player_id === pid);
  if (!myStats.length) {
    return { totalScore: 0, avgScore: 0, buts: 0, passD: 0, wins: 0, matchCount: 0, cleanSheets: 0, mvpCount: 0, nuls: 0 };
  }
  let totalScore = 0, buts = 0, passD = 0, wins = 0, cleanSheets = 0, mvpCount = 0, nuls = 0;
  myStats.forEach(s => {
    totalScore   += calcScore(pos, s);
    buts         += parseInt(s.buts || 0);
    passD        += parseInt(s.pass_d || 0);
    if (s.victoire)       wins++;
    if (s.nul)            nuls++;
    cleanSheets  += parseInt(s.clean_sheet || 0);
    if (s.mvp_bonus > 0)  mvpCount++;
  });
  const matchCount = myStats.length;
  const avgScore   = matchCount > 0 ? Math.round((totalScore / matchCount) * 10) / 10 : 0;
  return {
    totalScore: Math.round(totalScore * 10) / 10,
    avgScore,
    buts, passD, wins, matchCount, cleanSheets, mvpCount, nuls,
  };
}

export function generateTeams(players) {
  if (players.length < 2) {
    return {
      teamA: [],
      teamB: [],
      pctA: 50,
      pctB: 50,
      balance: 'N/A'
    };
  }

  // 🔥 power simple
  const scored = players.map(p => {
    const base = p.dynamic_level || p.level || 5;

    const posBonus =
      p.pos === 'ATQ' ? 0.2 :
      p.pos === 'MIL' ? 0.1 :
      p.pos === 'DEF' ? 0.15 : 0;

    return {
      ...p,
      power: base + posBonus
    };
  });

  // 🔥 tri global (important pour équilibre équipes)
  scored.sort((a, b) => b.power - a.power);

  const teamA = [];
  const teamB = [];

  const countA = { ATQ: 0, MIL: 0, DEF: 0 };
  const countB = { ATQ: 0, MIL: 0, DEF: 0 };

  // 🔥 distribution intelligente
  scored.forEach(p => {

    const sizeA = teamA.length;
    const sizeB = teamB.length;

    let target;

    // 🔥 priorité : équilibrer la taille
    if (sizeA < sizeB) target = 'A';
    else if (sizeB < sizeA) target = 'B';
    else {
      // 🔥 si égalité → équilibre puissance + poste
      const powerA = teamA.reduce((s, x) => s + x.power, 0);
      const powerB = teamB.reduce((s, x) => s + x.power, 0);

      const diff = powerA - powerB;

      if (diff > 0) target = 'B';
      else if (diff < 0) target = 'A';
      else target = Math.random() > 0.5 ? 'A' : 'B';
    }

    if (target === 'A') {
      teamA.push(p);
      countA[p.pos || 'MIL']++;
    } else {
      teamB.push(p);
      countB[p.pos || 'MIL']++;
    }
  });

  const powerA = teamA.reduce((s, p) => s + p.power, 0);
  const powerB = teamB.reduce((s, p) => s + p.power, 0);

  const total = powerA + powerB;

  const pctA = total > 0 ? Math.round((powerA / total) * 100) : 50;

  const diff = Math.abs(powerA - powerB);

  const balance =
    diff < 1 ? 'Parfait ⚖️' :
    diff < 2.5 ? 'Équilibré ✅' :
    'Déséquilibré ⚠️';

  return {
    teamA,
    teamB,
    pctA,
    pctB: 100 - pctA,
    balance
  };
}

// pts = suggested point weight for each criterion (helps players understand the note /10)
// ATQ : 2+3+3+2 = 10 max  |  MIL : 3+2+3+2 = 10 max  |  DEF : 2+2+2+2+2 = 10 max
export const RATING_SCALE = {
  ATQ: [
    { label: 'Actif / Pressing', icon: '🔥', pts: 2 },
    { label: 'Décisif',          icon: '⚡', pts: 3 },
    { label: 'Appels de balle',  icon: '📡', pts: 3 },
    { label: 'Placement',        icon: '📍', pts: 2 },
  ],
  MIL: [
    { label: 'Vision de jeu',      icon: '👁️', pts: 3 },
    { label: 'Act. défensive',     icon: '🛡️', pts: 2 },
    { label: 'Circulation ballon', icon: '🔄', pts: 3 },
    { label: 'Impact / Duel',      icon: '💥', pts: 2 },
  ],
  DEF: [
    { label: 'Relance propre',     icon: '🎯', pts: 2 },
    { label: 'Placement défensif', icon: '📍', pts: 2 },
    { label: 'Duels / Récup.',     icon: '💪', pts: 2 },
    { label: 'Communication',      icon: '📢', pts: 2 },
    { label: 'Sauve l\'équipe',    icon: '🦸', pts: 2 },
  ],
};

export function getFunComment(pos, score, stats) {
  const buts = parseInt(stats?.buts || 0);
  const mvp  = parseInt(stats?.mvp_bonus || 0);
  const note = parseFloat(stats?.note || 5);
  const cs   = parseInt(stats?.clean_sheet || 0);
  if (mvp > 0) return { emoji: '👑', text: 'MVP de la journée, le patron !' };
  if (pos === 'ATQ') {
    if (buts >= 3) return { emoji: '🎩', text: 'Hat-trick ! Un monstre devant le but !' };
    if (buts === 2) return { emoji: '🔥', text: 'Doublé, il était partout !' };
    if (buts === 1) return { emoji: '⚽', text: 'Décisif quand il fallait !' };
    if (note >= 8)  return { emoji: '💫', text: 'Excellent sans scorer, le pressing payait !' };
    if (note <= 4)  return { emoji: '😴', text: 'Invisible… il dormait debout ?' };
    return { emoji: '🤷', text: 'Prestation correcte, peut mieux faire.' };
  }
  if (pos === 'MIL') {
    if (parseInt(stats?.pass_d || 0) >= 3) return { emoji: '🎯', text: 'Maestro ! Les passes décisives s\'enchaînent !' };
    if (note >= 8) return { emoji: '🎪', text: 'Partout sur le terrain, a régalé !' };
    if (note <= 4) return { emoji: '🐌', text: 'Moins actif qu\'un escargot sous la pluie.' };
    return { emoji: '⚙️', text: 'Bon boulot au milieu, moteur du groupe.' };
  }
  if (pos === 'DEF') {
    if (cs >= 1 && note >= 7) return { emoji: '🧱', text: 'Mur défensif ! Clean sheet mérité !' };
    if (cs >= 1) return { emoji: '🔒', text: 'Porte inviolée, mission accomplie !' };
    if (note >= 8) return { emoji: '🦁', text: 'Lion en défense, a tout repoussé !' };
    if (note <= 4) return { emoji: '🤡', text: 'Défense en carton… on a vu mieux !' };
    return { emoji: '🛡️', text: 'Solide derrière, l\'équipe pouvait compter sur lui.' };
  }
  return { emoji: '📊', text: 'Stats enregistrées.' };
}

export function getSeasonBadge(avgScore, matchCount) {
  if (matchCount === 0) return { label: 'Novice', color: '#555', emoji: '🌱' };
  if (avgScore >= 20)   return { label: 'Légende', color: '#f5c518', emoji: '👑' };
  if (avgScore >= 15)   return { label: 'Elite',   color: '#FF6B35', emoji: '🔥' };
  if (avgScore >= 11)   return { label: 'Confirmé', color: '#00ff87', emoji: '⚡' };
  if (avgScore >= 7)    return { label: 'En forme', color: '#3d9eff', emoji: '📈' };
  return { label: 'Rookie', color: '#9eaab8', emoji: '🎮' };
}