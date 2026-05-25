// ================================================================
// APP.JS — PEN SYNERGY AI Trading Terminal (Frontend)
// ================================================================

// ── CONFIG ──
// GANTI AI DI SINI SAJA ('openai', 'gemini', atau 'claude')
const CONFIG = {
    STORAGE_BUCKET: 'screenshots',
    TICKER_INTERVAL: 4000,
};

// ── GLOBAL STATE ──
let currentUser      = null;
let tvWidget         = null;
let currentPair      = 'FX:EURUSD';
let currentPairLabel = 'EUR/USD';
let uploadedFile     = null;
let uploadedFileB64  = null;
let tickerInterval   = null;
let lastAnalysis     = null;

// ── DOM REFS ──
const globalLoader = document.getElementById('global-loader');
const authOverlay  = document.getElementById('auth-overlay');
const workspace    = document.getElementById('workspace');

// ================================================================
// UI STATE TRANSITIONS
// ================================================================

function hideLoader() {
    if (!globalLoader) return;
    globalLoader.classList.add('fade-out');
    setTimeout(() => globalLoader.classList.add('hidden'), 500);
}

function showAuthUI() {
    authOverlay?.classList.remove('hidden');
    workspace?.classList.add('hidden');
    stopTicker();
}

function showDashboard(user) {
    authOverlay?.classList.add('hidden');
    workspace?.classList.remove('hidden');

    const emailEl = document.getElementById('topbar-email');
    if (emailEl && user) emailEl.textContent = user.email || 'User';

    startLiveClock();
    initTradingView(currentPair);
    initTicker();
    loadAnalysisHistory();
    setMobileActivePanel('chart'); 
}

function showResetPasswordUI() {
    authOverlay?.classList.remove('hidden');
    workspace?.classList.add('hidden');

    const tabs = document.querySelector('.auth-tabs');
    if (tabs) tabs.style.display = 'none';

    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-reset')?.classList.add('active');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t =>
        t.classList.toggle('active', t.id === `tab-${tab}`)
    );
    document.querySelectorAll('.auth-panel').forEach(p =>
        p.classList.toggle('active', p.id === `panel-${tab}`)
    );
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

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

