# PDSMatch ⚽

App de stats foot entre amis — Next.js + Supabase + Vercel.

## Setup rapide

### 1. Supabase
1. Crée un projet sur [supabase.com](https://supabase.com)
2. Va dans **SQL Editor** → colle le contenu de `supabase_schema.sql` → Run
3. Va dans **Authentication → Users** → crée ton compte admin
4. Récupère ton **Project URL** et **anon public key** dans Settings → API

### 2. Variables d'environnement
```bash
cp .env.local.example .env.local
```
Remplis avec tes clés Supabase :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3. Lancer en local
```bash
npm install
npm run dev
```
Ouvre [http://localhost:3000](http://localhost:3000)

### 4. Déployer sur Vercel
```bash
npx vercel
```
Ajoute les variables d'env dans le dashboard Vercel (Settings → Environment Variables).

---

## Fonctionnalités
- **Classement** par **moyenne/match** (équitable pour les joueurs occasionnels)
- **Notes par poste** : ATQ (Pressing/Décisif/Appel/Placement), MIL (Vision/Déf/Circulation/Impact), DEF (Relance/Placement/Duels/Comm/Sauveur)
- **Génération d'équipes équilibrées** par niveau et poste
- **Authentification admin** via Supabase Auth
- **100% mobile-first**

## Système de score
| Formule | ATQ | MIL | DEF |
|---|---|---|---|
| But | ×3 | ×2 | — |
| Passe décisive | ×2 | ×3 | — |
| Clean Sheet | — | — | ×3 |
| Note | ×1 | ×1 | ×1.5 |
| Victoire | +3 | +3 | +3 |
| Nul | +1 | +1 | +1 |
| MVP | +1 | +1 | +1 |
| Présence | +0.5 | +0.5 | +0.5 |

Le classement affiche la **moyenne par match**, pas le total — ainsi un joueur présent à 2 matchs avec de bonnes perf peut devancer quelqu'un qui joue tout le temps avec des perf moyennes.
