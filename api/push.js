// Akşam hatırlatma bildirimleri (Vercel Cron günde 1 kez çağırır; ücretsiz planda saat içinde bir anda çalışır)
// Ortam değişkenleri: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET, PUSH_SECRET (Apps Script'tekiyle aynı)
const webpush = require('web-push');
const APPS_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwSn0Fg6c5crShQLu48u78oREJLMtycYhrQy62_-Rpzbe1ZBZWWUCxlkuXrXynnXzQ-/exec';
const MSG = [
  'Kapkapçı Eymen sizi ayağına çağırıyor.',
  'Kapkapçı Eymen kapıda, elinde ödev listesi var. Sen yatakta ne yapıyorsun?',
  'Telefona bakacak vaktin var, ödeve yok. İlginç.',
  'YKS seni bekliyor, sen telefonu. Kim kazanacak, görelim.',
  'Yarın başlarım diyenlerin yarını hiç gelmedi. Bugün başla ulan.',
  'Kapkapçı Eymen defterine ismini yazdı. Bunu iyi bir şey sanma.',
  'Ödevler kendiliğinden bitmiyor, denendi, olmuyor.',
  'Sıralamada aşağı kayıyorsun, arkadaşların yukarıdan manzara izliyor.',
  'Pilotsker izliyor. Kaçamazsın.',
  'Bir soru çöz, dünya yıkılmaz. Çözmezsen de yıkılmaz ama sen yıkılırsın.',
];

const QUOTES = ["Disiplin, canın istemediğinde de yapmaktır.","Bugün yaptığın 10 soru, yarın pişman olacağın 10 saattir.","Motivasyon gelip geçer, alışkanlık kalır.","Deneme yanlış yapar, sınav yanlış affetmez.","Yorgunluk geçer, pişmanlık geçmez.","Telefon kaydırarak mezun olan görülmedi.","Başlamak için mükemmel olmayı bekleme; başla, mükemmelleşirsin.","Bugün ekmediğini sınavda biçemezsin.","Kolay yol yok ama kısa yol var: istikrar.","Yanlış yaptığın soru, sınavda doğru yapacağın sorudur.","Küçük adımlar bile hiç yürümemekten hızlıdır.","Erteleme tuşu seni üniversiteye götürmez.","Netin, harcadığın zamanın aynasıdır.","Bugünün yorgunluğu, sınav günü gülümsemendir.","Hayal kuran çok, plan yapan az, uygulayan çok daha az.","Önce soruyu çöz, sonra çözümü merak et.","Sınav günü motivasyon konuşması yapılmaz, sadece soru çözülür."];

async function apps(payload) {
  const r = await fetch(APPS_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  return r.json();
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const q = req.query || {};
  const ok = secret && (req.headers.authorization === 'Bearer ' + secret || q.key === secret);
  if (!ok) return res.status(401).json({ error: 'yetkisiz' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.PUSH_SECRET) {
    return res.status(500).json({ error: 'ortam degiskenleri eksik (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET)' });
  }
  webpush.setVapidDetails('mailto:admin@kasko.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const test = q.test === '1';
  const t = await apps({ action: 'push_targets', secret: process.env.PUSH_SECRET, all: true });
  if (!t.ok) return res.status(502).json({ error: t.error || 'Apps Script hatasi (yeni kodu dagittin mi?)' });
  const day = new Date().getDate();
  let sent = 0;
  const dead = [];
  for (const x of t.targets) {
    const k = day + x.u.length;
    const q = QUOTES[k % QUOTES.length];
    const head = x.open > 0 || x.none ? MSG[k % MSG.length] : 'Bugünkü işler tamam, helal.';
    const body = ((test ? 'Test bildirimi. ' : '') + head + ' ' + (x.open > 0 ? x.open + ' ödev/rutin açık. ' : '') + (x.none ? 'Bugün süre ya da soru girişi yok. ' : '') + 'Günün sözü: “' + q + '”').trim();
    for (const s of x.subs) {
      try {
        await webpush.sendNotification(s, JSON.stringify({ title: 'KASKO YAPILIR', body, url: './' }));
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
      }
    }
  }
  if (dead.length) await apps({ action: 'push_clean', secret: process.env.PUSH_SECRET, endpoints: dead });
  return res.status(200).json({ kullanici: t.targets.length, gonderilen: sent, gecersiz: dead.length });
};