// ================================================================
// LIVE CLOCK & TRADINGVIEW
// ================================================================
function startLiveClock() {
    const clockEl = document.getElementById('clock-display');
    if (!clockEl) return;

    const update = () => {
        const now = new Date();
        const hh  = String(now.getUTCHours()).padStart(2, '0');
        const mm  = String(now.getUTCMinutes()).padStart(2, '0');
        const ss  = String(now.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}:${ss} UTC`;
    };

    update();
    setInterval(update, 1000);
}

function initTradingView(symbol = 'FX:EURUSD') {
    const container = document.getElementById('tradingview-container');
    if (!container) return;

    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'tradingview-widget-container';
    div.style.cssText = 'width:100%;height:100%;';

    const script = document.createElement('script');
    script.type  = 'text/javascript';
    script.src   = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.text  = JSON.stringify({
        autosize:           true,
        symbol:             symbol.replace(/\s+/g, ''),
        interval:           'D',
        timezone:           'Etc/UTC',
        theme:              'dark',
        style:              '1',
        locale:             'en',
        enable_publishing:  false,
        allow_symbol_change: true,
        calendar:           false,
        hide_top_toolbar:   false,
        hide_legend:        false,
        save_image:         false,
        support_host:       'https://www.tradingview.com',
    });

    div.appendChild(script);
    container.appendChild(div);
}

function changeTradingPair(symbol) {
    currentPair = symbol;
    const sel = document.getElementById('pair-select');
    if (sel) {
        const opt = sel.options[sel.selectedIndex];
        currentPairLabel = opt ? opt.text : symbol;
    }
    initTradingView(symbol);
    showToast('info', 'fa-chart-candlestick', `Pair diubah ke ${currentPairLabel}`);
}

// ================================================================
// LIVE MARKET TICKER
// ================================================================
const TICKER_PAIRS = [
    { label: 'EUR/USD',  base: 1.1850, pip: 0.0001, digits: 5 },
    { label: 'GBP/USD',  base: 1.2720, pip: 0.0001, digits: 5 },
    { label: 'USD/JPY',  base: 149.80, pip: 0.01,   digits: 3 },
    { label: 'XAU/USD',  base: 3320.0, pip: 0.1,    digits: 2 },
    { label: 'BTC/USDT', base: 69500,  pip: 1,      digits: 0 },
    { label: 'ETH/USDT', base: 3750,   pip: 0.1,    digits: 2 },
];

let tickerState = TICKER_PAIRS.map(p => ({
    ...p,
    price:  p.base,
    change: 0,
    pct:    0,
    high:   p.base * 1.003,
    low:    p.base * 0.997,
    volume: Math.floor(Math.random() * 90000) + 10000,
}));

function initTicker() {
    renderTickerSkeletons();
    updateTickerValues();
    tickerInterval = setInterval(updateTickerValues, CONFIG.TICKER_INTERVAL);
}

function stopTicker() {
    if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
}

function renderTickerSkeletons() {
    const grid = document.getElementById('ticker-grid');
    if (!grid) return;
    grid.innerHTML = tickerState.map(() => `
        <div class="ticker-card">
            <div class="tick-label skeleton" style="width:60px;height:10px;"></div>
            <div class="tick-value skeleton" style="width:90px;height:20px;margin:4px 0;"></div>
            <div class="tick-sub skeleton" style="width:70px;height:10px;"></div>
        </div>
    `).join('');
}

function updateTickerValues() {
    const grid = document.getElementById('ticker-grid');
    if (!grid) return;

    tickerState = tickerState.map(t => {
        const drift    = (Math.random() - 0.49) * t.pip * 3;
        const newPrice = Math.max(t.base * 0.97, Math.min(t.base * 1.03, t.price + drift));
        const change   = newPrice - t.base;
        const pct      = (change / t.base) * 100;
        const newHigh  = Math.max(t.high, newPrice);
        const newLow   = Math.min(t.low, newPrice);
        const volDrift = Math.floor((Math.random() - 0.5) * 500);

        return { ...t, price: newPrice, change, pct, high: newHigh, low: newLow, volume: Math.max(1000, t.volume + volDrift) };
    });

    grid.innerHTML = tickerState.map(t => {
        const dir     = t.change >= 0 ? 'up' : 'down';
        const arrow   = t.change >= 0 ? '▲' : '▼';
        const pctStr  = (t.pct >= 0 ? '+' : '') + t.pct.toFixed(2) + '%';
        const priceStr = t.price.toFixed(t.digits);
        const volStr  = t.volume >= 1000 ? (t.volume / 1000).toFixed(1) + 'K' : t.volume;

        return `
            <div class="ticker-card">
                <div class="tick-label">${t.label}</div>
                <div class="tick-value ${dir}">${priceStr}</div>
                <div class="tick-sub">${arrow} ${pctStr} &nbsp;|&nbsp; Vol: ${volStr}</div>
            </div>
        `;
    }).join('');
}

// ================================================================
// SCREENSHOT UPLOAD 
// ================================================================
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropzone')?.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('dropzone')?.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) processImageFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
}

function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('error', 'fa-circle-xmark', 'File harus berupa gambar (PNG/JPG/WEBP)!');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast('error', 'fa-circle-xmark', 'Ukuran file max 10MB!');
        return;
    }

    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target.result;
        uploadedFileB64 = result.split(',')[1]; 

        const placeholder = document.getElementById('dropzone-placeholder');
        const preview     = document.getElementById('dropzone-preview');
        const img         = document.getElementById('preview-img');
        const badge       = document.getElementById('upload-status');

        if (img)         img.src = result;
        if (placeholder) placeholder.classList.add('hidden');
        if (preview)     preview.classList.remove('hidden');
        if (badge)       badge.classList.remove('hidden');

        showToast('success', 'fa-circle-check', `Screenshot siap: ${file.name}`);
    };
    reader.readAsDataURL(file);
}

function clearUploadedImage(e) {
    if (e) e.stopPropagation();

    uploadedFile    = null;
    uploadedFileB64 = null;

    const placeholder = document.getElementById('dropzone-placeholder');
    const preview     = document.getElementById('dropzone-preview');
    const badge       = document.getElementById('upload-status');
    const fileInput   = document.getElementById('file-input');
    const img         = document.getElementById('preview-img');

    if (img)         img.src = '';
    if (placeholder) placeholder.classList.remove('hidden');
    if (preview)     preview.classList.add('hidden');
    if (badge)       badge.classList.add('hidden');
    if (fileInput)   fileInput.value = '';
}

async function uploadScreenshotToSupabase(file) {
    if (!supabaseClient || !currentUser) return null;

    const ext      = file.name.split('.').pop() || 'png';
    const fileName = `${currentUser.id}/${Date.now()}.${ext}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from(CONFIG.STORAGE_BUCKET)
            .upload(fileName, file, { contentType: file.type, upsert: false });

        if (error) throw error;
        const { data: urlData } = supabaseClient.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(fileName);
        return urlData?.publicUrl || null;

    } catch (err) {
        console.error('[STORAGE] Upload error:', err.message);
        showToast('warning', 'fa-triangle-exclamation', 'Gagal upload screenshot ke cloud.');
        return null;
    }
}

