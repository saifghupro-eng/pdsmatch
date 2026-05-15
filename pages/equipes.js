// pages/equipes.js
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { generateTeams } from '../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../lib/helpers';
import { toast } from '../components/Toast';

export default function Equipes() {
  const { isAdmin } = useAuth();
  const [players, setPlayers]         = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [selected, setSelected]       = useState([]);
  const [teams, setTeams]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sessionName, setSessionName] = useState('');
  const [savedId, setSavedId]         = useState(null);
  const [editedPos, setEditedPos]     = useState({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: pls }, { data: sess }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setPlayers(pls || []);
    setSessions(sess || []);
    setLoading(false);
  }

  function togglePlayer(p) {
    setSelected(prev => {
      const next = prev.find(x => x.id === p.id)
        ? prev.filter(x => x.id !== p.id)
        : [...prev, p];
      setTeams(null); setSavedId(null);
      return next;
    });
  }

  const gen = useCallback(() => {
    if (selected.length < 2) { toast('Sélectionne au moins 2 joueurs'); return; }
    const withEdits = selected.map(p => ({ ...p, pos: editedPos[p.id] || p.pos }));
    const arr = [...withEdits];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setTeams(generateTeams(arr));
    setSavedId(null);
  }, [selected, editedPos]);

  async function saveSession() {
    if (!isAdmin) { toast('🔒 Connexion admin requise'); return; }
    if (!teams) { toast('Génère d\'abord les équipes'); return; }
    const name = sessionName.trim() || `Session du ${new Date().toLocaleDateString('fr-FR')}`;
    const { data, error } = await supabase.from('sessions').insert({
      name,
      team_a: teams.teamA.map(p => p.id),
      team_b: teams.teamB.map(p => p.id),
    }).select().single();
    if (error) { toast('❌ Erreur sauvegarde'); return; }
    toast('✅ Session sauvegardée !');
    setSavedId(data.id);
    setSessionName('');
    await loadAll();
  }

  async function deleteSession(id) {
    if (!isAdmin) return;
    if (!confirm('Supprimer cette session ?')) return;
    await supabase.from('sessions').delete().eq('id', id);
    toast('Session supprimée');
    await loadAll();
  }

  const POSITIONS = ['ATQ', 'MIL', 'DEF'];

  return (
    <div className="page">
      {/* Sessions récentes */}
      {sessions.length > 0 && (
        <div className="card">
          <div className="card-title">Sessions récentes</div>
          {sessions.slice(0, 5).map(s => {
            const getName = pid => players.find(p => p.id === pid)?.name || '?';
            const allIds = [...(s.team_a || []), ...(s.team_b || [])];
            return (
              <div key={s.id} className={`session-card${savedId === s.id ? ' selected' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
                      {fmtDate(s.created_at?.slice(0, 10))} · {allIds.length} joueurs
                    </div>
                    <div style={{ fontSize: '0.72rem', marginTop: 5, lineHeight: 1.6 }}>
                      <span style={{ color: 'var(--neon)', fontWeight: 700 }}>A : </span>
                      <span style={{ color: 'var(--muted2)' }}>
                        {(s.team_a || []).map(id => getName(id)).join(', ')}
                      </span>
                      <br />
                      <span style={{ color: 'var(--blue)', fontWeight: 700 }}>B : </span>
                      <span style={{ color: 'var(--muted2)' }}>
                        {(s.team_b || []).map(id => getName(id)).join(', ')}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="btn btn-danger btn-xs" onClick={() => deleteSession(s.id)}>🗑️</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generator */}
      <div className="card">
        <div className="card-title">Générer des équipes équilibrées</div>
        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <div className="player-grid">
            {players.map(p => {
              const isSel = !!selected.find(x => x.id === p.id);
              const pos = editedPos[p.id] || p.pos;
              return (
                <div key={p.id} onClick={() => togglePlayer(p)}
                  className={`player-card${isSel ? ' selected' : ''}`}>
                  <div className={`avatar ${avatarCls(pos)}`} style={{ width: 36, height: 36, fontSize: '0.8rem' }}>
                    {initials(p.name)}
                  </div>
                  <div className="player-name">{p.name}</div>
                  <span className={`pos-tag ${posCls(pos)}`} style={{ fontSize: '0.6rem' }}>{pos}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          {selected.length >= 2 && selected.length % 2 === 0 && (
            <span style={{ color: 'var(--neon)' }}>✓ Nombre pair</span>
          )}
          {selected.length >= 2 && selected.length % 2 !== 0 && (
            <span style={{ color: 'var(--gold)' }}>⚠ Nombre impair</span>
          )}
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={gen}>⚡ Générer ({selected.length})</button>
          {teams && <button className="btn btn-ghost" onClick={gen}>🔀 Remélanger</button>}
          {selected.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected([]); setTeams(null); }}>
              Tout déselectionner
            </button>
          )}
        </div>
      </div>

      {/* Teams result */}
      {teams && (
        <>
          <div className="team-display">
            {[
              { label: 'Éq. A', players: teams.teamA, cls: 'team-a', color: 'var(--neon)' },
              { label: 'Éq. B', players: teams.teamB, cls: 'team-b', color: 'var(--blue)' },
            ].map(({ label, players: tpls, cls, color }) => (
              <div key={label} className={`team-box ${cls}`}>
                <h3 style={{ color }}>{label} <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontWeight: 400 }}>{tpls.length}</span></h3>
                {tpls.map(p => {
                  const pos = editedPos[p.id] || p.pos;
                  return (
                    <div key={p.id} className="team-player">
                      <div className={`avatar ${avatarCls(pos)}`} style={{ width: 28, height: 28, fontSize: '0.65rem', flexShrink: 0 }}>
                        {initials(p.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="team-player-name" style={{ fontSize: '0.82rem' }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                          {POSITIONS.map(pos2 => (
                            <button key={pos2}
                              onClick={e => {
                                e.stopPropagation();
                                setEditedPos(prev => ({ ...prev, [p.id]: pos2 }));
                              }}
                              style={{
                                padding: '1px 5px',
                                borderRadius: 4,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                border: '1px solid',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-head)',
                                letterSpacing: '0.3px',
                                background: pos === pos2
                                  ? (pos2 === 'ATQ' ? 'var(--att-dim)' : pos2 === 'MIL' ? 'var(--mid-dim)' : 'var(--def-dim)')
                                  : 'transparent',
                                color: pos2 === 'ATQ' ? 'var(--att)' : pos2 === 'MIL' ? 'var(--mid)' : 'var(--def)',
                                borderColor: pos2 === 'ATQ' ? 'var(--att)' : pos2 === 'MIL' ? 'var(--mid)' : 'var(--def)',
                              }}>
                              {pos2}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Balance bar */}
          <div className="balance-bar-wrap">
            <div className="balance-labels">
              <span style={{ color: 'var(--neon)' }}>Éq.A {teams.pctA}%</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{teams.balance}</span>
              <span style={{ color: 'var(--blue)' }}>{teams.pctB}% Éq.B</span>
            </div>
            <div className="balance-track">
              <div className="balance-fill" style={{ width: teams.pctA + '%' }} />
            </div>
          </div>

          {/* Save */}
          {isAdmin ? (
            <div className="card">
              <div className="card-title">Sauvegarder la session</div>
              <div className="field">
                <label>Nom de la session</label>
                <input value={sessionName} onChange={e => setSessionName(e.target.value)}
                  placeholder={`Session du ${new Date().toLocaleDateString('fr-FR')}`}
                  onKeyDown={e => e.key === 'Enter' && saveSession()} />
              </div>
              <button className="btn btn-primary" onClick={saveSession}>💾 Sauvegarder</button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
              🔒 Connecte-toi en admin pour sauvegarder la session.
            </div>
          )}
        </>
      )}
    </div>
  );
}
