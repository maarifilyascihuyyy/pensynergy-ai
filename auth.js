// ================================================================
// AUTH.JS — Authentication Logic (Satpam)
// Depends on: supabase.js (supabaseClient), app.js (showToast, etc.)
// ================================================================

// ── HELPER: Toggle loading state pakai btn-text/btn-loader pattern ──
function setBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = isLoading;
    const textEl  = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');
    if (textEl)   textEl.classList.toggle('hidden', isLoading);
    if (loaderEl) loaderEl.classList.toggle('hidden', !isLoading);
}

// ── SETUP AUTH STATE LISTENER ──
function setupAuthListener() {
    if (!supabaseClient) {
        console.error('[AUTH] supabaseClient belum tersedia!');
        return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('[AUTH] Event:', event, session ? session.user.email : 'No session');

        hideLoader();

        if (event === 'PASSWORD_RECOVERY') {
            showResetPasswordUI();
        } else if (session && session.user) {
            currentUser = session.user;
            showDashboard(session.user);
        } else {
            currentUser = null;
            showAuthUI();
        }
    });
}

// ── LOGIN ──
async function handleLogin() {
    const email    = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        showToast('warning', 'fa-triangle-exclamation', 'Isi email dan password terlebih dahulu!');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('warning', 'fa-triangle-exclamation', 'Format email tidak valid!');
        return;
    }

    setBtnLoading('btn-login', true);

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast('success', 'fa-circle-check', 'Login berhasil! Memuat dashboard...');
    } catch (err) {
        console.error('[AUTH] Login error:', err);
        const msg = err.message.includes('Invalid login credentials')
            ? 'Email atau password salah!'
            : err.message || 'Login gagal';
        showToast('error', 'fa-circle-xmark', msg);
        setBtnLoading('btn-login', false);
    }
    // Catatan: kalau login sukses, onAuthStateChange yang handle UI transition
    // sehingga finally tidak reset loading di sini — dibiarkan loading sampai redirect
}

// ── REGISTER ──
async function handleRegister() {
    const email    = document.getElementById('register-email')?.value?.trim();
    const password = document.getElementById('register-password')?.value;
    const confirm  = document.getElementById('register-confirm')?.value;

    if (!email || !password || !confirm) {
        showToast('warning', 'fa-triangle-exclamation', 'Semua field wajib diisi!');
        return;
    }
    if (!isValidEmail(email)) {
        showToast('warning', 'fa-triangle-exclamation', 'Format email tidak valid!');
        return;
    }
    if (password.length < 8) {
        showToast('warning', 'fa-triangle-exclamation', 'Password minimal 8 karakter!');
        return;
    }
    if (password !== confirm) {
        showToast('warning', 'fa-triangle-exclamation', 'Password dan konfirmasi tidak cocok!');
        return;
    }

    setBtnLoading('btn-register', true);

    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        showToast('success', 'fa-paper-plane', 'Registrasi berhasil! Cek email untuk verifikasi.', 6000);
        switchAuthTab('login');
    } catch (err) {
        console.error('[AUTH] Register error:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Registrasi gagal');
    } finally {
        setBtnLoading('btn-register', false);
    }
}

// ── SIGN OUT ──
async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
        showToast('info', 'fa-right-from-bracket', 'Logout berhasil. Sampai jumpa!');
    } catch (err) {
        console.error('[AUTH] SignOut error:', err);
        showToast('error', 'fa-circle-xmark', 'Gagal logout: ' + err.message);
    }
}

// ── FORGOT PASSWORD ──
async function handleForgotPassword() {
    const email = document.getElementById('login-email')?.value?.trim();

    if (!email) {
        showToast('warning', 'fa-triangle-exclamation', 'Masukkan email di kolom EMAIL ADDRESS dulu!');
        return;
    }
    if (!isValidEmail(email)) {
        showToast('warning', 'fa-triangle-exclamation', 'Format email tidak valid!');
        return;
    }

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href  // balik ke halaman yang sama
        });
        if (error) throw error;
        showToast('success', 'fa-paper-plane', 'Link reset password dikirim! Cek inbox/spam.', 6000);
    } catch (err) {
        showToast('error', 'fa-circle-xmark', 'Gagal kirim email: ' + err.message);
    }
}

// ── UPDATE PASSWORD (dari panel reset) ──
async function handleUpdatePassword() {
    const newPassword = document.getElementById('reset-password')?.value;

    if (!newPassword || newPassword.length < 8) {
        showToast('warning', 'fa-triangle-exclamation', 'Password baru minimal 8 karakter!');
        return;
    }

    setBtnLoading('btn-update-password', true);

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;

        showToast('success', 'fa-circle-check', 'Password berhasil diperbarui! Mengalihkan...', 3000);

        setTimeout(() => {
            window.location.hash = '';
            window.location.reload();
        }, 2500);

    } catch (err) {
        console.error('[AUTH] Update password error:', err);
        showToast('error', 'fa-circle-xmark', err.message || 'Gagal memperbarui password');
        setBtnLoading('btn-update-password', false);  // ← FIX: harus di catch, bukan di finally
    }
    // Tidak pakai finally karena kalau sukses kita reload page anyway
}

// ── HELPER: Email validation ──
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}