// ================================================================
// AI ANALYSIS — KOMUNIKASI DENGAN BACKEND VERCEL
// ================================================================
async function runAIAnalysis() {
    if (!currentUser) {
        showToast('warning', 'fa-triangle-exclamation', 'Login dulu untuk menjalankan analisis!');
        return;
    }

    setAnalysisButtonsState(true);
    document.getElementById('ai-section')?.classList.add('analyzing');
    showToast('info', 'fa-microchip', `Memanggil AI (${CONFIG.AI_PROVIDER.toUpperCase()}) dari server...`);

    try {
        let screenshotUrl = null;
        if (uploadedFile) {
            showToast('info', 'fa-cloud-arrow-up', 'Mengupload screenshot chart...');
            screenshotUrl = await uploadScreenshotToSupabase(uploadedFile);
        }

        // --- PANGGIL BACKEND ---
        const aiResult = await callAIAPI(currentPairLabel, uploadedFileB64);

        if (!aiResult || !aiResult.signal) throw new Error('Format balasan AI tidak valid');

        updateUIWithAnalysis(aiResult);
        await saveAnalysisToSupabase(aiResult, screenshotUrl);
        await loadAnalysisHistory();

        if (uploadedFileB64 && aiResult.visionAnalysis) {
            showVisionResult(aiResult.visionAnalysis);
        }

        showToast('success', 'fa-circle-check', `Analisis ${currentPairLabel} selesai!`, 5000);
        lastAnalysis = aiResult;

    } catch (err) {
        console.error('[FRONTEND] Analysis error:', err);
        showToast('error', 'fa-circle-xmark', 'Analisis gagal: ' + (err.message || 'Unknown error'));
    } finally {
        setAnalysisButtonsState(false);
        document.getElementById('ai-section')?.classList.remove('analyzing');
    }
}

function setAnalysisButtonsState(loading) {
    const btns = [
        document.getElementById('btn-run-analysis'),
        document.getElementById('btn-scan-analyze'),
    ];
    btns.forEach(btn => {
        if (!btn) return;
        btn.disabled = loading;
        const icon = btn.querySelector('i');
        if (icon) icon.className = loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-microchip';
    });
}

// ================================================================
// UPDATE UI
// ================================================================
function updateUIWithAnalysis(data) {
    updateSignalBadge(data);
    updateConfidence(data.confidence);
    updateMomentumGrid(data);
    updatePOILevels(data);
    updateSMCOutput(data.analysis);
    updateMTFMatrix(data.mtf);
    updateIndicators(data.indicators);
}

function updateSignalBadge(data) {
    const badge = document.getElementById('signal-badge');
    if (!badge) return;

    const signalMap = {
        'STRONG_BUY':  { cls: 'strong-buy', icon: 'fa-rocket',         label: 'STRONG BUY' },
        'BUY':         { cls: 'buy',        icon: 'fa-arrow-trend-up', label: 'BUY' },
        'WAIT':        { cls: 'wait',       icon: 'fa-hourglass-half', label: 'WAIT / NEUTRAL' },
        'SELL':        { cls: 'sell',       icon: 'fa-arrow-trend-down', label: 'SELL' },
        'STRONG_SELL': { cls: 'strong-sell', icon: 'fa-skull-crossbones', label: 'STRONG SELL' },
    };

    const sig = signalMap[data.signal?.toUpperCase()] || signalMap['WAIT'];
    badge.className = `signal-badge ${sig.cls}`;
    badge.innerHTML = `<i class="fa-solid ${sig.icon}"></i><span>${sig.label}</span>`;
}

