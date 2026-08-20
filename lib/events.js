// lib/events.js
// Catalogue d'événements + calcul des notes par axe — Vague 1 (sans vidéo).
//
// Principe : match_events est le journal fin (source de vérité pour le détail).
// À chaque événement ajouté/retiré, on resynchronise match_stats (note, buts,
// pass_d) pour ce joueur/match — le reste du site (calcScore, classement,
// comparateur, fiche joueur) continue de lire match_stats sans modification.

import { supabase } from './supabase';
import { calcScore } from './score';

// Poids "cible" des 5 axes — modifiables ici pour une prochaine saison.
export const AXIS_WEIGHTS = { attaque: 0.25, defense: 0.25, jeu: 0.20, impact: 0.20, engagement: 0.10 };

// Impact n'a pas encore de source de données en Vague 1 (il sera alimenté par
// l'évaluation des observateurs en Vague 2). En attendant, la note provisoire
// se calcule sur les 4 autres axes, renormalisés pour sommer à 1.
const PROVISIONAL_WEIGHTS = (() => {
  const { impact, ...rest } = AXIS_WEIGHTS;
  const sum = Object.values(rest).reduce((a, b) => a + b, 0);
  const out = {};
  Object.entries(rest).forEach(([k, w]) => { out[k] = w / sum; });
  return out;
})();

export const EVENT_CATALOG = {
  attaque: {
    label: 'Attaque', icon: '⚽', weight: AXIS_WEIGHTS.attaque,
    events: [
      { key: 'but',       label: 'But',             delta: 3   },
      { key: 'passe',     label: 'Passe décisive',  delta: 2   },
      { key: 'occasion',  label: 'Occasion créée',  delta: 1.5 },
      { key: 'appel',     label: 'Appel dangereux', delta: 1   },
      { key: 'perte_att', label: 'Perte dangereuse', delta: -1 },
    ],
  },
  defense: {
    label: 'Défense', icon: '🛡️', weight: AXIS_WEIGHTS.defense,
    events: [
      { key: 'interception', label: 'Interception',     delta: 1.5  },
      { key: 'duel',         label: 'Duel gagné',       delta: 1    },
      { key: 'tacle',        label: 'Tacle décisif',    delta: 2    },
      { key: 'occ_empechee', label: 'Occasion empêchée', delta: 1.5 },
      { key: 'erreur_def',   label: 'Erreur défensive', delta: -1.5 },
    ],
  },
  jeu: {
    label: 'Jeu', icon: '🎯', weight: AXIS_WEIGHTS.jeu,
    events: [
      { key: 'bonne_dec',    label: 'Bonne décision',     delta: 1  },
      { key: 'conservation', label: 'Bonne conservation', delta: 1  },
      { key: 'mauvaise_dec', label: 'Mauvaise décision',  delta: -1 },
      { key: 'perte',        label: 'Perte de balle',     delta: -1 },
    ],
  },
  impact: {
    // Pas d'événements propres : dérivé des actions marquantes des autres
    // axes + de l'évaluation des observateurs (Vague 2). Évite de compter
    // deux fois une même action.
    label: 'Impact', icon: '⚡', weight: AXIS_WEIGHTS.impact,
    events: [],
  },
  engagement: {
    label: 'Engagement', icon: '🔥', weight: AXIS_WEIGHTS.engagement,
    events: [
      { key: 'pressing', label: 'Pressing',        delta: 1  },
      { key: 'effort',   label: 'Gros effort',     delta: 1  },
      { key: 'manque',   label: "Manque d'effort", delta: -1 },
    ],
  },
};

export function axisRaw(events, axis) {
  return events.filter(e => e.axis === axis).reduce((s, e) => s + Number(e.delta), 0);
}

export function axisHasData(events, axis) {
  return events.some(e => e.axis === axis);
}

// Note d'un axe : base neutre à 5, ajustée par les événements, plafonnée 0-10.
// Retourne null tant qu'aucun événement n'a été tapé sur cet axe (→ affichage "—").
export function axisScore(events, axis) {
  if (!axisHasData(events, axis)) return null;
  return Math.max(0, Math.min(10, 5 + axisRaw(events, axis)));
}

export function hasAnyEvent(events) {
  return events.length > 0;
}

