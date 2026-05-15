// pages/admin.js
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { initials, avatarCls, posCls } from '../lib/helpers';
import { toast } from '../components/Toast';

export default function Admin() {
  const { isAdmin, user, signIn, signOut, loading: authLoading } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [logging, setLogging]   = useState(false);

  const [players, setPlayers]   = useState([]);
  const [pLoaded, setPLoaded]   = useState(false);
  const [pLoading, setPLoading] = useState(false);

  const [newName,  setNewName]  = useState('');
  const [newPos,   setNewPos]   = useState('ATQ');
  const [newLevel, setNewLevel] = useState(5);

  const [editId,    setEditId]    = useState(null);
  const [editName,  setEditName]  = useState('');
  const [editPos,   setEditPos]   = useState('ATQ');
  const [editLevel, setEditLevel] = useState(5);

  async function handleLogin() {
    if (!email || !password) { toast('Remplis tous les champs'); return; }
    setLogging(true);
    try {
      await signIn(email, password);
      toast('🔓 Connecté en admin');
      loadPlayers();
    } catch (err) {
      toast('❌ ' + (err.message || 'Erreur de connexion'));
    }
    setLogging(false);
  }

  async function loadPlayers() {
    setPLoading(true);
    const { data } = await supabase.from('players').select('*').order('name');
    setPlayers(data || []);
    setPLoaded(true);
    setPLoading(false);
  }

  if (isAdmin && !pLoaded && !pLoading) loadPlayers();

  async function addPlayer() {
    const name = newName.trim();
    if (!name) { toast('Saisis un pseudo'); return; }
    if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) { toast('Pseudo déjà utilisé'); return; }
    const { error } = await supabase.from('players').insert({ name, pos: newPos, level: parseInt(newLevel) || 5 });
    if (error) { toast('❌ Erreur ajout'); return; }
    toast('✅ ' + name + ' ajouté !');
    setNewName(''); setNewLevel(5);
    loadPlayers();
  }

  async function saveEdit(id) {
    const name = editName.trim();
    if (!name) { toast('Pseudo vide'); return; }
    const { error } = await supabase.from('players')
      .update({ name, pos: editPos, level: parseInt(editLevel) || 5 })
      .eq('id', id);
    if (error) { toast('❌ Erreur mise à jour'); return; }
    toast('✅ Joueur mis à jour');
    setEditId(null);
    loadPlayers();
  }

  async function removePlayer(id, name) {
    if (!confirm(`Supprimer ${name} et toutes ses stats ?`)) return;
    await supabase.from('players').delete().eq('id', id);
    toast('Joueur supprimé');
    loadPlayers();
  }

  async function resetAll() {
    if (!confirm('⚠️ Supprimer TOUTES les données ?')) return;
    if (!confirm('Confirmation finale — action irréversible !')) return;
    for (const t of ['match_stats', 'match_players', 'matches', 'sessions', 'players']) {
      await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    toast('Données supprimées');
    loadPlayers();
  }

  if (authLoading) {
    return <div className="loading" style={{ marginTop: '4rem' }}><div className="spinner" />Chargement…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="auth-box">
          <div className="auth-icon">🔒</div>
          <div className="card">
            <div className="card-title">Zone Admin</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: 16 }}>
              Connecte-toi avec ton compte Supabase Admin.
            </p>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="admin@exemple.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={logging}>
              {logging ? '⏳ Connexion...' : '→ Se connecter'}
            </button>
            <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>
              Crée le compte dans Supabase → Authentication → Users
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: 1 }}>
            Zone Admin
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{user?.email}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { signOut(); toast('Déconnecté'); }}>
          🚪 Déconnexion
        </button>
      </div>

      {/* Add player */}
      <div className="card">
        <div className="card-title">Ajouter un joueur</div>
        <div className="row3">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Pseudo</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="ex: Rayan" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Poste</label>
            <select value={newPos} onChange={e => setNewPos(e.target.value)}>
              <option value="ATQ">⚡ ATQ</option>
              <option value="MIL">🔄 MIL</option>
              <option value="DEF">🛡️ DEF</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Niveau (1-10)</label>
            <input type="number" min={1} max={10} value={newLevel}
              onChange={e => setNewLevel(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '10px 0' }}>
          💡 Le niveau se recalcule automatiquement après chaque match.
        </p>
        <button className="btn btn-primary" onClick={addPlayer}>+ Ajouter</button>
      </div>

      {/* Player list */}
      <div className="card">
        <div className="card-title">Joueurs ({players.length})</div>
        {pLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : !players.length ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '1rem 0' }}>Aucun joueur</div>
        ) : players.map(p => (
          <div key={p.id} className="lb-row" style={{ flexWrap: 'wrap' }}>
            <div className={`avatar ${avatarCls(editId === p.id ? editPos : p.pos)}`}
              style={{ width: 38, height: 38, flexShrink: 0 }}>
              {initials(editId === p.id ? editName || p.name : p.name)}
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              {editId === p.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="Pseudo" />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={editPos} onChange={e => setEditPos(e.target.value)}
                      style={{ width: 'auto' }}>
                      <option value="ATQ">ATQ</option>
                      <option value="MIL">MIL</option>
                      <option value="DEF">DEF</option>
                    </select>
                    <input type="number" min={1} max={10} value={editLevel}
                      onChange={e => setEditLevel(e.target.value)}
                      style={{ width: 64 }} />
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p.id)}>💾</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                    <span className={`pos-tag ${posCls(p.pos)}`}>{p.pos}</span>
                    {' · '}Niveau {p.level}
                  </div>
                </>
              )}
            </div>
            {editId !== p.id && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-xs" onClick={() => {
                  setEditId(p.id); setEditName(p.name); setEditPos(p.pos); setEditLevel(p.level);
                }}>✏️</button>
                <button className="btn btn-danger btn-xs" onClick={() => removePlayer(p.id, p.name)}>🗑️</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="card danger-card">
        <div className="card-title">Zone dangereuse</div>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 12 }}>Ces actions sont irréversibles.</p>
        <button className="btn btn-danger btn-sm" onClick={resetAll}>
          🗑️ Réinitialiser toutes les données
        </button>
      </div>
    </div>
  );
}
