// ============================================
// PEN SYNERGY AI - app.js
// Supabase-only: Config + Auth + Dashboard
// ============================================
'use strict';

// ── SUPABASE CONFIG ─────────────────────────
const SUPABASE_URL = 'https://oozkexigsiayejgxvvpz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_COkDK-0udZnlCnvZtcimGw_L06UlXX9';

// ── GLOBAL STATE ────────────────────────────
let supabaseClient = null;
let currentUser = null;

// ── DOM ELEMENTS ────────────────────────────
const globalLoader = document.getElementById('global-loader');
const authOverlay = document.getElementById('auth-overlay');
const workspace = document.getElementById('workspace');

// ── INITIALIZATION ──────────────────────────
function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('[ERROR] Supabase CDN not loaded!');
        showError('Supabase CDN tidak terdeteksi. Periksa koneksi internet Anda.');
        return false;
    }

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        console.log('[OK] Supabase client initialized');
        return true;
    } catch (err) {
        console.error('[ERROR] Supabase init failed:', err.message);
        showError('Gagal inisialisasi Supabase. Periksa URL dan ANON KEY.');
        return false;
    }
}

function showError(message) {
    if (globalLoader) {
        globalLoader.innerHTML = `
            <div style="text-align:center;color:#ef4444;padding:40px">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:3rem"></i>
                <p style="margin-top:16px;font-family:monospace">${message}</p>
            </div>`;
        globalLoader.classList.remove('hidden');
    }
}

// ── HIDE LOADER ─────────────────────────────
function hideLoader() {
    if (!globalLoader) return;
    globalLoader.classList.add('fade-out');
    setTimeout(() => {
        globalLoader.classList.add('hidden');
        globalLoader.classList.remove('fade-out');
    }, 500);
}

// ── UI TRANSITIONS ──────────────────────────
function showAuthUI() {
    if (authOverlay) authOverlay.classList.remove('hidden');
    if (workspace) workspace.classList.add('hidden');
}

function showDashboard(user) {
    if (authOverlay) authOverlay.classList.add('hidden');
    if (workspace) workspace.classList.remove('hidden');
    
    startLiveClock();
    initTradingView();

    const emailEl = document.getElementById('topbar-email');
    if (emailEl && user) {
        emailEl.textContent = user.email || 'User';
    }
}

// ── AUTH LISTENER ───────────────────────────
function setupAuthListener() {
    if (!supabaseClient) return;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('[AUTH] Event:', event, session ? 'User logged in' : 'No session');
        
        // SELALU sembunyikan loader setelah auth state terdeteksi
        hideLoader();
        // 1. JIKA USER DATANG DARI LINK EMAIL LUPA PASSWORD
        if (event === 'PASSWORD_RECOVERY') {
            console.log('[AUTH] Mengalihkan ke panel reset password...');
            showResetPasswordUI();
        } 
        // 2. JIKA USER BERHASIL LOGIN BIASA
        else if (session && session.user) {
            currentUser = session.user;
            showDashboard(session.user);
        } 
        // 3. JIKA TIDAK ADA SESI
        else 

        if (session && session.user) {
            currentUser = session.user;
            showDashboard(session.user);
        } else {
            currentUser = null;
            showAuthUI();
        }
    });
}

// ── AUTH FUNCTIONS ──────────────────────────
async function handleLogin() {
    const email = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        showToast('warning', 'fa-triangle-exclamation', 'Isi email dan password!');
        return;
    }

    const btn = document.getElementById('btn-login');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> LOADING...'; }

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast('success', 'fa-circle-check', 'Login berhasil!');
    } catch (err) {
        console.error('[AUTH] Login error:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Login gagal');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> ACCESS TERMINAL'; }
    }
}

async function handleRegister() {
    const email = document.getElementById('register-email')?.value?.trim();
    const password = document.getElementById('register-password')?.value;
    const confirm = document.getElementById('register-confirm')?.value;

    if (!email || !password) {
        showToast('warning', 'fa-triangle-exclamation', 'Isi email dan password!');
        return;
    }
    if (password !== confirm) {
        showToast('warning', 'fa-triangle-exclamation', 'Password tidak cocok!');
        return;
    }
    if (password.length < 8) {
        showToast('warning', 'fa-triangle-exclamation', 'Password minimal 8 karakter!');
        return;
    }

    const btn = document.getElementById('btn-register');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CREATING...'; }

    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        showToast('success', 'fa-circle-check', 'Registrasi berhasil! Cek email Anda.');
        switchAuthTab('login');
    } catch (err) {
        console.error('[AUTH] Register error:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Registrasi gagal');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> CREATE ACCOUNT'; }
    }
}

async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
        showToast('info', 'fa-right-from-bracket', 'Logout berhasil');
    } catch (err) {
        console.error('[AUTH] SignOut error:', err);
    }
}

// ── TAB SWITCHER ────────────────────────────
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.id === `tab-${tab}`);
    });
    document.querySelectorAll('.auth-panel').forEach(p => {
        p.classList.toggle('active', p.id === `panel-${tab}`);
    });
}

// ── PASSWORD TOGGLE ─────────────────────────
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
}

