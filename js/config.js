// ── Casa GM — Supabase Configuration ──────────────────────────────
// After creating your Supabase project:
//   1. Go to Settings › API in your Supabase dashboard
//   2. Paste your Project URL and anon key below
//   3. Push to GitHub — Vercel will redeploy automatically

const SUPABASE_URL = 'https://pezrffldzfjimvngsobx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Shs0StpKkllEweXFKvHXAA_KihOxixI';

// Only these two emails can sign in
const ALLOWED_EMAILS = ['brian@brianguerra.com', 'lbofman@gmail.com'];

// Web Push (VAPID) — public key only, safe to expose
const VAPID_PUBLIC_KEY = 'BCcVZSSg7f5yJuQIzDCgyEH_V5BAd8YvBF1D6w7H9VRW6_eYvxjuAuR8s34nNHiqx1xXLoCbzjoRxo-6A82GLg4';
