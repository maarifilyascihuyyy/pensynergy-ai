// /api/analyze.js
export const maxDuration = 60;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metode tidak diizinkan' });
    }

    const { provider, pair, imageBase64, mode, newsText } = req.body;

    // ── MODE: NEWS SENTIMENT (route terpisah) ──
    if (mode === 'sentiment') {
        if (!newsText) return res.status(400).json({ error: 'newsText wajib diisi' });

        const buildSentimentPrompt = (text) => `Analisis sentimen berita finansial ini.
Kembalikan HANYA JSON valid (tanpa markdown):
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
Berita: ${text}`;

        try {
            let sentText = '';
            const sp = buildSentimentPrompt(newsText);

            if (provider === 'openai') {
                const r = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: sp }], temperature: 0, response_format: { type: 'json_object' } }),
                });
                const d = await r.json();
                sentText = d.choices[0].message.content;

            } else if (provider === 'gemini') {
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: sp }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
                });
                const d = await r.json();
                sentText = d.candidates[0].content.parts[0].text;

            } else if (provider === 'claude') {
                const r = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                    body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 800, messages: [{ role: 'user', content: sp }] }),
                });
                const d = await r.json();
                sentText = d.content[0].text;
            }

            const clean = sentText.replace(/```json\n?|```\n?/g, '').trim();
            return res.status(200).json(JSON.parse(clean));

        } catch (err) {
            return res.status(500).json({ error: 'Sentiment analysis gagal: ' + err.message });
        }
    }

    // --- PROMPT TRADING EXPERT ---
    const systemPrompt = `You are an elite institutional trading analyst specializing in Smart Money Concepts (SMC), ICT methodology, and technical analysis. You have 20+ years of experience reading institutional order flow, liquidity sweeps, supply/demand zones, and market structure.

Your task: Analyze the market and return ONLY a valid JSON object (no markdown, no explanation outside JSON).

JSON structure required:
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
    "rsi": { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "macd": { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "ema": { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "sma": { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "bb": { "value": "UPPER|MID|LOWER", "signal": "BULL|BEAR|NEUT" },
    "volume": { "value": "HIGH|NORMAL|LOW", "signal": "BULL|BEAR|NEUT" },
    "vwap": { "value": "<value>", "signal": "BULL|BEAR|NEUT" },
    "atr": { "value": "<value>", "signal": "HIGH|NORMAL|LOW" }
  },
  "mtf": {
    "m1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "m5":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "m15": { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "h1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "h4":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" },
    "d1":  { "bias": "BULL|BEAR|NEUT", "detail": "<short detail>" }
  },
  "analysis": "<detailed 150-250 word SMC analysis in Indonesian, like a professional institutional trader>",
  "visionAnalysis": "<if image provided: detailed chart reading in Indonesian, else null>"
}`;

    const now = new Date().toUTCString();
    const hasImage = !!imageBase64;
    const userPromptText = `Analisis pair: ${pair}\nWaktu: ${now}\n${hasImage ? 'Screenshot chart telah diberikan. Baca dengan detail: candlestick pattern, trendline, support/resistance, liquidity zone, supply/demand, breakout/breakdown, dan momentum.' : 'Berikan analisis berdasarkan kondisi market umum pair ini.'}\n\nBerikan analisis dengan gaya Smart Money Concept (SMC) — identifikasi: market structure, order blocks, fair value gaps, liquidity sweeps, dan area entry terbaik.`;

    try {
        let aiResultText = "";

        // ==========================================
        // ROUTER 1: OPENAI (GPT-4o)
        // ==========================================
        if (provider === 'openai') {
            if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY belum disetting di Vercel");
            
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: hasImage 
                    ? [
                        { type: 'text', text: userPromptText },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                      ]
                    : userPromptText 
                }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: messages,
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            aiResultText = data.choices[0].message.content;
        } 
        
        // ==========================================
        // ROUTER 2: GEMINI (1.5 Flash / Pro)
        // ==========================================
        else if (provider === 'gemini') {
            if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum disetting di Vercel");

            const parts = [{ text: systemPrompt + '\n\n' + userPromptText }];
            if (hasImage) {
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            aiResultText = data.candidates[0].content.parts[0].text;
        } 
        
        // ==========================================
        // ROUTER 3: CLAUDE (Sonnet 3.5)
        // ==========================================
        else if (provider === 'claude') {
            if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY belum disetting di Vercel");

            const content = [];
            if (hasImage) {
                content.push({ 
                    type: "image", 
                    source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } 
                });
            }
            content.push({ type: "text", text: userPromptText });

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20241022',
                    system: systemPrompt,
                    max_tokens: 1500,
                    messages: [{ role: 'user', content: content }]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            aiResultText = data.content[0].text;
        } 
        
        else {
            return res.status(400).json({ error: 'Provider AI tidak dikenali. Pilih: openai, gemini, claude' });
        }

        // ==========================================
        // PARSER & PENGEMBALIAN DATA KE FRONTEND
        // ==========================================
        const cleanJsonText = aiResultText.replace(/```json\n?|```\n?/g, '').trim();
        const result = JSON.parse(cleanJsonText);

        return res.status(200).json(result);

    } catch (error) {
        console.error('[API Backend Error]:', error);
        return res.status(500).json({ error: error.message || 'Gagal memproses AI' });
    }
}