// ── TOAST SYSTEM ────────────────────────────
function showToast(type, iconClass, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    container.appendChild(toast);

    const timer = setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    toast.addEventListener('click', () => {
        clearTimeout(timer);
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    });
}

// ── BOOTSTRAP ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.log('[APP] DOM loaded, initializing...');

    // 1. Inisialisasi Supabase
    if (!initSupabase()) {
        // Supabase gagal - loader sudah menampilkan error
        return;
    }

    // 2. Setup auth listener (ini akan menyembunyikan loader)
    setupAuthListener();

    // 3. Fallback: kalau dalam 3 detik loader belum hilang, sembunyikan paksa
    setTimeout(() => {
        if (globalLoader && !globalLoader.classList.contains('hidden')) {
            console.warn('[APP] Force hiding loader after timeout');
            hideLoader();
            showAuthUI();
        }
    }, 3000);
});

console.log('[APP] app.js loaded');

// Kita tambahkan variabel global untuk menyimpan referensi widget saat ini
let currentTVWidget = null;

function initTradingView(symbol = "FX:EURUSD") {
    const container = document.getElementById('tradingview-container');
    if (!container) return;

    // 1. Bersihkan isi container secara fisik
    container.innerHTML = ''; 

    // 2. Jika widget lama masih aktif, kita hapus (opsional jika library mendukung)
    // Tapi karena kita menggunakan CDN, cara paling aman adalah membuang elemen di dalamnya
    
    // 3. Tambahkan sedikit jeda agar browser sempat merender ulang
    setTimeout(() => {
        new TradingView.widget({
            "container_id": "tradingview-container",
            "symbol": symbol,
            "autosize": true,
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#060913",
            "enable_publishing": false,
            "allow_symbol_change": true, // Biarkan user ganti pair dari dalam widget juga
            "details": true
        });
    }, 10); // Jeda 100ms sudah cukup untuk menghilangkan sisa grafik lama
}

function startLiveClock() {
    const clockEl = document.getElementById('clock-display');
    if (!clockEl) return;
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toUTCString().split(' ')[4] + ' UTC';
    }, 1000);
}

// ── FUNGSI UNTUK MENGGANTI PAIR (PENTING!) ──
function changeTradingPair(symbol) {
    console.log('[UI] Mengganti pair ke:', symbol);
    // Fungsi ini akan menghapus grafik lama dan memuat grafik baru
    initTradingView(symbol);
}

// ── FUNGSI LUPA PASSWORD ────────────────────
async function handleForgotPassword() {
    const email = document.getElementById('login-email')?.value?.trim();

    // Validasi apakah user sudah ketik email di kolom login
    if (!email) {
        showToast('warning', 'fa-triangle-exclamation', 'Ketik email kamu dulu di kolom EMAIL ADDRESS!');
        return;
    }

    try {
        // Mengirimkan email reset password dari Supabase
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin, // Akan mengarahkan kembali ke web saat diklik
        });
        
        if (error) throw error;
        showToast('success', 'fa-circle-check', 'Link reset password dikirim! Silakan cek email kamu.');
    } catch (err) {
        console.error('[AUTH] Reset error:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Gagal mengirim email reset');
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('login-email')?.value?.trim();

    if (!email) {
        showToast('warning', 'fa-triangle-exclamation', 'Masukkan email Anda di kolom atas!');
        return;
    }

    try {
        // Ini perintah ke Supabase untuk mengirim email reset
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/index.html', 
        });
        
        if (error) throw error;
        showToast('success', 'fa-paper-plane', 'Email reset password telah dikirim!');
    } catch (err) {
        showToast('error', 'fa-circle-xmark', 'Gagal: ' + err.message);
    }
}

// Fungsi untuk memunculkan form password baru & menyembunyikan menu login/register
function showResetPasswordUI() {
    if (authOverlay) authOverlay.classList.remove('hidden');
    if (workspace) workspace.classList.add('hidden');
    
    // Sembunyikan tab penanda SIGN IN / REGISTER di atas agar tidak membingungkan
    const tabs = document.querySelector('.auth-tabs');
    if (tabs) tabs.style.display = 'none'; 
    
    // Aktifkan panel reset password
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    const resetPanel = document.getElementById('panel-reset');
    if (resetPanel) resetPanel.classList.add('active');
}

// Fungsi eksekusi ganti password ke server Supabase
async function handleUpdatePassword() {
    const newPassword = document.getElementById('reset-password')?.value;

    if (!newPassword || newPassword.length < 8) {
        showToast('warning', 'fa-triangle-exclamation', 'Password baru minimal 8 karakter!');
        return;
    }

    const btn = document.getElementById('btn-update-password');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPDATING...'; }

    try {
        // Mengirim password baru ke akun user yang sedang aktif lewat token email
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        
        showToast('success', 'fa-circle-check', 'Password berhasil diganti! Memuat ulang halaman...');
        
        // Bersihkan token di URL dan balikkan ke halaman login utama setelah 2 detik
        setTimeout(() => {
            window.location.hash = ''; 
            window.location.reload(); 
        }, 2500);

    } catch (err) {
        console.error('[AUTH] Gagal update password:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Gagal memperbarui password');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="btn-text"><i class="fa-solid fa-key"></i> SIMPAN PASSWORD BARU</span>'; }
    }
}