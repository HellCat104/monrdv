# MonRDV — SaaS de prise de rendez-vous médical 🇲🇦

Plateforme complète de gestion de rendez-vous pour cabinets médicaux au Maroc.

## Fonctionnalités

**Côté Médecin (Dashboard)**
- Login sécurisé via Supabase Auth
- Calendrier des RDV (vue jour / semaine / tous)
- Création manuelle de RDV
- Annulation / confirmation avec SMS automatique
- Fiche patient avec historique
- Paramètres : horaires, durée des RDV, spécialité
- Statistiques : RDV du jour, taux d'annulation, total mensuel

**Côté Patient (Page publique)**
- URL unique par médecin : `/dr-hassan` ou `/[slug]`
- Sélection date → créneaux disponibles → formulaire
- Confirmation par SMS automatique
- Rappel automatique 24h avant (cron Vercel)
- Annulation via lien SMS

## Stack technique

| Composant    | Technologie                         |
|-------------|-------------------------------------|
| Frontend/Backend | Next.js 14 (App Router)         |
| Base de données | Supabase (PostgreSQL + RLS)     |
| Auth         | Supabase Auth                       |
| UI           | Tailwind CSS + shadcn/ui            |
| SMS          | Twilio                              |
| Hébergement  | Vercel                              |
| Paiement     | Stripe (prêt, à activer)           |

## Installation

### 1. Cloner et installer

```bash
cd monrdv
npm install
```

### 2. Configurer Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. **N'exécutez pas `supabase/schema.sql`** : c'est une archive obsolète, protégée
   contre l'exécution. Initialisez la base depuis un dump SQL généré par Supabase
   (Dashboard ou `supabase db dump`), puis appliquez les fichiers
   `supabase/migration_v*.sql` par ordre numérique. Avant une nouvelle instance,
   générez de préférence un dump à jour du projet de référence.
3. Dans **Authentication > Users**, créez un compte pour chaque médecin
4. Insérez le médecin dans la table `doctors` avec **le même email** :

```sql
INSERT INTO doctors (name, email, phone, specialty, slug)
VALUES ('Hassan Alami', 'dr.hassan@exemple.ma', '+212522001122', 'Médecin généraliste', 'hassan-alami');
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env.local
```

Remplissez `.env.local` avec vos vraies valeurs (Supabase, Twilio, etc.)

### 4. Lancer en développement

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000)

- Page médecin : `http://localhost:3000/login`
- Page patient : `http://localhost:3000/dr-hassan`

## Déploiement sur Vercel

### Option A : via CLI

```bash
npm install -g vercel
vercel
```

### Option B : via GitHub

1. Poussez le code sur GitHub
2. Importez le repo dans [vercel.com](https://vercel.com)
3. Ajoutez toutes les variables d'environnement dans **Settings > Environment Variables**
4. Déployez

### Cron job (rappels SMS)

Le fichier `vercel.json` configure un cron qui s'exécute tous les jours à 8h :
```json
{ "path": "/api/cron/reminders", "schedule": "0 8 * * *" }
```
Assurez-vous d'avoir configuré `CRON_SECRET` dans vos variables d'environnement Vercel.

## Architecture

```
monrdv/
├── app/
│   ├── (auth)/login/          # Page de connexion médecin
│   ├── (dashboard)/           # Dashboard protégé
│   │   ├── dashboard/         # Statistiques
│   │   ├── appointments/      # Gestion RDV
│   │   ├── patients/          # Fiche patients
│   │   └── settings/          # Paramètres cabinet
│   ├── [slug]/                # Page de réservation publique
│   ├── cancel-result/         # Page après annulation SMS
│   └── api/
│       ├── appointments/      # CRUD rendez-vous
│       ├── slots/             # Créneaux disponibles
│       ├── cancel/[token]/    # Annulation via SMS
│       └── cron/reminders/    # Rappels automatiques
├── components/
│   ├── ui/                    # Composants shadcn/ui
│   ├── dashboard/             # Composants du dashboard
│   └── booking/               # Composants de réservation
├── lib/
│   ├── supabase/              # Clients Supabase (client + server)
│   ├── twilio.ts              # Service SMS
│   ├── stripe.ts              # Paiement (prêt à activer)
│   └── utils.ts               # Utilitaires
├── types/index.ts             # Types TypeScript
├── supabase/migration_v*.sql  # Migrations versionnées à appliquer dans l'ordre
├── supabase/schema.sql        # Archive obsolète, volontairement inexécutable
└── vercel.json                # Config Vercel + Cron
```

## Activer Stripe (abonnements)

1. Décommentez le code dans `lib/stripe.ts`
2. Ajoutez `STRIPE_SECRET_KEY` dans vos variables d'environnement
3. Créez les produits dans le dashboard Stripe
4. Mettez à jour les `price_id` dans `lib/stripe.ts`

## Sécurité multi-tenant

Chaque médecin est isolé grâce aux **Row Level Security (RLS)** de Supabase :
- Un médecin ne peut voir et modifier que ses propres patients et RDV
- Les réservations publiques utilisent le `service_role` uniquement pour les opérations autorisées
- Les tokens d'annulation sont uniques et à usage unique

## Fuseau horaire

Toutes les dates et heures sont gérées en **Africa/Casablanca (GMT+1 / GMT+0 en hiver)** conformément au fuseau horaire marocain.

---

Développé avec ❤️ pour les médecins marocains
