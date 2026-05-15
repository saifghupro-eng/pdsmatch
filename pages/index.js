// pages/index.js
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { calcScore, getSeasonBadge, playerSeasonStats } from '../lib/score';
import { initials, avatarCls, posCls, rankCls, fmtDate } from '../lib/helpers';

export default function Home() {
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [matches,  setMatches]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: stats }, { data: mts }] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('match_stats').select('*, players(pos)'),
        supabase.from('matches')
          .select('*, match_stats(*), match_players(*, players(name,pos))')
          .order('date', { ascending: false }).limit(5),
      ]);
      setPlayers(pls || []);
      setAllStats(stats || []);
      setMatches(mts || []);
      setLoading(false);
    }
    load();
  }, []);

  const sortedPlayers = [...players].map(p => ({
    ...p, ss: playerSeasonStats(allStats, p.id, p.pos),
  })).sort((a, b) => b.ss.avgScore - a.ss.avgScore);

  const totalGoals = matches.reduce((s, m) => s + (m.score_a || 0) + (m.score_b || 0), 0);

  const quickNav = [
    { href: '/match',       icon: '⚽', label: 'Nouveau match',   sub: 'Stats & résultats',    color: 'var(--blue)' },
    { href: '/classement',  icon: '🏆', label: 'Classement',      sub: 'Top joueurs',           color: 'var(--blue)' },
    { href: '/equipes',     icon: '👥', label: 'Équipes',          sub: 'Tirage équilibré',      color: 'var(--blue)' },
  ];

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero">
        <h1>PDS<span>MATCH</span></h1>
        <p className="hero-sub">Stats · Classement · Équipes — foot entre amis</p>
        {!loading && (
          <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-val">{players.length}</div>
                <div className="hero-stat-label">Joueurs</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-val">{matches.length}</div>
                <div className="hero-stat-label">Matchs</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-val">{totalGoals}</div>
                <div className="hero-stat-label">Buts</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick nav */}
      <div className="quick-nav">
        {quickNav.map(b => (
          <Link key={b.href} href={b.href} className="quick-card"
            style={{ borderTop: `2px solid ${b.color}` }}>
            <div className="quick-card-icon">{b.icon}</div>
            <div className="quick-card-label" style={{ color: b.color }}>{b.label}</div>
            <div className="quick-card-sub">{b.sub}</div>
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Chargement…</div>
      ) : (
        <>
          {/* Top players */}
          <div className="card">
            <div className="card-title">Top joueurs · moy/match</div>
            {!sortedPlayers.length ? (
              <div className="empty">
                <div className="empty-icon">👤</div>
                <p>Aucun joueur — <Link href="/admin" style={{ color: 'var(--neon)' }}>ajouter dans Admin</Link></p>
              </div>
            ) : sortedPlayers.slice(0, 5).map((p, i) => {
              const badge = getSeasonBadge(p.ss.avgScore, p.ss.matchCount);
              return (
                <div key={p.id} className="lb-row">
                  <div className={`lb-rank ${rankCls(i)}`}>
                    {i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>
                  <div className={`avatar ${avatarCls(p.pos)}`} style={{ width: 38, height: 38 }}>
                    {initials(p.name)}
                  </div>
                  <div className="lb-info">
                    <div className="lb-name">
                      {p.name}
                      <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
                      <span className="badge" style={{
                        color: badge.color,
                        background: `${badge.color}18`,
                        borderColor: `${badge.color}40`,
                        fontSize: '0.65rem',
                      }}>{badge.emoji} {badge.label}</span>
                    </div>
                    <div className="lb-details">
                      <span className="pill">Niv.{p.level}</span>
                      <span className="pill">🎮 {p.ss.matchCount}</span>
                      {p.ss.buts > 0 && <span className="pill">⚽ {p.ss.buts}</span>}
                    </div>
                  </div>
                  <div className="avg-indicator">
                    <div className="avg-val">{p.ss.avgScore}</div>
                    <div className="avg-label">moy/m</div>
                  </div>
                </div>
              );
            })}
            {sortedPlayers.length > 5 && (
              <div style={{ textAlign: 'center', paddingTop: 10 }}>
                <Link href="/classement" style={{ fontSize: 12, color: 'var(--neon)', fontWeight: 700, fontFamily: 'var(--font-head)' }}>
                  Classement complet →
                </Link>
              </div>
            )}
          </div>

          {/* Recent matches */}
          <div className="card">
            <div className="card-title">Derniers matchs</div>
            {!matches.length ? (
              <div className="empty">
                <div className="empty-icon">⚽</div>
                <p><Link href="/match" style={{ color: 'var(--neon)' }}>Créer un match</Link></p>
              </div>
            ) : matches.map(m => {
              const winner = m.score_a > m.score_b ? '🟢 Éq.A' : m.score_b > m.score_a ? '🔵 Éq.B' : '🤝 Nul';
              const nb = (m.match_players || []).length;
              const mvpP = m.mvp_id
                ? (m.match_players || []).find(mp => mp.player_id === m.mvp_id)?.players
                : null;
              return (
                <div key={m.id} className="match-card">
                  <div className="match-info">
                    <div className="match-name">{m.name || 'Match'}</div>
                    <div className="match-meta">
                      {fmtDate(m.date)} · {nb} joueurs · {winner}
                    </div>
                    {mvpP && <div className="mvp-pill">⭐ {mvpP.name}</div>}
                  </div>
                  <div className="match-score">
                    {m.score_a}<span className="match-score-sep"> – </span>{m.score_b}
                  </div>
                </div>
              );
            })}
            {matches.length > 0 && (
              <div style={{ textAlign: 'center', paddingTop: 10 }}>
                <Link href="/match" style={{ fontSize: 12, color: 'var(--neon)', fontWeight: 700, fontFamily: 'var(--font-head)' }}>
                  Gérer les matchs →
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
