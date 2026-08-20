// pages/classement.js
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { playerSeasonStats, getSeasonBadge, getFunComment, calcScore, getBestDuos, getDuoVibe, pickTeamOfPeriod } from '../lib/score';
import { initials, avatarCls, posCls, rankCls, fmtDate } from '../lib/helpers';
import { useAuth } from '../lib/auth';
import { toast } from '../components/Toast';

/* ─── Commentaire fun basé sur le meilleur match du joueur ─── */
function getBestComment(allStats, pid, pos) {
  const myStats = allStats.filter(s => s.player_id === pid);
  if (!myStats.length) return null;
  let best = null, bestScore = -1;
  myStats.forEach(s => {
    const sc = calcScore(pos, s);
    if (sc > bestScore) { bestScore = sc; best = s; }
  });
  return best ? getFunComment(pos, bestScore, best) : null;
}

/* ─── Détail lisible du calcul de score (saison entière) ─── */
function ScoreBreakdown({ pos, ss, bonusPts }) {
  const bonus = parseFloat(bonusPts || 0);
  const lines = [];

  if (pos === 'ATQ') {
    if (ss.buts  > 0) lines.push({ label: 'Buts',     val: `${ss.buts}×3`,  pts: ss.buts * 3 });
    if (ss.passD > 0) lines.push({ label: 'Passes D', val: `${ss.passD}×2`, pts: ss.passD * 2 });
  }
  if (pos === 'MIL') {
    if (ss.buts  > 0) lines.push({ label: 'Buts',     val: `${ss.buts}×2`,  pts: ss.buts * 2 });
    if (ss.passD > 0) lines.push({ label: 'Passes D', val: `${ss.passD}×3`, pts: ss.passD * 3 });
  }
  if (pos === 'DEF') {
    if (ss.cleanSheets > 0) lines.push({ label: 'Clean sheets', val: `${ss.cleanSheets}×3`, pts: ss.cleanSheets * 3 });
  }
  if (ss.wins     > 0) lines.push({ label: 'Victoires', val: `${ss.wins}×3`,      pts: ss.wins * 3 });
  if (ss.nuls     > 0) lines.push({ label: 'Nuls',      val: `${ss.nuls}×1`,      pts: ss.nuls });
  if (ss.mvpCount > 0) lines.push({ label: 'MVP',       val: `${ss.mvpCount}×1`,  pts: ss.mvpCount });
  // Présence bonus supprimé
  if (bonus !== 0) lines.push({ label: '⭐ Bonus admin', val: `${bonus > 0 ? '+' : ''}${bonus}`, pts: bonus, isBonus: true });

  return (
    <div style={{
      marginTop: 8,
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: '0.66rem',
      color: 'var(--muted2)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 6, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        📐 Détail du calcul — saison complète
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
        {lines.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--muted)' }}>{l.label}</span>
            <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{l.val}</span>
            <span style={{
              color: l.isBonus ? '#f5c518' : 'var(--neon)',
              fontWeight: 700,
              background: l.isBonus ? '#f5c51820' : 'var(--neon-dim)',
              borderRadius: 4,
              padding: '1px 5px',
            }}>= {l.pts}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 7, borderTop: '1px solid var(--border)', paddingTop: 5, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <span style={{ color: 'var(--muted)' }}>
          Total saison <strong style={{ color: 'var(--neon)' }}>{Math.round((ss.totalScore + bonus) * 10) / 10} pts</strong>
        </span>
        <span style={{ color: 'var(--muted)' }}>
          Moy/match <strong style={{ color: 'var(--neon)' }}>{ss.avgScore} pts</strong>
        </span>
      </div>
    </div>
  );
}

/* ─── Modal admin bonus ─── */
function BonusModal({ player, onClose, onSave }) {
  const [val, setVal]       = useState(parseFloat(player.bonus_pts || 0));
  const [reason, setReason] = useState(player.bonus_reason || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('players')
      .update({ bonus_pts: val, bonus_reason: reason.trim() || null })
      .eq('id', player.id);
    setSaving(false);
    if (error) { toast('❌ Erreur sauvegarde bonus'); return; }
    toast(`✅ Bonus ${val > 0 ? '+' : ''}${val} pts → ${player.name}`);
    onSave({ bonus_pts: val, bonus_reason: reason.trim() || null });
    onClose();
  }

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:20, width:'100%', maxWidth:340 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight:800, fontSize:'1rem', marginBottom:4 }}>⭐ Bonus admin — {player.name}</div>
        <div style={{ fontSize:'0.72rem', color:'var(--muted2)', marginBottom:14 }}>
          Ajoute (ou retire) des points directement au score cumulé de ce joueur.
        </div>

        <label style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700 }}>Points bonus</label>
        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'6px 0 14px' }}>
          <button className="counter-btn" onClick={() => setVal(v => Math.round((v - 0.5) * 10) / 10)}>−</button>
          <input
            type="number" step="0.5" value={val}
            onChange={e => setVal(parseFloat(e.target.value) || 0)}
            style={{
              flex:1, textAlign:'center', fontWeight:800, fontSize:'1.3rem',
              background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8,
              padding:'6px 0', color: val >= 0 ? 'var(--neon)' : '#ff5555',
            }}
          />
          <button className="counter-btn" onClick={() => setVal(v => Math.round((v + 0.5) * 10) / 10)}>+</button>
        </div>

        <label style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700 }}>Raison (optionnel)</label>
        <input
          type="text" value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="ex : Effort défensif exceptionnel…"
          style={{
            width:'100%', marginTop:6, marginBottom:16,
            background:'var(--bg3)', border:'1px solid var(--border)',
            borderRadius:8, padding:'8px 10px', fontSize:'0.8rem', color:'var(--fg)',
            boxSizing:'border-box',
          }}
        />

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose}>Annuler</button>
          <button
            className="btn btn-ghost"
            style={{ flex:1, borderColor:'#ff5555', color:'#ff5555' }}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const { error } = await supabase.from('players')
                .update({ bonus_pts: 0, bonus_reason: null })
                .eq('id', player.id);
              setSaving(false);
              if (error) { toast('❌ Erreur suppression bonus'); return; }
              toast(`🗑️ Bonus supprimé pour ${player.name}`);
              onSave({ bonus_pts: 0, bonus_reason: null });
              onClose();
            }}
          >
            🗑️ Supprimer
          </button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={save} disabled={saving}>
            {saving ? '⏳...' : '💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Classements spéciaux ─── */
function RankingButs({ players, allStats }) {
  const ranked = players
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .filter(p => p.ss.buts > 0)
    .sort((a, b) => b.ss.buts - a.ss.buts || b.ss.matchCount - a.ss.matchCount);
  if (!ranked.length) return <div className="empty"><div className="empty-icon">⚽</div><p>Aucun but inscrit</p></div>;
  return (
    <div className="card">
      {ranked.map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
          <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>{initials(p.name)}</div>
          <div className="lb-info">
            <div className="lb-name">{p.name}<span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span></div>
            <div className="lb-details" style={{ marginTop:5 }}>
              <span className="pill">🎮 {p.ss.matchCount}m</span><span className="pill">🏆 {p.ss.wins}V</span>
            </div>
          </div>
          <div className="avg-indicator">
            <div className="avg-val" style={{ color:'var(--att)', fontSize:'1.5rem' }}>{p.ss.buts}</div>
            <div className="avg-label">buts</div>
            <div className="avg-matches">{(p.ss.buts / Math.max(1, p.ss.matchCount)).toFixed(1)}/m</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingPassD({ players, allStats }) {
  const ranked = players
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .filter(p => p.ss.passD > 0)
    .sort((a, b) => b.ss.passD - a.ss.passD || b.ss.matchCount - a.ss.matchCount);
  if (!ranked.length) return <div className="empty"><div className="empty-icon">🎯</div><p>Aucune passe décisive</p></div>;
  return (
    <div className="card">
      {ranked.map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
          <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>{initials(p.name)}</div>
          <div className="lb-info">
            <div className="lb-name">{p.name}<span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span></div>
            <div className="lb-details" style={{ marginTop:5 }}>
              <span className="pill">🎮 {p.ss.matchCount}m</span><span className="pill">🏆 {p.ss.wins}V</span>
            </div>
          </div>
          <div className="avg-indicator">
            <div className="avg-val" style={{ color:'var(--mid)', fontSize:'1.5rem' }}>{p.ss.passD}</div>
            <div className="avg-label">passes D</div>
            <div className="avg-matches">{(p.ss.passD / Math.max(1, p.ss.matchCount)).toFixed(1)}/m</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingDef({ players, allStats }) {
  const ranked = players
    .filter(p => p.pos === 'DEF')
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .sort((a, b) => b.ss.cleanSheets - a.ss.cleanSheets || b.ss.matchCount - a.ss.matchCount);
  if (!ranked.length) return <div className="empty"><div className="empty-icon">🛡️</div><p>Aucun défenseur</p></div>;
  return (
    <div className="card">
      {ranked.map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
          <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>{initials(p.name)}</div>
          <div className="lb-info">
            <div className="lb-name">{p.name}<span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span></div>
            <div className="lb-details" style={{ marginTop:5 }}>
              <span className="pill">🎮 {p.ss.matchCount}m</span><span className="pill">🏆 {p.ss.wins}V</span>
            </div>
          </div>
          <div className="avg-indicator">
            <div className="avg-val" style={{ color:'var(--def)', fontSize:'1.5rem' }}>{p.ss.cleanSheets}</div>
            <div className="avg-label">clean sh.</div>
            <div className="avg-matches">{(p.ss.cleanSheets / Math.max(1, p.ss.matchCount)).toFixed(1)}/m</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Classement par ratio victoires / matchs joués ─── */
function RankingWinRatio({ players, allStats }) {
  const ranked = players
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .filter(p => p.ss.matchCount >= 5)
    .map(p => ({ ...p, ratio: p.ss.wins / p.ss.matchCount }))
    .sort((a, b) => b.ratio - a.ratio || b.ss.matchCount - a.ss.matchCount);
  if (!ranked.length) return <div className="empty"><div className="empty-icon">🏆</div><p>Aucun joueur avec 5 matchs ou plus</p></div>;
  return (
    <div className="card">
      {ranked.map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
          <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>{initials(p.name)}</div>
          <div className="lb-info">
            <div className="lb-name">{p.name}<span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span></div>
            <div className="lb-details" style={{ marginTop:5 }}>
              <span className="pill">🎮 {p.ss.matchCount}m</span>
              <span className="pill">🏆 {p.ss.wins}V</span>
              {p.ss.nuls > 0 && <span className="pill">🤝 {p.ss.nuls}N</span>}
            </div>
          </div>
          <div className="avg-indicator">
            <div className="avg-val" style={{ color:'var(--neon)', fontSize:'1.5rem' }}>{Math.round(p.ratio * 100)}%</div>
            <div className="avg-label">victoires</div>
            <div className="avg-matches">{p.ss.wins}/{p.ss.matchCount}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Classement par date (agrège tous les matchs joués ce jour-là) ─── */
function RankingBySession({ sessionStats }) {
  const [selectedDate, setSelectedDate] = useState('');

  const dates = [...new Set(sessionStats.map(s => s.matches?.date).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  useEffect(() => {
    if (dates.length && !selectedDate) setSelectedDate(dates[0]);
  }, [dates]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dates.length) return <div className="empty"><div className="empty-icon">📅</div><p>Aucune stat enregistrée</p></div>;

  const statsForDate = sessionStats.filter(s => s.matches?.date === selectedDate);

  // Agrégation par joueur sur tous les matchs de la date choisie
  const byPlayer = {};
  statsForDate.forEach(s => {
    const pid = s.player_id;
    if (!byPlayer[pid]) {
      byPlayer[pid] = {
        pid, name: s.players?.name || '?', pos: s.players?.pos || 'MIL',
        buts: 0, passD: 0, cleanSheet: 0, wins: 0, nuls: 0, matches: 0, score: 0,
      };
    }
    const p = byPlayer[pid];
    p.buts        += s.buts || 0;
    p.passD       += s.pass_d || 0;
    p.cleanSheet  += s.clean_sheet || 0;
    p.wins        += s.victoire ? 1 : 0;
    p.nuls        += s.nul ? 1 : 0;
    p.matches     += 1;
    p.score       += calcScore(p.pos, s);
  });
  const ranked = Object.values(byPlayer).sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="card" style={{ padding: '10px 14px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Choisir une date</label>
        <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ marginTop: 6 }}>
          {dates.map(d => (
            <option key={d} value={d}>
              {fmtDate(d)} — {sessionStats.filter(s => s.matches?.date === d && s.match_id).reduce((set, s) => set.add(s.match_id), new Set()).size} match(s)
            </option>
          ))}
        </select>
      </div>

      {!ranked.length ? (
        <div className="empty"><div className="empty-icon">📅</div><p>Aucune stat pour cette date</p></div>
      ) : (
        <div className="card">
          {ranked.map((p, i) => (
            <div key={p.pid} className="lb-row">
              <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
              <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>
                {initials(p.name)}
              </div>
              <div className="lb-info">
                <div className="lb-name">
                  {p.name}
                  <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
                </div>
                <div className="lb-details" style={{ marginTop: 5 }}>
                  <span className="pill">🎮 {p.matches}m</span>
                  <span className="pill">🏆 {p.wins}V</span>
                  {p.nuls > 0 && <span className="pill">🤝 {p.nuls}N</span>}
                  {p.buts > 0 && <span className="pill">⚽ {p.buts}</span>}
                  {p.passD > 0 && <span className="pill">🎯 {p.passD}</span>}
                  {p.cleanSheet > 0 && <span className="pill">🧤 {p.cleanSheet}CS</span>}
                </div>
              </div>
              <div className="avg-indicator">
                <div className="avg-val" style={{ color: 'var(--neon)', fontSize: '1.5rem' }}>{Math.round(p.score * 10) / 10}</div>
                <div className="avg-label">pts</div>
                <div className="avg-matches">{Math.round((p.score / p.matches) * 10) / 10} moy.</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Meilleurs / pires duos — paires qui gagnent (ou perdent) le plus souvent ensemble ─── */
function RankingDuos({ matches }) {
  const [minTogether, setMinTogether] = useState(2);

  const allDuos = getBestDuos(matches, Math.max(1, parseInt(minTogether) || 1));
  const bestDuos  = allDuos;
  const worstDuos = [...allDuos].sort((a, b) => a.winRate - b.winRate || b.together - a.together);

  function DuoRow({ d, i }) {
    const vibe = getDuoVibe(d.winRate);
    return (
      <div key={d.ids.join('-')} className="lb-row">
        <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}</div>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <div className={`avatar ${avatarCls(d.poss[0])}`} style={{ width: 34, height: 34, fontSize: '0.72rem', border: '2px solid var(--bg2)' }}>
            {initials(d.names[0])}
          </div>
          <div className={`avatar ${avatarCls(d.poss[1])}`} style={{ width: 34, height: 34, fontSize: '0.72rem', marginLeft: -12, border: '2px solid var(--bg2)' }}>
            {initials(d.names[1])}
          </div>
        </div>
        <div className="lb-info">
          <div className="lb-name">{d.names[0]} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>&</span> {d.names[1]}</div>
          <div className="lb-details" style={{ marginTop: 5 }}>
            <span className="pill">🎮 {d.together} ensemble</span>
            <span className="pill">🏆 {d.wins}V</span>
            {d.nuls > 0 && <span className="pill">🤝 {d.nuls}N</span>}
          </div>
          <div style={{
            marginTop: 5, fontSize: '0.68rem', color: 'var(--muted2)',
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--bg3)', borderRadius: 6, padding: '3px 7px', width: 'fit-content',
          }}>
            <span style={{ fontSize: '0.85rem' }}>{vibe.emoji}</span>
            <span style={{ fontStyle: 'italic' }}>{vibe.label}</span>
          </div>
        </div>
        <div className="avg-indicator">
          <div className="avg-val" style={{ color: d.winRate >= 50 ? 'var(--neon)' : '#ff5555', fontSize: '1.5rem' }}>{d.winRate}%</div>
          <div className="avg-label">pts (V3/N1)</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ padding: '10px 14px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
          Matchs minimum joués ensemble
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <button className="counter-btn" onClick={() => setMinTogether(v => Math.max(1, (parseInt(v) || 1) - 1))}>−</button>
          <input
            type="number" min={1} value={minTogether}
            onChange={e => setMinTogether(e.target.value)}
            style={{
              width: 60, textAlign: 'center', fontWeight: 800, fontSize: '1rem',
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '6px 0', color: 'var(--fg)',
            }}
          />
          <button className="counter-btn" onClick={() => setMinTogether(v => (parseInt(v) || 1) + 1)}>+</button>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
            {allDuos.length} duo{allDuos.length > 1 ? 's' : ''} trouvé{allDuos.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {!allDuos.length ? (
        <div className="empty">
          <div className="empty-icon">🤝</div>
          <p>Aucun duo n'a joué {minTogether} match{minTogether > 1 ? 's' : ''} ensemble ou plus.</p>
        </div>
      ) : (
        <>
          <div className="section-label" style={{ color: 'var(--neon)' }}>👑 Meilleurs duos</div>
          <div className="card">
            {bestDuos.slice(0, 10).map((d, i) => <DuoRow key={d.ids.join('-')} d={d} i={i} />)}
          </div>

          <div className="section-label" style={{ color: '#ff5555' }}>📉 Pires duos</div>
          <div className="card">
            {worstDuos.slice(0, 10).map((d, i) => <DuoRow key={d.ids.join('-')} d={d} i={i} />)}
          </div>
        </>
      )}
    </>
  );
}

/* ─── Couleur par poste (réutilisée par le terrain) ─── */
function posColor(pos) {
  return pos === 'ATQ' ? 'var(--att)' : pos === 'DEF' ? 'var(--def)' : 'var(--mid)';
}

/* ─── Terrain de foot — visuel graphique de l'équipe type ─── */
function FootballPitch({ team }) {
  if (!team.length) return null;

  const byPos = { ATQ: [], MIL: [], DEF: [] };
  team.forEach(p => {
    if (byPos[p.pos]) byPos[p.pos].push(p);
    else byPos.MIL.push(p);
  });
  Object.values(byPos).forEach(arr => arr.sort((a, b) => b.score - a.score));

  // Positions horizontales (%) selon le nombre de joueurs sur la ligne
  function xPositions(count) {
    if (count <= 1) return [50];
    if (count === 2) return [28, 72];
    if (count === 3) return [18, 50, 82];
    return Array.from({ length: count }, (_, i) => (100 / (count + 1)) * (i + 1));
  }

  // ATQ proche du but adverse (haut), DEF proche de son propre but (bas)
  const rows = [
    { pos: 'ATQ', y: 16, players: byPos.ATQ },
    { pos: 'MIL', y: 50, players: byPos.MIL },
    { pos: 'DEF', y: 82, players: byPos.DEF },
  ];

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '3 / 4',
      borderRadius: 14,
      overflow: 'hidden',
      background: 'repeating-linear-gradient(0deg, #1e7a34 0, #1e7a34 40px, #23893a 40px, #23893a 80px)',
      border: '2px solid var(--border)',
      marginBottom: 14,
      boxShadow: 'inset 0 0 40px rgba(0,0,0,0.35)',
    }}>
      {/* Tracé du terrain */}
      <svg viewBox="0 0 300 400" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="8" y="8" width="284" height="384" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <line x1="8" y1="200" x2="292" y2="200" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <circle cx="150" cy="200" r="42" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <circle cx="150" cy="200" r="3" fill="rgba(255,255,255,0.55)" />
        {/* Surface adverse (haut) */}
        <rect x="80" y="8" width="140" height="55" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <rect x="112" y="8" width="76" height="24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <path d="M 118 63 A 42 42 0 0 0 182 63" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        {/* Surface propre (bas) */}
        <rect x="80" y="337" width="140" height="55" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <rect x="112" y="368" width="76" height="24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        <path d="M 118 337 A 42 42 0 0 1 182 337" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      </svg>

      {/* Joueurs positionnés */}
      {rows.map(row => {
        const xs = xPositions(row.players.length);
        return row.players.map((p, i) => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${xs[i]}%`,
              top: `${row.y}%`,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              zIndex: 2,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--bg2)',
              border: `2.5px solid ${posColor(p.pos)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.78rem', color: 'var(--fg)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
            }}>
              {initials(p.name)}
            </div>
            <div style={{
              fontSize: '0.62rem', fontWeight: 700, color: '#fff',
              background: 'rgba(0,0,0,0.6)', borderRadius: 5, padding: '1px 6px',
              whiteSpace: 'nowrap', maxWidth: 82, overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {p.name}
            </div>
            <div style={{
              fontSize: '0.6rem', fontWeight: 800, color: posColor(p.pos),
              background: 'rgba(0,0,0,0.6)', borderRadius: 5, padding: '0 5px',
            }}>
              {p.score} pts
            </div>
          </div>
        ));
      })}
    </div>
  );
}

/* ─── Équipe type — les 6 meilleurs, en formation 2 DEF / 2 MIL / 2 ATQ ─── */
function TeamOfTypeCard({ team, title, subtitle }) {
  if (!team.length) {
    return (
      <div className="empty">
        <div className="empty-icon">🌟</div>
        <p>Pas assez de données pour former une équipe.</p>
      </div>
    );
  }
  const order = { ATQ: 0, MIL: 1, DEF: 2 };
  const sorted = [...team].sort((a, b) => (order[a.pos] ?? 3) - (order[b.pos] ?? 3) || b.score - a.score);
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {subtitle && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 10 }}>{subtitle}</div>}
      <FootballPitch team={sorted} />
      {sorted.map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${rankCls(i)}`}>{i===0?'👑':i===1?'🥈':i===2?'🥉':'⭐'}</div>
          <div className={`avatar ${avatarCls(p.pos)}`} style={{ width: 40, height: 40, fontSize: '0.85rem' }}>
            {initials(p.name)}
          </div>
          <div className="lb-info">
            <div className="lb-name">{p.name}<span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span></div>
          </div>
          <div className="avg-indicator">
            <div className="avg-val" style={{ color: 'var(--neon)' }}>{p.score}</div>
            <div className="avg-label">pts</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamOfWeek({ sessionStats }) {
  const dates = [...new Set(sessionStats.map(s => s.matches?.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (dates.length && !selectedDate) setSelectedDate(dates[0]);
  }, [dates]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dates.length) return <div className="empty"><div className="empty-icon">📅</div><p>Aucune stat enregistrée</p></div>;

  const statsForDate = sessionStats.filter(s => s.matches?.date === selectedDate);
  const byPlayer = {};
  statsForDate.forEach(s => {
    const pid = s.player_id;
    if (!byPlayer[pid]) {
      byPlayer[pid] = { id: pid, name: s.players?.name || '?', pos: s.players?.pos || 'MIL', score: 0 };
    }
    byPlayer[pid].score += calcScore(byPlayer[pid].pos, s);
  });
  const playersScored = Object.values(byPlayer).map(p => ({ ...p, score: Math.round(p.score * 10) / 10 }));
  const team = pickTeamOfPeriod(playersScored);

  return (
    <>
      <div className="card" style={{ padding: '10px 14px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Choisir une semaine</label>
        <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ marginTop: 6 }}>
          {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
        </select>
      </div>
      <TeamOfTypeCard
        team={team}
        title={`🌟 Équipe type — ${fmtDate(selectedDate)}`}
        subtitle="Formation 3 DEF · 2 MIL · 1 ATQ — meilleurs scores du jour"
      />
    </>
  );
}

function TeamOfSeason({ players, allStats }) {
  const [minMatches, setMinMatches] = useState(3);
  const minM = Math.max(1, parseInt(minMatches) || 1);

  const scored = players
    .map(p => ({ ...p, ss: playerSeasonStats(allStats, p.id, p.pos) }))
    .filter(p => p.ss.matchCount >= minM)
    .map(p => ({ id: p.id, name: p.name, pos: p.pos, score: p.ss.avgScore }));
  const team = pickTeamOfPeriod(scored);

  return (
    <>
      <div className="card" style={{ padding: '10px 14px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
          Matchs minimum joués
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <button className="counter-btn" onClick={() => setMinMatches(v => Math.max(1, (parseInt(v) || 1) - 1))}>−</button>
          <input
            type="number" min={1} value={minMatches}
            onChange={e => setMinMatches(e.target.value)}
            style={{
              width: 60, textAlign: 'center', fontWeight: 800, fontSize: '1rem',
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '6px 0', color: 'var(--fg)',
            }}
          />
          <button className="counter-btn" onClick={() => setMinMatches(v => (parseInt(v) || 1) + 1)}>+</button>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
            {scored.length} joueur{scored.length > 1 ? 's' : ''} éligible{scored.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <TeamOfTypeCard
        team={team}
        title="🏆 Équipe type de la saison"
        subtitle={`Formation 3 DEF · 2 MIL · 1 ATQ — meilleure moyenne/match (min. ${minM} match${minM > 1 ? 's' : ''} joué${minM > 1 ? 's' : ''})`}
      />
    </>
  );
}

function TeamOfTheTypeSection({ sessionStats, players, allStats }) {
  const [mode, setMode] = useState('week');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button className={`btn btn-sm ${mode==='week' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('week')} style={{ flex: 1 }}>
          📅 Semaine
        </button>
        <button className={`btn btn-sm ${mode==='season' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('season')} style={{ flex: 1 }}>
          🏆 Saison
        </button>
      </div>
      {mode === 'week'
        ? <TeamOfWeek sessionStats={sessionStats} />
        : <TeamOfSeason players={players} allStats={allStats} />}
    </>
  );
}

/* ══════════════ PAGE PRINCIPALE ══════════════ */
export default function Classement() {
  const { isAdmin }                 = useAuth();
  const [tab, setTab]               = useState('global');
  const [scoreMode, setScoreMode]   = useState('avg');
  const [players, setPlayers]       = useState([]);
  const [allStats, setAllStats]     = useState([]);
  const [sessionStats, setSessionStats] = useState([]);
  const [matches, setMatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState({});   // { [pid]: bool }
  const [bonusModal, setBonusModal] = useState(null); // player | null

  // ── Saisons ──
  const [seasons, setSeasons]                 = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(undefined); // undefined = pas encore chargé, null = "toutes saisons"

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: seasonsData } = await supabase.from('seasons').select('*').order('start_date', { ascending: false });
    const list = seasonsData || [];
    setSeasons(list);
    const active = list.find(s => s.is_active) || list[0] || null;
    const sid = active ? active.id : null;
    setSelectedSeasonId(sid);
    await load(sid);
  }

  async function load(seasonId) {
    setLoading(true);
    // Avec un id de saison : on filtre matches/match_stats sur cette saison.
    // seasonId === null → pas de filtre, on prend l'historique complet (all-time).
    let statsQuery   = supabase.from('match_stats').select('*, players(name,pos), matches!inner(date, season_id)');
    let matchesQuery = supabase.from('matches').select('*, match_players(*, players(name,pos))');
    if (seasonId) {
      statsQuery   = statsQuery.eq('matches.season_id', seasonId);
      matchesQuery = matchesQuery.eq('season_id', seasonId);
    }

    const [{ data: pls }, { data: stats }, { data: mts }] = await Promise.all([
      supabase.from('players').select('*'),
      statsQuery,
      matchesQuery,
    ]);
    setPlayers(pls || []);
    setAllStats(stats || []);
    setSessionStats(stats || []);
    setMatches(mts || []);
    setLoading(false);
  }

  function handleSeasonChange(seasonId) {
    setSelectedSeasonId(seasonId);
    load(seasonId);
  }

  function toggleExpanded(pid) {
    setExpanded(prev => ({ ...prev, [pid]: !prev[pid] }));
  }

  function handleBonusSaved(pid, update) {
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, ...update } : p));
  }

  const isSpecial = ['buts', 'passd', 'cleansheets', 'winratio', 'duo', 'teamtype', 'session'].includes(tab);

  const posFilterMap = { global: null, att: 'ATQ', mid: 'MIL', def: 'DEF' };
  let filtered = [...players];
  if (!isSpecial && posFilterMap[tab]) filtered = filtered.filter(p => p.pos === posFilterMap[tab]);

  const ranked = filtered
    .map(p => {
      const ss    = playerSeasonStats(allStats, p.id, p.pos);
      const bonus = parseFloat(p.bonus_pts || 0);
      return {
        ...p, ss,
        displayAvg:   ss.avgScore,
        displayTotal: Math.round((ss.totalScore + bonus) * 10) / 10,
      };
    })
    .sort((a, b) =>
      scoreMode === 'total'
        ? b.displayTotal - a.displayTotal
        : b.displayAvg   - a.displayAvg
    );

  return (
    <div className="page">

      {/* Sélecteur de saison */}
      {seasons.length > 0 && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Saison</label>
          <select
            value={selectedSeasonId ?? 'all'}
            onChange={e => handleSeasonChange(e.target.value === 'all' ? null : e.target.value)}
            style={{ marginTop: 6 }}
          >
            <option value="all">🗂️ Toutes les saisons (all-time)</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.is_active ? '🟢 ' : ''}{s.name}
                {s.is_active ? ' — en cours' : ` — ${fmtDate(s.start_date)} → ${s.end_date ? fmtDate(s.end_date) : '?'}`}
              </option>
            ))}
          </select>
          {selectedSeasonId === null && (
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6 }}>
              📊 Cumul de toutes les saisons confondues.
            </div>
          )}
        </div>
      )}

      {/* Tabs ligne 1 */}
      <div className="tab-row">
        {[['global','🌍 Général'],['att','⚡ ATQ'],['mid','🔄 MIL'],['def','🛡️ DEF']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Tabs ligne 2 — classements spéciaux */}
      <div className="tab-row" style={{ marginTop:4 }}>
        {[['buts','⚽ Buteurs'],['passd','🎯 Passeurs'],['cleansheets','🧤 Clean Sheets'],['winratio','📊 Ratio V'],['duo','🤝 Duos'],['teamtype','🌟 Équipe type'],['session','📅 Par date']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>

      ) : tab === 'buts' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>⚽</span><span>Classement par <strong style={{ color:'var(--att)' }}>nombre de buts</strong> — tous postes confondus.</span>
            </div>
          </div>
          <RankingButs players={players} allStats={allStats} />
        </>

      ) : tab === 'passd' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>🎯</span><span>Classement par <strong style={{ color:'var(--mid)' }}>passes décisives</strong> — tous postes confondus.</span>
            </div>
          </div>
          <RankingPassD players={players} allStats={allStats} />
        </>

      ) : tab === 'cleansheets' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>🧤</span><span>Classement des <strong style={{ color:'var(--def)' }}>défenseurs</strong> par clean sheets.</span>
            </div>
          </div>
          <RankingDef players={players} allStats={allStats} />
        </>

      ) : tab === 'winratio' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>📊</span><span>Classement par <strong style={{ color:'var(--neon)' }}>ratio victoires / matchs joués</strong> — à partir de 5 matchs joués, tous postes confondus.</span>
            </div>
          </div>
          <RankingWinRatio players={players} allStats={allStats} />
        </>

      ) : tab === 'duo' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>🤝</span><span>Les paires de joueurs qui gagnent — ou perdent — le plus souvent <strong style={{ color:'var(--neon)' }}>ensemble</strong> (victoire = 3 pts, nul = 1 pt, sur le total de points possibles). Utile pour équilibrer le tirage dans Équipes.</span>
            </div>
          </div>
          <RankingDuos matches={matches} />
        </>

      ) : tab === 'teamtype' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>🌟</span><span>L'<strong style={{ color:'var(--neon)' }}>équipe type</strong> — les 6 meilleurs, semaine par semaine ou sur la saison entière.</span>
            </div>
          </div>
          <TeamOfTheTypeSection sessionStats={sessionStats} players={players} allStats={allStats} />
        </>

      ) : tab === 'session' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>📅</span><span>Classement <strong style={{ color:'var(--neon)' }}>d'un match précis</strong> — choisis une date.</span>
            </div>
          </div>
          <RankingBySession sessionStats={sessionStats} />
        </>

      ) : (
        <>
          {/* Toggle moyenne / cumulé */}
          <div style={{ display:'flex', gap:8, margin:'8px 0' }}>
            <button className={`btn btn-sm ${scoreMode==='avg'?'btn-primary':'btn-ghost'}`} onClick={() => setScoreMode('avg')} style={{ flex:1 }}>
              ⚖️ Moyenne / match
            </button>
            <button className={`btn btn-sm ${scoreMode==='total'?'btn-primary':'btn-ghost'}`} onClick={() => setScoreMode('total')} style={{ flex:1 }}>
              📈 Cumulé saison
            </button>
          </div>

          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>{scoreMode==='avg'?'⚖️':'📈'}</span>
              {scoreMode==='avg'
                ? <span>Classement par <strong style={{ color:'var(--neon)' }}>moyenne/match</strong> — les joueurs occasionnels ne sont pas pénalisés.</span>
                : <span>Classement par <strong style={{ color:'var(--neon)' }}>score cumulé</strong> sur la saison — bonus admin inclus.</span>
              }
            </div>
          </div>

          {!ranked.length ? (
            <div className="empty"><div className="empty-icon">📊</div><p>Aucun joueur dans cette catégorie</p></div>
          ) : (
            <div className="card">
              {ranked.map((p, i) => {
                const badge   = getSeasonBadge(p.ss.avgScore, p.ss.matchCount);
                const comment = getBestComment(allStats, p.id, p.pos);
                const bonus   = parseFloat(p.bonus_pts || 0);
                const isOpen  = !!expanded[p.id];

                return (
                  <div key={p.id}>
                    {/* Ligne principale — clic pour ouvrir le détail */}
                    <div className="lb-row" style={{ cursor:'pointer' }} onClick={() => toggleExpanded(p.id)}>
                      <div className={`lb-rank ${rankCls(i)}`}>
                        {i===0?'👑':i===1?'🥈':i===2?'🥉':i+1}
                      </div>
                      <div className={`avatar ${avatarCls(p.pos)}`} style={{ width:42, height:42, fontSize:'0.88rem' }}>
                        {initials(p.name)}
                      </div>
                      <div className="lb-info">
                        <div className="lb-name">
                          {p.name}
                          <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
                          {p.ss.mvpCount > 0 && (
                            <span className="mvp-pill" style={{ fontSize:'0.65rem', padding:'1px 6px' }}>⭐ ×{p.ss.mvpCount}</span>
                          )}
                          {bonus !== 0 && (
                            <span style={{
                              fontSize:'0.62rem', fontWeight:700,
                              color:'#f5c518', background:'#f5c51820',
                              borderRadius:4, padding:'1px 5px', marginLeft:2,
                            }}>
                              {bonus > 0 ? `+${bonus}` : bonus} pts
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop:3 }}>
                          <span className="badge" style={{
                            color:badge.color, background:`${badge.color}18`,
                            borderColor:`${badge.color}40`, fontSize:'0.65rem',
                          }}>{badge.emoji} {badge.label}</span>
                        </div>
                        <div className="lb-details" style={{ marginTop:5 }}>
                          <span className="pill">🎮 {p.ss.matchCount}m</span>
                          <span className="pill">🏆 {p.ss.wins}V</span>
                          <span className="pill">Niv.{p.level}</span>
                          {p.pos !== 'DEF' && p.ss.buts  > 0 && <span className="pill">⚽ {p.ss.buts}</span>}
                          {p.pos !== 'DEF' && p.ss.passD > 0 && <span className="pill">🎯 {p.ss.passD}PD</span>}
                          {p.pos === 'DEF'                    && <span className="pill">🧤 {p.ss.cleanSheets}CS</span>}
                        </div>
                        {comment && (
                          <div style={{
                            marginTop:5, fontSize:'0.68rem', color:'var(--muted2)',
                            display:'flex', alignItems:'center', gap:4,
                            background:'var(--bg3)', borderRadius:6, padding:'3px 7px',
                          }}>
                            <span style={{ fontSize:'0.85rem' }}>{comment.emoji}</span>
                            <span style={{ fontStyle:'italic' }}>{comment.text}</span>
                          </div>
                        )}
                      </div>

                      {/* Score + chevron */}
                      <div className="avg-indicator" style={{ flexShrink:0 }}>
                        <div className="avg-val">
                          {scoreMode==='avg' ? p.displayAvg : p.displayTotal}
                        </div>
                        <div className="avg-label">{scoreMode==='avg'?'moy/m':'total'}</div>
                        {scoreMode==='avg'
                          ? <div className="avg-matches">{p.displayTotal} tot.</div>
                          : <div className="avg-matches">{p.displayAvg} moy.</div>
                        }
                        <div style={{ fontSize:'0.58rem', color:'var(--muted)', marginTop:2, textAlign:'center' }}>
                          {isOpen ? '▲' : '▼'}
                        </div>
                      </div>
                    </div>

                    {/* Panneau détail */}
                    {isOpen && (
                      <div style={{ padding:'4px 12px 14px', borderTop:'1px solid var(--border)' }}>
                        <ScoreBreakdown pos={p.pos} ss={p.ss} bonusPts={p.bonus_pts} />

                        <Link
                          href={`/joueur/${p.id}`}
                          onClick={e => e.stopPropagation()}
                          className="btn btn-ghost btn-sm"
                          style={{ marginTop: 8, width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
                        >
                          📊 Voir la fiche complète →
                        </Link>

                        {isAdmin && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop:8, width:'100%', borderColor:'#f5c518', color:'#f5c518' }}
                            onClick={e => { e.stopPropagation(); setBonusModal(p); }}
                          >
                            ⭐ {bonus !== 0
                              ? `Modifier le bonus (${bonus > 0 ? '+' : ''}${bonus} pts)`
                              : 'Ajouter un bonus de points'}
                          </button>
                        )}
                        {p.bonus_reason && (
                          <div style={{ marginTop:4, fontSize:'0.66rem', color:'#f5c518', fontStyle:'italic' }}>
                            📝 {p.bonus_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Formules */}
          <div className="card">
            <div className="card-title">Formules de notation</div>
            <div className="formula-grid">
              {[
                { pos:'ATQ', color:'var(--att)', text:'But×3 + Passe D×2 + Note + Victoire×3 / Nul×1 + MVP' },
                { pos:'MIL', color:'var(--mid)', text:'But×2 + Passe D×3 + Note + Victoire×3 / Nul×1 + MVP' },
                { pos:'DEF', color:'var(--def)', text:'CS×3 + But×1 + Passe Dx1 + Note×1.5 + Victoire×3 / Nul×1 + MVP' },
              ].map(f => (
                <div key={f.pos} className="formula-card" style={{ borderLeftColor:f.color }}>
                  <div className="formula-pos" style={{ color:f.color }}>{f.pos}</div>
                  <div className="formula-text">{f.text}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10, padding:'8px 12px', background:'var(--neon-dim)', borderRadius:8, fontSize:'0.72rem', color:'var(--muted2)' }}>
              💡 Score = <strong style={{ color:'var(--neon)' }}>
                {scoreMode==='avg' ? 'moyenne par match joué' : 'cumulé saison + bonus admin'}
              </strong>.
            </div>
          </div>

          {/* Badges */}
          <div className="card">
            <div className="card-title">Badges (moy/match)</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { label:'Novice',   color:'#555',    emoji:'🌱', desc:'0 match' },
                { label:'Rookie',   color:'#9eaab8', emoji:'🎮', desc:'<7 moy' },
                { label:'En forme', color:'#3d9eff', emoji:'📈', desc:'7+ moy' },
                { label:'Confirmé', color:'#00ff87', emoji:'⚡', desc:'11+ moy' },
                { label:'Elite',    color:'#FF6B35', emoji:'🔥', desc:'15+ moy' },
                { label:'Légende',  color:'#f5c518', emoji:'👑', desc:'20+ moy' },
              ].map(b => (
                <div key={b.label} className="badge" style={{
                  flexDirection:'column', background:`${b.color}18`,
                  color:b.color, borderColor:`${b.color}40`,
                  padding:'6px 10px', fontSize:'0.68rem', alignItems:'center', gap:2,
                }}>
                  <span style={{ fontSize:'1rem' }}>{b.emoji}</span>
                  <span style={{ fontWeight:700 }}>{b.label}</span>
                  <span style={{ opacity:0.7 }}>{b.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Modal bonus admin */}
      {bonusModal && (
        <BonusModal
          player={bonusModal}
          onClose={() => setBonusModal(null)}
          onSave={(update) => handleBonusSaved(bonusModal.id, update)}
        />
      )}
    </div>
  );
}