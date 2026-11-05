/* Wpollo Chat — servidor próprio de mensagens (sem número de telefone: login por username).
 * Recursos: conversas 1:1, grupos (admin, adicionar/remover, renomear), imagens, recibos de leitura,
 * "digitando…", presença online, histórico paginado, tempo real por WebSocket.
 * Dependência única: ws. Dados em data/db.json (gravação atômica) e imagens em data/media/.
 * Uso:  npm i && PORT=8787 node server.js   (ponha atrás de HTTPS: Caddy/Nginx — WebXR exige https)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8787;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_IMG = 3 * 1024 * 1024, MAX_JSON = 64 * 1024, MAX_TEXT = 4000;
fs.mkdirSync(path.join(DATA, 'media'), { recursive: true });

// ---------------------------------------------------------------- banco (JSON simples, gravação atômica)
const DBF = path.join(DATA, 'db.json');
let db = { users: {}, tokens: {}, chats: {}, messages: {}, seq: 1 };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DBF, 'utf8'))); } catch (e) { /* novo */ }
let dirty = false;
function save() { dirty = true; }
setInterval(() => { if (!dirty) return; dirty = false; const tmp = DBF + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DBF); }, 1000);
const id = () => crypto.randomBytes(9).toString('base64url');
const now = () => Date.now();

// ---------------------------------------------------------------- senhas e sessões
function hashPw(pw, salt) { salt = salt || crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, stored) { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 32); return a.length === b.length && crypto.timingSafeEqual(a, b); }
const tokHash = t => crypto.createHash('sha256').update(t).digest('hex');
function newToken(user) { const t = crypto.randomBytes(32).toString('base64url'); db.tokens[tokHash(t)] = { user, at: now() }; save(); return t; }
function auth(req) { const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : null; const s = t && db.tokens[tokHash(t)]; return s && db.users[s.user] ? s.user : null; }

// ---------------------------------------------------------------- limite de requisições (por IP)
const buckets = new Map();
function limited(ip, cost = 1) {
  const b = buckets.get(ip) || { n: 60, t: now() }; b.n = Math.min(60, b.n + (now() - b.t) / 1000 * 2); b.t = now();
  if (b.n < cost) { buckets.set(ip, b); return true; } b.n -= cost; buckets.set(ip, b); return false;
}

