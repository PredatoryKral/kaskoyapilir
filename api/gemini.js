// Vercel sunucu fonksiyonu: giriş yapmış kullanıcıların istekleri ortak Gemini anahtarıyla yanıtlanır.
// Vercel ortam değişkenleri: GEMINI_API_KEY (zorunlu), APPS_SCRIPT_URL (isteğe bağlı), GEMINI_MODEL (isteğe bağlı)
const APPS_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwSn0Fg6c5crShQLu48u78oREJLMtycYhrQy62_-Rpzbe1ZBZWWUCxlkuXrXynnXzQ-/exec';

async function checkUser(token) {
  const r = await fetch(APPS_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'whoami', token, count: true }),
  });
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'sunucu ayarlari eksik' });

  const token = String(req.headers['x-token'] || '');
  if (!token) return res.status(401).json({ error: 'yetkisiz' });
  try {
    const who = await checkUser(token);
    if (!who.ok) {
      if (who.limit) return res.status(429).json({ error: who.error || 'limit' });
      if (who.auth === false) return res.status(401).json({ error: who.error || 'yetkisiz' });
      return res.status(502).json({ error: 'Apps Script güncel değil ya da hata verdi (' + (who.error || 'bilinmeyen') + '). Yeni kodu yapıştırıp yeni sürüm olarak dağıt.' });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Apps Script yanıtı okunamadı. Dağıtımda Erişim Herkes olmalı ve APPS_SCRIPT_URL doğru olmalı.' });
  }

  const { messages, json } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) {
    return res.status(400).json({ error: 'gecersiz istek' });
  }
  const contents = messages.map((m) => {
    const parts = typeof m.content === 'string'
      ? [{ text: m.content }]
      : (m.content || []).map((p) => p.type === 'image'
        ? { inline_data: { mime_type: p.source.media_type, data: p.source.data } }
        : { text: String(p.text || '') });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 4096, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: (d.error && d.error.message) || 'api hatasi' });
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    return res.status(200).json({ text: parts.map((p) => p.text || '').join('') });
  } catch (e) {
    return res.status(500).json({ error: 'sunucu hatasi' });
  }
};
