// /api/analyze.js
export const maxDuration = 60;

// ================================================================
// OPENROUTER CONFIG
// Base URL sama dengan OpenAI, tinggal ganti model
// Model gratis yang support vision: meta-llama/llama-3.2-11b-vision-instruct:free
// Model gratis teks only: meta-llama/llama-3.3-70b-instruct:free
// ================================================================

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

const MODELS = {
    vision: 'meta-llama/llama-3.2-11b-vision-instruct:free', // support screenshot
    text:   'meta-llama/llama-3.3-70b-instruct:free',        // teks only, lebih pintar
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metode tidak diizinkan' });
    }

    const { pair, imageBase64, mode, newsText } = req.body;

    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY belum disetting di Vercel' });
    }

    const hasImage = !!imageBase64;

    // ── HELPER: Panggil OpenRouter ──
    async function callOpenRouter(messages, useVision = false) {
        const model = useVision ? MODELS.vision : MODELS.text;

        const response = await fetch(OPENROUTER_BASE, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer':  'https://pensynergy-ai.vercel.app',
                'X-Title':       'PEN SYNERGY AI',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens:  2000,
            }),
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

        return data.choices?.[0]?.message?.content || '';
    }

    // ================================================================
    // MODE: NEWS SENTIMENT
    // ================================================================
    if (mode === 'sentiment') {
        if (!newsText) return res.status(400).json({ error: 'newsText wajib diisi' });

        const sentimentPrompt = `Kamu adalah engine analisis sentimen berita finansial.
Baca berita berikut dan kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan):
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

        try {
            const messages = [{ role: 'user', content: sentimentPrompt }];
            const text = await callOpenRouter(messages, false);
            const clean = text.replace(/```json\n?|```\n?/g, '').trim();
            return res.status(200).json(JSON.parse(clean));
        } catch (err) {
            return res.status(500).json({ error: 'Sentiment analysis gagal: ' + err.message });
        }
    }

    // ================================================================
    // MODE: TRADING ANALYSIS (default)
    // ================================================================
    const systemPrompt = `You are an elite institutional trading analyst specializing in Smart Money Concepts (SMC), ICT methodology, and technical analysis. You have 20+ years of experience reading institutional order flow, liquidity sweeps, supply/demand zones, and market structure.

Your task: Analyze the market and return ONLY a valid JSON object. No markdown, no explanation outside JSON.

Required JSON structure:
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
  "analysis": "<detailed 150-250 word SMC analysis in Indonesian>",
  "visionAnalysis": "<if image provided: detailed chart reading in Indonesian, else null>"
}`;

    const now = new Date().toUTCString();
    const userText = `Analisis pair: ${pair}
Waktu: ${now}
${hasImage
    ? 'Screenshot chart diberikan. Baca detail: candlestick pattern, trendline, support/resistance, liquidity zone, supply/demand, breakout/breakdown, momentum.'
    : 'Berikan analisis berdasarkan kondisi market umum pair ini.'
}

Gunakan gaya Smart Money Concept (SMC): market structure, order blocks, fair value gaps, liquidity sweeps, area entry terbaik.`;

    try {
        let messages;

        if (hasImage) {
            // Pakai vision model kalau ada screenshot
            messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userText },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                    ],
                },
            ];
        } else {
            messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userText },
            ];
        }

        const aiText = await callOpenRouter(messages, hasImage);
        const clean  = aiText.replace(/```json\n?|```\n?/g, '').trim();
        const result = JSON.parse(clean);

        return res.status(200).json(result);

    } catch (error) {
        console.error('[API Error]:', error);
        return res.status(500).json({ error: error.message || 'Gagal memproses AI' });
    }
}
