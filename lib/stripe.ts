// Intégration Stripe — prête à activer
// Pour activer : décommentez le code et ajoutez STRIPE_SECRET_KEY dans .env

// import Stripe from 'stripe'
//
// export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: '2024-04-10',
// })
//
// // Plans d'abonnement (à configurer dans le dashboard Stripe)
// export const PLANS = {
//   starter: {
//     name: 'Starter',
//     price_id: 'price_XXXXXXXX',
//     price: 199, // MAD/mois
//     features: ['1 médecin', '50 RDV/mois', 'SMS inclus'],
//   },
//   pro: {
//     name: 'Pro',
//     price_id: 'price_YYYYYYYY',
//     price: 399, // MAD/mois
//     features: ['3 médecins', 'RDV illimités', 'SMS inclus', 'Support prioritaire'],
//   },
// }

export const STRIPE_ENABLED = false
