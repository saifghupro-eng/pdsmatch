// lib/helpers.js

export function initials(name) {
  const parts = (name || '??').trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || '??').slice(0, 2).toUpperCase();
}

export function avatarCls(pos) {
  if (pos === 'ATQ') return 'av-att';
  if (pos === 'MIL') return 'av-mid';
  return 'av-def';
}

export function posCls(pos) {
  if (pos === 'ATQ') return 'pos-att';
  if (pos === 'MIL') return 'pos-mid';
  return 'pos-def';
}

export function rankCls(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}