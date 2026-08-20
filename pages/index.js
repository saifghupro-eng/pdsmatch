// pages/index.js
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { playerSeasonStats } from '../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../lib/helpers';

const TEAM_DOT = { A: 'var(--blue)', B: 'var(--green)', C: 'var(--accent)' };

function detectTeams(matchPlayers) {
  const t = [...new Set((matchPlayers || []).map(mp => mp.team))].sort();
  return t.length >= 2 ? t : ['A', 'B'];
}
function getScore(m, t) {
  if (t === 'A') return m.score_a ?? 0;
  if (t === 'B') return m.score_b ?? 0;
  return m.score_c ?? 0;
}

export default function Home() {
  const [players, setPlayers]           = useState([]);
  const [seasons, setSeasons]           = useState([]);       // triées par start_date croissant
  const [seasonIndex, setSeasonIndex]   = useState(null);
  const [seasonMatches, setSeasonMatches] = useState([]);
  const [seasonStats, setSeasonStats]     = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => { init(); }, []);

  async function init() {
    const [{ data: pls }, { data: seasonsData }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('seasons').select('*').order('start_date', { ascending: true }),
    ]);
    setPlayers(pls || []);
    const list = seasonsData || [];
    setSeasons(list);
    let idx = list.findIndex(s => s.is_active);
    if (idx === -1) idx = list.length - 1;
    setSeasonIndex(idx);
    if (idx >= 0) await loadSeason(list[idx].id);
    setLoading(false);
  }

  async function loadSeason(seasonId) {
    const [{ data: mts }, { data: stats }] = await Promise.all([
      supabase.from('matches')
        .select('*, match_players(*, players(name)), match_stats(*)')
        .eq('season_id', seasonId)
        .order('date', { ascending: false }),
      supabase.from('match_stats')
        .select('*, players(name,pos), matches!inner(date, season_id)')
        .eq('matches.season_id', seasonId),
    ]);
    setSeasonMatches(mts || []);
    setSeasonStats(stats || []);
  }

  async function changeSeason(newIndex) {
    if (newIndex < 0 || newIndex >= seasons.length) return;
    setLoading(true);
    setSeasonIndex(newIndex);
    await loadSeason(seasons[newIndex].id);
    setLoading(false);
  }

  const season = seasonIndex !== null && seasonIndex >= 0 ? seasons[seasonIndex] : null;

  // ── Stats dérivées de la saison sélectionnée ──
  const scored = players
    .map(p => ({ ...p, ss: playerSeasonStats(seasonStats, p.id, p.pos) }))
    .filter(p => p.ss.matchCount > 0)
    .sort((a, b) => b.ss.avgScore - a.ss.avgScore);

  const journeesCount = new Set(seasonMatches.map(m => m.date)).size;
  const butsTotal = scored.reduce((s, p) => s + p.ss.buts, 0);

  const topButeurs  = [...scored].filter(p => p.ss.buts > 0).sort((a, b) => b.ss.buts - a.ss.buts).slice(0, 5);
  const topPasseurs = [...scored].filter(p => p.ss.passD > 0).sort((a, b) => b.ss.passD - a.ss.passD).slice(0, 5);
  const topMvp      = [...scored].filter(p => p.ss.mvpCount > 0).sort((a, b) => b.ss.mvpCount - a.ss.mvpCount).slice(0, 5);

  const lastDate = seasonMatches[0]?.date;
  const lastMatchday = seasonMatches.filter(m => m.date === lastDate);

  const podiumOrder = [scored[1], scored[0], scored[2]].filter(Boolean);

  const quickActions = [
    { href: '/match',       icon: '⚽', title: 'Nouveau match',  sub: 'Créer une rencontre' },
    { href: '/classement',  icon: '🏆', title: 'Classement',     sub: 'Voir le classement complet' },
    { href: '/equipes',     icon: '👥', title: 'Équipes',        sub: 'Tirage équilibré' },
    { href: '/comparateur', icon: '⚔️', title: 'Comparateur',    sub: 'Face à face' },
  ];

  return (
    <div className="page page-wide">
      {/* Bandeau saison */}
      {season && (
        <div className="season-banner">
          <button className="season-nav-btn" onClick={() => changeSeason(seasonIndex - 1)}
            disabled={seasonIndex <= 0} aria-label="Saison précédente">←</button>
          <div className="season-banner-info">
            <div className="season-banner-tag">
              <span className="dot" style={{ background: season.is_active ? 'var(--green)' : 'var(--muted)' }} />
              {season.is_active ? 'Saison en cours' : 'Saison terminée'}
            </div>
            <div className="season-banner-name">{season.name}</div>
            <div className="season-banner-dates">
              {fmtDate(season.start_date)} → {season.end_date ? fmtDate(season.end_date) : 'en cours'}
            </div>
          </div>
          <button className="season-nav-btn" onClick={() => changeSeason(seasonIndex + 1)}
            disabled={seasonIndex >= seasons.length - 1} aria-label="Saison suivante">→</button>
        </div>
      )}

      {!season && !loading && (
        <div className="empty">
          <div className="empty-icon">🗓️</div>
          <p>Aucune saison créée — <Link href="/admin" style={{ color: 'var(--blue)' }}>en créer une dans Admin</Link></p>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" />Chargement…</div>
      ) : season && (
        <>
          {/* Mini stats */}
          <div className="mini-stats">
            <div className="mini-stat-card">
              <div className="mini-stat-val">{players.length}</div>
              <div className="mini-stat-label">Joueurs</div>
            </div>
            <div className="mini-stat-card">
              <div className="mini-stat-val">{journeesCount}</div>
              <div className="mini-stat-label">Journées</div>
            </div>
            <div className="mini-stat-card">
              <div className="mini-stat-val">{seasonMatches.length}</div>
              <div className="mini-stat-label">Matchs</div>
            </div>
            <div className="mini-stat-card">
              <div className="mini-stat-val">{butsTotal}</div>
              <div className="mini-stat-label">Buts</div>
            </div>
          </div>

          <div className="home-grid">
            <div className="home-main">
              {/* Podium + classement */}
              <div className="card">
                <div className="card-title">Classement saison</div>
                {!scored.length ? (
                  <div className="empty">
                    <div className="empty-icon">👤</div>
                    <p>Aucun match noté sur cette saison pour l'instant.</p>
                  </div>
                ) : (
                  <>
                    {podiumOrder.length > 0 && (
                      <div className="podium" style={{ marginBottom: 18 }}>
                        {podiumOrder.map(p => {
                          const rank = scored.indexOf(p) + 1;
                          return (
                            <Link key={p.id} href={`/joueur/${p.id}`}
                              className={`podium-card${rank === 1 ? ' first' : ''}`}>
                              {rank === 1 && <div className="podium-crown">👑</div>}
                              <div className="podium-rank-badge">{rank}</div>
                              <div className={`avatar ${avatarCls(p.pos)} podium-avatar`}
                                style={{ width: rank === 1 ? 52 : 42, height: rank === 1 ? 52 : 42, fontSize: rank === 1 ? '1rem' : '0.85rem' }}>
                                {initials(p.name)}
                              </div>
                              <div className="podium-name">{p.name}</div>
                              <div className="podium-score">{p.ss.avgScore}</div>
                              <div className="podium-meta">
                                <span className="pill">🎮 {p.ss.matchCount}</span>
                                {p.ss.buts > 0 && <span className="pill">⚽ {p.ss.buts}</span>}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}

                    {scored.slice(0, 5).map((p, i) => (
                      <Link key={p.id} href={`/joueur/${p.id}`} className="lb-row"
                        style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className={`lb-rank${i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : ''}`}>
                          {i + 1}
                        </div>
                        <div className={`avatar ${avatarCls(p.pos)}`} style={{ width: 36, height: 36 }}>
                          {initials(p.name)}
                        </div>
                        <div className="lb-info">
                          <div className="lb-name">
                            {p.name}
                            <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
                          </div>
                          <div className="lb-details">
                            <span className="pill">🎮 {p.ss.matchCount}</span>
                            {p.ss.buts > 0 && <span className="pill">⚽ {p.ss.buts}</span>}
                          </div>
                        </div>
                        <div className="avg-indicator">
                          <div className="avg-val">{p.ss.avgScore}</div>
                          <div className="avg-label">moy/m</div>
                        </div>
                      </Link>
                    ))}

                    {scored.length > 5 && (
                      <div style={{ textAlign: 'center', paddingTop: 12 }}>
                        <Link href="/classement" style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>
                          Voir le classement complet →
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Dernière journée */}
              <div className="card">
                <div className="card-title">Dernière journée</div>
                {!lastMatchday.length ? (
                  <div className="empty">
                    <div className="empty-icon">⚽</div>
                    <p>Aucun match sur cette saison — <Link href="/match" style={{ color: 'var(--blue)' }}>en créer un</Link></p>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted2)', marginBottom: 4 }}>{fmtDate(lastDate)}</div>
                    {lastMatchday.map((m, i) => {
                      const teams = detectTeams(m.match_players);
                      const mvpMp = m.mvp_id ? (m.match_players || []).find(mp => mp.player_id === m.mvp_id) : null;
                      return (
                        <div key={m.id} className="mday-row">
                          <div className="mday-label">Match {i + 1}</div>
                          <div className="mday-mid">
                            <div className="mday-score-line">
                              {teams.map((t, ti) => (
                                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {ti > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> – </span>}
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TEAM_DOT[t], display: 'inline-block' }} />
                                  {getScore(m, t)}
                                </span>
                              ))}
                            </div>
                            <div className="mday-teamname">
                              {teams.map(t => `Équipe ${t}`).join(' vs ')}
                            </div>
                            {mvpMp && <div className="mday-mvp">⭐ MVP {mvpMp.players?.name}</div>}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ textAlign: 'center', paddingTop: 10 }}>
                      <Link href="/match" style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>
                        Voir tous les matchs →
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="home-side">
              {topButeurs.length > 0 && (
                <div className="card">
                  <div className="card-title">⚽ Meilleurs buteurs</div>
                  <div className="top-stat-list">
                    {topButeurs.map((p, i) => (
                      <Link key={p.id} href={`/joueur/${p.id}`} className="top-stat-row">
                        <span className="top-stat-rank">{i + 1}</span>
                        <span className="top-stat-name">{p.name}</span>
                        <span className="top-stat-val">{p.ss.buts}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {topPasseurs.length > 0 && (
                <div className="card">
                  <div className="card-title">🎯 Meilleurs passeurs</div>
                  <div className="top-stat-list">
                    {topPasseurs.map((p, i) => (
                      <Link key={p.id} href={`/joueur/${p.id}`} className="top-stat-row">
                        <span className="top-stat-rank">{i + 1}</span>
                        <span className="top-stat-name">{p.name}</span>
                        <span className="top-stat-val">{p.ss.passD}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {topMvp.length > 0 && (
                <div className="card">
                  <div className="card-title">🏆 MVP de la saison</div>
                  <div className="top-stat-list">
                    {topMvp.map((p, i) => (
                      <Link key={p.id} href={`/joueur/${p.id}`} className="top-stat-row">
                        <span className="top-stat-rank">{i + 1}</span>
                        <span className="top-stat-name">{p.name}</span>
                        <span className="top-stat-val">{p.ss.mvpCount}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-title">Actions rapides</div>
                <div className="action-list">
                  {quickActions.map(a => (
                    <Link key={a.href} href={a.href} className="action-item">
                      <div className="action-icon">{a.icon}</div>
                      <div className="action-text">
                        <div className="action-title">{a.title}</div>
                        <div className="action-sub">{a.sub}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}