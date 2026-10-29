# xray-ws-template

Single-file launcher for a **personal** Xray proxy (VLESS over WebSocket) on container hosts.
On first start it downloads Xray, creates your own UUID and path, and prints a ready-to-import link.
No dependencies, no manual file uploads.

Deploy it on **your own** account. Every deployment gets its own private link, and free plans
(for example 256 MB RAM and 15% CPU) are only enough for one person's browsing and chat.

## What the host must provide

Check this list before trying a new host:

1. Node.js 18 or newer (or Docker, see the `Dockerfile`).
2. Outbound internet access (to download Xray and to reach the sites you browse).
3. A public **HTTPS** address on port 443 that forwards to your app's port, with WebSocket support.
4. Rules that allow personal proxies. **Read the host's terms first.** Many hosts forbid proxies and VPNs.
   Railway's staff, for example, have said personal Xray/V2Ray servers are not allowed there, so do not deploy it on Railway.

## Deploy on panel hosts (bot-hosting and similar)

1. **New**, then **Application**. Source: **GitHub**, paste this repository's URL. Runtime: **Node.js** (18 or newer).
2. Press **Start** and wait for the console to print `YOUR PROXY LINK`.
3. Open the **Domains** tab and copy the hostname under **Canonical URL** (without `https://`).
4. In the **Env** tab add `PUBLIC_HOST` with that hostname, then restart.
   (If the Env tab does not pass variables through, create a file named `host.txt` containing only the hostname.)
5. Copy the new link from the console, or open `link.txt` in **Files**.
6. Import it into Hiddify, v2rayNG or v2rayN, and **turn Mux ON** in the profile. A link cannot carry that setting, and without Mux,
   apps that open many connections at once get refused.

## Deploy on Render

1. **New**, then **Web Service**, and connect this repository. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`.
2. Add the environment variable `VPN_SECRET` with any long random text. Render wipes the disk on every restart, and
   this keeps your link the same.
3. Deploy. The console prints your link. Render supplies the hostname by itself, so there is nothing else to set.
4. Import the link and turn **Mux ON**.

Free Render services go to sleep after 15 minutes without traffic. The first connection after that can take 30 to 60 seconds,
so the client may need a retry. Active traffic keeps it awake. Confirm in Render's current terms that a personal proxy is allowed before you rely on it.

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `PUBLIC_HOST` | your public hostname (needed on most hosts; automatic on Render) |
| `VPN_SECRET` | any long random text; derives your UUID and path so the link never changes, even if the disk is wiped |
| `XRAY_VERSION` | pin a release such as `v26.3.27` (empty = latest) |
| `XRAY_URL` | download Xray from another address (a mirror), instead of GitHub |
| `DISCORD_WEBHOOK` | send the link to a private Discord channel on each start |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | send the link to a private Telegram chat |

The port comes from `SERVER_PORT` or `PORT`, whichever the host sets.

## Notes

- Without `VPN_SECRET`, your UUID and path are saved in `vpn-state.json`. Delete it and restart to rotate them.
  With `VPN_SECRET`, change the secret instead. Old links stop working either way.
- Never share your link publicly. Anyone who has it can use your server.
- Good for browsing and chat. Games work poorly, because UDP is carried inside a TCP tunnel.
- If the console says it could not download Xray, download the Linux build from the XTLS/Xray-core releases page,
  extract the file named `xray`, and upload it next to `index.js`.
- Other hosts: if it has Node.js and a public HTTPS address that reaches your app's port, set `PUBLIC_HOST` and it should work.
