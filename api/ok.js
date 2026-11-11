// Giriş formunun gönderim hedefi: tarayıcıya 'form gönderildi' sinyali verir (parola kaydetme önerisi için). Gövdeyi okumaz.
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<!doctype html><title>ok</title>ok');
};
