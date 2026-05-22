// pages/equipes.js
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { generateTeams } from '../lib/score';
import { initials, avatarCls, posCls, fmtDate } from '../lib/helpers';
import { toast } from '../components/Toast';

const POSITIONS = ['ATQ', 'MIL', 'DEF'];

// Couleurs et libellés pour chaque équipe
const TEAM_META = {
  A: { label: 'Éq. A', color: 'var(--neon)',  borderColor: 'rgba(0,255,135,0.25)',  bgKey: 'neon-dim'  },
  B: { label: 'Éq. B', color: 'var(--blue)',  borderColor: 'rgba(61,158,255,0.25)', bgKey: 'blue-dim'  },
  C: { label: 'Éq. C', color: 'var(--gold)',  borderColor: 'rgba(245,197,24,0.25)', bgKey: 'gold-dim'  },
};

/* ─── Modal ajout / édition joueur ─── */
function PlayerModal({ player, onClose, onSaved }) {
  const isEdit = !!player?.id;
  const [name,     setName]     = useState(player?.name  || '');
  const [pos,      setPos]      = useState(player?.pos   || 'MIL');
  const [level,    setLevel]    = useState(player?.level ?? 5);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!name.trim()) { toast('⚠️ Le nom est requis'); return; }
    setSaving(true);
    const payload = { name: name.trim(), pos, level: parseFloat(level) };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from('players').update(payload).eq('id', player.id));
    } else {
      ({ error } = await supabase.from('players').insert(payload));
    }
    setSaving(false);
    if (error) { toast('❌ Erreur sauvegarde'); return; }
    toast(isEdit ? `✅ ${name} mis à jour` : `✅ ${name} ajouté !`);
    onSaved(); onClose();
  }

  async function deletePlayer() {
    if (!isEdit) return;
    if (!confirm(`Supprimer définitivement ${player.name} ? Cette action est irréversible.`)) return;
    setDeleting(true);
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    setDeleting(false);
    if (error) { toast('❌ Erreur suppression'); return; }
    toast(`🗑️ ${player.name} supprimé`);
    onSaved(); onClose();
  }

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.82)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:20, width:'100%', maxWidth:340 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight:800, fontSize:'1rem', marginBottom:14 }}>
          {isEdit ? `✏️ Modifier — ${player.name}` : '➕ Nouveau joueur'}
        </div>

        <label style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700 }}>Nom</label>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Prénom Nom" onKeyDown={e => e.key === 'Enter' && save()}
          style={{ width:'100%', marginTop:6, marginBottom:14, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', fontSize:'0.85rem', color:'var(--fg)', boxSizing:'border-box' }}
        />

        <label style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700 }}>Position</label>
        <div style={{ display:'flex', gap:8, margin:'6px 0 14px' }}>
          {POSITIONS.map(p2 => (
            <button key={p2} onClick={() => setPos(p2)} style={{
              flex:1, padding:'7px 0', borderRadius:8, fontWeight:700, fontSize:'0.78rem',
              fontFamily:'var(--font-head)', letterSpacing:'0.5px', cursor:'pointer', border:'1px solid',
              background: pos===p2 ? (p2==='ATQ' ? 'var(--att-dim)' : p2==='MIL' ? 'var(--mid-dim)' : 'var(--def-dim)') : 'transparent',
              color: p2==='ATQ' ? 'var(--att)' : p2==='MIL' ? 'var(--mid)' : 'var(--def)',
              borderColor: p2==='ATQ' ? 'var(--att)' : p2==='MIL' ? 'var(--mid)' : 'var(--def)',
            }}>{p2}</button>
          ))}
        </div>

        <label style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700 }}>
          Niveau <span style={{ color:'var(--neon)', fontWeight:800 }}>{level}</span> / 10
        </label>
        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'6px 0 18px' }}>
          <button className="counter-btn" onClick={() => setLevel(v => Math.max(1, Math.round((v-0.5)*10)/10))}>−</button>
          <input type="range" min={1} max={10} step={0.5} value={level}
            onChange={e => setLevel(parseFloat(e.target.value))}
            style={{ flex:1, accentColor:'var(--neon)' }} />
          <button className="counter-btn" onClick={() => setLevel(v => Math.min(10, Math.round((v+0.5)*10)/10))}>+</button>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose}>Annuler</button>
          {isEdit && (
            <button className="btn btn-ghost" style={{ borderColor:'#ff5555', color:'#ff5555' }}
              disabled={deleting} onClick={deletePlayer}>
              {deleting ? '⏳' : '🗑️'}
            </button>
          )}
          <button className="btn btn-primary" style={{ flex:2 }} onClick={save} disabled={saving}>
            {saving ? '⏳...' : isEdit ? '💾 Mettre à jour' : '➕ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal édition des équipes formées ─── */
function TeamEditorModal({ teams, numTeams, allPlayers, editedPos, onClose, onApply }) {
  const [teamA, setTeamA] = useState([...teams.teamA]);
  const [teamB, setTeamB] = useState([...teams.teamB]);
  const [teamC, setTeamC] = useState([...(teams.teamC || [])]);

  const [bench, setBench] = useState(
    allPlayers.filter(p =>
      !teams.teamA.find(x => x.id === p.id) &&
      !teams.teamB.find(x => x.id === p.id) &&
      !(teams.teamC || []).find(x => x.id === p.id)
    )
  );

  const calcPower = arr =>
    arr.reduce((s, p) => s + Math.max(0, parseFloat(p.dynamic_level || p.level || 5) + parseFloat(p.bonus_pts || 0) / 10), 0);

  const powerA = calcPower(teamA);
  const powerB = calcPower(teamB);
  const powerC = calcPower(teamC);
  const total  = (numTeams === 3 ? powerA + powerB + powerC : powerA + powerB) || 1;
  const pctA   = Math.round((powerA / total) * 100);
  const pctB   = Math.round((powerB / total) * 100);
  const pctC   = numTeams === 3 ? 100 - pctA - pctB : 0;

  const diff = numTeams === 3
    ? Math.max(powerA, powerB, powerC) - Math.min(powerA, powerB, powerC)
    : Math.abs(powerA - powerB);
  const balance = diff < 0.5 ? 'Parfait ⚖️' : diff < 2 ? 'Équilibré ✅' : 'Déséquilibré ⚠️';

  // Déplace un joueur d'une zone à une autre ('A' | 'B' | 'C' | 'bench')
  function move(player, from, to) {
    const setter = { A: setTeamA, B: setTeamB, C: setTeamC, bench: setBench };
    setter[from](prev => prev.filter(p => p.id !== player.id));
    setter[to](prev => [...prev, player]);
  }

  function apply() {
    onApply({ teamA, teamB, teamC, pctA, pctB, pctC, balance });
    onClose();
  }

  const PlayerRow = ({ player, teamKey }) => {
    const pos   = editedPos[player.id] || player.pos;
    const bonus = parseFloat(player.bonus_pts || 0);
    // Boutons pour aller vers les autres équipes (pas la sienne)
    const otherTeams = numTeams === 3
      ? ['A', 'B', 'C'].filter(k => k !== teamKey)
      : ['A', 'B'].filter(k => k !== teamKey);

    return (
      <div style={{
        display:'flex', alignItems:'center', gap:6, marginBottom:5,
        background:'var(--bg2)', borderRadius:8, padding:'5px 7px',
        border:'1px solid var(--border)',
      }}>
        <div className={`avatar ${avatarCls(pos)}`} style={{ width:24, height:24, fontSize:'0.6rem', flexShrink:0 }}>
          {initials(player.name)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--fg)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ fontSize:'0.58rem', color:'var(--muted)' }}>
            Niv.{player.dynamic_level || player.level || 5}
            {bonus !== 0 && <span style={{ color:'#f5c518' }}> {bonus>0?'+':''}{bonus}</span>}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
          {otherTeams.map(tk => (
            <button key={tk}
              onClick={() => move(player, teamKey, tk)}
              title={`Passer en Éq.${tk}`}
              style={{ background:'transparent', border:`1px solid ${TEAM_META[tk].color}`, borderRadius:4, cursor:'pointer', fontSize:'0.65rem', padding:'2px 6px', color: TEAM_META[tk].color, lineHeight:1 }}
            >→ {tk}</button>
          ))}
          <button
            onClick={() => move(player, teamKey, 'bench')}
            title="Retirer de l'équipe"
            style={{ background:'transparent', border:'1px solid #ff555540', borderRadius:4, cursor:'pointer', fontSize:'0.65rem', padding:'2px 6px', color:'#ff5555', lineHeight:1 }}
          >✕</button>
        </div>
      </div>
    );
  };

  const teamEntries = numTeams === 3
    ? [['A', teamA], ['B', teamB], ['C', teamC]]
    : [['A', teamA], ['B', teamB]];

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px 12px', overflowY:'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:16, width:'100%', maxWidth:520, marginBottom:20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight:800, fontSize:'1rem', marginBottom:4 }}>✏️ Modifier les équipes</div>
        <div style={{ fontSize:'0.7rem', color:'var(--muted2)', marginBottom:12 }}>
          → pour changer d'équipe · ✕ pour mettre au banc.
        </div>

        {/* Balance live */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', marginBottom:4 }}>
            <span style={{ color:'var(--neon)', fontWeight:700 }}>A {pctA}%</span>
            {numTeams === 3 && <span style={{ color:'var(--gold)', fontWeight:700 }}>C {pctC}%</span>}
            <span style={{ color:'var(--muted)', fontWeight:500 }}>{balance}</span>
            <span style={{ color:'var(--blue)', fontWeight:700 }}>{pctB}% B</span>
          </div>
          <div className="balance-track">
            <div className="balance-fill" style={{ width: pctA+'%', transition:'width 0.25s' }} />
          </div>
        </div>

        {/* Colonnes équipes */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          {teamEntries.map(([key, members]) => {
            const meta = TEAM_META[key];
            return (
              <div key={key} style={{ flex:1, background:'var(--bg3)', border:`1px solid ${meta.borderColor}`, borderRadius:10, padding:'10px 8px' }}>
                <div style={{ fontWeight:800, fontSize:'0.82rem', color: meta.color, marginBottom:8, textAlign:'center' }}>
                  {meta.label} <span style={{ fontWeight:400, color:'var(--muted)', fontSize:'0.7rem' }}>({members.length})</span>
                </div>
                {members.length === 0 && (
                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', textAlign:'center', padding:'10px 0' }}>Vide</div>
                )}
                {members.map(p => <PlayerRow key={p.id} player={p} teamKey={key} />)}
              </div>
            );
          })}
        </div>

        {/* Banc */}
        <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px', marginBottom:14 }}>
          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--muted)', marginBottom: bench.length ? 8 : 0 }}>
            🪑 Banc {bench.length === 0 && <span style={{ fontWeight:400 }}>— aucun joueur en attente</span>}
          </div>
          {bench.map(p => {
            const pos = editedPos[p.id] || p.pos;
            return (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, background:'var(--bg2)', borderRadius:8, padding:'5px 7px', border:'1px solid var(--border)' }}>
                <div className={`avatar ${avatarCls(pos)}`} style={{ width:24, height:24, fontSize:'0.6rem', flexShrink:0 }}>
                  {initials(p.name)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--fg)' }}>{p.name}</div>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {(numTeams === 3 ? ['A', 'B', 'C'] : ['A', 'B']).map(tk => (
                    <button key={tk}
                      onClick={() => move(p, 'bench', tk)}
                      style={{ background:'transparent', border:`1px solid ${TEAM_META[tk].color}`, borderRadius:4, cursor:'pointer', fontSize:'0.65rem', padding:'2px 8px', color: TEAM_META[tk].color, fontWeight:700 }}
                    >+ {tk}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={apply}>✅ Appliquer</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ PAGE PRINCIPALE ══════════════ */
export default function Equipes() {
  const { isAdmin } = useAuth();
  const [players, setPlayers]         = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [selected, setSelected]       = useState([]);
  const [teams, setTeams]             = useState(null);
  const [numTeams, setNumTeams]       = useState(2); // 2 ou 3 équipes
  const [loading, setLoading]         = useState(true);
  const [sessionName, setSessionName] = useState('');
  const [savedId, setSavedId]         = useState(null);
  const [editedPos, setEditedPos]     = useState({});
  const [playerModal, setPlayerModal] = useState(null);
  const [teamEditor, setTeamEditor]   = useState(false);

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
    const minPlayers = numTeams;
    if (selected.length < minPlayers) { toast(`Sélectionne au moins ${minPlayers} joueurs`); return; }
    const withEdits = selected.map(p => ({ ...p, pos: editedPos[p.id] || p.pos }));
    const arr = [...withEdits];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setTeams(generateTeams(arr, numTeams));
    setSavedId(null);
  }, [selected, editedPos, numTeams]);

  async function saveSession() {
    if (!isAdmin) { toast('🔒 Connexion admin requise'); return; }
    if (!teams) { toast('Génère d\'abord les équipes'); return; }
    const name = sessionName.trim() || `Session du ${new Date().toLocaleDateString('fr-FR')}`;

    const payload = {
      name,
      team_a: teams.teamA.map(p => p.id),
      team_b: teams.teamB.map(p => p.id),
      ...(numTeams === 3 && teams.teamC?.length
        ? { team_c: teams.teamC.map(p => p.id) }
        : { team_c: [] }),
    };

    // ── UPDATE si la session existe déjà (après chargement ou première sauvegarde) ──
    if (savedId) {
      const { error } = await supabase
        .from('sessions').update(payload).eq('id', savedId);
      if (error) { toast('❌ Erreur mise à jour'); return; }
      toast('✅ Session mise à jour !');
      await loadAll();
      return;
    }

    // ── INSERT nouvelle session ──
    const { data, error } = await supabase
      .from('sessions').insert(payload).select().single();
    if (error) {
      // Fallback si la colonne team_c n'existe pas encore en base
      if (error.message?.includes('team_c')) {
        toast('⚠️ Colonne team_c absente — seules A et B sauvegardées');
        const { data: d2, error: e2 } = await supabase
          .from('sessions').insert({ name, team_a: payload.team_a, team_b: payload.team_b }).select().single();
        if (e2) { toast('❌ Erreur sauvegarde'); return; }
        toast('✅ Session sauvegardée !');
        setSavedId(d2.id); setSessionName(''); await loadAll();
      } else {
        toast('❌ Erreur sauvegarde');
      }
      return;
    }
    toast('✅ Session sauvegardée !');
    setSavedId(data.id); setSessionName(''); await loadAll();
  }

  async function deleteSession(id) {
    if (!isAdmin) return;
    if (!confirm('Supprimer cette session ?')) return;
    await supabase.from('sessions').delete().eq('id', id);
    toast('Session supprimée');
    await loadAll();
  }

  async function handlePlayerSaved() {
    await loadAll();
    const { data: fresh } = await supabase.from('players').select('id');
    const freshIds = new Set((fresh || []).map(p => p.id));
    setSelected(prev => prev.filter(p => freshIds.has(p.id)));
    setTeams(null);
  }

  function loadSession(s) {
    const getPlayer = id => players.find(p => p.id === id);
    const tA = (s.team_a || []).map(getPlayer).filter(Boolean);
    const tB = (s.team_b || []).map(getPlayer).filter(Boolean);
    const tC = (s.team_c || []).map(getPlayer).filter(Boolean);
    const has3 = tC.length > 0;
    const allSel = [...tA, ...tB, ...tC];

    const calcPower = arr =>
      arr.reduce((sum, p) => sum + Math.max(0, parseFloat(p.dynamic_level || p.level || 5) + parseFloat(p.bonus_pts || 0) / 10), 0);
    const pA = calcPower(tA);
    const pB = calcPower(tB);
    const pC = calcPower(tC);
    const tot = (has3 ? pA + pB + pC : pA + pB) || 1;
    const pctA = Math.round((pA / tot) * 100);
    const pctB = Math.round((pB / tot) * 100);
    const pctC = has3 ? 100 - pctA - pctB : 0;
    const diff = has3 ? Math.max(pA, pB, pC) - Math.min(pA, pB, pC) : Math.abs(pA - pB);
    const balance = diff < 0.5 ? 'Parfait ⚖️' : diff < 2 ? 'Équilibré ✅' : 'Déséquilibré ⚠️';

    setNumTeams(has3 ? 3 : 2);
    setSelected(allSel);
    setTeams({ teamA: tA, teamB: tB, teamC: tC, pctA, pctB, pctC, balance });
    setSavedId(s.id);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
    toast(`↩ Session "${s.name}" chargée — tu peux modifier les équipes`);
  }

  // Validation sélection
  const selectionOk = numTeams === 3
    ? selected.length >= 3
    : selected.length >= 2;

  return (
    <div className="page">

      {/* Modals */}
      {playerModal !== null && (
        <PlayerModal
          player={playerModal?.id ? playerModal : null}
          onClose={() => setPlayerModal(null)}
          onSaved={handlePlayerSaved}
        />
      )}
      {teamEditor && teams && (
        <TeamEditorModal
          teams={teams}
          numTeams={numTeams}
          allPlayers={selected}
          editedPos={editedPos}
          onClose={() => setTeamEditor(false)}
          onApply={newTeams => { setTeams(newTeams); setSavedId(null); }}
        />
      )}

      {/* Sessions récentes */}
      {sessions.length > 0 && (
        <div className="card">
          <div className="card-title">Sessions récentes</div>
          {sessions.slice(0, 5).map(s => {
            const getName = pid => players.find(p => p.id === pid)?.name || '?';
            const allIds = [...(s.team_a || []), ...(s.team_b || []), ...(s.team_c || [])];
            const has3 = (s.team_c || []).length > 0;
            return (
              <div key={s.id} className={`session-card${savedId === s.id ? ' selected' : ''}`}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:'0.95rem' }}>{s.name}</div>
                    <div style={{ fontSize:'0.7rem', color:'var(--muted)', marginTop:2 }}>
                      {fmtDate(s.created_at?.slice(0, 10))} · {allIds.length} joueurs · {has3 ? '3 équipes' : '2 équipes'}
                    </div>
                    <div style={{ fontSize:'0.72rem', marginTop:5, lineHeight:1.6 }}>
                      <span style={{ color:'var(--neon)', fontWeight:700 }}>A : </span>
                      <span style={{ color:'var(--muted2)' }}>{(s.team_a || []).map(id => getName(id)).join(', ')}</span>
                      <br />
                      <span style={{ color:'var(--blue)', fontWeight:700 }}>B : </span>
                      <span style={{ color:'var(--muted2)' }}>{(s.team_b || []).map(id => getName(id)).join(', ')}</span>
                      {has3 && (
                        <>
                          <br />
                          <span style={{ color:'var(--gold)', fontWeight:700 }}>C : </span>
                          <span style={{ color:'var(--muted2)' }}>{(s.team_c || []).map(id => getName(id)).join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0, marginLeft:8 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ fontSize:'0.65rem', borderColor:'#f5c518', color:'#f5c518', whiteSpace:'nowrap' }}
                      onClick={() => loadSession(s)}
                      title="Charger et modifier ces équipes"
                    >✏️ Modifier</button>
                    {isAdmin && (
                      <button className="btn btn-danger btn-xs" onClick={() => deleteSession(s.id)}>🗑️</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generator */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div className="card-title" style={{ margin:0 }}>Générer des équipes équilibrées</div>
          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize:'0.72rem', borderColor:'var(--neon)', color:'var(--neon)' }}
              onClick={() => setPlayerModal({})}
            >➕ Joueur</button>
          )}
        </div>

        {/* Choix du nombre d'équipes */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:'0.72rem', color:'var(--muted)', fontWeight:700, marginBottom:6 }}>
            Nombre d'équipes à générer
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {[2, 3].map(n => (
              <button key={n} onClick={() => { setNumTeams(n); setTeams(null); setSavedId(null); }} style={{
                flex:1, padding:'8px 0', borderRadius:8, fontWeight:800, fontSize:'0.82rem',
                fontFamily:'var(--font-head)', letterSpacing:'0.5px', cursor:'pointer',
                border:'1.5px solid',
                background: numTeams === n ? 'var(--neon-dim)' : 'transparent',
                color: numTeams === n ? 'var(--neon)' : 'var(--muted)',
                borderColor: numTeams === n ? 'var(--neon)' : 'var(--border)',
                transition:'all 0.15s',
              }}>
                {n === 2 ? '⚔️ 2 équipes' : '🔺 3 équipes'}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <div className="player-grid">
            {players.map(p => {
              const isSel = !!selected.find(x => x.id === p.id);
              const pos   = editedPos[p.id] || p.pos;
              const bonus = parseFloat(p.bonus_pts || 0);
              return (
                <div key={p.id} style={{ position:'relative' }}>
                  <div onClick={() => togglePlayer(p)} className={`player-card${isSel ? ' selected' : ''}`}>
                    <div className={`avatar ${avatarCls(pos)}`} style={{ width:36, height:36, fontSize:'0.8rem' }}>
                      {initials(p.name)}
                    </div>
                    <div className="player-name">{p.name}</div>
                    <span className={`pos-tag ${posCls(pos)}`} style={{ fontSize:'0.6rem' }}>{pos}</span>
                    {bonus !== 0 && (
                      <span style={{ position:'absolute', top:3, right:3, fontSize:'0.52rem', fontWeight:800, color:'#f5c518', background:'#f5c51825', borderRadius:3, padding:'1px 4px', lineHeight:1.4 }}>
                        {bonus > 0 ? '+' : ''}{bonus}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); setPlayerModal(p); }}
                      style={{ position:'absolute', bottom:2, right:2, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, cursor:'pointer', fontSize:'0.6rem', padding:'1px 4px', color:'var(--muted)', lineHeight:1.4, zIndex:1 }}
                      title={`Modifier ${p.name}`}
                    >✏️</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop:10, fontSize:'0.72rem', color:'var(--muted)', display:'flex', alignItems:'center', gap:10 }}>
          <span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          {numTeams === 2 && selected.length >= 2 && selected.length % 2 === 0 && <span style={{ color:'var(--neon)' }}>✓ Nombre pair</span>}
          {numTeams === 2 && selected.length >= 2 && selected.length % 2 !== 0 && <span style={{ color:'var(--gold)' }}>⚠ Nombre impair</span>}
          {numTeams === 3 && selected.length >= 3 && selected.length % 3 === 0 && <span style={{ color:'var(--neon)' }}>✓ Répartition parfaite</span>}
          {numTeams === 3 && selected.length >= 3 && selected.length % 3 !== 0 && <span style={{ color:'var(--gold)' }}>⚠ {selected.length % 3} joueur(s) en surplus</span>}
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
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'4px 0' }}>
            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--muted)' }}>Résultat des équipes</div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize:'0.72rem', borderColor:'#f5c518', color:'#f5c518' }}
              onClick={() => setTeamEditor(true)}
            >✏️ Modifier les équipes</button>
          </div>

          {/* Affichage des équipes */}
          <div className="team-display" style={{ gridTemplateColumns: numTeams === 3 ? '1fr 1fr 1fr' : '1fr 1fr' }}>
            {[
              { key: 'A', players: teams.teamA },
              { key: 'B', players: teams.teamB },
              ...(numTeams === 3 ? [{ key: 'C', players: teams.teamC || [] }] : []),
            ].map(({ key, players: tpls }) => {
              const meta = TEAM_META[key];
              return (
                <div key={key} className={`team-box team-${key.toLowerCase()}`}>
                  <h3 style={{ color: meta.color }}>
                    {meta.label} <span style={{ fontSize:'0.7rem', color:'var(--muted)', fontFamily:'var(--font-body)', fontWeight:400 }}>{tpls.length}</span>
                  </h3>
                  {tpls.map(p => {
                    const pos   = editedPos[p.id] || p.pos;
                    const bonus = parseFloat(p.bonus_pts || 0);
                    return (
                      <div key={p.id} className="team-player">
                        <div className={`avatar ${avatarCls(pos)}`} style={{ width:28, height:28, fontSize:'0.65rem', flexShrink:0 }}>
                          {initials(p.name)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div className="team-player-name" style={{ fontSize:'0.82rem' }}>{p.name}</div>
                            <span style={{ fontSize:'0.6rem', color:'var(--muted)', fontWeight:600 }}>
                              Niv.{p.dynamic_level || p.level || 5}
                              {bonus !== 0 && <span style={{ color:'#f5c518', fontWeight:800, marginLeft:2 }}>{bonus>0?'+':''}{bonus}</span>}
                            </span>
                          </div>
                          <div style={{ display:'flex', gap:2, flexWrap:'wrap', marginTop:2 }}>
                            {POSITIONS.map(pos2 => (
                              <button key={pos2}
                                onClick={e => { e.stopPropagation(); setEditedPos(prev => ({ ...prev, [p.id]: pos2 })); }}
                                style={{
                                  padding:'1px 5px', borderRadius:4, fontSize:'0.6rem', fontWeight:700,
                                  border:'1px solid', cursor:'pointer', fontFamily:'var(--font-head)', letterSpacing:'0.3px',
                                  background: pos===pos2 ? (pos2==='ATQ' ? 'var(--att-dim)' : pos2==='MIL' ? 'var(--mid-dim)' : 'var(--def-dim)') : 'transparent',
                                  color: pos2==='ATQ' ? 'var(--att)' : pos2==='MIL' ? 'var(--mid)' : 'var(--def)',
                                  borderColor: pos2==='ATQ' ? 'var(--att)' : pos2==='MIL' ? 'var(--mid)' : 'var(--def)',
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
              );
            })}
          </div>

          {/* Balance bar */}
          <div className="balance-bar-wrap">
            <div className="balance-labels">
              <span style={{ color:'var(--neon)' }}>A {teams.pctA}%</span>
              {numTeams === 3 && <span style={{ color:'var(--gold)' }}>C {teams.pctC}%</span>}
              <span style={{ fontSize:'0.72rem', color:'var(--muted)', fontFamily:'var(--font-body)', fontWeight:500 }}>{teams.balance}</span>
              <span style={{ color:'var(--blue)' }}>{teams.pctB}% B</span>
            </div>
            <div className="balance-track">
              <div className="balance-fill" style={{ width: teams.pctA+'%' }} />
            </div>
          </div>

          {/* Save */}
          {isAdmin ? (
            <div className="card">
              <div className="card-title">{savedId ? '💾 Mettre à jour la session' : 'Sauvegarder la session'}</div>
              <div className="field">
                <label>Nom de la session</label>
                <input value={sessionName} onChange={e => setSessionName(e.target.value)}
                  placeholder={`Session du ${new Date().toLocaleDateString('fr-FR')}`}
                  onKeyDown={e => e.key === 'Enter' && saveSession()} />
              </div>
              <button className="btn btn-primary" onClick={saveSession}>
                {savedId ? '🔄 Mettre à jour' : '💾 Sauvegarder'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--muted)' }}>
              🔒 Connecte-toi en admin pour sauvegarder la session.
            </div>
          )}
        </>
      )}
    </div>
  );
}