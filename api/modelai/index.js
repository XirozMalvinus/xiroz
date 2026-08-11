// api/modelai/index.js
// Xiroz Project — AI Model Endpoint
// Deploy this to Vercel, Netlify, or any Node.js serverless environment

import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// CONFIGURATION
// ============================================================
const VALID_TOKENS = new Set();
// In production, store tokens in a database or Redis
// This is just for demo — tokens persist in memory until server restarts

const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
};

const rateLimitStore = new Map();

// ============================================================
// TOKEN GENERATION & VALIDATION
// ============================================================
function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'xz_sk_';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  VALID_TOKENS.add(token);
  return token;
}

function isValidToken(token) {
  if (!token || !token.startsWith('xz_sk_')) return false;
  return VALID_TOKENS.has(token);
}

// ============================================================
// RATE LIMITING
// ============================================================
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip) || { count: 0, resetTime: now + RATE_LIMIT.windowMs };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT.windowMs;
  }

  record.count += 1;
  rateLimitStore.set(ip, record);

  return {
    allowed: record.count <= RATE_LIMIT.maxRequests,
    remaining: Math.max(0, RATE_LIMIT.maxRequests - record.count),
    resetAt: record.resetTime,
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ===== GET — health check + token info =====
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      version: 'v1',
      model: 'claude-3-haiku-20240307',
      endpoints: {
        generate_token: 'POST /api/modelai/generate',
        chat: 'POST /api/modelai',
      },
    });
  }

  // ===== POST — main AI endpoint =====
  if (req.method === 'POST') {
    // --- Token validation ---
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!isValidToken(token)) {
      return res.status(401).json({
        error: 'Invalid or missing API token. Generate one at /api/modelai/generate',
        code: 'INVALID_TOKEN',
      });
    }

    // --- Rate limiting ---
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const rate = checkRateLimit(ip);

    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Try again later.',
        code: 'RATE_LIMITED',
        resetAt: new Date(rate.resetAt).toISOString(),
      });
    }

    // --- Parse request ---
    const { prompt, system, max_tokens = 500 } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid "prompt" field',
        code: 'MISSING_PROMPT',
      });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({
        error: 'Prompt too long (max 5000 characters)',
        code: 'PROMPT_TOO_LONG',
      });
    }

    // --- Call Anthropic API ---
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: Math.min(max_tokens, 1000),
        system: system || 'Kamu adalah asisten AI bernama Xiroz, bagian dari platform Xiroz Project. Jawab dengan ramah, singkat, dan informatif dalam Bahasa Indonesia. Jangan sebut Claude atau Anthropic.',
        messages: [
          { role: 'user', content: prompt.trim() },
        ],
      });

      const reply = response.content[0]?.text || 'Maaf, tidak ada respons yang diterima.';

      // Cache identical prompts for 5 minutes (optional)
      return res.status(200).json({
        response: reply,
        usage: {
          input_tokens: response.usage?.input_tokens || 0,
          output_tokens: response.usage?.output_tokens || 0,
          total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
        model: 'claude-3-haiku-20240307',
        rate_limit: {
          remaining: rate.remaining,
          resetAt: new Date(rate.resetAt).toISOString(),
        },
      });
    } catch (error) {
      console.error('Anthropic API error:', error);

      // Fallback mock response for development
      if (process.env.NODE_ENV === 'development' || !process.env.ANTHROPIC_API_KEY) {
        const mockReplies = [
          'Menarik! Bisa kamu jelaskan lebih detail tentang itu?',
          'Baik, saya akan bantu. Untuk itu, kita perlu lihat dulu konteksnya secara keseluruhan.',
          'Hmm, saya pikir pendekatan terbaik adalah dengan memecah masalah menjadi bagian-bagian kecil yang manageable.',
          'Tentu! Xiroz Project menyediakan API yang sangat fleksibel untuk kebutuhan semacam itu.',
          'Apakah kamu sudah mencoba generate token di halaman Home? Itu langkah pertama yang penting.',
          'Saya suka pertanyaan itu! Mari kita bahas lebih dalam dengan pendekatan sistemik.',
          'Oh, itu pertanyaan bagus. Secara teknis, kita bisa optimasi dengan WebSocket untuk real-time streaming.',
          'Siap! Saya akan bantu tulis scriptnya. Tunggu sebentar ya, sedang diproses.'
        ];
        const mockReply = mockReplies[Math.floor(Math.random() * mockReplies.length)];

        return res.status(200).json({
          response: mockReply,
          usage: { input_tokens: prompt.length / 4, output_tokens: mockReply.length / 4, total_tokens: (prompt.length + mockReply.length) / 4 },
          model: 'mock-haiku',
          rate_limit: { remaining: rate.remaining, resetAt: new Date(rate.resetAt).toISOString() },
          _note: 'Mock response — set ANTHROPIC_API_KEY for real AI',
        });
      }

      return res.status(500).json({
        error: 'AI service temporarily unavailable',
        code: 'AI_SERVICE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  // ===== Method not allowed =====
  return res.status(405).json({
    error: 'Method not allowed',
    code: 'METHOD_NOT_ALLOWED',
    allowed: ['GET', 'POST', 'OPTIONS'],
  });
}

// ============================================================
// TOKEN GENERATION ENDPOINT (sub-route)
// ============================================================
export async function generate(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = generateToken();
  return res.status(200).json({
    token,
    expires: null, // never expires for demo
    message: 'Token generated successfully. Use it in Authorization: Bearer <token>',
  });
}

// ============================================================
// FOR STANDALONE EXPRESS SERVER (optional)
// ============================================================
// If you're running this as a standalone Express app:
/*
import express from 'express';
const app = express();
app.use(express.json());

app.all('/api/modelai', handler);
app.post('/api/modelai/generate', generate);

app.listen(3000, () => console.log('Xiroz AI API running on port 3000'));
*/
