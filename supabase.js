// ── PEN SYNERGY AI: SUPABASE LAYER INITIALIZATION ──

// 1. Deklarasikan kredensial Supabase kamu di sini
const SUPABASE_URL = 'https://oozkexigsiayejgxvvpz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_COkDK-0udZnlCnvZtcimGw_L06UlXX9';

let supabaseClient = null;

(function initSupabaseCore() {
    if (typeof window.supabase === 'undefined') {
        console.error('[SUPABASE] CDN tidak terdeteksi!');
        return;
    }

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession:     true,
                autoRefreshToken:   true,
                detectSessionInUrl: true,
            }
        });
        console.log('[SUPABASE] ✅ Client berhasil diinisialisasi.');
    } catch (err) {
        console.error('[SUPABASE] ❌ Gagal init:', err.message);
    }
})();