function updateConfidence(pct) {
    const bar   = document.getElementById('confidence-bar');
    const label = document.getElementById('confidence-pct');
    const value = Math.min(100, Math.max(0, parseInt(pct) || 0));

    if (bar)   bar.style.width = `${value}%`;
    if (label) label.textContent = `${value}%`;

    if (bar) {
        if (value >= 75)      bar.style.background = 'linear-gradient(90deg, #10b981, #00f2fe)';
        else if (value >= 50) bar.style.background = 'linear-gradient(90deg, #f59e0b, #4facfe)';
        else                  bar.style.background = 'linear-gradient(90deg, #ef4444, #f59e0b)';
    }
}

function updateMomentumGrid(data) {
    const fields = {
        'mom-momentum':  data.momentum || '—',
        'mom-risk':      data.risk_level || '—',
        'mom-direction': data.direction || '—',
        'mom-trend':     data.trend_strength || '—',
    };

    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = val;

        if (['BULLISH', 'STRONG', 'LOW'].includes(val))  el.style.color = 'var(--green)';
        else if (['BEARISH', 'HIGH'].includes(val))       el.style.color = 'var(--red)';
        else if (['SIDEWAYS', 'MODERATE', 'MEDIUM'].includes(val)) el.style.color = 'var(--yellow)';
        else el.style.color = 'var(--text-primary)';
    });
}

function updatePOILevels(data) {
    const poiSection = document.getElementById('poi-section');
    if (poiSection) poiSection.style.display = 'block';

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '—';
    };

    setVal('poi-entry', data.entry);
    setVal('poi-sl',    data.stop_loss);
    setVal('poi-tp1',   data.take_profit_1);
    setVal('poi-tp2',   data.take_profit_2);
}

function updateSMCOutput(text) {
    const el = document.getElementById('smc-output');
    if (!el || !text) return;

    el.innerHTML = `<div class="smc-text">${escapeHtml(text)
        .replace(/(BULLISH|naik|uptrend|buy|breakout)/gi, '<span class="highlight-bull">$1</span>')
        .replace(/(BEARISH|turun|downtrend|sell|breakdown)/gi, '<span class="highlight-bear">$1</span>')
        .replace(/(SIDEWAYS|konsolidasi|ranging|neutral)/gi, '<span class="highlight-neu">$1</span>')
        .replace(/(liquidity|order block|fair value gap|FVG|SMC|ICT|supply|demand)/gi, '<span class="highlight-info">$1</span>')
    }</div>`;
}

function showVisionResult(text) {
    const container = document.getElementById('vision-result');
    const body      = document.getElementById('vision-result-body');
    if (!container || !body || !text) return;

    body.innerHTML = escapeHtml(text)
        .replace(/\n/g, '<br>')
        .replace(/(BULLISH|BUY|breakout)/gi, '<span class="highlight-bull">$1</span>')
        .replace(/(BEARISH|SELL|breakdown)/gi, '<span class="highlight-bear">$1</span>');

    container.classList.remove('hidden');
}

function updateMTFMatrix(mtf) {
    if (!mtf) return;

    const tfs = { m1: 'M1', m5: 'M5', m15: 'M15', h1: 'H1', h4: 'H4', d1: 'D1' };

    Object.entries(tfs).forEach(([key, label]) => {
        const data = mtf[key];
        if (!data) return;

        const biasEl   = document.getElementById(`mtf-${key}`);
        const detailEl = document.getElementById(`mtf-${key}-detail`);

        if (biasEl) {
            const cls = { BULL: 'bull', BEAR: 'bear', NEUT: 'neut' }[data.bias?.toUpperCase()] || 'neut';
            const icon = { BULL: '▲', BEAR: '▼', NEUT: '—' }[data.bias?.toUpperCase()] || '—';
            biasEl.className = `mtf-bias ${cls}`;
            biasEl.textContent = icon + ' ' + (data.bias || '—');
        }

        if (detailEl) {
            detailEl.textContent = data.detail || '';
        }
    });
}

