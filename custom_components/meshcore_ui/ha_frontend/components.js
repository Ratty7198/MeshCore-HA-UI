// Shared UI components for MeshCore UI

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'info') {
  const existing = document.querySelector('.mc-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `mc-toast mc-toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${escHtml(message)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Escape HTML special characters.
 */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a timestamp to local time string.
 */
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format uptime seconds to human-readable string.
 */
export function formatUptime(seconds) {
  if (!seconds) return '—';
  const s = parseInt(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Return a CSS colour for an SNR value.
 */
export function snrColor(snr) {
  const n = parseFloat(snr);
  if (isNaN(n)) return '#6b7280';
  if (n >= 5) return '#22c55e';
  if (n >= 0) return '#eab308';
  if (n >= -10) return '#f97316';
  return '#ef4444';
}

/**
 * Return a battery icon based on percentage.
 */
export function batteryIcon(pct) {
  const n = parseInt(pct);
  if (isNaN(n)) return '🔋';
  if (n > 80) return '🔋';
  if (n > 40) return '🪫';
  return '⚠️';
}

/**
 * Render a stat card.
 */
export function statCard(icon, label, value, extra = '') {
  return `
    <div class="mc-card stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-body">
        <div class="stat-value">${escHtml(String(value ?? '—'))}</div>
        <div class="stat-label">${escHtml(label)}</div>
        ${extra ? `<div class="stat-extra">${extra}</div>` : ''}
      </div>
    </div>`;
}

/**
 * Render a key/value info row.
 */
export function infoRow(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `
    <div class="info-row">
      <span class="info-label">${escHtml(label)}</span>
      <span class="info-value">${escHtml(String(value))}</span>
    </div>`;
}

/**
 * Connection status badge HTML.
 */
export function connectionBadge(connected) {
  const cls = connected ? 'mc-badge-green' : 'mc-badge-red';
  const label = connected ? 'Connected' : 'Disconnected';
  return `<span class="mc-badge ${cls}">${label}</span>`;
}

/**
 * Simple confirm dialog using a custom modal.
 * Returns a promise that resolves to true/false.
 */
export function confirmDialog(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'mc-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="mc-dialog" style="max-width:380px">
        <div class="mc-dialog-header">
          <h2>${escHtml(title)}</h2>
        </div>
        <div class="mc-dialog-body">
          <p style="color:var(--mc-text2);font-size:14px">${escHtml(message)}</p>
        </div>
        <div class="mc-dialog-footer">
          <button class="mc-btn mc-btn-secondary" id="mc-confirm-no">Cancel</button>
          <button class="mc-btn mc-btn-danger" id="mc-confirm-yes">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#mc-confirm-yes').onclick = () => { backdrop.remove(); resolve(true); };
    backdrop.querySelector('#mc-confirm-no').onclick = () => { backdrop.remove(); resolve(false); };
    backdrop.onclick = (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(false); } };
  });
}

/**
 * Build a conversation ID from context.
 */
export function buildConversationId(type, id) {
  return type === 'dm' ? `dm_${id}` : `ch_${id}`;
}

/**
 * Parse a conversation ID.
 */
export function parseConversationId(cid) {
  if (!cid) return { type: 'channel', id: '0' };
  if (cid.startsWith('dm_')) return { type: 'dm', id: cid.slice(3) };
  return { type: 'channel', id: cid.slice(3) };
}
