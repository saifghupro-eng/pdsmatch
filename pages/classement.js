// pages/classement.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { playerSeasonStats, getSeasonBadge, getFunComment, calcScore } from '../lib/score';
import { initials, avatarCls, posCls, rankCls } from '../lib/helpers';
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

/* ══════════════ PAGE PRINCIPALE ══════════════ */
export default function Classement() {
  const { isAdmin }                 = useAuth();
  const [tab, setTab]               = useState('global');
  const [scoreMode, setScoreMode]   = useState('avg');
  const [players, setPlayers]       = useState([]);
  const [allStats, setAllStats]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState({});   // { [pid]: bool }
  const [bonusModal, setBonusModal] = useState(null); // player | null

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: pls }, { data: stats }] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('match_stats').select('*, players(pos)'),
    ]);
    setPlayers(pls || []);
    setAllStats(stats || []);
    setLoading(false);
  }

  function toggleExpanded(pid) {
    setExpanded(prev => ({ ...prev, [pid]: !prev[pid] }));
  }

  function handleBonusSaved(pid, update) {
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, ...update } : p));
  }

  const isSpecial = ['buts', 'passd', 'def'].includes(tab);

  const posFilterMap = { global: null, att: 'ATQ', mid: 'MIL' };
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
      scoreMode === 'avg'
        ? b.displayAvg   - a.displayAvg
        : b.displayTotal - a.displayTotal
    );

  return (
    <div className="page">

      {/* Tabs ligne 1 */}
      <div className="tab-row">
        {[['global','🌍 Général'],['att','⚡ ATQ'],['mid','🔄 MIL']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Tabs ligne 2 — classements spéciaux */}
      <div className="tab-row" style={{ marginTop:4 }}>
        {[['buts','⚽ Buteurs'],['passd','🎯 Passeurs'],['def','🛡️ Défenseurs']].map(([k,l]) => (
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

      ) : tab === 'def' ? (
        <>
          <div className="card" style={{ padding:'10px 14px' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--muted2)', display:'flex', alignItems:'center', gap:6 }}>
              <span>🛡️</span><span>Classement des <strong style={{ color:'var(--def)' }}>défenseurs</strong> par clean sheets.</span>
            </div>
          </div>
          <RankingDef players={players} allStats={allStats} />
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