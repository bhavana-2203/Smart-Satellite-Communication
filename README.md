# Satellite Communication Agent

An AI-powered satellite communication assistant built on **IBM Granite-4** via WatsonX.

## Features

- 🛰️ Satellite communication Q&A and diagnostics
- 📡 Real-time AI chat powered by IBM Granite-4 (ibm/granite-4-h-small)
- 🌐 Professional web UI with satellite-themed design
- 🔒 Secure backend with rate limiting and CORS protection
- 💬 Persistent conversation history per session
- 📊 Satellite topics: orbital mechanics, link budgets, frequency bands, protocols

## Setup

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Configuration

Edit `config.env` with your credentials (already pre-filled):

```
IBM_API_KEY=your_api_key
IBM_PROJECT_ID=your_project_id
IBM_MODEL_ID=ibm/granite-4-h-small
PORT=3000
```

### Run

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Open your browser at **http://localhost:3000**

## Architecture

```
satellite-communication-agent/
├── server.js           # Express backend + WatsonX API integration
├── config.env          # Environment configuration
├── package.json        # Dependencies
└── public/
    ├── index.html      # Main UI
    ├── style.css       # Satellite-themed styles
    └── app.js          # Frontend JavaScript
```

## IBM WatsonX Integration

- **Model**: `ibm/granite-4-h-small`
- **Project**: `52bf4141-20ab-412c-b3aa-032164230146`
- **Region**: `eu-de` (Frankfurt)
- **Auth**: IAM token-based (auto-refreshed)

## Satellite Topics Covered

- Orbital mechanics & trajectory
- Link budget calculations
- Frequency bands (L, S, C, X, Ku, Ka)
- Communication protocols (DVB-S2, CCSDS)
- Ground station operations
- Satellite telemetry & commanding
- Interference & mitigation
- Antenna design & pointing
