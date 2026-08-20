// pages/notation.js
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  EVENT_CATALOG, axisScore, computeNoteFromEvents,
  logEvent, undoLastEventGlobal, deleteEvent, fetchPlayerEvents,
} from '../lib/events';
import { initials, fmtDate } from '../lib/helpers';
import { toast } from '../components/Toast';

export default function Notation() {
  const router = useRouter();
  const { matchId } = router.query;
  const { isAdmin, loading: authLoading } = useAuth();

  const [match, setMatch]               = useState(null);
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [eventsByPlayer, setEventsByPlayer] = useState({}); // { [playerId]: event[] }
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState(false);

  // view: { mode: 'grid' } | { mode: 'panel', playerId } | { mode: 'assist', scorerId }
  const [view, setView] = useState({ mode: 'grid' });

  const load = useCallback(async (mid) => {
    setLoading(true);
    const [{ data: m }, { data: mp }, { data: evs }] = await Promise.all([
      supabase.from('matches').select('*').eq('id', mid).single(),
      supabase.from('match_players').select('*, players(name)').eq('match_id', mid),
      supabase.from('match_events').select('*').eq('match_id', mid).order('created_at', { ascending: true }),
    ]);
    setMatch(m || null);
    setMatchPlayers(mp || []);
    const grouped = {};
    (evs || []).forEach(e => {
      if (!grouped[e.player_id]) grouped[e.player_id] = [];
      grouped[e.player_id].push(e);
    });
    setEventsByPlayer(grouped);
    setLoading(false);
  }, []);

  useEffect(() => { if (matchId) load(matchId); }, [matchId, load]);

  function eventsFor(pid) { return eventsByPlayer[pid] || []; }

  async function refreshPlayer(pid) {
    const list = await fetchPlayerEvents(matchId, pid);
    setEventsByPlayer(prev => ({ ...prev, [pid]: [...list].reverse() })); // stocké croissant pour rester cohérent avec load()
  }

  async function handleLogEvent(pid, axis, ev, secondaryPlayerId = null) {
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      await logEvent({ matchId, playerId: pid, axis, eventKey: ev.key, label: ev.label, delta: ev.delta, secondaryPlayerId });
      await refreshPlayer(pid);
    } catch {
      toast('❌ Erreur enregistrement');
    }
    setBusy(false);
  }

  async function handleUndoGlobal() {
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      const undone = await undoLastEventGlobal(matchId);
      if (undone) {
        toast('↩️ Dernière action annulée');
        await refreshPlayer(undone.player_id);
      }
    } catch {
      toast('❌ Erreur lors de l\'annulation');
    }
    setBusy(false);
  }

  async function handleDeleteEvent(pid, eventId) {
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      await deleteEvent(matchId, pid, eventId);
      await refreshPlayer(pid);
    } catch {
      toast('❌ Erreur suppression');
    }
    setBusy(false);
  }

  // Ctrl+Z global → annule la dernière action, où qu'on soit dans l'UI
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndoGlobal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchId, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || loading) {
    return <div className="page"><div className="loading" style={{ marginTop: '4rem' }}><div className="spinner" />Chargement…</div></div>;
  }

  if (!matchId) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon">🎬</div>
          <p>Ouvre cette page depuis un match : <code>/notation?matchId=...</code></p>
          <p><Link href="/match" style={{ color: 'var(--neon)' }}>← Retour aux matchs</Link></p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon">🤔</div>
          <p>Match introuvable.</p>
        </div>
      </div>
    );
  }

  const lastEvent = findLastEvent(eventsByPlayer);
  const teams = {};
  matchPlayers.forEach(mp => {
    if (!teams[mp.team]) teams[mp.team] = [];
    teams[mp.team].push(mp);
  });

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
            🎬 {match.name || 'Match'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{fmtDate(match.date)} · Mode notation</div>
        </div>
        {isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={handleUndoGlobal} disabled={busy || !lastEvent}
            style={{ opacity: lastEvent ? 1 : 0.4 }}>
            ↩️ Annuler{lastEvent ? ` · ${lastEvent.label}` : ''}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="card" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          🔒 Connecte-toi en admin pour enregistrer des événements. <Link href="/admin" style={{ color: 'var(--neon)' }}>Se connecter</Link>
        </div>
      )}

      {view.mode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {Object.entries(teams).map(([team, players]) => (
            <div key={team} className="card" style={{ padding: '10px 8px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6, paddingLeft: 4 }}>
                Équipe {team}
              </div>
              {players.map(mp => {
                const note = computeNoteFromEvents(eventsFor(mp.player_id));
                const count = eventsFor(mp.player_id).length;
                return (
                  <div key={mp.player_id} className="lb-row" style={{ cursor: 'pointer', padding: '8px 4px' }}
                    onClick={() => setView({ mode: 'panel', playerId: mp.player_id })}>
                    <div className="avatar av-mid" style={{ width: 30, height: 30, fontSize: '0.65rem', flexShrink: 0 }}>
                      {initials(mp.players?.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mp.players?.name}
                      </div>
                      {count > 0 && <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{count} évén.</div>}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: note === null ? 'var(--muted)' : 'var(--neon)' }}>
                      {note === null ? '—' : note}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view.mode === 'panel' && (
        <PlayerPanel
          playerId={view.playerId}
          matchPlayers={matchPlayers}
          events={eventsFor(view.playerId)}
          disabled={!isAdmin || busy}
          onBack={() => setView({ mode: 'grid' })}
          onEvent={(axis, ev) => {
            if (ev.key === 'but') {
              setView({ mode: 'assist', scorerId: view.playerId });
            } else {
              handleLogEvent(view.playerId, axis, ev);
            }
          }}
          onDeleteEvent={(eventId) => handleDeleteEvent(view.playerId, eventId)}
        />
      )}

      {view.mode === 'assist' && (
        <AssistStep
          scorerId={view.scorerId}
          matchPlayers={matchPlayers}
          disabled={busy}
          onPick={async (assistId) => {
            const butEv = EVENT_CATALOG.attaque.events.find(e => e.key === 'but');
            const passeEv = EVENT_CATALOG.attaque.events.find(e => e.key === 'passe');
            await handleLogEvent(view.scorerId, 'attaque', butEv, assistId || null);
            if (assistId) await handleLogEvent(assistId, 'attaque', passeEv, view.scorerId);
            setView({ mode: 'panel', playerId: view.scorerId });
          }}
          onCancel={() => setView({ mode: 'panel', playerId: view.scorerId })}
        />
      )}
    </div>
  );
}

function findLastEvent(eventsByPlayer) {
  let latest = null;
  Object.values(eventsByPlayer).forEach(list => {
    list.forEach(e => {
      if (!latest || new Date(e.created_at) > new Date(latest.created_at)) latest = e;
    });
  });
  return latest;
}

function PlayerPanel({ playerId, matchPlayers, events, disabled, onBack, onEvent, onDeleteEvent }) {
  const mp = matchPlayers.find(x => x.player_id === playerId);
  const note = computeNoteFromEvents(events);
  const sortedDesc = [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="Retour">←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{mp?.players?.name}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
            {events.length} événement{events.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: note === null ? 'var(--muted)' : 'var(--neon)' }}>
          {note === null ? '—' : note}
        </div>
      </div>

      {/* Barres par axe */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {Object.entries(EVENT_CATALOG).map(([axis, cat]) => {
          const s = axisScore(events, axis);
          return (
            <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, textAlign: 'center' }}>{cat.icon}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s === null ? 0 : s * 10}%`, background: 'var(--neon)' }} />
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--muted)', width: 30, textAlign: 'right' }}>
                {s === null ? '—' : s}
              </span>
            </div>
          );
        })}
      </div>

      {/* Boutons d'événements par catégorie */}
      {Object.entries(EVENT_CATALOG).map(([axis, cat]) => (
        <div key={axis} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: 6 }}>{cat.icon} {cat.label}</div>
          {!cat.events.length ? (
            <div style={{ fontSize: '0.66rem', color: 'var(--muted)', fontStyle: 'italic' }}>
              Calculé automatiquement (évaluation observateurs à venir)
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cat.events.map(ev => (
                <button key={ev.key} className="btn btn-ghost btn-sm" disabled={disabled}
                  style={{ color: ev.delta >= 0 ? 'var(--fg)' : '#ff5555' }}
                  onClick={() => onEvent(axis, ev)}>
                  {ev.label} {ev.delta > 0 ? '+' : ''}{ev.delta}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Journal complet — suppression dans n'importe quel ordre */}
      {sortedDesc.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 8 }}>Journal du match</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedDesc.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: '0.78rem', padding: '6px 8px', background: 'var(--bg2)', borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span>{EVENT_CATALOG[e.axis]?.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                  <span style={{ color: e.delta >= 0 ? 'var(--neon)' : '#ff5555', flexShrink: 0 }}>
                    {e.delta > 0 ? '+' : ''}{e.delta}
                  </span>
                </div>
                <button className="btn btn-ghost btn-xs" disabled={disabled}
                  onClick={() => onDeleteEvent(e.id)} aria-label={`Supprimer ${e.label}`}
                  style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssistStep({ scorerId, matchPlayers, disabled, onPick, onCancel }) {
  const scorer = matchPlayers.find(x => x.player_id === scorerId);
  const teammates = matchPlayers.filter(x => x.team === scorer?.team && x.player_id !== scorerId);
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Annuler">←</button>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>⚽ But de</div>
          <div style={{ fontWeight: 700 }}>{scorer?.players?.name}</div>
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 10 }}>Passe décisive de :</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teammates.map(mp => (
          <button key={mp.player_id} className="btn btn-ghost" disabled={disabled}
            style={{ textAlign: 'left' }} onClick={() => onPick(mp.player_id)}>
            {mp.players?.name}
          </button>
        ))}
        <button className="btn btn-ghost" disabled={disabled}
          style={{ textAlign: 'left', color: 'var(--muted)' }} onClick={() => onPick(null)}>
          Solo, pas de passe
        </button>
      </div>
    </div>
  );
}