require('dotenv').config({ path: './config.env' });

const express    = require('express');
const axios      = require('axios');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Config ─────────────────────────────────────────────────────────────────
const IBM_API_KEY      = process.env.IBM_API_KEY;
const WATSONX_URL      = process.env.IBM_WATSONX_URL;
const IAM_URL          = process.env.IBM_IAM_URL  || 'https://iam.cloud.ibm.com/identity/token';
const PROJECT_ID       = process.env.IBM_PROJECT_ID;
const MODEL_ID         = process.env.IBM_MODEL_ID  || 'ibm/granite-4-h-small';

// ─── IAM Token Cache ─────────────────────────────────────────────────────────
let iamTokenCache = null;
let iamTokenExpiry = 0;

async function getIAMToken() {
  if (iamTokenCache && Date.now() < iamTokenExpiry) {
    return iamTokenCache;
  }
  const response = await axios.post(
    IAM_URL,
    new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: IBM_API_KEY,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  iamTokenCache  = response.data.access_token;
  // Expire 5 minutes before actual expiry
  iamTokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
  return iamTokenCache;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api/', limiter);

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are SatCom-AI, an expert satellite communication engineer and assistant.
You have deep knowledge in:
- Orbital mechanics (LEO, MEO, GEO, HEO orbits, Kepler's laws, station-keeping)
- Satellite link budgets (EIRP, G/T ratio, path loss, C/N, Eb/N0, Shannon limit)
- Frequency bands: L-band (1–2 GHz), S-band (2–4 GHz), C-band (4–8 GHz), X-band (8–12 GHz), Ku-band (12–18 GHz), Ka-band (26.5–40 GHz)
- Communication protocols: DVB-S2/S2X, CCSDS, AX.25, IP-over-satellite
- Ground station operations, antenna systems, pointing & tracking
- Satellite telemetry, tracking and commanding (TT&C)
- Interference analysis, frequency coordination, ITU regulations
- Modulation & coding: BPSK, QPSK, 8PSK, 16APSK, LDPC, turbo codes
- VSAT, broadcast, broadband, military satellite comms
- Doppler effects, propagation delays, atmospheric effects (rain fade, scintillation)
- Modern constellations: Starlink, OneWeb, O3b/SES
- Satellite payload design: transponders, beamforming, frequency reuse

Provide precise, technical, and helpful answers. When discussing calculations, show your work step by step. Always be clear, professional, and educational.`;

// ─── In-memory session store ──────────────────────────────────────────────────
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  return sessions.get(sessionId);
}

// Cleanup old sessions every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, data] of sessions) {
    if (data._lastAccess && data._lastAccess < cutoff) {
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MODEL_ID,
    project: PROJECT_ID,
    timestamp: new Date().toISOString(),
  });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const history = getSession(sessionId);
  history._lastAccess = Date.now();

  // Build conversation messages array (no _lastAccess metadata)
  const conversationMessages = Array.isArray(history)
    ? history.filter(m => m && m.role)
    : [];

  // Add user message
  const userMsg = { role: 'user', content: message.trim() };
  conversationMessages.push(userMsg);

  const payload = {
    model_id: MODEL_ID,
    project_id: PROJECT_ID,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationMessages,
    ],
    parameters: {
      max_new_tokens: 1024,
      temperature: 0.7,
      top_p: 0.95,
      repetition_penalty: 1.1,
    },
  };

  try {
    const token = await getIAMToken();

    const response = await axios.post(WATSONX_URL, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 60000,
    });

    const assistantContent =
      response.data?.choices?.[0]?.message?.content ||
      response.data?.results?.[0]?.generated_text ||
      'No response generated.';

    const assistantMsg = { role: 'assistant', content: assistantContent };

    // Persist history (cap at 20 turns = 40 messages)
    history.push(userMsg, assistantMsg);
    while (history.filter(m => m && m.role).length > 40) {
      const idx = history.findIndex(m => m && m.role === 'user');
      if (idx === -1) break;
      history.splice(idx, 2);
    }

    return res.json({
      reply: assistantContent,
      sessionId,
      usage: response.data?.usage || null,
    });
  } catch (err) {
    console.error('WatsonX API Error:', err.response?.data || err.message);
    const status  = err.response?.status || 500;
    const detail  = err.response?.data?.errors?.[0]?.message ||
                    err.response?.data?.error ||
                    err.message;
    return res.status(status).json({ error: `AI service error: ${detail}` });
  }
});

// Clear session history
app.delete('/api/chat/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ cleared: true });
});

// Suggested prompts
app.get('/api/suggestions', (req, res) => {
  res.json({
    suggestions: [
      'Explain the link budget calculation for a Ku-band satellite',
      'What is the Doppler shift for a LEO satellite at 600 km altitude?',
      'Compare GEO vs LEO satellite orbits for communication',
      'How does rain fade affect Ka-band satellite signals?',
      'Explain DVB-S2X modulation and coding schemes',
      'Calculate the free-space path loss at 12 GHz for a 36,000 km GEO orbit',
      'What is frequency reuse in satellite communication?',
      'Describe the CCSDS telecommand protocol stack',
    ],
  });
});

// Catch-all → serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛰️  Satellite Communication Agent running`);
  console.log(`   ➜  http://localhost:${PORT}`);
  console.log(`   Model  : ${MODEL_ID}`);
  console.log(`   Project: ${PROJECT_ID}\n`);
});