function updateIndicators(indicators) {
    if (!indicators) return;

    const map = {
        'ind-rsi':    { val: 'rsi',    sig: 'ind-rsi-sig'    },
        'ind-macd':   { val: 'macd',   sig: 'ind-macd-sig'   },
        'ind-ema':    { val: 'ema',     sig: 'ind-ema-sig'    },
        'ind-sma':    { val: 'sma',     sig: 'ind-sma-sig'    },
        'ind-bb':     { val: 'bb',      sig: 'ind-bb-sig'     },
        'ind-volume': { val: 'volume',  sig: 'ind-vol-sig'    },
        'ind-vwap':   { val: 'vwap',    sig: 'ind-vwap-sig'   },
        'ind-atr':    { val: 'atr',     sig: 'ind-atr-sig'    },
    };

    Object.entries(map).forEach(([valId, { val, sig: sigId }]) => {
        const indData = indicators[val];
        if (!indData) return;

        const valEl = document.getElementById(valId);
        const sigEl = document.getElementById(sigId);

        if (valEl) valEl.textContent = indData.value || '—';
        if (sigEl) {
            const sigText = indData.signal || 'NEUT';
            const cls = { BULL: 'bull', BEAR: 'bear', NEUT: 'neut', HIGH: 'bear', LOW: 'bull', NORMAL: 'neut' }[sigText.toUpperCase()] || 'neut';
            sigEl.className = `ind-signal ${cls}`;
            sigEl.textContent = sigText;
        }
    });
}

// ================================================================
// SUPABASE DATABASE
// ================================================================

async function saveAnalysisToSupabase(data, screenshotUrl = null) {
    if (!supabaseClient || !currentUser) return;

    const record = {
        user_id:        currentUser.id,
        pair:           currentPairLabel,
        signal:         data.signal || 'WAIT',
        confidence:     parseInt(data.confidence) || 0,
        momentum:       data.momentum || null,
        risk_level:     data.risk_level || null,
        direction:      data.direction || null,
        trend_strength: data.trend_strength || null,
        entry_price:    data.entry || null,
        stop_loss:      data.stop_loss || null,
        take_profit_1:  data.take_profit_1 || null,
        take_profit_2:  data.take_profit_2 || null,
        analysis_text:  data.analysis || null,
        screenshot_url: screenshotUrl,
        mtf_data:       data.mtf || null,
        indicators_data: data.indicators || null,
    };

    const { error } = await supabaseClient.from('analysis_history').insert([record]);

    if (error) {
        console.error('[DB] Save error:', error.message);
        showToast('warning', 'fa-triangle-exclamation', 'Analisis gagal disimpan ke cloud.');
    } else {
        console.log('[DB] Analisis berhasil disimpan.');
    }
}

