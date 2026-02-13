/**
 * Status Page — Live HTML dashboard
 *
 * Serves at /status — auto-refreshes, shows active sessions,
 * recent messages, and links to the GUI for each session.
 */

import { Hono } from "hono";

const statusPage = new Hono();

statusPage.get("/", (c) => {
  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.BOTICAL_PORT || 6001}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>🐆 Leopard Status</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 16px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.5em; margin-bottom: 8px; }
    .meta { color: #888; font-size: 0.85em; margin-bottom: 20px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 1.1em; color: #aaa; margin-bottom: 10px; border-bottom: 1px solid #222; padding-bottom: 6px; }
    .card { background: #141414; border: 1px solid #222; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
    .card:hover { border-color: #444; }
    .card a { color: #7cb3ff; text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .card .title { font-weight: 600; margin-bottom: 4px; }
    .card .info { color: #888; font-size: 0.85em; }
    .card .preview { color: #bbb; font-size: 0.9em; margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: 600; }
    .badge-active { background: #1a3a1a; color: #4ade80; }
    .badge-leopard { background: #3a2a1a; color: #fbbf24; }
    .badge-user { background: #1a2a3a; color: #60a5fa; }
    .badge-assistant { background: #2a1a3a; color: #c084fc; }
    .live-dot { display: inline-block; width: 8px; height: 8px; background: #4ade80; border-radius: 50%; margin-right: 6px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .error { color: #f87171; }
    .loading { color: #888; }
  </style>
</head>
<body>
  <h1>🐆 Leopard Status</h1>
  <div class="meta"><span class="live-dot"></span>Live — refreshes every 10s | <span id="timestamp"></span></div>

  <div class="section">
    <h2>Active Sessions</h2>
    <div id="sessions" class="loading">Loading...</div>
  </div>

  <div class="section">
    <h2>Recent Activity</h2>
    <div id="messages" class="loading">Loading...</div>
  </div>

  <div class="section">
    <h2>System</h2>
    <div id="system" class="loading">Loading...</div>
  </div>

  <script>
    const BASE = '';
    const APP = '${baseUrl}';

    function timeAgo(ts) {
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      if (s < 86400) return Math.floor(s/3600) + 'h ago';
      return Math.floor(s/86400) + 'd ago';
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    async function refresh() {
      try {
        const r = await fetch(BASE + '/api/status');
        const { data } = await r.json();

        document.getElementById('timestamp').textContent = new Date(data.timestamp).toLocaleString();

        // Sessions
        if (data.activeSessions.length === 0) {
          document.getElementById('sessions').innerHTML = '<div class="card">No active sessions</div>';
        } else {
          document.getElementById('sessions').innerHTML = data.activeSessions.map(s => {
            const url = APP + '/projects/' + s.projectId + '/tasks/' + s.id;
            return '<div class="card">' +
              '<div class="title"><a href="' + url + '" target="_blank">' + esc(s.title || s.id) + '</a></div>' +
              '<div class="info">' +
                (s.agent ? '<span class="badge badge-leopard">' + esc(s.agent) + '</span> ' : '') +
                '<span class="badge badge-active">active</span> ' +
                s.messageCount + ' msgs · ' + esc(s.projectName) + ' · ' + timeAgo(s.lastActivity) +
              '</div>' +
              (s.lastMessage ? '<div class="preview">' + esc(s.lastMessage) + '</div>' : '') +
            '</div>';
          }).join('');
        }

        // Messages
        if (data.recentMessages.length === 0) {
          document.getElementById('messages').innerHTML = '<div class="card">No recent messages</div>';
        } else {
          document.getElementById('messages').innerHTML = data.recentMessages.map(m => {
            const badge = m.role === 'user' ? 'badge-user' : 'badge-assistant';
            return '<div class="card">' +
              '<div class="info">' +
                '<span class="badge ' + badge + '">' + m.role + '</span> ' +
                (m.agent ? '<span class="badge badge-leopard">' + esc(m.agent) + '</span> ' : '') +
                timeAgo(m.createdAt) +
              '</div>' +
              '<div class="preview">' + esc(m.text) + '</div>' +
            '</div>';
          }).join('');
        }

        // System
        const upH = Math.floor(data.services.uptime / 3600);
        const upM = Math.floor((data.services.uptime % 3600) / 60);
        document.getElementById('system').innerHTML =
          '<div class="card"><div class="info">Server: ' + data.services.server + ' · Uptime: ' + upH + 'h ' + upM + 'm</div></div>';

      } catch (e) {
        document.getElementById('sessions').innerHTML = '<div class="error">Failed to load: ' + e.message + '</div>';
      }
    }

    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;

  return c.html(html);
});

export { statusPage };
