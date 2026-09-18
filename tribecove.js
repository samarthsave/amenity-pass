// TribeCove event integration for the amenity booking bot.
//
// Creates a TribeCove event after a successful court booking. The API key is
// read at runtime from ~/.tribecove-api-key (never hard-coded), so the secret
// stays on this machine. All functions are defensive: a TribeCove failure logs
// and returns, and must never break or delay a booking.
//
// API docs: https://tribecove.com/api/v1  (see API.md in the tribecove repo)
//
// Enable via env:
//   TRIBECOVE_ENABLED=1
//   TRIBECOVE_TRIBE_ID=33            (preferred) OR
//   TRIBECOVE_TRIBE_NAME=Pickleball  (resolved via GET /tribes at runtime)

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://tribecove.com/api/v1';
const KEY_PATH = path.join(os.homedir(), '.tribecove-api-key');

function readApiKey() {
    try {
        return fs.readFileSync(KEY_PATH, 'utf8').trim();
    } catch (e) {
        console.log(`[tribecove] Could not read API key at ${KEY_PATH}: ${e.message}`);
        return null;
    }
}

async function apiRequest(method, endpoint, body) {
    const key = readApiKey();
    if (!key) return { ok: false, status: 0, error: 'no api key' };
    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${key}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = null;
        try { data = await res.json(); } catch (_) { /* non-JSON body */ }
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    }
}

// Resolve the target tribe id from env (id preferred, else name lookup).
async function resolveTribeId() {
    if (process.env.TRIBECOVE_TRIBE_ID) {
        return parseInt(process.env.TRIBECOVE_TRIBE_ID, 10);
    }
    const wantName = (process.env.TRIBECOVE_TRIBE_NAME || '').trim().toLowerCase();
    if (!wantName) return null;
    const res = await apiRequest('GET', '/tribes');
    if (!res.ok || !res.data || !Array.isArray(res.data.tribes)) {
        console.log(`[tribecove] GET /tribes failed (status ${res.status}): ${res.error || JSON.stringify(res.data)}`);
        return null;
    }
    const match = res.data.tribes.find((t) => (t.name || '').toLowerCase().includes(wantName));
    if (!match) {
        console.log(`[tribecove] No tribe matching "${wantName}" in: ${res.data.tribes.map((t) => t.name).join(', ')}`);
        return null;
    }
    return match.id;
}

// Avoid duplicates: true if an event with the same title + start already exists.
async function eventExists(tribeId, title, startsAt) {
    const res = await apiRequest('GET', `/tribes/${tribeId}/events`);
    if (!res.ok || !res.data || !Array.isArray(res.data.events)) return false;
    return res.data.events.some((e) => e.title === title && e.startsAt === startsAt);
}

// Create one event. `payload` follows the TribeCove body schema. Returns the
// created event's public URL on success, or null on any failure.
// startsAt/endsAt must be local wall-clock "YYYY-MM-DDTHH:mm" (no timezone).
async function createEvent(payload) {
    if (process.env.TRIBECOVE_ENABLED !== '1') return null;
    const tribeId = await resolveTribeId();
    if (!tribeId) {
        console.log('[tribecove] No tribe id resolved (set TRIBECOVE_TRIBE_ID or TRIBECOVE_TRIBE_NAME); skipping.');
        return null;
    }
    if (await eventExists(tribeId, payload.title, payload.startsAt)) {
        console.log(`[tribecove] Event already exists: "${payload.title}" @ ${payload.startsAt}; skipping.`);
        return null;
    }
    const res = await apiRequest('POST', `/tribes/${tribeId}/events`, payload);
    if (!res.ok) {
        console.log(`[tribecove] Create failed (status ${res.status}): ${res.error || JSON.stringify(res.data)}`);
        return null;
    }
    console.log(`[tribecove] ✅ Event created: ${res.data && res.data.url}`);
    return res.data ? res.data.url : null;
}

module.exports = { createEvent, resolveTribeId, eventExists, readApiKey };