async function loadAnalysisHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl || !supabaseClient || !currentUser) return;

    listEl.innerHTML = Array(3).fill(`
        <div class="history-item">
            <div class="skeleton" style="width:60%;height:14px;"></div>
            <div class="skeleton" style="width:40%;height:10px;margin-top:8px;"></div>
            <div class="skeleton" style="width:80%;height:10px;margin-top:6px;"></div>
        </div>
    `).join('');

    try {
        const { data, error } = await supabaseClient
            .from('analysis_history')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            listEl.innerHTML = `
                <div class="history-empty">
                    <i class="fa-solid fa-inbox"></i>
                    <p>No analysis records yet.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = data.map(item => renderHistoryItem(item)).join('');

    } catch (err) {
        console.error('[DB] Load history error:', err.message);
        listEl.innerHTML = `
            <div class="history-empty">
                <i class="fa-solid fa-triangle-exclamation" style="color:var(--yellow)"></i>
                <p>Gagal memuat history.<br>Cek koneksi dan coba refresh.</p>
            </div>
        `;
    }
}

function renderHistoryItem(item) {
    const signalCls = {
        'BUY': 'bull', 'STRONG_BUY': 'bull',
        'SELL': 'bear', 'STRONG_SELL': 'bear',
        'WAIT': 'neut',
    }[item.signal?.toUpperCase()] || 'neut';

    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const thumbHtml = item.screenshot_url
        ? `<img src="${escapeHtml(item.screenshot_url)}" class="hist-screenshot-thumb" alt="Chart" loading="lazy" onerror="this.style.display='none'" />`
        : '';

    const previewText = item.analysis_text
        ? escapeHtml(item.analysis_text.substring(0, 80)) + '...'
        : '';

    return `
        <div class="history-item">
            <div class="hist-header">
                <span class="hist-pair">${escapeHtml(item.pair)}</span>
                <span class="hist-signal ${signalCls}">${item.signal || 'WAIT'}</span>
            </div>
            <div class="hist-meta">
                <span class="hist-meta-item"><i class="fa-solid fa-calendar"></i>${dateStr}</span>
                <span class="hist-meta-item"><i class="fa-solid fa-clock"></i>${timeStr}</span>
            </div>
            ${thumbHtml}
            <div class="hist-preview">${previewText}</div>
        </div>
    `;
}

// ================================================================
// UTILITY & RESPONSIVE PANELS
// ================================================================

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setMobileActivePanel(panelId) {
    document.querySelectorAll('.mobile-panel').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden'); 
    });
    
    const targetPanel = document.getElementById(`panel-${panelId}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.classList.remove('hidden');
    }

    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`tab-btn-${panelId}`);
    if (targetBtn) targetBtn.classList.add('active');
}
// ================================================================
// CALL AI API — via Vercel backend (/api/analyze)
// API key aman di server, tidak exposed ke browser
// ================================================================
async function callAIAPI(pair, imageBase64 = null) {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider:    CONFIG.AI_PROVIDER.toLowerCase(),
            pair:        pair,
            imageBase64: imageBase64 || null,
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
    }

    return await response.json();
}

// ================================================================
// RISK / LOT CALCULATOR
// ================================================================
const TICK_VALUES = {
    'EUR/USD': 10.00, 'GBP/USD': 10.00, 'USD/JPY': 9.09,
    'XAU/USD': 10.00, 'BTC/USDT': 1.00, 'ETH/USDT': 1.00,
    'DEFAULT': 10.00,
};

function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calc-balance')?.value) || 0;
    const riskPct = parseFloat(document.getElementById('calc-risk')?.value)    || 1;
    const slPips  = parseFloat(document.getElementById('calc-sl-pips')?.value) || 0;
    const pair    = document.getElementById('calc-pair')?.value || 'DEFAULT';

    const resultEl = document.getElementById('calc-result');
    const detailEl = document.getElementById('calc-detail');

    if (balance <= 0 || slPips <= 0) {
        if (resultEl) resultEl.textContent = '—';
        if (detailEl) detailEl.textContent = 'Isi semua field terlebih dahulu.';
        return;
    }

    const tickValue  = TICK_VALUES[pair] || TICK_VALUES['DEFAULT'];
    const amountRisk = balance * (riskPct / 100);
    const lotRaw     = amountRisk / (slPips * tickValue);
    // MathFloor — bulatkan ke bawah demi keamanan modal
    const lotFinal   = Math.max(Math.floor(lotRaw * 100) / 100, 0.01);
    const maxLoss    = (slPips * tickValue * lotFinal).toFixed(2);

    if (resultEl) resultEl.textContent = lotFinal.toFixed(2) + ' LOT';
    if (detailEl) {
        detailEl.innerHTML = `
            <span style="color:var(--cyan)">Risiko: $${amountRisk.toFixed(2)}</span> &nbsp;|&nbsp;
            <span style="color:var(--yellow)">Tick: $${tickValue}</span> &nbsp;|&nbsp;
            <span style="color:var(--green)">Max Loss: $${maxLoss}</span>
        `;
    }
}

function initRiskCalculator() {
    ['calc-balance', 'calc-risk', 'calc-sl-pips', 'calc-pair'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calculateLotSize);
    });
}

