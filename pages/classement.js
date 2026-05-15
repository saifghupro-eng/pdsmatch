// pages/classement.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { playerSeasonStats, getSeasonBadge, getFunComment } from '../lib/score';
import { initials, avatarCls, posCls, rankCls } from '../lib/helpers';

function getBestComment(allStats, pid, pos) {
  const myStats = allStats.filter(s => s.player_id === pid);
  if (!myStats.length) return null;

  let best = null, bestScore = -1;

  myStats.forEach(s => {
    const sc = (pos === 'DEF')
      ? (s.cleanSheets * 3 + (s.note || 0))
      : (s.note || 0);

    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  });

  return best ? getFunComment(pos, bestScore, best) : null;
}

export default function Classement() {
  const [tab, setTab] = useState('global');
  const [scoreMode, setScoreMode] = useState('avg');
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsTab, setStatsTab] = useState('buteur');

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: stats }] = await Promise.all([
        supabase.from('players').select('*'),
        supabase.from('match_stats').select('*, players(pos)'),
      ]);

      setPlayers(pls || []);
      setAllStats(stats || []);
      setLoading(false);
    }

    load();
  }, []);

  const posFilter = {
    global: null,
    att: 'ATQ',
    mid: 'MIL',
    def: 'DEF'
  };

  let filtered = [...players];

  if (posFilter[tab]) {
    filtered = filtered.filter(p => p.pos === posFilter[tab]);
  }

  const ranked = filtered
    .map(p => ({
      ...p,
      ss: playerSeasonStats(allStats, p.id, p.pos)
    }))
    .sort((a, b) =>
      scoreMode === 'avg'
        ? b.ss.avgScore - a.ss.avgScore
        : b.ss.totalScore - a.ss.totalScore
    );

  // helper score DEF
  const defScore = (ss) => (ss.cleanSheets * 3) + (ss.avgScore || 0);

  // LEADERBOARDS
  const topScorers = [...players]
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .sort((a, b) => b.ss.buts - a.ss.buts);

  const topAssists = [...players]
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .sort((a, b) => b.ss.passD - a.ss.passD);

  const topDefenders = [...players]
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .filter(p => p.pos === 'DEF')
    .sort((a, b) => defScore(b.ss) - defScore(a.ss));

  if (loading) return <div className="page">Chargement...</div>;

  return (
    <div className="page">

      {/* Tabs */}
      <div className="tab-row">
        {[
          ["global", "🌍 Général"],
          ["att", "⚡ ATQ"],
          ["mid", "🔄 MIL"],
          ["def", "🛡️ DEF"]
        ].map(([k, l]) => (
          <button
            key={k}
            className={`tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Score mode */}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button
          className={`btn btn-sm ${scoreMode === 'avg' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setScoreMode('avg')}
          style={{ flex: 1 }}
        >
          ⚖️ Moyenne / match
        </button>

        <button
          className={`btn btn-sm ${scoreMode === 'total' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setScoreMode('total')}
          style={{ flex: 1 }}
        >
          📈 Cumulé saison
        </button>
      </div>

      {/* MAIN RANKING */}
      <div className="card">
        {ranked.map((p, i) => {
          const badge = getSeasonBadge(p.ss.avgScore, p.ss.matchCount);

          return (
            <div key={p.id} className="lb-row">
              <div className={`lb-rank ${rankCls(i)}`}>{i + 1}</div>

              <div
                className={`avatar ${avatarCls(p.pos)}`}
                style={{ width: 42, height: 42 }}
              >
                {initials(p.name)}
              </div>

              <div className="lb-info">
                <div className="lb-name">
                  {p.name}
                  <span className={`pos-tag ${posCls(p.pos)}`}>
                    {p.pos}
                  </span>
                </div>
              </div>

              <div className="avg-indicator">
                <div className="avg-val">
                  {scoreMode === 'avg'
                    ? p.ss.avgScore
                    : p.ss.totalScore}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* STATS TABS */}
      <div className="tab-row" style={{ marginTop: 20 }}>
        {[
          ['buteur', '⚽ Buteurs'],
          ['passeur', '🎯 Passeurs'],
          ['defenseur', '🛡️ Défenseurs'],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`tab${statsTab === k ? ' active' : ''}`}
            onClick={() => setStatsTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="card">

        {statsTab === 'buteur' && topScorers.slice(0, 10).map((p, i) => (
          <div key={p.id} className="lb-row">
            <div className="lb-rank">{i + 1}</div>
            <div style={{ flex: 1 }}>{p.name}</div>
            <div>{p.ss.buts} ⚽</div>
          </div>
        ))}

        {statsTab === 'passeur' && topAssists.slice(0, 10).map((p, i) => (
          <div key={p.id} className="lb-row">
            <div className="lb-rank">{i + 1}</div>
            <div style={{ flex: 1 }}>{p.name}</div>
            <div>{p.ss.passD} 🎯</div>
          </div>
        ))}

        {statsTab === 'defenseur' && topDefenders.slice(0, 10).map((p, i) => (
          <div key={p.id} className="lb-row">
            <div className="lb-rank">{i + 1}</div>
            <div style={{ flex: 1 }}>{p.name}</div>
            <div>
              {p.ss.cleanSheets} CS · {defScore(p.ss).toFixed(1)} pts
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}