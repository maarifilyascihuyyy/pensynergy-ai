// /api/analyze.js
export const maxDuration = 60;

// ── CONFIG ENDPOINTS ──
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

// ── SENTIMENT PROMPT (lengkap dengan format JSON) ──
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
// CORE FETCHERS
// ================================================================

async function fetchGroq(messages, modelName) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY belum disetting di Vercel');
    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model: modelName, messages, temperature: 0.7, max_tokens: 2000 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Groq [${modelName}]: ${data.error.message || JSON.stringify(data.error)}`);
    return data.choices?.[0]?.message?.content || '';
}

async function fetchOpenRouter(messages, modelName) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY belum disetting di Vercel');
    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer':  'https://pensynergy-ai.vercel.app',
            'X-Title':       'PEN SYNERGY AI',
        },
        body: JSON.stringify({ model: modelName, messages, temperature: 0.7, max_tokens: 2000 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`OpenRouter [${modelName}]: ${data.error.message || JSON.stringify(data.error)}`);
    return data.choices?.[0]?.message?.content || '';
}

// ================================================================
// CROSS-FALLBACK LOGIC
// ================================================================

// Jalur Teks: Groq → OpenRouter
async function processTextWithFallback(messages) {
    try {
        console.log('[Teks] Mencoba Groq (llama-3.3-70b-versatile)...');
        return await fetchGroq(messages, 'llama-3.3-70b-versatile');
    } catch (errGroq) {
        console.warn(`[Fallback Teks] Groq gagal: ${errGroq.message}. Beralih ke OpenRouter...`);
        try {
            return await fetchOpenRouter(messages, 'meta-llama/llama-3.3-70b-instruct:free');
        } catch (errOR) {
            throw new Error(`Semua server teks down. Groq: ${errGroq.message} | OpenRouter: ${errOR.message}`);
        }
    }
}

// Jalur Vision: OpenRouter (loop) → Groq Vision
async function processVisionWithFallback(messages) {
    const orModels = [
        'google/gemini-2.5-flash:free',
        'google/gemini-2.5-pro:free',
        'qwen/qwen2.5-vl-7b-instruct:free',
    ];

    let lastError = null;

    for (const model of orModels) {
        try {
            console.log(`[Vision] Mencoba OpenRouter (${model})...`);
            return await fetchOpenRouter(messages, model);
        } catch (err) {
            console.warn(`[Vision] ${model} gagal: ${err.message}`);
            lastError = err;
        }
    }

    // Fallback terakhir: Groq Vision
    console.warn('[Fallback Vision] Semua OpenRouter gagal. Beralih ke Groq Vision...');
    try {
        return await fetchGroq(messages, 'llama-3.2-11b-vision-preview');
    } catch (errGroq) {
        throw new Error(`Semua server vision down. OpenRouter: ${lastError?.message} | Groq: ${errGroq.message}`);
    }
}

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
            const text = await processTextWithFallback([{ role: 'user', content: SENTIMENT_PROMPT(newsText) }]);
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
            aiText = await processVisionWithFallback(messages);
        } else {
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: userText },
            ];
            aiText = await processTextWithFallback(messages);
        }

        return res.status(200).json(parseJSON(aiText));

    } catch (error) {
        console.error('[API Error]:', error.message);
        return res.status(500).json({ error: error.message || 'Gagal memproses AI' });
    }
}