// ================================================================
// NEWS SENTIMENT ENGINE — via Vercel backend
// ================================================================
async function analyzeNewsSentiment() {
    const newsText = document.getElementById('news-input')?.value?.trim();
    if (!newsText) {
        showToast('warning', 'fa-triangle-exclamation', 'Masukkan teks berita terlebih dahulu!');
        return;
    }

    const btn = document.getElementById('btn-analyze-news');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ANALYZING...'; }

    const resultEl = document.getElementById('sentiment-result');
    if (resultEl) resultEl.innerHTML = '<div class="skeleton" style="height:80px;border-radius:8px;"></div>';

    try {
        // Pakai endpoint khusus sentiment di backend
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: CONFIG.AI_PROVIDER.toLowerCase(),
                mode:     'sentiment',
                newsText: newsText,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server error ${response.status}`);
        }

        const data = await response.json();
        renderSentimentResult(data);

    } catch (err) {
        console.error('[SENTIMENT]', err);
        if (resultEl) resultEl.innerHTML = `<p style="color:var(--red);font-family:var(--font-mono);font-size:0.72rem;">Gagal: ${escapeHtml(err.message)}</p>`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-newspaper"></i> ANALYZE NEWS';
        }
    }
}

function renderSentimentResult(data) {
    const el = document.getElementById('sentiment-result');
    if (!el || !data) return;

    const impactColor = { LOW: 'var(--green)', MEDIUM: 'var(--yellow)', HIGH: 'var(--red)' }[data.impact_level] || 'var(--cyan)';
    const sentColor   = { BULLISH: 'var(--green)', BEARISH: 'var(--red)', NEUTRAL: 'var(--yellow)' };

    const pairsHtml = (data.pairs || []).map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;
            background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid var(--border);gap:8px;">
            <span style="font-family:var(--font-display);font-size:0.65rem;color:var(--text-primary);min-width:70px;">${escapeHtml(p.pair)}</span>
            <span style="font-family:var(--font-mono);font-size:0.6rem;color:${sentColor[p.sentiment] || 'var(--yellow)'};">${p.sentiment}</span>
            <span style="font-family:var(--font-mono);font-size:0.55rem;color:var(--text-muted);text-align:right;">${escapeHtml(p.reason || '')}</span>
        </div>
    `).join('');

    el.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <span style="font-family:var(--font-mono);font-size:0.6rem;padding:4px 10px;border-radius:99px;
                border:1px solid ${impactColor};background:rgba(0,0,0,0.2);color:${impactColor};">
                <i class="fa-solid fa-bolt"></i> ${data.impact_level || '—'} IMPACT
            </span>
            <span style="font-family:var(--font-mono);font-size:0.6rem;padding:4px 10px;border-radius:99px;
                border:1px solid ${sentColor[data.overall_sentiment] || 'var(--yellow)'};
                background:rgba(0,0,0,0.2);color:${sentColor[data.overall_sentiment] || 'var(--yellow)'};">
                ${data.overall_sentiment || 'NEUTRAL'}
            </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">${pairsHtml}</div>
        <p style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-secondary);
            line-height:1.7;padding:10px;background:rgba(0,0,0,0.15);
            border-radius:6px;border:1px solid var(--border);">
            ${escapeHtml(data.summary || '')}
        </p>
    `;
}

// ================================================================
// BOOTSTRAP — DOMContentLoaded
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('[APP] Initializing PEN SYNERGY AI...');

    // Init risk calculator
    initRiskCalculator();

    // Setup auth listener (dari auth.js, butuh supabaseClient dari supabase.js)
    if (typeof setupAuthListener === 'function') {
        setupAuthListener();
    } else {
        setTimeout(() => {
            if (typeof setupAuthListener === 'function') {
                setupAuthListener();
            } else {
                console.error('[APP] auth.js / supabase.js gagal load!');
                hideLoader();
                showAuthUI();
            }
        }, 500);
    }

    // Safety fallback: 5 detik tanpa auth event → paksa tampilkan auth UI
    setTimeout(() => {
        if (globalLoader && !globalLoader.classList.contains('hidden')) {
            console.warn('[APP] Auth timeout — forcing auth UI');
            hideLoader();
            showAuthUI();
        }
    }, 5000);
});
