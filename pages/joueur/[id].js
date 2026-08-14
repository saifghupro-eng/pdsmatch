// pages/joueur/[id].js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { calcScore, getSeasonBadge, getFunComment, playerSeasonStats } from '../../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../../lib/helpers';

export default function PlayerPage() {
  const router = useRouter();
  const { id } = router.query;

  const [player, setPlayer]   = useState(null);
  const [history, setHistory] = useState([]); // [{ stats, match, score }] triés par date croissante
  const [allStats, setAllStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // recharts rend les attributs SVG (stroke/fill) littéralement : on résout
  // les variables CSS en vraies couleurs hex une fois le DOM monté, sinon le
  // graphique reste invisible (aucune ligne, ni grille, ni axes).
  const [chartColors, setChartColors] = useState({
    neon: '#00ff87', border: '#2a2f3a', muted: '#9eaab8', bg2: '#141820',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const read = (name, fallback) => {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    setChartColors({
      neon:   read('--neon',   '#00ff87'),
      border: read('--border', '#2a2f3a'),
      muted:  read('--muted',  '#9eaab8'),
      bg2:    read('--bg2',    '#141820'),
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    load(id);
  }, [id]);

  async function load(pid) {
    setLoading(true);
    const [{ data: pl }, { data: stats }] = await Promise.all([
      supabase.from('players').select('*').eq('id', pid).single(),
      supabase.from('match_stats').select('*, matches(*)').eq('player_id', pid),
    ]);

    if (!pl) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const rows = (stats || [])
      .filter(s => s.matches) // garde-fou si un match a été supprimé entre-temps
      .map(s => ({
        stats: s,
        match: s.matches,
        score: Math.round(calcScore(pl.pos, s) * 10) / 10,
      }))
      .sort((a, b) => new Date(a.match.date) - new Date(b.match.date));

    setPlayer(pl);
    setHistory(rows);
    setAllStats(stats || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading"><div className="spinner" />Chargement…</div>
      </div>
    );
  }

  if (notFound || !player) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon">🤔</div>
          <p>Joueur introuvable — <Link href="/classement" style={{ color: 'var(--neon)' }}>retour au classement</Link></p>
        </div>
      </div>
    );
  }

  const ss    = playerSeasonStats(allStats, player.id, player.pos);
  const badge = getSeasonBadge(ss.avgScore, ss.matchCount);

  const chartData = history.map((h, i) => ({
    idx: i + 1,
    date: fmtDate(h.match.date),
    score: h.score,
    name: h.match.name || 'Match',
  }));

  let best = null, worst = null;
  history.forEach(h => {
    if (!best  || h.score > best.score)  best  = h;
    if (!worst || h.score < worst.score) worst = h;
  });

  return (
    <div className="page">
      <div style={{ marginBottom: 4 }}>
        <Link href="/classement" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Classement
        </Link>
      </div>

      {/* Header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className={`avatar ${avatarCls(player.pos)}`} style={{ width: 58, height: 58, fontSize: '1.2rem', flexShrink: 0 }}>
          {initials(player.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem' }}>
            {player.name}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <span className={`pos-tag ${posCls(player.pos)}`}>{player.pos}</span>
            <span className="pill">Niv.{player.level}</span>
            <span className="badge" style={{
              color: badge.color, background: `${badge.color}18`,
              borderColor: `${badge.color}40`, fontSize: '0.65rem',
            }}>{badge.emoji} {badge.label}</span>
          </div>
        </div>
      </div>

      {/* Résumé */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-val">{ss.matchCount}</div>
            <div className="hero-stat-label">Matchs</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-val">{ss.avgScore}</div>
            <div className="hero-stat-label">Moy/match</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-val">{ss.totalScore}</div>
            <div className="hero-stat-label">Total saison</div>
          </div>
        </div>
      </div>

      {/* Graphique de progression */}
      <div className="card">
        <div className="card-title">Progression du score</div>
        {chartData.length < 2 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem', padding: '1rem 0' }}>
            Pas encore assez de matchs pour tracer une courbe (2 minimum).
          </div>
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -22 }}>
                <CartesianGrid stroke={chartColors.border} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: chartColors.muted, fontSize: 11 }}
                  axisLine={{ stroke: chartColors.border }}
                  tickLine={false}
                  label={{ value: 'Match n°', position: 'insideBottom', offset: -2, fill: chartColors.muted, fontSize: 10 }}
                />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 11 }} axisLine={{ stroke: chartColors.border }} tickLine={false} />
                <ReferenceLine y={ss.avgScore} stroke={chartColors.muted} strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: chartColors.bg2, border: `1px solid ${chartColors.border}`, borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(idx) => chartData[idx - 1]?.name}
                  formatter={(value, name, entry) => [`${value} pts`, entry?.payload?.date]}
                />
                <Line
                  type="natural" dataKey="score"
                  stroke={chartColors.neon} strokeWidth={2.5}
                  dot={false} activeDot={{ r: 5, fill: chartColors.neon }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Meilleur / pire match */}
      {(best || worst) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {best && (
            <div className="card" style={{ borderLeft: '3px solid var(--neon)' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>🔥 Meilleur match</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{best.match.name || 'Match'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 6 }}>{fmtDate(best.match.date)}</div>
              <div className="avg-val" style={{ color: 'var(--neon)' }}>{best.score} pts</div>
            </div>
          )}
          {worst && (
            <div className="card" style={{ borderLeft: '3px solid #ff5555' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>😴 Pire match</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{worst.match.name || 'Match'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 6 }}>{fmtDate(worst.match.date)}</div>
              <div className="avg-val" style={{ color: '#ff5555' }}>{worst.score} pts</div>
            </div>
          )}
        </div>
      )}

      {/* Historique complet */}
      <div className="card">
        <div className="card-title">Historique ({history.length})</div>
        {!history.length ? (
          <div className="empty">
            <div className="empty-icon">⚽</div>
            <p>Aucun match enregistré pour ce joueur.</p>
          </div>
        ) : [...history].reverse().map(h => {
          const comment = getFunComment(player.pos, h.score, h.stats);
          const result = h.stats.victoire ? '🏆 Victoire' : h.stats.nul ? '🤝 Nul' : '💀 Défaite';
          return (
            <div key={h.stats.id} className="match-card">
              <div className="match-info">
                <div className="match-name">{h.match.name || 'Match'}</div>
                <div className="match-meta">{fmtDate(h.match.date)} · {result}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{comment.emoji}</span><span style={{ fontStyle: 'italic' }}>{comment.text}</span>
                </div>
              </div>
              <div className="match-score" style={{ color: 'var(--neon)' }}>{h.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}