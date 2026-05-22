// pages/match.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { calcScore, getFunComment, RATING_SCALE } from '../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../lib/helpers';
import { toast } from '../components/Toast';

const TEAM_META = {
  A: { color: 'var(--neon)',  label: 'Éq. A' },
  B: { color: 'var(--blue)',  label: 'Éq. B' },
  C: { color: 'var(--gold)',  label: 'Éq. C' },
};

// Toutes les combinaisons possibles
const COMBOS = [['A','B'], ['A','C'], ['B','C'], ['A','B','C']];

export default function MatchPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab]           = useState('list');
  const [players, setPlayers]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [matches, setMatches]   = useState([]);
  const [loading, setLoading]   = useState(true);

  // ── Création ──
  const [matchName, setMatchName]   = useState('');
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10));
  const [lieu, setLieu]             = useState('');
  const [scoreA, setScoreA]         = useState(0);
  const [scoreB, setScoreB]         = useState(0);
  const [scoreC, setScoreC]         = useState(0);
  const [useSession, setUseSession] = useState(true);
  const [selectedSession, setSelectedSession] = useState('');
  const [customPlayers, setCustomPlayers]     = useState([]);
  const [playerTeams, setPlayerTeams]         = useState({});
  // Équipes choisies pour la création (ex: ['A','B'] ou ['A','C']…)
  const [createTeams, setCreateTeams] = useState(['A', 'B']);

  // ── Stats ──
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

  // Équipes effectivement présentes dans un match (depuis match_players)
  function detectTeams(matchPlayers) {
    const t = [...new Set((matchPlayers || []).map(mp => mp.team))].sort();
    return t.length >= 2 ? t : ['A', 'B'];
  }

  // Score d'une équipe depuis l'objet match
  function getScore(m, t) {
    if (t === 'A') return m.score_a ?? 0;
    if (t === 'B') return m.score_b ?? 0;
    return m.score_c ?? 0;
  }

  async function createMatch() {
    if (!isAdmin) { toast('🔒 Connexion admin requise'); return; }
    let mpRows = [];

    if (useSession && selectedSession) {
      const sess = sessions.find(s => s.id === selectedSession);
      if (!sess) { toast('Session introuvable'); return; }
      // N'importer que les joueurs des équipes sélectionnées
      if (createTeams.includes('A')) (sess.team_a || []).forEach(pid => mpRows.push({ player_id: pid, team: 'A' }));
      if (createTeams.includes('B')) (sess.team_b || []).forEach(pid => mpRows.push({ player_id: pid, team: 'B' }));
      if (createTeams.includes('C')) (sess.team_c || []).forEach(pid => mpRows.push({ player_id: pid, team: 'C' }));
    } else {
      if (customPlayers.length < 2) { toast('Sélectionne au moins 2 joueurs'); return; }
      const missing = customPlayers.filter(pid => !playerTeams[pid]);
      if (missing.length) { toast('Assigne une équipe à chaque joueur'); return; }
      // Vérifier que seules les équipes de createTeams sont utilisées
      const invalidTeam = customPlayers.find(pid => !createTeams.includes(playerTeams[pid]));
      if (invalidTeam) { toast('Un joueur est assigné à une équipe non sélectionnée'); return; }
      mpRows = customPlayers.map(pid => ({ player_id: pid, team: playerTeams[pid] }));
    }
    if (!mpRows.length) { toast('Aucun joueur sélectionné'); return; }

    const scorePayload = { score_a: 0, score_b: 0, score_c: 0 };
    if (createTeams.includes('A')) scorePayload.score_a = parseInt(scoreA) || 0;
    if (createTeams.includes('B')) scorePayload.score_b = parseInt(scoreB) || 0;
    if (createTeams.includes('C')) scorePayload.score_c = parseInt(scoreC) || 0;

    const { data: match, error } = await supabase.from('matches').insert({
      name: matchName.trim() || `Match du ${new Date().toLocaleDateString('fr-FR')}`,
      date, lieu: lieu.trim() || null,
      ...scorePayload,
    }).select().single();
    if (error) { toast('❌ Erreur création match'); return; }

    const { error: mpErr } = await supabase.from('match_players').insert(
      mpRows.map(r => ({ match_id: match.id, player_id: r.player_id, team: r.team }))
    );
    if (mpErr) { toast(`❌ Erreur ajout joueurs : ${mpErr.message}`); return; }

    toast('✅ Match créé !');
    setMatchName(''); setLieu(''); setScoreA(0); setScoreB(0); setScoreC(0);
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
    const at = detectTeams(m.match_players);
    const form = {};
    (m.match_players || []).forEach(mp => {
      const existing = (m.match_stats || []).find(s => s.player_id === mp.player_id);
      const pos  = mp.players?.pos || 'MIL';
      const team = mp.team;
      const myScore  = getScore(m, team);
      const maxScore = Math.max(...at.map(t => getScore(m, t)));
      const winners  = at.filter(t => getScore(m, t) === maxScore);
      const conceded = at.filter(t => t !== team).reduce((s, t) => s + getScore(m, t), 0);
      form[mp.player_id] = {
        buts:        existing?.buts        ?? 0,
        pass_d:      existing?.pass_d      ?? 0,
        clean_sheet: existing?.clean_sheet ?? (pos === 'DEF' && conceded === 0 ? 1 : 0),
        note:        existing?.note        ?? 5,
        victoire:    existing?.victoire    ?? (winners.length === 1 && winners[0] === team),
        nul:         existing?.nul         ?? (winners.length > 1 && winners.includes(team)),
        pos, name: mp.players?.name || '?', team,
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

  function setAllResult(winnerTeam) {
    setStatsForm(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(pid => {
        next[pid] = {
          ...next[pid],
          victoire: winnerTeam !== 'nul' && next[pid].team === winnerTeam,
          nul: winnerTeam === 'nul',
        };
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
      presence_bonus: 0,
      score_calc:     calcScore(s.pos, { ...s, mvp_bonus: statsMvp === pid ? 1 : 0 }),
    }));

    await supabase.from('matches').update({
      mvp_id:  statsMvp || null,
      score_a: statsMatch?.score_a ?? 0,
      score_b: statsMatch?.score_b ?? 0,
      score_c: statsMatch?.score_c ?? 0,
    }).eq('id', statsMatchId);

    const { error } = await supabase.from('match_stats').upsert(rows, { onConflict: 'match_id,player_id' });
    if (error) { toast('❌ Erreur sauvegarde stats'); setSaving(false); return; }

    for (const [pid, s] of Object.entries(statsForm)) {
      const { data: allStats } = await supabase.from('match_stats')
        .select('*, players(pos)').eq('player_id', pid);
      if (allStats?.length) {
        const scores  = allStats.map(st => calcScore(st.players?.pos || 'MIL', st));
        const avg     = scores.reduce((a, b) => a + b, 0) / scores.length;
        const newLevel = Math.min(10, Math.max(1, Math.round(avg / 3)));
        await supabase.from('players').update({ level: newLevel }).eq('id', pid);
      }
    }

    toast('✅ Stats enregistrées !');
    setSaving(false);
    await loadAll();
    const m = matches.find(x => x.id === statsMatchId);
    if (m) initStatsForm({ ...m, match_stats: rows });
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
  const activeMatchTeams = statsMatch ? detectTeams(statsMatch.match_players) : ['A', 'B'];

  // Session sélectionnée pour la création
  const selectedSess = sessions.find(s => s.id === selectedSession);
  const sessionHas3  = !!(selectedSess?.team_c?.length);

  return (
    <div className="page">
      <div className="tab-row">
        <button className={`tab${tab === 'list'   ? ' active' : ''}`} onClick={() => setTab('list')}>📋 Matchs</button>
        <button className={`tab${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>➕ Créer</button>
        <button className={`tab${tab === 'stats'  ? ' active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
      </div>

      {/* ══ LIST ══ */}
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
            const teams    = detectTeams(m.match_players);
            const scores   = teams.map(t => getScore(m, t));
            const maxScore = Math.max(...scores);
            const winners  = teams.filter(t => getScore(m, t) === maxScore);
            const winLabel = winners.length > 1 ? '🤝 Nul' : `🏆 ${winners[0]}`;
            const nb       = (m.match_players || []).length;
            const hasStats = (m.match_stats || []).length > 0;
            const mvpP     = m.mvp_id ? (m.match_players || []).find(mp => mp.player_id === m.mvp_id)?.players : null;
            return (
              <div key={m.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="match-name">{m.name || 'Match'}</div>
                    <div className="match-meta">
                      {fmtDate(m.date)}{m.lieu ? ` · ${m.lieu}` : ''} · {nb} joueurs · {winLabel}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {mvpP && <span className="mvp-pill">⭐ {mvpP.name}</span>}
                      <span className="pill">{hasStats ? '✅ Stats' : '⏳ En attente'}</span>
                      {teams.length === 3 && <span className="pill" style={{ color: 'var(--gold)' }}>🔺 3 équipes</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="match-score" style={{ fontSize: teams.length === 3 ? '0.88rem' : undefined }}>
                      {teams.map((t, i) => (
                        <span key={t}>
                          {i > 0 && <span className="match-score-sep"> – </span>}
                          <span style={{ color: TEAM_META[t].color, fontWeight: 800 }}>{t}</span>
                          <span>{getScore(m, t)}</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 6 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { selectMatchForStats(m.id); setTab('stats'); }}>📊</button>
                      {isAdmin && <button className="btn btn-danger btn-xs" onClick={() => deleteMatch(m.id)}>🗑️</button>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ CREATE ══ */}
      {tab === 'create' && (
        <div className="card">
          <div className="card-title">Nouveau match</div>

          {/* ── ÉTAPE 1 : Équipes qui s'affrontent ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
              ⚔️ Quelles équipes s'affrontent ?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COMBOS.map(combo => {
                const key      = combo.join('');
                const isActive = createTeams.length === combo.length && combo.every(t => createTeams.includes(t));
                return (
                  <button key={key}
                    onClick={() => { setCreateTeams(combo); setCustomPlayers([]); setPlayerTeams({}); setSelectedSession(''); }}
                    style={{
                      flex: 1, minWidth: 72, padding: '9px 6px', borderRadius: 10,
                      fontSize: '0.82rem', fontWeight: 800, fontFamily: 'var(--font-head)',
                      border: '1.5px solid', cursor: 'pointer', textAlign: 'center',
                      background: isActive ? 'var(--neon-dim)' : 'var(--bg3)',
                      color: isActive ? 'var(--neon)' : 'var(--muted)',
                      borderColor: isActive ? 'var(--neon)' : 'var(--border)',
                      transition: 'all 0.15s',
                    }}>
                    {combo.map((t, i) => (
                      <span key={t}>
                        <span style={{ color: TEAM_META[t].color }}>{t}</span>
                        {i < combo.length - 1 && <span style={{ color: 'var(--muted)', margin: '0 3px', fontWeight: 400 }}>vs</span>}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Infos du match ── */}
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

          {/* ── ÉTAPE 2 : Score ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
              🥅 Score final
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16 }}>
              {createTeams.map((t, i) => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {i > 0 && <span style={{ fontSize: '1.4rem', color: 'var(--muted)', fontWeight: 300, paddingBottom: 6 }}>–</span>}
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: TEAM_META[t].color, fontFamily: 'var(--font-head)', letterSpacing: '0.05em' }}>
                      ÉQ. {t}
                    </span>
                    <input type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      value={t === 'A' ? scoreA : t === 'B' ? scoreB : scoreC}
                      onChange={e => t === 'A' ? setScoreA(e.target.value) : t === 'B' ? setScoreB(e.target.value) : setScoreC(e.target.value)}
                      style={{
                        width: 68, textAlign: 'center', fontSize: '2rem', fontWeight: 900,
                        background: 'var(--bg3)', border: `2px solid ${TEAM_META[t].color}`,
                        borderRadius: 12, color: TEAM_META[t].color, padding: '8px 0',
                        fontFamily: 'var(--font-head)',
                      }} />
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* ── ÉTAPE 3 : Joueurs ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className={`btn btn-sm ${useSession ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseSession(true)}>📋 Depuis session</button>
            <button className={`btn btn-sm ${!useSession ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseSession(false)}>✏️ Manuel</button>
          </div>

          {useSession ? (
            <div className="field">
              <label>Session enregistrée</label>
              <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
                <option value="">— Choisir une session —</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{(s.team_c || []).length ? ' 🔺' : ''}
                  </option>
                ))}
              </select>
              {sessions.length === 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                  Aucune session. Génère d'abord des équipes dans "Équipes".
                </p>
              )}
              {selectedSess && createTeams.includes('C') && !sessionHas3 && (
                <p style={{ fontSize: '0.72rem', color: '#ff5555', marginTop: 4 }}>
                  ⚠️ Cette session n'a pas d'équipe C.
                </p>
              )}
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                Assigne chaque joueur à une équipe ({createTeams.join(', ')})
              </div>
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
                          {/* N'afficher que les boutons des équipes sélectionnées */}
                          {createTeams.map(t => (
                            <button key={t}
                              onClick={() => setPlayerTeams(prev => ({ ...prev, [p.id]: t }))}
                              style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: '0.8rem',
                                fontWeight: 700, fontFamily: 'var(--font-head)',
                                border: '1.5px solid', cursor: 'pointer',
                                background: team === t
                                  ? (t === 'A' ? 'var(--neon-dim)' : t === 'B' ? 'var(--blue-dim)' : 'rgba(245,197,24,0.15)')
                                  : 'transparent',
                                color: TEAM_META[t].color,
                                borderColor: TEAM_META[t].color,
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

      {/* ══ STATS ══ */}
      {tab === 'stats' && (
        <div>
          {/* Sélection du match */}
          <div className="card">
            <div className="card-title">Sélectionner un match</div>
            <select value={statsMatchId} onChange={e => {
              setStatsMatchId(e.target.value);
              const m = matches.find(x => x.id === e.target.value);
              if (m) initStatsForm(m);
            }}>
              <option value="">— Choisir un match —</option>
              {matches.map(m => {
                const t = detectTeams(m.match_players);
                const s = t.map(tk => `${tk}${getScore(m, tk)}`).join('–');
                return (
                  <option key={m.id} value={m.id}>
                    {m.name || 'Match'} · {fmtDate(m.date)} · {s}{t.length === 3 ? ' 🔺' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {statsMatchId && matchPlayers.length > 0 && (
            <>
              {/* Score en grand + résultat rapide */}
              {isAdmin && statsMatch && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, marginBottom: 14 }}>
                    {activeMatchTeams.map((t, i) => (
                      <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {i > 0 && <span style={{ fontSize: '1.4rem', color: 'var(--muted)', fontWeight: 300, paddingBottom: 6 }}>–</span>}
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: TEAM_META[t].color, fontFamily: 'var(--font-head)', letterSpacing: '0.05em' }}>
                            ÉQ. {t}
                          </span>
                          <input type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                            value={t === 'A' ? (statsMatch.score_a ?? 0) : t === 'B' ? (statsMatch.score_b ?? 0) : (statsMatch.score_c ?? 0)}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setStatsMatch(prev => ({
                                ...prev,
                                ...(t === 'A' ? { score_a: val } : t === 'B' ? { score_b: val } : { score_c: val }),
                              }));
                            }}
                            style={{
                              width: 68, textAlign: 'center', fontSize: '2rem', fontWeight: 900,
                              background: 'var(--bg3)', border: `2px solid ${TEAM_META[t].color}`,
                              borderRadius: 12, color: TEAM_META[t].color, padding: '8px 0',
                              fontFamily: 'var(--font-head)',
                            }} />
                        </span>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {activeMatchTeams.map(t => (
                      <button key={t} className="btn btn-ghost btn-sm"
                        style={{ flex: 1, borderColor: TEAM_META[t].color, color: TEAM_META[t].color }}
                        onClick={() => setAllResult(t)}>
                        🏆 {TEAM_META[t].label}
                      </button>
                    ))}
                    <button className="btn btn-ghost btn-sm"
                      style={{ flex: 1, borderColor: 'var(--muted)', color: 'var(--muted)' }}
                      onClick={() => setAllResult('nul')}>
                      🤝 Nul
                    </button>
                  </div>
                </div>
              )}

              {/* Joueurs par équipe */}
              {activeMatchTeams.map(t => {
                const tPlayers = matchPlayers.filter(p => p.team === t);
                if (!tPlayers.length) return null;
                return (
                  <div key={t}>
                    <div className="section-label" style={{ color: TEAM_META[t].color }}>
                      {TEAM_META[t].label}
                    </div>
                    {tPlayers.map(({ pid, pos, name }) => (
                      <StatRow key={pid} pid={pid} pos={pos} name={name} team={t}
                        s={statsForm[pid] || {}} mvp={statsMvp}
                        onStat={handleStat} onResult={setResult} onMvp={setStatsMvp}
                        disabled={!isAdmin} />
                    ))}
                  </div>
                );
              })}

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
  const isDef     = pos === 'DEF';
  const note      = parseFloat(s.note ?? 5);
  const result    = s.victoire ? 'win' : s.nul ? 'nul' : 'loss';
  const comment   = getFunComment(pos, calcScore(pos, s), s);
  const liveScore = Math.round(calcScore(pos, { ...s, mvp_bonus: mvp === pid ? 1 : 0 }) * 10) / 10;
  const teamColor = TEAM_META[team]?.color || 'var(--muted)';
  const avatarCls2 = team === 'A' ? 'av-def' : team === 'B' ? 'av-mid' : 'av-att';

  return (
    <div className="stat-player-card">
      <div className="stat-player-header">
        <div className={`avatar ${avatarCls2}`} style={{ width: 40, height: 40, fontSize: '0.85rem' }}>
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

      <div className="stat-grid">
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

        <div style={{
          gridColumn: '1 / -1', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginBottom: 4,
        }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            📋 Barème {pos} — aide à la note /10
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(RATING_SCALE[pos] || []).map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--muted2)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: '0.85rem' }}>{c.icon}</span>
                  <span>{c.label}</span>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--neon)', background: 'var(--neon-dim)', border: '1px solid var(--neon-dim)', borderRadius: 4, padding: '1px 7px', fontSize: '0.68rem' }}>
                  +{c.pts} pts
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.62rem', color: 'var(--muted)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 5 }}>
            💡 Additionne les critères réussis pour obtenir la note. Max = 10.
          </div>
        </div>

        <div className="note-slider-wrap">
          <div className="stat-label">⭐ Note globale</div>
          <div className="note-display">
            <div className="note-num">{note}</div>
            <input type="range" min={0} max={10} step={0.5} value={note} disabled={disabled}
              style={{ flex: 1 }} onChange={e => onStat(pid, 'note', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="result-btns">
        <button className={`result-btn${result === 'win'  ? ' r-win'  : ''}`} disabled={disabled} onClick={() => onResult(pid, 'win')}>🏆 Victoire</button>
        <button className={`result-btn${result === 'nul'  ? ' r-nul'  : ''}`} disabled={disabled} onClick={() => onResult(pid, 'nul')}>🤝 Nul</button>
        <button className={`result-btn${result === 'loss' ? ' r-loss' : ''}`} disabled={disabled} onClick={() => onResult(pid, 'loss')}>💀 Défaite</button>
      </div>

      <button className={`mvp-toggle${mvp === pid ? ' active' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && onMvp(mvp === pid ? '' : pid)}>
        ⭐ {mvp === pid ? 'MVP sélectionné !' : 'Désigner MVP'}
      </button>

      <div className="fun-comment">
        <span style={{ fontSize: '1rem' }}>{comment.emoji}</span>
        <span>{comment.text}</span>
      </div>
    </div>
  );
}