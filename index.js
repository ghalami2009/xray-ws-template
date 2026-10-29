const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

// Port: panel hosts (Pterodactyl style) use SERVER_PORT, most cloud hosts use PORT
const port = parseInt(process.env.SERVER_PORT || process.env.PORT || '3000');

// Public hostname: PUBLIC_HOST variable, or a file named host.txt, or Render's own variable
function readHost() {
  let h = process.env.PUBLIC_HOST || '';
  if (!h) { try { h = fs.readFileSync('host.txt', 'utf8'); } catch {} }
  if (!h) h = process.env.RENDER_EXTERNAL_HOSTNAME || '';
  return h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
const HOST = readHost();

// UUID and path. With VPN_SECRET set they are derived from it, so the link survives
// restarts even on hosts that wipe the disk. Without it they are generated once and saved.
function fromSecret(secret) {
  const h = (label) => crypto.createHmac('sha256', secret).update(label).digest();
  const u = h('uuid').subarray(0, 16);
  u[6] = (u[6] & 0x0f) | 0x40;
  u[8] = (u[8] & 0x3f) | 0x80;
  const x = u.toString('hex');
  return {
    uuid: `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`,
    path: '/ws-' + h('path').subarray(0, 6).toString('hex')
  };
}

const STATE_FILE = 'vpn-state.json';
let state = {};
if (process.env.VPN_SECRET) {
  state = fromSecret(process.env.VPN_SECRET);
} else {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
  if (!state.uuid || !state.path) {
    state = {
      uuid: crypto.randomUUID(),
      path: '/ws-' + crypto.randomBytes(6).toString('hex')
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  }
}

const shownHost = HOST || 'YOUR_HOST';
const link =
  `vless://${state.uuid}@${shownHost}:443?encryption=none&security=tls` +
  `&sni=${shownHost}&fp=chrome&type=ws&host=${shownHost}` +
  `&path=${encodeURIComponent(state.path)}#my-proxy`;

fs.writeFileSync('link.txt', link);

// Reads one file out of a zip archive using only Node's built-in zlib
function extractFromZip(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error('unsupported zip method ' + method);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(wanted + ' not found in the zip');
}

// Downloads the official Xray release on the first start if the binary is missing
async function ensureXray() {
  if (fs.existsSync('./xray')) return;
  if (os.platform() !== 'linux') throw new Error('this launcher needs Linux (found ' + os.platform() + ')');
  const asset = { x64: 'Xray-linux-64.zip', arm64: 'Xray-linux-arm64-v8a.zip' }[os.arch()];
  if (!asset) throw new Error('unsupported CPU type: ' + os.arch());
  const v = process.env.XRAY_VERSION; // optional, e.g. v26.3.27 (empty = latest)
  const url = process.env.XRAY_URL || (v
    ? `https://github.com/XTLS/Xray-core/releases/download/${v}/${asset}`
    : `https://github.com/XTLS/Xray-core/releases/latest/download/${asset}`);
  console.log('Downloading Xray from', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  const zip = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('xray', extractFromZip(zip, 'xray'));
  fs.chmodSync('./xray', 0o755);
}

async function sendLink() {
  const text = 'Proxy link: ' + link;
  try {
    if (process.env.DISCORD_WEBHOOK) {
      await fetch(process.env.DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
    }
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text })
      });
    }
  } catch (e) {
    console.log('Could not send link:', e.message);
  }
}

(async () => {
  try {
    await ensureXray();
  } catch (e) {
    console.log('Could not get Xray:', e.message);
    console.log('Fix: download the Linux build from the XTLS/Xray-core releases page, extract the file');
    console.log('named xray, and upload it next to index.js. Then start again.');
    process.exit(1);
  }

  console.log('\n========== YOUR PROXY LINK ==========');
  console.log(link);
  console.log('=====================================');
  if (!HOST) {
    console.log('\nNOT FINISHED: your hostname is not set yet.');
    console.log('1) Find your public hostname (on panel hosts: the Domains tab, Canonical URL, without https://).');
    console.log('2) Set it as the PUBLIC_HOST variable (or put it in a file named host.txt).');
    console.log('3) Restart. Then use the new link, or replace YOUR_HOST in the link above.\n');
  } else {
    console.log('Import it into your client and turn Mux ON in the profile.\n');
  }
  if (process.env.RENDER && !process.env.VPN_SECRET) {
    console.log('NOTE: this host wipes its disk on restarts. Set VPN_SECRET to any long random text,');
    console.log('otherwise your link changes every time the service restarts.\n');
  }
  sendLink();

  const config = {
    log: { loglevel: 'warning' },
    inbounds: [{
      listen: '0.0.0.0',
      port,
      protocol: 'vless',
      settings: { clients: [{ id: state.uuid }], decryption: 'none' },
      streamSettings: {
        network: 'ws',
        security: 'none',
        wsSettings: { path: state.path }
      }
    }],
    outbounds: [{ protocol: 'freedom' }]
  };

  fs.writeFileSync('config.json', JSON.stringify(config));
  fs.chmodSync('./xray', 0o755);

  const p = spawn('./xray', ['run', '-c', 'config.json'], { stdio: 'inherit' });
  p.on('exit', code => process.exit(code));
})();
