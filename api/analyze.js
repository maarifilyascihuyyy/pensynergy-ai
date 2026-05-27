// /api/analyze.js
export const maxDuration = 60;

// ── CONFIG ENDPOINTS (3 PROVIDER) ──
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// ── SYSTEM PROMPT ──
const SYSTEM_PROMPT = `You are an elite institutional trading analyst specializing in Smart Money Concepts (SMC), ICT methodology, and technical analysis. Return ONLY a valid JSON object. No markdown, no text outside JSON.
Required structure:
{
  "signal": "BUY|STRONG_BUY|SELL|STRONG_SELL|WAIT",
  "confidence": 85,
  "momentum": "STRONG|MODERATE|WEAK",
  "risk_level": "LOW|MEDIUM|HIGH",
  "direction": "BULLISH|BEARISH|SIDEWAYS",
  "trend_strength": "STRONG|MODERATE|WEAK|REVERSAL",
  "entry": "<price or zone>",
  "stop_loss": "<price>",
  "take_profit_1": "<price>",
  "take_profit_2": "<price>",
  "indicators": {
    "rsi":    { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "macd":   { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "ema":    { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "sma":    { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "bb":     { "value": "UPPER|MID|LOWER", "signal": "BULL|BEAR|NEUT" },
    "volume": { "value": "HIGH|NORMAL|LOW", "signal": "BULL|BEAR|NEUT" },
    "vwap":   { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "atr":    { "value": "<value>", "signal": "HIGH|NORMAL|LOW" }
  },
  "mtf": {
    "m1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "m5":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "m15": { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "h1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "h4":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "d1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" }
  },
  "analysis": "<150-250 word SMC analysis in Indonesian>",
  "visionAnalysis": "<detailed chart reading in Indonesian or null>"
}`;

// ── SENTIMENT PROMPT ──
const SENTIMENT_PROMPT = (newsText) => `Kamu adalah engine analisis sentimen berita finansial.
Kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan):
{
  "impact_level": "LOW|MEDIUM|HIGH",
  "overall_sentiment": "BULLISH|BEARISH|NEUTRAL",
  "pairs": [
    { "pair": "EUR/USD", "sentiment": "BULLISH|BEARISH|NEUTRAL", "reason": "<1 kalimat>" },
    { "pair": "GBP/USD", "sentiment": "BULLISH|BEARISH|NEUTRAL", "reason": "<1 kalimat>" },
    { "pair": "USD/JPY", "sentiment": "BULLISH|BEARISH|NEUTRAL", "reason": "<1 kalimat>" },
    { "pair": "XAU/USD", "sentiment": "BULLISH|BEARISH|NEUTRAL", "reason": "<1 kalimat>" }
  ],
  "summary": "<dampak berita 2-3 kalimat bahasa Indonesia>"
}
Berita: ${newsText}`;

// ================================================================
// CORE FETCHER — 1 fungsi untuk semua provider
// ================================================================
async function fetchAPI(url, apiKey, modelName, messages, extraHeaders = {}) {
    if (!apiKey) throw new Error('API Key belum disetting di Vercel');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders,
        },
        body: JSON.stringify({ model: modelName, messages, temperature: 0.7, max_tokens: 2000 }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || '';
}

// Wrapper per provider
const askGroq = (msgs, model) =>
    fetchAPI(GROQ_URL, process.env.GROQ_API_KEY, model, msgs);

const askGemini = (msgs, model) =>
    fetchAPI(GEMINI_URL, process.env.GEMINI_API_KEY, model, msgs);

const askOpenRouter = (msgs, model) =>
    fetchAPI(OPENROUTER_URL, process.env.OPENROUTER_API_KEY, model, msgs, {
        'HTTP-Referer': 'https://pensynergy-ai.vercel.app',
        'X-Title':      'PEN SYNERGY AI',
    });

// ================================================================
// SMART ROUTING — loop semua route, fallback otomatis
// ================================================================
async function executeWithFallback(messages, routeList, mode) {
    const errors = [];

    for (const route of routeList) {
        try {
            console.log(`[${mode}] Mencoba ${route.provider} — ${route.model}`);
            if (route.provider === 'Groq')       return await askGroq(messages, route.model);
            if (route.provider === 'Gemini')     return await askGemini(messages, route.model);
            if (route.provider === 'OpenRouter') return await askOpenRouter(messages, route.model);
        } catch (err) {
            console.warn(`[${route.provider} GAGAL] ${err.message}`);
            errors.push(`${route.provider}(${route.model}): ${err.message}`);
        }
    }

    throw new Error(`Semua server ${mode} down! [${errors.join(' | ')}]`);
}

// ================================================================
// ROUTE DEFINITIONS
// ================================================================

// Teks: Groq (cepat) → Gemini (stabil) → OpenRouter (cadangan)
const TEXT_ROUTES = [
    { provider: 'Groq',       model: 'llama-3.3-70b-versatile' },
    { provider: 'Gemini',     model: 'gemini-2.5-flash' },
    { provider: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
];

// Vision: Gemini (terbaik) → Groq (cepat) → OpenRouter (cadangan)
const VISION_ROUTES = [
    { provider: 'Gemini',     model: 'gemini-2.5-flash' },
    { provider: 'Groq',       model: 'llama-3.2-11b-vision-preview' },
    { provider: 'OpenRouter', model: 'qwen/qwen2.5-vl-7b-instruct:free' },
];

// ================================================================
// PARSER
// ================================================================
function parseJSON(text) {
    const clean = text.replace(/```json\n?|```\n?/g, '').trim();
    try { return JSON.parse(clean); } catch (_) {}
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI tidak mengembalikan JSON valid');
}

// ================================================================
// MAIN HANDLER
// ================================================================
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { pair, imageBase64, mode, newsText } = req.body;
    const hasImage = !!imageBase64;

    // ── MODE: SENTIMENT ──
    if (mode === 'sentiment') {
        if (!newsText) return res.status(400).json({ error: 'newsText wajib diisi' });
        try {
            const text = await executeWithFallback(
                [{ role: 'user', content: SENTIMENT_PROMPT(newsText) }],
                TEXT_ROUTES,
                'Sentiment'
            );
            return res.status(200).json(parseJSON(text));
        } catch (err) {
            return res.status(500).json({ error: 'Sentiment gagal: ' + err.message });
        }
    }

    // ── MODE: TRADING ANALYSIS ──
    const userText = `Analisis pair: ${pair}
Waktu: ${new Date().toUTCString()}
${hasImage
    ? 'Screenshot chart diberikan. Baca detail: candlestick, trendline, support/resistance, liquidity zone, supply/demand, breakout/breakdown, momentum.'
    : 'Berikan analisis berdasarkan kondisi market umum pair ini.'
}
Gunakan SMC: market structure, order blocks, fair value gaps, liquidity sweeps, area entry terbaik.`;

    try {
        let aiText = '';

        if (hasImage) {
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userText },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                    ],
                },
            ];
            aiText = await executeWithFallback(messages, VISION_ROUTES, 'Vision');
        } else {
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: userText },
            ];
            aiText = await executeWithFallback(messages, TEXT_ROUTES, 'Teks');
        }

        return res.status(200).json(parseJSON(aiText));

    } catch (error) {
        console.error('[API Error]:', error.message);
        return res.status(500).json({ error: error.message || 'Gagal memproses AI' });
    }
}