// ---------------------------------------------------------------- utilidades HTTP
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req, max) {
  return new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { fail(Object.assign(new Error('grande demais'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail);
  });
}
const json = async req => { const b = await body(req, MAX_JSON); try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { throw Object.assign(new Error('JSON inválido'), { code: 400 }); } };
const USER_RE = /^[a-z0-9_.]{3,20}$/;
const pub = u => { const x = db.users[u]; return x && { username: u, name: x.name, color: x.color, status: x.status || '', online: online.has(u), lastSeen: x.lastSeen || 0 }; };

function chatView(c, me) {
  const msgs = db.messages[c.id] || [], last = msgs[msgs.length - 1];
  const read = (c.read && c.read[me]) || 0;
  return { id: c.id, type: c.type, name: c.type === 'dm' ? (pub(c.members.find(m => m !== me) || me) || {}).name : c.name,
    members: c.members.map(pub), admins: c.admins || [], created: c.created,
    last: last ? { from: last.from, text: last.text, image: !!last.image, at: last.at } : null,
    unread: msgs.filter(m => m.at > read && m.from !== me).length };
}
function memberOf(cid, u) { const c = db.chats[cid]; return c && c.members.includes(u) ? c : null; }
function post(c, from, text, image) {
  const m = { id: id(), from, at: now(), text: text ? String(text).slice(0, MAX_TEXT) : '', image: image || null };
  (db.messages[c.id] = db.messages[c.id] || []).push(m); c.updated = m.at; save();
  broadcast(c.members, { type: 'message', chat: c.id, message: m });
  return m;
}

// ---------------------------------------------------------------- rotas
const routes = [];
const route = (method, re, fn, open) => routes.push({ method, re, fn, open });

route('POST', /^\/api\/register$/, async (req, res) => {
  const { username, password, name } = await json(req);
  const u = String(username || '').toLowerCase();
  if (!USER_RE.test(u)) return send(res, 400, { error: 'username: 3–20 letras minúsculas, números, _ ou .' });
  if (!password || String(password).length < 6) return send(res, 400, { error: 'senha: mínimo 6 caracteres' });
  if (db.users[u]) return send(res, 409, { error: 'username já existe' });
  db.users[u] = { pw: hashPw(String(password)), name: String(name || u).slice(0, 40), color: '#' + crypto.randomBytes(3).toString('hex'), created: now() }; save();
  send(res, 200, { token: newToken(u), user: pub(u) });
}, true);
route('POST', /^\/api\/login$/, async (req, res) => {
  const { username, password } = await json(req); const u = String(username || '').toLowerCase(), x = db.users[u];
  if (!x || !checkPw(String(password || ''), x.pw)) return send(res, 401, { error: 'usuário ou senha incorretos' });
  send(res, 200, { token: newToken(u), user: pub(u) });
}, true);
route('POST', /^\/api\/logout$/, async (req, res, me) => { const t = (req.headers.authorization || '').slice(7); delete db.tokens[tokHash(t)]; save(); send(res, 200, { ok: true }); });
route('GET', /^\/api\/me$/, async (req, res, me) => send(res, 200, pub(me)));
route('PATCH', /^\/api\/me$/, async (req, res, me) => { const b = await json(req), x = db.users[me]; if (b.name) x.name = String(b.name).slice(0, 40); if (b.status !== undefined) x.status = String(b.status).slice(0, 80); if (/^#[0-9a-f]{6}$/i.test(b.color || '')) x.color = b.color; save(); send(res, 200, pub(me)); });
route('GET', /^\/api\/users$/, async (req, res, me) => {
  const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').toLowerCase();
  send(res, 200, Object.keys(db.users).filter(u => u !== me && (u.includes(q) || db.users[u].name.toLowerCase().includes(q))).slice(0, 20).map(pub));
});
route('GET', /^\/api\/chats$/, async (req, res, me) => send(res, 200, Object.values(db.chats).filter(c => c.members.includes(me)).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(c => chatView(c, me))));
route('POST', /^\/api\/chats\/dm$/, async (req, res, me) => {
  const u = String((await json(req)).username || '').toLowerCase(); if (!db.users[u] || u === me) return send(res, 404, { error: 'usuário não encontrado' });
  let c = Object.values(db.chats).find(c => c.type === 'dm' && c.members.includes(me) && c.members.includes(u));
  if (!c) { c = { id: id(), type: 'dm', members: [me, u], created: now(), updated: now(), read: {} }; db.chats[c.id] = c; save(); broadcast(c.members, { type: 'chat', chat: c.id }); }
  send(res, 200, chatView(c, me));
});
route('POST', /^\/api\/chats\/group$/, async (req, res, me) => {
  const b = await json(req); const name = String(b.name || '').trim().slice(0, 50); if (!name) return send(res, 400, { error: 'nome do grupo obrigatório' });
  const members = [me].concat((b.members || []).map(x => String(x).toLowerCase()).filter(u => db.users[u] && u !== me)).slice(0, 256);
  const c = { id: id(), type: 'group', name, members: Array.from(new Set(members)), admins: [me], created: now(), updated: now(), read: {} };
  db.chats[c.id] = c; save(); post(c, me, '📢 ' + db.users[me].name + ' criou o grupo "' + name + '"'); send(res, 200, chatView(c, me));
});
route('POST', /^\/api\/chats\/(\w[\w-]*)\/members$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me); if (!c || c.type !== 'group') return send(res, 404, { error: 'grupo não encontrado' });
  if (!c.admins.includes(me)) return send(res, 403, { error: 'só administradores' });
  const add = ((await json(req)).usernames || []).map(x => String(x).toLowerCase()).filter(u => db.users[u] && !c.members.includes(u));
  c.members.push(...add); save(); if (add.length) post(c, me, '➕ ' + add.join(', ') + ' entrou no grupo'); send(res, 200, chatView(c, me));
});
route('DELETE', /^\/api\/chats\/(\w[\w-]*)\/members\/([a-z0-9_.]+)$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me), u = m[2]; if (!c || c.type !== 'group') return send(res, 404, { error: 'grupo não encontrado' });
  if (u !== me && !c.admins.includes(me)) return send(res, 403, { error: 'só administradores' });
  c.members = c.members.filter(x => x !== u); c.admins = c.admins.filter(x => x !== u); if (!c.admins.length && c.members.length) c.admins.push(c.members[0]);
  save(); post(c, me, (u === me ? '🚪 ' + u + ' saiu' : '➖ ' + u + ' foi removido')); broadcast([u], { type: 'chat', chat: c.id }); send(res, 200, { ok: true });
});
route('PATCH', /^\/api\/chats\/(\w[\w-]*)$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me); if (!c || c.type !== 'group' || !c.admins.includes(me)) return send(res, 403, { error: 'sem permissão' });
  const b = await json(req); if (b.name) { c.name = String(b.name).slice(0, 50); save(); post(c, me, '✏️ grupo renomeado para "' + c.name + '"'); }
  send(res, 200, chatView(c, me));
});
route('GET', /^\/api\/chats\/(\w[\w-]*)\/messages$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me); if (!c) return send(res, 404, { error: 'conversa não encontrada' });
  const sp = new URL(req.url, 'http://x').searchParams, before = +sp.get('before') || Infinity, lim = Math.min(100, +sp.get('limit') || 50);
  const all = (db.messages[c.id] || []).filter(x => x.at < before); send(res, 200, { messages: all.slice(-lim), read: c.read || {} });
});
route('POST', /^\/api\/chats\/(\w[\w-]*)\/messages$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me); if (!c) return send(res, 404, { error: 'conversa não encontrada' });
  const b = await json(req); const img = b.image && /^[\w-]{6,30}\.(jpg|png|webp)$/.test(b.image) && fs.existsSync(path.join(DATA, 'media', b.image)) ? b.image : null;
  if (!b.text && !img) return send(res, 400, { error: 'mensagem vazia' });
  send(res, 200, post(c, me, b.text, img));
});
route('POST', /^\/api\/chats\/(\w[\w-]*)\/read$/, async (req, res, me, m) => {
  const c = memberOf(m[1], me); if (!c) return send(res, 404, { error: 'conversa não encontrada' });
  (c.read = c.read || {})[me] = now(); save(); broadcast(c.members, { type: 'read', chat: c.id, user: me, at: c.read[me] }); send(res, 200, { ok: true });
});
route('POST', /^\/api\/chats\/(\w[\w-]*)\/typing$/, async (req, res, me, m) => { const c = memberOf(m[1], me); if (c) broadcast(c.members.filter(u => u !== me), { type: 'typing', chat: c.id, user: me }); send(res, 200, { ok: true }); });
// imagens: corpo bruto (image/jpeg|png|webp), validado pelos bytes mágicos
route('POST', /^\/api\/media$/, async (req, res, me) => {
  const buf = await body(req, MAX_IMG);
  const t = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png' : buf.slice(8, 12).toString() === 'WEBP' ? 'webp' : null;
  if (!t) return send(res, 415, { error: 'só JPEG, PNG ou WebP' });
  const name = id() + '.' + t; fs.writeFileSync(path.join(DATA, 'media', name), buf); send(res, 200, { id: name });
});

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const server = http.createServer(async (req, res) => {
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE' }); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && /^\/media\/[\w-]+\.(jpg|png|webp)$/.test(u.pathname)) {
    const f = path.join(DATA, 'media', path.basename(u.pathname)); if (!fs.existsSync(f)) return send(res, 404, { error: 'não encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[f.split('.').pop()], 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'public, max-age=31536000, immutable' }); return fs.createReadStream(f).pipe(res);
  }
  if (u.pathname === '/' || u.pathname === '/health') return send(res, 200, { app: 'Wpollo Chat', ok: true, users: Object.keys(db.users).length });
  const r = routes.find(r => r.method === req.method && r.re.test(u.pathname));
  if (!r) return send(res, 404, { error: 'rota não encontrada' });
  if (limited(ip, r.open ? 5 : 1)) return send(res, 429, { error: 'muitas requisições, aguarde' });
  const me = auth(req); if (!r.open && !me) return send(res, 401, { error: 'faça login' });
  try { await r.fn(req, res, me, u.pathname.match(r.re)); } catch (e) { send(res, e.code || 500, { error: e.code ? e.message : 'erro interno' }); if (!e.code) console.error(e); }
});

// ---------------------------------------------------------------- tempo real
const online = new Map(); // username -> Set<ws>
function broadcast(users, ev) { const s = JSON.stringify(ev); users.forEach(u => (online.get(u) || []).forEach(ws => { if (ws.readyState === 1) ws.send(s); })); }
function friendsOf(u) { const s = new Set(); Object.values(db.chats).forEach(c => { if (c.members.includes(u)) c.members.forEach(m => s.add(m)); }); s.delete(u); return Array.from(s); }
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const t = new URL(req.url, 'http://x').searchParams.get('token'), s = t && db.tokens[tokHash(t)];
  if (!s || !db.users[s.user]) return ws.close(4001, 'auth');
  const u = s.user, set = online.get(u) || new Set(); set.add(ws); online.set(u, set);
  if (set.size === 1) broadcast(friendsOf(u), { type: 'presence', user: u, online: true });
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => { set.delete(ws); if (!set.size) { online.delete(u); db.users[u].lastSeen = now(); save(); broadcast(friendsOf(u), { type: 'presence', user: u, online: false }); } });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);

server.listen(PORT, () => console.log('Wpollo Chat ouvindo na porta ' + PORT + ' (dados em ' + DATA + ')'));
