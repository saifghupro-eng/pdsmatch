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
  const resultBonus = victoire ? 3 : nul ? 1 : 0;

  if (pos === 'ATQ') return buts * 3 + passD * 2 + note + resultBonus + mvp;
  if (pos === 'MIL') return buts * 2 + passD * 3 + note + resultBonus + mvp;
  if (pos === 'DEF') return cs * 3 + buts + passD + note * 1.5 + resultBonus + mvp;
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

/**
 * Génère 2 ou 3 équipes équilibrées selon le paramètre `numTeams`.
 * Pour 3 équipes : divise les joueurs en 3 groupes les plus équilibrés possible.
 */
export function generateTeams(players, numTeams = 2) {
  if (players.length < numTeams) {
    const empty = { teamA: [], teamB: [], teamC: [], pctA: 50, pctB: 50, pctC: 0, balance: 'N/A' };
    return empty;
  }

  // Power = dynamic_level si dispo, sinon level, sinon 5
  // + bonus_pts admin normalisé (divisé par 10 pour rester dans la même échelle)
  const scored = players.map(p => {
    const base  = parseFloat(p.dynamic_level || p.level || 5);
    const bonus = parseFloat(p.bonus_pts || 0) / 10;
    return { ...p, power: Math.max(0, base + bonus) };
  });

  // ── CAS 2 ÉQUIPES (comportement original) ──
  if (numTeams === 2) {
    const n = scored.length;
    const half = Math.floor(n / 2);
    let bestA, bestB, bestDiff = Infinity;

    if (n <= 16) {
      function* combinations(arr, size) {
        if (size === 0) { yield []; return; }
        if (arr.length < size) return;
        const [first, ...rest] = arr;
        for (const combo of combinations(rest, size - 1)) yield [first, ...combo];
        yield* combinations(rest, size);
      }
      for (const groupA of combinations(scored, half)) {
        const idsA = new Set(groupA.map(p => p.id));
        const groupB = scored.filter(p => !idsA.has(p.id));
        const sumA = groupA.reduce((s, p) => s + p.power, 0);
        const sumB = groupB.reduce((s, p) => s + p.power, 0);
        const diff = Math.abs(sumA - sumB);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestA = groupA;
          bestB = groupB;
          if (diff === 0) break;
        }
      }
    } else {
      const sorted = [...scored].sort((a, b) => b.power - a.power);
      bestA = []; bestB = [];
      sorted.forEach((p) => {
        const powerA = bestA.reduce((s, x) => s + x.power, 0);
        const powerB = bestB.reduce((s, x) => s + x.power, 0);
        if (bestA.length < bestB.length) bestA.push(p);
        else if (bestB.length < bestA.length) bestB.push(p);
        else (powerA <= powerB ? bestA : bestB).push(p);
      });
      bestDiff = Math.abs(
        bestA.reduce((s, p) => s + p.power, 0) -
        bestB.reduce((s, p) => s + p.power, 0)
      );
    }

    const powerA = bestA.reduce((s, p) => s + p.power, 0);
    const powerB = bestB.reduce((s, p) => s + p.power, 0);
    const total  = powerA + powerB;
    const pctA   = total > 0 ? Math.round((powerA / total) * 100) : 50;
    const diff   = Math.abs(powerA - powerB);
    const balance =
      diff < 0.5  ? 'Parfait ⚖️' :
      diff < 2    ? 'Équilibré ✅' :
      'Déséquilibré ⚠️';

    return { teamA: bestA, teamB: bestB, teamC: [], pctA, pctB: 100 - pctA, pctC: 0, balance };
  }

  // ── CAS 3 ÉQUIPES ──
  // Algorithme greedy snake-draft : trie par puissance décroissante,
  // distribue en zigzag A→B→C→C→B→A→A→B→C… (meilleur équilibre possible en O(n))
  const sorted = [...scored].sort((a, b) => b.power - a.power);
  const teamA = [], teamB = [], teamC = [];
  const teams3 = [teamA, teamB, teamC];

  sorted.forEach((p, i) => {
    // Trouver l'équipe avec la somme la plus faible parmi celles avec le moins de joueurs
    const minSize = Math.min(teamA.length, teamB.length, teamC.length);
    const candidates = teams3.filter(t => t.length === minSize);
    // Parmi les candidates, choisir celle avec la plus faible somme de power
    const target = candidates.reduce((best, t) => {
      const sumBest = best.reduce((s, p) => s + p.power, 0);
      const sumT    = t.reduce((s, p) => s + p.power, 0);
      return sumT < sumBest ? t : best;
    });
    target.push(p);
  });

  const powerA = teamA.reduce((s, p) => s + p.power, 0);
  const powerB = teamB.reduce((s, p) => s + p.power, 0);
  const powerC = teamC.reduce((s, p) => s + p.power, 0);
  const total3 = powerA + powerB + powerC || 1;
  const pctA3  = Math.round((powerA / total3) * 100);
  const pctB3  = Math.round((powerB / total3) * 100);
  const pctC3  = 100 - pctA3 - pctB3;

  const maxPower = Math.max(powerA, powerB, powerC);
  const minPower = Math.min(powerA, powerB, powerC);
  const diff3 = maxPower - minPower;
  const balance3 =
    diff3 < 0.5 ? 'Parfait ⚖️' :
    diff3 < 2   ? 'Équilibré ✅' :
    'Déséquilibré ⚠️';

  return { teamA, teamB, teamC, pctA: pctA3, pctB: pctB3, pctC: pctC3, balance: balance3 };
}

// pts = suggested point weight for each criterion (helps players understand the note /10)
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