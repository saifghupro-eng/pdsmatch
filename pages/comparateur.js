// pages/comparateur.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { playerSeasonStats, getSeasonBadge } from '../lib/score';
import { initials, avatarCls, posCls } from '../lib/helpers';

function PlayerHeader({ p, ss }) {
  if (!p) return null;
  const badge = getSeasonBadge(ss.avgScore, ss.matchCount);
  return (
    <div style={{ textAlign: 'center' }}>
      <div className={`avatar ${avatarCls(p.pos)}`} style={{ width: 56, height: 56, fontSize: '1.1rem', margin: '0 auto' }}>
        {initials(p.name)}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.92rem', marginTop: 8 }}>
        {p.name}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
        <span className="pill">Niv.{p.level}</span>
      </div>
      <span className="badge" style={{
        color: badge.color, background: `${badge.color}18`, borderColor: `${badge.color}40`,
        fontSize: '0.6rem', marginTop: 6, display: 'inline-flex',
      }}>{badge.emoji} {badge.label}</span>
    </div>
  );
}

function CompareRow({ label, v1, v2, suffix = '' }) {
  const higher = v1 === v2 ? null : v1 > v2 ? 1 : 2;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem',
    }}>
      <div style={{ textAlign: 'right', fontWeight: 700, color: higher === 1 ? 'var(--neon)' : 'var(--fg)' }}>
        {v1}{suffix}{higher === 1 ? ' 🔺' : ''}
      </div>
      <div style={{ textAlign: 'center', fontSize: '0.64rem', color: 'var(--muted)', padding: '0 8px', minWidth: 90 }}>
        {label}
      </div>
      <div style={{ textAlign: 'left', fontWeight: 700, color: higher === 2 ? 'var(--neon)' : 'var(--fg)' }}>
        {higher === 2 ? '🔺 ' : ''}{v2}{suffix}
      </div>
    </div>
  );
}

export default function Comparateur() {
  const [players, setPlayers]   = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [id1, setId1] = useState('');
  const [id2, setId2] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: pls }, { data: stats }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('match_stats').select('*, players(pos)'),
    ]);
    setPlayers(pls || []);
    setAllStats(stats || []);
    setLoading(false);
    if ((pls || []).length >= 2) {
      setId1(pls[0].id);
      setId2(pls[1].id);
    }
  }

  const p1 = players.find(p => p.id === id1);
  const p2 = players.find(p => p.id === id2);
  const ss1 = p1 ? playerSeasonStats(allStats, p1.id, p1.pos) : null;
  const ss2 = p2 ? playerSeasonStats(allStats, p2.id, p2.pos) : null;

  const winRatio = ss => ss.matchCount ? Math.round((ss.wins / ss.matchCount) * 100) : 0;

  const rows = ss1 && ss2 ? [
    { label: '🎮 Matchs joués',      v1: ss1.matchCount,               v2: ss2.matchCount },
    { label: '⚖️ Moyenne/match',      v1: ss1.avgScore,                 v2: ss2.avgScore },
    { label: '📈 Total saison',       v1: Math.round(ss1.totalScore*10)/10, v2: Math.round(ss2.totalScore*10)/10 },
    { label: '🏆 Victoires',          v1: ss1.wins,                     v2: ss2.wins },
    { label: '🤝 Nuls',               v1: ss1.nuls,                     v2: ss2.nuls },
    { label: '📊 Ratio victoires',    v1: winRatio(ss1),                v2: winRatio(ss2), suffix: '%' },
    { label: '⚽ Buts',               v1: ss1.buts,                     v2: ss2.buts },
    { label: '🎯 Passes décisives',   v1: ss1.passD,                    v2: ss2.passD },
    { label: '🧤 Clean sheets',       v1: ss1.cleanSheets,              v2: ss2.cleanSheets },
    { label: '⭐ MVP',                v1: ss1.mvpCount,                 v2: ss2.mvpCount },
  ] : [];

  return (
    <div className="page">
      <div className="hero">
        <h1>Compa<span>rateur</span></h1>
        <p className="hero-sub">Deux joueurs, stats côte à côte</p>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Chargement…</div>
      ) : players.length < 2 ? (
        <div className="empty">
          <div className="empty-icon">👥</div>
          <p>Il faut au moins 2 joueurs pour comparer.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Joueur 1</label>
                <select value={id1} onChange={e => setId1(e.target.value)}>
                  {players.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === id2}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{
                fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--muted)',
                fontSize: '0.85rem', paddingBottom: 8,
              }}>VS</div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Joueur 2</label>
                <select value={id2} onChange={e => setId2(e.target.value)}>
                  {players.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === id1}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {p1 && p2 && (
            <div className="card">
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 6,
              }}>
                <PlayerHeader p={p1} ss={ss1} />
                <PlayerHeader p={p2} ss={ss2} />
              </div>

              {rows.map(r => (
                <CompareRow key={r.label} label={r.label} v1={r.v1} v2={r.v2} suffix={r.suffix || ''} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
