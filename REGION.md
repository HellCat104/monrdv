# Pourquoi les fonctions tournent à Dublin

Mesuré le 20 octobre 2026, en production :

| Requête | Temps serveur |
|---|---|
| Route API sans accès base | 0,18 – 0,30 s |
| Pages avec requêtes base | 0,58 s · 1,0 s · 1,5 s · 5,1 s · **9,5 s** |

L'en-tête de réponse disait tout :

```
x-vercel-id: cdg1::iad1::…
```

`cdg1` est l'entrée du réseau (Paris), **`iad1` est la région d'exécution :
Washington**. Or la base Supabase est en `eu-west-1`, c'est-à-dire **Dublin**.

Chaque requête SQL faisait donc Washington → Dublin → Washington, soit 75 à
90 ms d'aller-retour incompressibles. Une page de réservation en enchaîne huit
à dix : près d'une seconde de pur réseau, avant même que PostgreSQL travaille.
C'est aussi ce qui expliquait la variabilité — un établissement de connexion ou
un démarrage à froid s'ajoutant par-dessus, d'où les pointes à 9 secondes.

## Le choix de `dub1` plutôt que `cdg1`

À dix requêtes par rendu, le trajet fonction ↔ base compte dix fois ; le trajet
patient ↔ fonction ne compte qu'une fois. On rapproche donc la fonction de la
BASE, pas de l'utilisateur.

| Région | Fonction ↔ base (×10) | Patient marocain ↔ fonction (×1) | Total |
|---|---|---|---|
| `iad1` Washington | ~800 ms | ~120 ms | **~920 ms** |
| `cdg1` Paris | ~200 ms | ~40 ms | ~240 ms |
| **`dub1` Dublin** | **~30 ms** | ~55 ms | **~85 ms** |

Dublin héberge la base : la fonction et PostgreSQL deviennent voisins.

## À savoir

- Le premier déploiement après ce changement provoque de nouveaux démarrages à
  froid : les toutes premières requêtes resteront lentes quelques minutes.
- Si la base est un jour déplacée, **cette région doit suivre**. Les deux ne se
  choisissent pas séparément.
- Vérification : `curl -sD - -o /dev/null https://www.monrdv.co.ma/api/appointments`
  doit afficher `x-vercel-id: …::dub1::…`.
