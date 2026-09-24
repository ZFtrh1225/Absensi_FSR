import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { reminderAt } from './schedule.js';

const {
  PORT = '8787', APP_ORIGIN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
  VAPID_SUBJECT, PUSH_DATA_FILE = './data/subscriptions.json'
} = process.env;
if (!APP_ORIGIN || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  throw new Error('Set APP_ORIGIN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.');
}
const allowedOrigin = new URL(APP_ORIGIN).origin;
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const dataPath = resolve(PUSH_DATA_FILE);
mkdirSync(dirname(dataPath), { recursive: true });
const state = existsSync(dataPath)
  ? JSON.parse(readFileSync(dataPath, 'utf8'))
  : { subscriptions: {}, lastSent: {} };
state.subscriptions ||= {};
state.lastSent ||= {};
function save() {
  writeFileSync(dataPath + '.tmp', JSON.stringify(state));
  renameSync(dataPath + '.tmp', dataPath);
}
function idFor(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}
function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const host = url.hostname.toLowerCase();
    const pushService = host === 'fcm.googleapis.com' ||
      host === 'android.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host === 'push.services.mozilla.com' ||
      host === 'push.apple.com' ||
      host.endsWith('.notify.windows.com');
    return url.protocol === 'https:' && value.endpoint.length < 2048 &&
      url.port === '' && pushService &&
      typeof value.keys?.p256dh === 'string' && value.keys.p256dh.length < 256 &&
      typeof value.keys?.auth === 'string' && value.keys.auth.length < 256;
  } catch { return false; }
}
function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(body));
}
async function readJSON(req) {
  let text = '';
  for await (const part of req) {
    text += part;
    if (text.length > 8192) throw new Error('Payload terlalu besar');
  }
  return JSON.parse(text);
}
const server = http.createServer(async (req, res) => {
  if (req.url !== '/api/push/config' && req.url !== '/api/push/subscriptions') {
    return respond(res, 404, { error: 'Not found' });
  }
  if (req.headers.origin && req.headers.origin !== allowedOrigin) {
    return respond(res, 403, { error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.url === '/api/push/config' && req.method === 'GET') {
    return respond(res, 200, { publicKey: VAPID_PUBLIC_KEY });
  }
  if (req.url === '/api/push/subscriptions' && ['POST', 'DELETE'].includes(req.method)) {
    // This endpoint receives only browser-generated subscriptions. Do not put user IDs or PINs here.
    if (req.headers.origin !== allowedOrigin) return respond(res, 403, { error: 'Origin wajib sesuai aplikasi' });
    try {
      const { subscription } = await readJSON(req);
      if (!validSubscription(subscription)) return respond(res, 400, { error: 'Subscription tidak valid' });
      const key = idFor(subscription.endpoint);
      if (req.method === 'POST') state.subscriptions[key] = subscription;
      else delete state.subscriptions[key];
      save();
      return respond(res, 200, { ok: true });
    } catch { return respond(res, 400, { error: 'JSON tidak valid' }); }
  }
  return respond(res, 405, { error: 'Method tidak didukung' });
});

async function sendDailyReminder() {
  const reminder = reminderAt(new Date());
  if (!reminder || state.lastSent[reminder.type] === reminder.key) return;
  // Persist before sending to prevent duplicate sends after a process restart.
  state.lastSent[reminder.type] = reminder.key;
  save();
  const payload = JSON.stringify({ title: reminder.title, body: reminder.body, tag: reminder.key });
  const subscriptions = Object.entries(state.subscriptions);
  for (let i = 0; i < subscriptions.length; i += 50) {
    await Promise.all(subscriptions.slice(i, i + 50).map(async ([key, subscription]) => {
      try { await webpush.sendNotification(subscription, payload, { TTL: 3600 }); }
      catch (error) {
        if ([404, 410].includes(error.statusCode)) delete state.subscriptions[key];
        else console.error('Push delivery failed:', error.statusCode || error.message);
      }
    }));
  }
  save();
  console.log(`Reminder ${reminder.key}: ${subscriptions.length} subscriptions processed`);
}
let sending = false;
setInterval(async () => {
  if (sending) return;
  sending = true;
  try { await sendDailyReminder(); }
  catch (error) { console.error('Reminder scheduler failed:', error); }
  finally { sending = false; }
}, 5000);
server.listen(Number(PORT), () => console.log(`Push server listening on ${PORT}`));
