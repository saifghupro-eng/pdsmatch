// components/Nav.js
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/',           icon: '🏠', label: 'Accueil' },
  { href: '/match',      icon: '⚽', label: 'Matchs' },
  { href: '/classement', icon: '🏆', label: 'Classement' },
  { href: '/equipes',    icon: '👥', label: 'Équipes' },
  { href: '/comparateur',icon: '⚔️', label: 'Comparer' },
  { href: '/admin',      icon: '⚙️', label: 'Admin' },
];

export default function Nav() {
  const { pathname } = useRouter();
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <span aria-hidden="true">⚽</span>PDS<span>MATCH</span>
      </Link>
      <div className="nav-links">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`nav-link${pathname === l.href ? ' active' : ''}`}>
            <span className="nav-icon">{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}