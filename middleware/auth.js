const jwt = require('jsonwebtoken');

function autenticarAdmin(req, res, next) {
  const token = req.cookies && req.cookies.af_token;
  if (!token) {
    if (req.accepts('html')) return res.redirect('/login.html');
    return res.status(401).json({ erro: 'Não autorizado.' });
  }
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    if (req.accepts('html')) return res.redirect('/login.html');
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}

module.exports = { autenticarAdmin };