// Note globale provisoire (hors Impact, en attendant la Vague 2).
// Retourne null tant qu'aucun événement n'existe pour ce joueur sur ce match
// — jamais un 5.0 par défaut.
export function computeNoteFromEvents(events) {
  if (!hasAnyEvent(events)) return null;
  let total = 0;
  Object.entries(PROVISIONAL_WEIGHTS).forEach(([axis, w]) => {
    const s = axisScore(events, axis);
    total += (s === null ? 5 : s) * w;
  });
  return Math.round(total * 10) / 10;
}

export function countByKey(events, key) {
  return events.filter(e => e.event_key === key).length;
}

// Journal complet d'un joueur sur un match, du plus récent au plus ancien —
// utilisé pour l'affichage détaillé + suppression au choix dans le panneau.
export async function fetchPlayerEvents(matchId, playerId) {
  const { data, error } = await supabase
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Enregistre un événement en base puis resynchronise match_stats pour ce
 * joueur/match (note recalculée, buts/pass_d recomptés). C'est ce qui
 * garde tout le reste du site fonctionnel sans changement.
 */
export async function logEvent({ matchId, playerId, axis, eventKey, label, delta, secondaryPlayerId = null }) {
  const { error } = await supabase.from('match_events').insert({
    match_id: matchId,
    player_id: playerId,
    axis, event_key: eventKey, label, delta,
    secondary_player_id: secondaryPlayerId,
  });
  if (error) throw error;
  await syncMatchStats(matchId, playerId);
}

// Annule le tout dernier événement enregistré sur ce match, tous joueurs
// confondus — raccourci rapide pendant la notation (bouton "Annuler" + Ctrl+Z),
// pas besoin de rouvrir le joueur concerné.
export async function undoLastEventGlobal(matchId) {
  const { data: last } = await supabase
    .from('match_events')
    .select('id, player_id')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return null;
  await supabase.from('match_events').delete().eq('id', last.id);
  await syncMatchStats(matchId, last.player_id);
  return last;
}

// Supprime UN événement précis, quel que soit son rang dans le journal
// (pas forcément le dernier) — permet de corriger un joueur/match dans
// n'importe quel ordre depuis le journal détaillé du panneau.
export async function deleteEvent(matchId, playerId, eventId) {
  const { error } = await supabase.from('match_events').delete().eq('id', eventId);
  if (error) throw error;
  await syncMatchStats(matchId, playerId);
}

async function syncMatchStats(matchId, playerId) {
  const { data: events, error: evErr } = await supabase
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .eq('player_id', playerId);
  if (evErr) { console.error('[events] fetch match_events failed', evErr); throw evErr; }

  const note  = computeNoteFromEvents(events || []) ?? 5;
  const buts  = countByKey(events || [], 'but');
  const passD = countByKey(events || [], 'passe');

  // On récupère la ligne existante pour ne pas écraser les champs que les
  // événements ne gèrent pas encore (clean sheet, victoire/nul, mvp) —
  // ils restent saisis ailleurs (résultat du match) pour l'instant.
  const { data: existing, error: exErr } = await supabase
    .from('match_stats')
    .select('*')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (exErr) { console.error('[events] fetch existing match_stats failed', exErr); throw exErr; }

  const { data: playerRow } = await supabase.from('players').select('pos').eq('id', playerId).maybeSingle();
  const pos = playerRow?.pos || 'MIL';

  const merged = {
    match_id: matchId,
    player_id: playerId,
    note,
    buts,
    pass_d: passD,
    clean_sheet:    existing?.clean_sheet    ?? 0,
    victoire:       existing?.victoire       ?? false,
    nul:            existing?.nul            ?? false,
    mvp_bonus:      existing?.mvp_bonus      ?? 0,
    presence_bonus: existing?.presence_bonus ?? 0,
  };
  merged.score_calc = calcScore(pos, merged);

  // upsert (et non select+insert/update séparés) : même pattern que
  // l'ancien saveStats(), qui confirme la contrainte unique match_id+player_id.
  const { error } = await supabase
    .from('match_stats')
    .upsert(merged, { onConflict: 'match_id,player_id' });
  if (error) { console.error('[events] upsert match_stats failed', error); throw error; }
}