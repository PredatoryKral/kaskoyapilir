// Vercel sunucu fonksiyonu: giriş yapmış kullanıcıların istekleri ortak Gemini anahtarıyla yanıtlanır.
// Vercel ortam değişkenleri: GEMINI_API_KEY (zorunlu), GEMINI_MODEL, GEMINI_FALLBACK_MODEL, APPS_SCRIPT_URL (isteğe bağlı)
// Tarayıcıda /api/gemini adresini açarsan ayarların durumunu gösterir. /api/gemini?test=1 Gemini'ye küçük bir deneme isteği atar.
const APPS_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwSn0Fg6c5crShQLu48u78oREJLMtycYhrQy62_-Rpzbe1ZBZWWUCxlkuXrXynnXzQ-/exec';
const MODELS = [process.env.GEMINI_MODEL || 'gemini-3.1-flash', process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite'];

async function appsPost(payload) {
  const r = await fetch(APPS_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

async function callGemini(model, key, body) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body,
  });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  return { r, d };
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') {
    const out = { gemini_key_set: !!key, model: MODELS[0], fallback_model: MODELS[1], apps_script: null, gemini_test: null };
    try {
      const j = await appsPost({ action: 'whoami', token: 'tanilama' });
      if (j && j.error === 'Oturum yok') out.apps_script = 'ok (guncel kod)';
      else if (j && j.error === 'Bilinmeyen işlem') out.apps_script = 'ESKI KOD: Apps Script yeni kodla yeniden dagitilmali';
      else out.apps_script = 'beklenmeyen yanit: ' + JSON.stringify(j).slice(0, 120);
    } catch (e) {
      out.apps_script = 'ulasilamadi ya da JSON degil: Erisim "Herkes" olmali, URL dogru olmali';
    }
    if (req.query && req.query.test === '1') {
      if (!key) out.gemini_test = 'GEMINI_API_KEY yok';
      else {
        try {
          const { r, d } = await callGemini(MODELS[0], key, JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Merhaba de.' }] }] }));
          out.gemini_test = r.ok ? 'ok' : { durum: r.status, mesaj: (d.error && d.error.message) || 'bilinmiyor' };
        } catch (e) {
          out.gemini_test = 'istek atilamadi';
        }
      }
    } else out.gemini_test = 'Denemek icin adresin sonuna ?test=1 ekle';
    return res.status(200).json(out);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY Vercel ortam degiskeni eksik (ya da ekledikten sonra yeniden deploy edilmedi)' });

  const token = String(req.headers['x-token'] || '');
  if (!token) return res.status(401).json({ error: 'yetkisiz' });
  try {
    const who = await appsPost({ action: 'whoami', token, count: true });
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
  const body = JSON.stringify({
    contents,
    generationConfig: { maxOutputTokens: 4096, ...(json ? { responseMimeType: 'application/json' } : {}) },
  });

  let last = { status: 0, msg: 'bilinmeyen hata', model: MODELS[0] };
  try {
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { r, d } = await callGemini(model, key, body);
        if (r.ok) {
          const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
          const text = parts.map((p) => p.text || '').join('');
          if (!text) return res.status(502).json({ error: 'Gemini boş yanıt döndürdü (' + model + '). Güvenlik filtresi olabilir.' });
          return res.status(200).json({ text });
        }
        last = { status: r.status, msg: (d.error && d.error.message) || 'bilinmeyen hata', model };
        if (![429, 500, 503].includes(r.status)) break;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    }
  } catch (e) {
    return res.status(500).json({ error: 'sunucu hatasi: ' + String(e && e.message).slice(0, 120) });
  }
  const busy = [429, 500, 503].includes(last.status);
  return res.status(502).json({
    error: (busy ? 'Gemini şu an yoğun ya da kotan doldu. ' : 'Gemini hatası. ') + '(' + last.status + ', model ' + last.model + '): ' + String(last.msg).slice(0, 200),
  });
};
