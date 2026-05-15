// pages/match.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { calcScore, getFunComment } from '../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../lib/helpers';
import { toast } from '../components/Toast';

export default function MatchPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab]         = useState('list');
  const [players, setPlayers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [matches, setMatches]   = useState([]);
  const [loading, setLoading]   = useState(true);

  // New match form
  const [matchName, setMatchName]   = useState('');
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10));
  const [lieu, setLieu]             = useState('');
  const [scoreA, setScoreA]         = useState(0);
  const [scoreB, setScoreB]         = useState(0);
  const [useSession, setUseSession] = useState(true);
  const [selectedSession, setSelectedSession] = useState('');
  const [customPlayers, setCustomPlayers]     = useState([]);
  const [playerTeams, setPlayerTeams]         = useState({});

  // Stats form
  const [statsMatchId, setStatsMatchId] = useState('');
  const [statsMatch, setStatsMatch]     = useState(null);
  const [statsForm, setStatsForm]       = useState({});
  const [statsMvp, setStatsMvp]         = useState('');
  const [saving, setSaving]             = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: pls }, { data: mts }, { data: sess }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('matches')
        .select('*, match_players(*, players(*)), match_stats(*)')
        .order('date', { ascending: false }),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setPlayers(pls || []);
    setMatches(mts || []);
    setSessions(sess || []);
    setLoading(false);
  }

  async function createMatch() {
    if (!isAdmin) { toast('🔒 Connexion admin requise'); return; }
    let mpRows = [];
    if (useSession && selectedSession) {
      const sess = sessions.find(s => s.id === selectedSession);
      if (!sess) { toast('Session introuvable'); return; }
      (sess.team_a || []).forEach(pid => mpRows.push({ player_id: pid, team: 'A' }));
      (sess.team_b || []).forEach(pid => mpRows.push({ player_id: pid, team: 'B' }));
    } else {
      if (customPlayers.length < 2) { toast('Sélectionne au moins 2 joueurs'); return; }
      const missing = customPlayers.filter(pid => !playerTeams[pid]);
      if (missing.length) { toast('Assigne une équipe à chaque joueur'); return; }
      mpRows = customPlayers.map(pid => ({ player_id: pid, team: playerTeams[pid] }));
    }
    if (!mpRows.length) { toast('Aucun joueur sélectionné'); return; }

    const { data: match, error } = await supabase.from('matches').insert({
      name: matchName.trim() || `Match du ${new Date().toLocaleDateString('fr-FR')}`,
      date, lieu: lieu.trim() || null,
      score_a: parseInt(scoreA) || 0,
      score_b: parseInt(scoreB) || 0,
    }).select().single();
    if (error) { toast('❌ Erreur création match'); return; }

    const { error: mpErr } = await supabase.from('match_players').insert(
      mpRows.map(r => ({ match_id: match.id, player_id: r.player_id, team: r.team }))
    );
    if (mpErr) { toast('❌ Erreur ajout joueurs'); return; }

    toast('✅ Match créé !');
    setMatchName(''); setLieu(''); setScoreA(0); setScoreB(0);
    setSelectedSession(''); setCustomPlayers([]); setPlayerTeams({});
    await loadAll();
    setStatsMatchId(match.id);
    setTab('stats');
    setTimeout(async () => {
      const { data: m } = await supabase.from('matches')
        .select('*, match_players(*, players(*)), match_stats(*)')
        .eq('id', match.id).single();
      if (m) initStatsForm(m);
    }, 400);
  }

  function initStatsForm(m) {
    const form = {};
    (m.match_players || []).forEach(mp => {
      const existing = (m.match_stats || []).find(s => s.player_id === mp.player_id);
      const pos = mp.players?.pos || 'MIL';
      const team = mp.team;
      // Auto clean sheet: DEF whose team conceded 0 goals
      const teamConceded = team === 'A' ? (m.score_b || 0) : (m.score_a || 0);
      const autoCleanSheet = pos === 'DEF' && teamConceded === 0 ? 1 : 0;
      form[mp.player_id] = {
        buts:        existing?.buts        ?? 0,
        pass_d:      existing?.pass_d      ?? 0,
        clean_sheet: existing?.clean_sheet ?? autoCleanSheet,
        note:        existing?.note        ?? 5,
        victoire:    existing?.victoire    ?? (m.score_a > m.score_b ? mp.team === 'A' : m.score_b > m.score_a ? mp.team === 'B' : false),
        nul:         existing?.nul         ?? (m.score_a === m.score_b),
        pos,
        name: mp.players?.name || '?',
        team,
      };
    });
    setStatsMvp(m.mvp_id || '');
    setStatsForm(form);
    setStatsMatch(m);
  }

  function selectMatchForStats(mid) {
    setStatsMatchId(mid);
    const m = matches.find(x => x.id === mid);
    if (m) initStatsForm(m);
  }

  function handleStat(pid, field, value) {
    setStatsForm(prev => ({ ...prev, [pid]: { ...prev[pid], [field]: value } }));
  }

  function setResult(pid, result) {
    setStatsForm(prev => ({
      ...prev,
      [pid]: { ...prev[pid], victoire: result === 'win', nul: result === 'nul' },
    }));
  }

  function setAllResult(result) {
    setStatsForm(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(pid => {
        if (result === 'teamB') {
          next[pid] = { ...next[pid], victoire: next[pid].team === 'B', nul: false };
        } else {
          next[pid] = { ...next[pid], victoire: result === 'win', nul: result === 'nul' };
        }
      });
      return next;
    });
  }

  async function saveStats() {
    if (!isAdmin) { toast('🔒 Connexion admin requise'); return; }
    if (!statsMatchId) { toast('Sélectionne un match'); return; }
    setSaving(true);
    const rows = Object.entries(statsForm).map(([pid, s]) => ({
      match_id:       statsMatchId,
      player_id:      pid,
      buts:           parseInt(s.buts) || 0,
      pass_d:         parseInt(s.pass_d) || 0,
      clean_sheet:    parseInt(s.clean_sheet) || 0,
      note:           parseFloat(s.note) || 5,
      victoire:       !!s.victoire,
      nul:            !!s.nul,
      mvp_bonus:      statsMvp === pid ? 1 : 0,
      presence_bonus: 0.5,
      score_calc:     calcScore(s.pos, { ...s, mvp_bonus: statsMvp === pid ? 1 : 0, presence_bonus: 0.5 }),
    }));

    await supabase.from('matches').update({
      mvp_id: statsMvp || null,
      score_a: statsMatch?.score_a ?? 0,
      score_b: statsMatch?.score_b ?? 0,
    }).eq('id', statsMatchId);

    const { error } = await supabase.from('match_stats').upsert(rows, {
      onConflict: 'match_id,player_id',
    });
    if (error) { toast('❌ Erreur sauvegarde stats'); setSaving(false); return; }

    // Update player levels
    for (const [pid, s] of Object.entries(statsForm)) {
      const { data: allStats } = await supabase.from('match_stats')
        .select('*, players(pos)').eq('player_id', pid);
      if (allStats?.length) {
        const scores = allStats.map(st => calcScore(st.players?.pos || 'MIL', st));
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const newLevel = Math.min(10, Math.max(1, Math.round(avg / 3)));
        await supabase.from('players').update({ level: newLevel }).eq('id', pid);
      }
    }

    toast('✅ Stats enregistrées !');
    setSaving(false);
    await loadAll();
    const m = matches.find(x => x.id === statsMatchId);
    if (m) initStatsForm({ ...m, match_stats: rows.map(r => ({ ...r, player_id: r.player_id })) });
  }

  async function deleteMatch(id) {
    if (!isAdmin) return;
    if (!confirm('Supprimer ce match et toutes ses stats ?')) return;
    await supabase.from('matches').delete().eq('id', id);
    toast('Match supprimé');
    if (statsMatchId === id) { setStatsMatchId(''); setStatsForm({}); setStatsMatch(null); }
    await loadAll();
  }

  const matchPlayers = Object.entries(statsForm).map(([pid, s]) => ({ pid, ...s }));
  const teamAPlayers = matchPlayers.filter(p => p.team === 'A');
  const teamBPlayers = matchPlayers.filter(p => p.team === 'B');

  return (
    <div className="page">
      <div className="tab-row">
        <button className={`tab${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>📋 Matchs</button>
        <button className={`tab${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>➕ Créer</button>
        <button className={`tab${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
      </div>

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div className="card">
          <div className="card-title">Tous les matchs</div>
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : !matches.length ? (
            <div className="empty">
              <div className="empty-icon">⚽</div>
              <p>Aucun match — crée le premier !</p>
            </div>
          ) : matches.map(m => {
            const winner = m.score_a > m.score_b ? '🟢 A' : m.score_b > m.score_a ? '🔵 B' : '🤝 Nul';
            const nb = (m.match_players || []).length;
            const hasStats = (m.match_stats || []).length > 0;
            const mvpP = m.mvp_id
              ? (m.match_players || []).find(mp => mp.player_id === m.mvp_id)?.players
              : null;
            return (
              <div key={m.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="match-name">{m.name || 'Match'}</div>
                    <div className="match-meta">
                      {fmtDate(m.date)}{m.lieu ? ` · ${m.lieu}` : ''} · {nb} joueurs · {winner}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {mvpP && <span className="mvp-pill">⭐ {mvpP.name}</span>}
                      <span className="pill">{hasStats ? '✅ Stats' : '⏳ En attente'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="match-score">
                      {m.score_a}<span className="match-score-sep"> – </span>{m.score_b}
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 6 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { selectMatchForStats(m.id); setTab('stats'); }}>
                        📊
                      </button>
                      {isAdmin && (
                        <button className="btn btn-danger btn-xs" onClick={() => deleteMatch(m.id)}>🗑️</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE ── */}
      {tab === 'create' && (
        <div className="card">
          <div className="card-title">Nouveau match</div>

          <div className="row2">
            <div className="field">
              <label>Nom (optionnel)</label>
              <input value={matchName} onChange={e => setMatchName(e.target.value)}
                placeholder={`Match du ${new Date().toLocaleDateString('fr-FR')}`} />
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Lieu (optionnel)</label>
            <input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Terrain Moulin" />
          </div>

          <div className="row2">
            <div className="field">
              <label>Score Éq. A</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} value={scoreA} onChange={e => setScoreA(e.target.value)} />
            </div>
            <div className="field">
              <label>Score Éq. B</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} value={scoreB} onChange={e => setScoreB(e.target.value)} />
            </div>
          </div>

          {/* Session or manual */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              className={`btn btn-sm ${useSession ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseSession(true)}>
              📋 Depuis session
            </button>
            <button
              className={`btn btn-sm ${!useSession ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseSession(false)}>
              ✏️ Manuel
            </button>
          </div>

          {useSession ? (
            <div className="field">
              <label>Session enregistrée</label>
              <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
                <option value="">— Choisir une session —</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {sessions.length === 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                  Aucune session. Génère d'abord des équipes dans "Équipes".
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="card-title" style={{ marginBottom: 8 }}>Joueurs & équipes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {players.map(p => {
                  const isSel = customPlayers.includes(p.id);
                  const team  = playerTeams[p.id];
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', background: 'var(--bg3)',
                      borderRadius: 12, border: '1.5px solid var(--border)',
                    }}>
                      <input type="checkbox" checked={isSel}
                        onChange={e => {
                          if (e.target.checked) setCustomPlayers(prev => [...prev, p.id]);
                          else {
                            setCustomPlayers(prev => prev.filter(x => x !== p.id));
                            setPlayerTeams(prev => { const n = { ...prev }; delete n[p.id]; return n; });
                          }
                        }}
                        style={{ width: 18, height: 18, accentColor: 'var(--neon)' }} />
                      <div className={`avatar ${avatarCls(p.pos)}`} style={{ width: 30, height: 30, fontSize: '0.7rem', flexShrink: 0 }}>
                        {initials(p.name)}
                      </div>
                      <div style={{ flex: 1, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem' }}>{p.name}</div>
                      {isSel && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['A', 'B'].map(t => (
                            <button key={t}
                              onClick={() => setPlayerTeams(prev => ({ ...prev, [p.id]: t }))}
                              style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem',
                                fontWeight: 700, fontFamily: 'var(--font-head)',
                                border: '1.5px solid',
                                cursor: 'pointer',
                                background: team === t ? (t === 'A' ? 'var(--neon-dim)' : 'var(--blue-dim)') : 'transparent',
                                color: t === 'A' ? 'var(--neon)' : 'var(--blue)',
                                borderColor: t === 'A' ? 'var(--neon)' : 'var(--blue)',
                              }}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {isAdmin && (
            <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} onClick={createMatch}>
              ✅ Créer le match
            </button>
          )}
          {!isAdmin && (
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)', marginTop: 12 }}>
              🔒 Connexion admin requise pour créer un match.
            </p>
          )}
        </div>
      )}

      {/* ── STATS ── */}
      {tab === 'stats' && (
        <div>
          {/* Match selector */}
          <div className="card">
            <div className="card-title">Sélectionner un match</div>
            <select value={statsMatchId} onChange={e => {
              setStatsMatchId(e.target.value);
              const m = matches.find(x => x.id === e.target.value);
              if (m) initStatsForm(m);
            }}>
              <option value="">— Choisir un match —</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || 'Match'} · {fmtDate(m.date)} · {m.score_a}–{m.score_b}
                </option>
              ))}
            </select>
          </div>

          {statsMatchId && matchPlayers.length > 0 && (
            <>
              {/* Score edit */}
              {isAdmin && statsMatch && (
                <div className="card">
                  <div className="card-title">Score du match</div>
                  <div className="row2">
                    <div className="field">
                      <label>Équipe A</label>
                      <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} value={statsMatch.score_a}
                        onChange={e => setStatsMatch(prev => ({ ...prev, score_a: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="field">
                      <label>Équipe B</label>
                      <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} value={statsMatch.score_b}
                        onChange={e => setStatsMatch(prev => ({ ...prev, score_b: parseInt(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--neon)', color: 'var(--neon)' }}
                      onClick={() => setAllResult('win')}>🏆 Éq.A gagne</button>
                    <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                      onClick={() => setAllResult('nul')}>🤝 Match nul</button>
                    <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}
                      onClick={() => setAllResult('teamB')}>🏆 Éq.B gagne</button>
                  </div>
                </div>
              )}

              {/* Team A */}
              <div className="section-label">Équipe A</div>
              {teamAPlayers.map(({ pid, pos, name }) => (
                <StatRow key={pid} pid={pid} pos={pos} name={name} team="A"
                  s={statsForm[pid] || {}} mvp={statsMvp}
                  onStat={handleStat} onResult={setResult} onMvp={setStatsMvp}
                  disabled={!isAdmin} />
              ))}

              <div className="section-label">Équipe B</div>
              {teamBPlayers.map(({ pid, pos, name }) => (
                <StatRow key={pid} pid={pid} pos={pos} name={name} team="B"
                  s={statsForm[pid] || {}} mvp={statsMvp}
                  onStat={handleStat} onResult={setResult} onMvp={setStatsMvp}
                  disabled={!isAdmin} />
              ))}

              {statsMvp && (
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <span className="mvp-pill" style={{ fontSize: '0.85rem', padding: '6px 16px' }}>
                    ⭐ MVP — {matchPlayers.find(p => p.pid === statsMvp)?.name || '?'}
                  </span>
                  {isAdmin && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setStatsMvp('')}>
                      Retirer
                    </button>
                  )}
                </div>
              )}

              {isAdmin && (
                <button className="btn btn-primary btn-full" onClick={saveStats} disabled={saving}>
                  {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer les stats'}
                </button>
              )}
            </>
          )}

          {statsMatchId && matchPlayers.length === 0 && !loading && (
            <div className="empty">
              <div className="empty-icon">🤔</div>
              <p>Aucun joueur associé à ce match.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── StatRow ── */
function StatRow({ pid, pos, name, team, s, mvp, onStat, onResult, onMvp, disabled }) {
  const isDef   = pos === 'DEF';
  const note    = parseFloat(s.note ?? 5);
  const result  = s.victoire ? 'win' : s.nul ? 'nul' : 'loss';
  const comment = getFunComment(pos, calcScore(pos, s), s);
  const liveScore = Math.round(calcScore(pos, { ...s, mvp_bonus: mvp === pid ? 1 : 0, presence_bonus: 0.5 }) * 10) / 10;

  const teamColor = team === 'A' ? 'var(--neon)' : 'var(--blue)';

  return (
    <div className="stat-player-card">
      {/* Header */}
      <div className="stat-player-header">
        <div className={`avatar ${team === 'A' ? 'av-def' : 'av-mid'}`} style={{ width: 40, height: 40, fontSize: '0.85rem' }}>
          {initials(name)}
        </div>
        <div style={{ flex: 1 }}>
          <div className="stat-player-name">
            {name}
            <span className={`pos-tag ${posCls(pos)}`}>{pos}</span>
            <span style={{ fontSize: '0.7rem', color: teamColor, fontWeight: 700, fontFamily: 'var(--font-head)' }}>
              Éq.{team}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-live-score">{liveScore}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>pts</div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {!isDef && (
          <div>
            <div className="stat-label">⚽ Buts</div>
            <div className="counter-row">
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'buts', Math.max(0, (parseInt(s.buts) || 0) - 1))}>−</button>
              <div className="counter-val">{s.buts ?? 0}</div>
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'buts', (parseInt(s.buts) || 0) + 1)}>+</button>
            </div>
          </div>
        )}
        {!isDef && (
          <div>
            <div className="stat-label">🎯 Passes D.</div>
            <div className="counter-row">
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'pass_d', Math.max(0, (parseInt(s.pass_d) || 0) - 1))}>−</button>
              <div className="counter-val">{s.pass_d ?? 0}</div>
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'pass_d', (parseInt(s.pass_d) || 0) + 1)}>+</button>
            </div>
          </div>
        )}
        {isDef && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="stat-label">🧤 Clean Sheet</div>
            <div className="counter-row">
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'clean_sheet', Math.max(0, (parseInt(s.clean_sheet) || 0) - 1))}>−</button>
              <div className="counter-val">{s.clean_sheet ?? 0}</div>
              <button className="counter-btn" disabled={disabled}
                onClick={() => onStat(pid, 'clean_sheet', (parseInt(s.clean_sheet) || 0) + 1)}>+</button>
            </div>
          </div>
        )}

        {/* Note slider */}
        <div className="note-slider-wrap">
          <div className="stat-label">⭐ Note globale</div>
          <div className="note-display">
            <div className="note-num">{note}</div>
            <input type="range" min={0} max={10} step={0.5} value={note} disabled={disabled}
              style={{ flex: 1 }}
              onChange={e => onStat(pid, 'note', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="result-btns">
        <button className={`result-btn${result === 'win' ? ' r-win' : ''}`} disabled={disabled}
          onClick={() => onResult(pid, 'win')}>🏆 Victoire</button>
        <button className={`result-btn${result === 'nul' ? ' r-nul' : ''}`} disabled={disabled}
          onClick={() => onResult(pid, 'nul')}>🤝 Nul</button>
        <button className={`result-btn${result === 'loss' ? ' r-loss' : ''}`} disabled={disabled}
          onClick={() => onResult(pid, 'loss')}>💀 Défaite</button>
      </div>

      {/* MVP */}
      <button className={`mvp-toggle${mvp === pid ? ' active' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && onMvp(mvp === pid ? '' : pid)}>
        ⭐ {mvp === pid ? 'MVP sélectionné !' : 'Désigner MVP'}
      </button>

      {/* Fun comment */}
      <div className="fun-comment">
        <span style={{ fontSize: '1rem' }}>{comment.emoji}</span>
        <span>{comment.text}</span>
      </div>
    </div>
  );
}