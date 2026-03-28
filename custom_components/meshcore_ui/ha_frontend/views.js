// Tab views for MeshCore UI
import { escHtml, formatTime, formatUptime, snrColor, batteryIcon, statCard, infoRow, connectionBadge, showToast, confirmDialog, parseConversationId, buildConversationId } from './components.js';
import { sharedStyles } from './styles.js';

// ── Messages View ─────────────────────────────────────────────────────────────

export class MeshCoreMessagesView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._contacts = [];
    this._conversations = {};
    this._activeConv = null;
    this._messages = [];
    this._sending = false;
  }

  set hass(val) { this._hass = val; }

  async connectedCallback() {
    this._render();
    await this._loadContacts();
    this._setupEventListener();
  }

  disconnectedCallback() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  _setupEventListener() {
    if (!this._hass) return;
    this._unsub = this._hass.connection.subscribeEvents((event) => {
      if (event.data?.conversation_id === this._activeConv) {
        this._messages.push(event.data.message);
        this._renderMessages();
      } else {
        this._markUnread(event.data?.conversation_id);
      }
    }, 'meshcore_ui_new_message').then(unsub => { this._unsub = unsub; });
  }

  async _loadContacts() {
    const res = await this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_contacts' });
    this._contacts = res.contacts || [];
    this._renderSidebar();
  }

  async _selectConversation(cid) {
    this._activeConv = cid;
    const res = await this._hass.connection.sendMessagePromise({
      type: 'meshcore_ui/get_messages',
      conversation_id: cid,
      limit: 100,
    });
    this._messages = res.messages || [];
    this._renderSidebar();
    this._renderMessages();
    this._shadow?.querySelector('.mc-msg-input')?.focus();
  }

  async _sendMessage() {
    const input = this.shadowRoot.querySelector('.mc-msg-input');
    const text = input?.value?.trim();
    if (!text || this._sending || !this._activeConv) return;
    this._sending = true;

    const { type, id } = parseConversationId(this._activeConv);
    const payload = {
      type: 'meshcore_ui/send_message',
      text,
      conversation_id: this._activeConv,
    };
    if (type === 'dm') payload.contact_pubkey = id;
    else payload.channel_idx = parseInt(id);

    try {
      const res = await this._hass.connection.sendMessagePromise(payload);
      if (res.success) {
        input.value = '';
        this._messages.push(res.message);
        this._renderMessages();
        showToast('Sent', 'success');
      }
    } catch (e) {
      showToast(`Send failed: ${e.message}`, 'error');
    } finally {
      this._sending = false;
    }
  }

  _markUnread(cid) {
    const el = this.shadowRoot.querySelector(`[data-cid="${CSS.escape(cid)}"] .conv-unread`);
    if (el) { el.textContent = '●'; el.style.display = 'inline'; }
  }

  _buildConvList() {
    const items = [];
    // Channel conversations (ch_0 etc)
    for (let i = 0; i < 8; i++) {
      items.push({ cid: `ch_${i}`, name: `Channel ${i}`, icon: '📡', type: 'channel' });
    }
    // DM conversations from contacts
    for (const c of this._contacts) {
      items.push({ cid: `dm_${c.pubkey_prefix}`, name: c.name || c.pubkey_prefix, icon: '👤', type: 'dm' });
    }
    return items;
  }

  _renderSidebar() {
    const sidebar = this.shadowRoot.querySelector('.conv-list');
    if (!sidebar) return;
    const convs = this._buildConvList();
    sidebar.innerHTML = convs.map(c => `
      <div class="conv-item ${c.cid === this._activeConv ? 'active' : ''}" data-cid="${escHtml(c.cid)}">
        <span class="conv-icon">${c.icon}</span>
        <span class="conv-name">${escHtml(c.name)}</span>
        <span class="conv-unread" style="display:none;color:var(--mc-accent);font-size:10px">●</span>
      </div>`).join('');

    sidebar.querySelectorAll('.conv-item').forEach(el => {
      el.addEventListener('click', () => this._selectConversation(el.dataset.cid));
    });
  }

  _renderMessages() {
    const container = this.shadowRoot.querySelector('.mc-messages-list');
    if (!container) return;

    if (!this._activeConv) {
      container.innerHTML = `<div class="mc-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><h3>Select a conversation</h3><p>Choose a channel or contact from the sidebar</p></div>`;
      return;
    }

    if (!this._messages.length) {
      container.innerHTML = `<div class="mc-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><h3>No messages yet</h3></div>`;
      return;
    }

    container.innerHTML = this._messages.map(m => {
      const out = m.direction === 'out';
      return `
        <div class="mc-msg ${out ? 'mc-msg-out' : 'mc-msg-in'}">
          ${!out ? `<div class="mc-msg-sender">${escHtml(m.sender_name || m.sender_pubkey)}</div>` : ''}
          <div class="mc-msg-bubble">${escHtml(m.text)}</div>
          <div class="mc-msg-meta">
            ${m.snr !== undefined ? `<span style="color:${snrColor(m.snr)}">SNR ${m.snr}</span>` : ''}
            ${m.hops !== undefined ? `<span>${m.hops} hop${m.hops !== 1 ? 's' : ''}</span>` : ''}
            <span>${formatTime(m.timestamp)}</span>
          </div>
        </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${sharedStyles}
        :host { display: flex; height: 100%; overflow: hidden; }
        .conv-sidebar {
          width: 220px; flex-shrink: 0;
          background: var(--mc-surface); border-right: 1px solid var(--mc-border);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .conv-sidebar-header {
          padding: 14px 16px; border-bottom: 1px solid var(--mc-border);
          font-size: 13px; font-weight: 600; color: var(--mc-text2); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .conv-list { flex: 1; overflow-y: auto; padding: 6px; }
        .conv-item {
          display: flex; align-items: center; gap: 8px; padding: 9px 10px;
          border-radius: var(--mc-radius-sm); cursor: pointer; font-size: 13px;
          transition: background 0.12s; color: var(--mc-text2);
        }
        .conv-item:hover { background: var(--mc-surface2); color: var(--mc-text); }
        .conv-item.active { background: rgba(99,102,241,0.15); color: var(--mc-text); }
        .conv-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .mc-chat-area {
          flex: 1; display: flex; flex-direction: column; overflow: hidden;
          background: var(--mc-bg);
        }
        .mc-chat-header {
          padding: 12px 20px; border-bottom: 1px solid var(--mc-border);
          display: flex; align-items: center; gap: 10px;
          background: var(--mc-surface);
        }
        .mc-chat-title { font-size: 15px; font-weight: 600; }

        .mc-messages-list { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }

        .mc-msg { display: flex; flex-direction: column; max-width: 72%; }
        .mc-msg-in { align-self: flex-start; }
        .mc-msg-out { align-self: flex-end; align-items: flex-end; }
        .mc-msg-sender { font-size: 11px; color: var(--mc-text2); padding: 0 6px 2px; }
        .mc-msg-bubble {
          padding: 9px 13px; border-radius: 16px; font-size: 14px; line-height: 1.45; word-break: break-word;
        }
        .mc-msg-in .mc-msg-bubble { background: var(--mc-surface); border-radius: 4px 16px 16px 16px; }
        .mc-msg-out .mc-msg-bubble { background: var(--mc-accent); color: #fff; border-radius: 16px 4px 16px 16px; }
        .mc-msg-meta { display: flex; gap: 8px; font-size: 10px; color: var(--mc-text2); padding: 2px 6px; }

        .mc-compose {
          padding: 12px 16px; border-top: 1px solid var(--mc-border);
          background: var(--mc-surface); display: flex; gap: 8px; align-items: flex-end;
        }
        .mc-compose textarea {
          flex: 1; background: var(--mc-surface2); border: 1px solid var(--mc-border);
          color: var(--mc-text); border-radius: var(--mc-radius-sm);
          padding: 9px 12px; font-size: 14px; resize: none; min-height: 42px; max-height: 140px;
          font-family: inherit; line-height: 1.4;
        }
        .mc-compose textarea:focus { outline: none; border-color: var(--mc-accent); }
        .mc-compose textarea::placeholder { color: var(--mc-text2); }
        .mc-byte-counter { font-size: 11px; color: var(--mc-text2); text-align: right; }
      </style>
      <div class="conv-sidebar">
        <div class="conv-sidebar-header">Conversations</div>
        <div class="conv-list"></div>
      </div>
      <div class="mc-chat-area">
        <div class="mc-chat-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="mc-chat-title">Messages</span>
        </div>
        <div class="mc-messages-list"></div>
        <div class="mc-compose">
          <div style="flex:1;display:flex;flex-direction:column;gap:4px">
            <textarea class="mc-msg-input" placeholder="Type a message…" rows="1" maxlength="200"></textarea>
            <div class="mc-byte-counter">0 / 200</div>
          </div>
          <button class="mc-btn mc-btn-primary" id="mc-send-btn">Send</button>
        </div>
      </div>`;

    const textarea = this.shadowRoot.querySelector('.mc-msg-input');
    const counter = this.shadowRoot.querySelector('.mc-byte-counter');
    textarea?.addEventListener('input', () => {
      counter.textContent = `${textarea.value.length} / 200`;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
    });
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendMessage(); }
    });
    this.shadowRoot.querySelector('#mc-send-btn')?.addEventListener('click', () => this._sendMessage());

    this._renderSidebar();
    this._renderMessages();
  }
}

customElements.define('meshcore-messages-view', MeshCoreMessagesView);


// ── Contacts View ─────────────────────────────────────────────────────────────

export class MeshCoreContactsView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._contacts = [];
    this._filter = '';
    this._sortKey = 'name';
    this._loading = true;
  }

  set hass(val) {
    const firstSet = this._hass === null;
    this._hass = val;
    if (firstSet) this._load();
  }

  async _load() {
    this._loading = true;
    this._render();
    try {
      const res = await this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_contacts' });
      this._contacts = res.contacts || [];
    } catch (e) {
      showToast(`Failed to load contacts: ${e.message}`, 'error');
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _filtered() {
    let list = [...this._contacts];
    if (this._filter) {
      const q = this._filter.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.pubkey_prefix || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (this._sortKey === 'name') return (a.name || '').localeCompare(b.name || '');
      if (this._sortKey === 'last_seen') return (b.last_seen || '') > (a.last_seen || '') ? 1 : -1;
      if (this._sortKey === 'snr') return (parseFloat(b.snr) || -99) - (parseFloat(a.snr) || -99);
      return 0;
    });
    return list;
  }

  async _openDetail(contact) {
    const backdrop = document.createElement('div');
    backdrop.className = 'mc-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="mc-dialog">
        <div class="mc-dialog-header">
          <h2>👤 ${escHtml(contact.name || contact.pubkey_prefix)}</h2>
          <button class="mc-btn-icon" id="mc-detail-close">✕</button>
        </div>
        <div class="mc-dialog-body">
          ${infoRow('Public Key Prefix', contact.pubkey_prefix)}
          ${infoRow('Last Seen', formatTime(contact.last_seen))}
          ${infoRow('SNR', contact.snr !== undefined ? `${contact.snr} dB` : null)}
          ${infoRow('Path', contact.path)}
          ${infoRow('Type', contact.type)}
          ${infoRow('Battery', contact.battery_pct !== undefined ? `${contact.battery_pct}%` : null)}
        </div>
        <div class="mc-dialog-footer">
          <button class="mc-btn mc-btn-danger" id="mc-detail-remove">Remove</button>
          <button class="mc-btn mc-btn-secondary" id="mc-detail-ping">Ping</button>
          <button class="mc-btn mc-btn-primary" id="mc-detail-msg">Message</button>
        </div>
      </div>`;
    this.shadowRoot.appendChild(backdrop);

    backdrop.querySelector('#mc-detail-close').onclick = () => backdrop.remove();
    backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

    backdrop.querySelector('#mc-detail-remove').onclick = async () => {
      if (!await confirmDialog(`Remove contact ${contact.name || contact.pubkey_prefix}?`)) return;
      try {
        await this._hass.connection.sendMessagePromise({
          type: 'meshcore_ui/remove_contact',
          pubkey_prefix: contact.pubkey_prefix,
        });
        backdrop.remove();
        showToast('Contact removed', 'success');
        await this._load();
      } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
    };

    backdrop.querySelector('#mc-detail-ping').onclick = async () => {
      try {
        await this._hass.connection.sendMessagePromise({
          type: 'meshcore_ui/ping_contact',
          pubkey_prefix: contact.pubkey_prefix,
        });
        showToast('Ping sent', 'success');
        backdrop.remove();
      } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
    };

    backdrop.querySelector('#mc-detail-msg').onclick = () => {
      backdrop.remove();
      this.dispatchEvent(new CustomEvent('navigate', { bubbles: true, composed: true, detail: { tab: 'messages', conversation: `dm_${contact.pubkey_prefix}` } }));
    };
  }

  _render() {
    if (!this.shadowRoot.querySelector('.contacts-wrap')) {
      this.shadowRoot.innerHTML = `
        <style>
          ${sharedStyles}
          :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
          .contacts-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
          .contacts-toolbar {
            padding: 14px 20px; border-bottom: 1px solid var(--mc-border);
            background: var(--mc-surface); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          }
          .contacts-toolbar h2 { font-size: 16px; font-weight: 600; flex: 1; display: flex; align-items: center; gap: 8px; }
          .contacts-table-wrap { flex: 1; overflow-y: auto; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 10px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mc-text2); border-bottom: 1px solid var(--mc-border); background: var(--mc-surface); position: sticky; top: 0; cursor: pointer; user-select: none; }
          th:hover { color: var(--mc-text); }
          td { padding: 11px 16px; font-size: 13px; border-bottom: 1px solid var(--mc-border); }
          tr:hover td { background: var(--mc-surface); cursor: pointer; }
          .snr-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
        </style>
        <div class="contacts-wrap">
          <div class="contacts-toolbar">
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Contacts
            </h2>
            <input class="mc-input" id="contact-search" style="max-width:220px" placeholder="Search…">
            <select class="mc-select" id="sort-select">
              <option value="name">Sort: Name</option>
              <option value="last_seen">Sort: Last Seen</option>
              <option value="snr">Sort: SNR</option>
            </select>
            <button class="mc-btn mc-btn-secondary" id="contacts-refresh">↻ Refresh</button>
          </div>
          <div class="contacts-table-wrap">
            <div class="contacts-body"></div>
          </div>
        </div>`;

      this.shadowRoot.querySelector('#contact-search').addEventListener('input', (e) => {
        this._filter = e.target.value;
        this._renderTable();
      });
      this.shadowRoot.querySelector('#sort-select').addEventListener('change', (e) => {
        this._sortKey = e.target.value;
        this._renderTable();
      });
      this.shadowRoot.querySelector('#contacts-refresh').addEventListener('click', () => this._load());
    }
    this._renderTable();
  }

  _renderTable() {
    const body = this.shadowRoot.querySelector('.contacts-body');
    if (!body) return;

    if (this._loading) {
      body.innerHTML = `<div style="display:flex;justify-content:center;padding:40px"><div class="mc-spinner"></div></div>`;
      return;
    }

    const contacts = this._filtered();
    if (!contacts.length) {
      body.innerHTML = `<div class="mc-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><h3>No contacts found</h3></div>`;
      return;
    }

    body.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Key Prefix</th><th>SNR</th><th>Last Seen</th><th>Battery</th><th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${contacts.map(c => `
            <tr data-pk="${escHtml(c.pubkey_prefix)}">
              <td><strong>${escHtml(c.name || c.pubkey_prefix)}</strong></td>
              <td style="font-family:monospace;color:var(--mc-text2)">${escHtml(c.pubkey_prefix || '')}</td>
              <td>
                ${c.snr !== undefined ? `<span class="snr-dot" style="background:${snrColor(c.snr)}"></span>${c.snr} dB` : '—'}
              </td>
              <td>${formatTime(c.last_seen) || '—'}</td>
              <td>${c.battery_pct !== undefined ? `${batteryIcon(c.battery_pct)} ${c.battery_pct}%` : '—'}</td>
              <td>${c.type ? `<span class="mc-badge mc-badge-blue">${escHtml(c.type)}</span>` : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    body.querySelectorAll('tr[data-pk]').forEach(row => {
      row.addEventListener('click', () => {
        const c = contacts.find(c => c.pubkey_prefix === row.dataset.pk);
        if (c) this._openDetail(c);
      });
    });
  }
}

customElements.define('meshcore-contacts-view', MeshCoreContactsView);


// ── Stats View ────────────────────────────────────────────────────────────────

export class MeshCoreStatsView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._state = null;
    this._nodeInfo = null;
    this._loading = true;
  }

  set hass(val) {
    const firstSet = this._hass === null;
    this._hass = val;
    // Only load on first set — refresh button handles subsequent loads
    if (firstSet) this._load();
  }

  async _load() {
    this._loading = true;
    this._renderShell();
    try {
      const [stateRes, nodeRes] = await Promise.all([
        this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_state' }),
        this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_node_info' }),
      ]);
      this._state = stateRes;
      this._nodeInfo = nodeRes;
    } catch (e) {
      showToast(`Failed to load stats: ${e.message}`, 'error');
    }
    this._loading = false;
    this._renderContent();
  }

  async _sendAdvert() {
    try {
      await this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/send_advert', flood: true });
      showToast('Advertisement sent', 'success');
    } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
  }

  _renderShell() {
    if (this.shadowRoot.querySelector('.stats-wrap')) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${sharedStyles}
        :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .stats-header {
          padding: 12px 20px; border-bottom: 1px solid var(--mc-border);
          background: var(--mc-surface); display: flex; align-items: center; gap: 10px;
        }
        .stats-header h2 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; flex: 1; }
        .stats-wrap { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 12px; }
        .stat-card { display: flex; align-items: center; gap: 14px; }
        .stat-icon { font-size: 26px; flex-shrink: 0; }
        .stat-value { font-size: 22px; font-weight: 700; line-height: 1.1; }
        .stat-label { font-size: 11px; color: var(--mc-text2); margin-top: 2px; }
        .section-title { font-size: 11px; font-weight: 600; color: var(--mc-text2); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--mc-border); font-size: 13px; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: var(--mc-text2); }
        .info-value { font-weight: 500; text-align: right; max-width: 60%; word-break: break-all; }
        .sensors-list { display: flex; flex-direction: column; }
        .sensor-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: var(--mc-radius-sm); font-size: 12px; gap: 10px; }
        .sensor-row:nth-child(odd) { background: var(--mc-surface2); }
        .sensor-name { color: var(--mc-text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .sensor-val { font-weight: 500; white-space: nowrap; }
        .sensor-unit { color: var(--mc-text2); margin-left: 2px; font-size: 11px; }
        .actions-row { display: flex; gap: 10px; flex-wrap: wrap; }
      </style>
      <div class="stats-header">
        <h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Stats
        </h2>
        <button class="mc-btn mc-btn-secondary" id="advert-btn">📢 Advertise</button>
        <button class="mc-btn mc-btn-secondary" id="refresh-btn">↻ Refresh</button>
      </div>
      <div class="stats-wrap"><div style="display:flex;justify-content:center;padding:60px"><div class="mc-spinner"></div></div></div>`;

    this.shadowRoot.querySelector('#advert-btn').addEventListener('click', () => this._sendAdvert());
    this.shadowRoot.querySelector('#refresh-btn').addEventListener('click', () => this._load());
  }

  _renderContent() {
    const wrap = this.shadowRoot.querySelector('.stats-wrap');
    if (!wrap) return;

    if (this._loading || !this._state) {
      wrap.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="mc-spinner"></div></div>';
      return;
    }

    const ni = this._state.node_info || {};
    const sensors = this._nodeInfo?.sensors || {};
    const binary = this._nodeInfo?.binary_sensors || {};
    const sensorCount = this._state.sensor_count || Object.keys(sensors).length;

    const prettyName = (eid) => eid
      .replace(/^(sensor|binary_sensor)\./, '')
      .replace(/^meshcore_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Build cards using string concat to avoid nested template literal issues
    const batteryStr  = ni.battery_pct ? ni.battery_pct + '%'      : '—';
    const txStr       = ni.tx_power    ? ni.tx_power    + ' dBm'   : '—';
    const rssiStr     = ni.rssi        ? ni.rssi        + ' dBm'   : null;
    const snrStr      = ni.snr         ? ni.snr         + ' dB'    : null;

    let sensorRows = '';
    Object.entries(sensors).sort(([a],[b]) => a.localeCompare(b)).forEach(([eid, s]) => {
      const unit = s.attributes && s.attributes.unit_of_measurement
        ? '<span class="sensor-unit">' + escHtml(s.attributes.unit_of_measurement) + '</span>'
        : '';
      sensorRows += '<div class="sensor-row">'
        + '<span class="sensor-name" title="' + escHtml(eid) + '">' + escHtml(prettyName(eid)) + '</span>'
        + '<span class="sensor-val">' + escHtml(s.state) + unit + '</span>'
        + '</div>';
    });
    Object.entries(binary).sort(([a],[b]) => a.localeCompare(b)).forEach(([eid, s]) => {
      sensorRows += '<div class="sensor-row">'
        + '<span class="sensor-name" title="' + escHtml(eid) + '">' + escHtml(prettyName(eid)) + '</span>'
        + '<span class="sensor-val">' + (s.state === 'on' ? '\u2705 on' : '\u26aa off') + '</span>'
        + '</div>';
    });

    const sensorsBlock = sensorCount > 0
      ? '<div class="mc-card"><div class="section-title" style="margin-bottom:8px">All MeshCore Entities ('
          + sensorCount + ')</div><div class="sensors-list">' + sensorRows + '</div></div>'
      : '<div class="mc-card"><div class="section-title">No MeshCore Sensor Entities Found</div>'
          + '<p style="font-size:13px;color:var(--mc-text2);margin-top:8px">'
          + 'Make sure the <strong>meshcore</strong> integration is installed and your radio is connected. '
          + 'Sensor entities should appear under Developer Tools \u2192 States as <code>sensor.meshcore_*</code>.'
          + '</p></div>';

    wrap.innerHTML =
      '<div class="stats-grid">'
      + statCard('\ud83d\udcac', 'Messages Today', this._state.messages_today ?? 0)
      + statCard('\ud83d\udce1', 'Node Name', ni.name || '\u2014')
      + statCard('\ud83d\udd0b', 'Battery', batteryStr)
      + statCard('\ud83d\udcf6', 'TX Power', txStr)
      + statCard('\ud83c\udf10', 'Region', ni.region || '\u2014')
      + statCard('\u23f1\ufe0f', 'Uptime', formatUptime(ni.uptime))
      + '</div>'
      + '<div class="mc-card">'
      + '<div class="section-title">Connection</div>'
      + infoRow('Status', this._state.connected ? '\ud83d\udfe2 Connected' : '\ud83d\udd34 Disconnected')
      + (ni.pubkey ? infoRow('Public Key Prefix', ni.pubkey) : '')
      + (ni.freq   ? infoRow('Frequency', ni.freq) : '')
      + (rssiStr   ? infoRow('RSSI', rssiStr) : '')
      + (snrStr    ? infoRow('SNR', snrStr) : '')
      + infoRow('MeshCore Sensors', sensorCount)
      + '</div>'
      + sensorsBlock;
  }

  _render() {
    this._renderShell();
    this._renderContent();
  }
}

customElements.define('meshcore-stats-view', MeshCoreStatsView);


// ── Console View ──────────────────────────────────────────────────────────────

export class MeshCoreConsoleView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._log = [];
    this._busy = false;
    this._history = [];
    this._histIdx = -1;
    this._QUICK = [
      { label: 'Device Query', cmd: 'device_query' },
      { label: 'Get Contacts', cmd: 'get_contacts' },
      { label: 'Get Msgs', cmd: 'get_msgs 0' },
      { label: 'Send Advert', cmd: 'send_advert true' },
      { label: 'Reset Contacts', cmd: 'reset_contacts' },
    ];
  }

  set hass(val) { this._hass = val; }

  connectedCallback() { this._render(); }

  async _run(cmd) {
    if (!cmd.trim() || this._busy) return;
    this._busy = true;
    this._log.push({ type: 'cmd', text: cmd });
    if (this._history[0] !== cmd) this._history.unshift(cmd);
    if (this._history.length > 50) this._history.pop();
    this._histIdx = -1;
    this._renderLog();
    try {
      const res = await this._hass.connection.sendMessagePromise({
        type: 'meshcore_ui/execute_command',
        command: cmd,
      });
      this._log.push({ type: 'ok', text: res.success ? 'OK' : JSON.stringify(res) });
    } catch (e) {
      this._log.push({ type: 'err', text: e.message });
    } finally {
      this._busy = false;
      this._renderLog();
    }
  }

  _renderLog() {
    const el = this.shadowRoot.querySelector('.console-output');
    if (!el) return;
    if (!this._log.length) {
      el.textContent = 'Ready. Type a command or use the quick buttons above.\n';
      return;
    }
    el.textContent = this._log.map(l => {
      const prefix = l.type === 'cmd' ? '> ' : l.type === 'ok' ? '✓ ' : '✗ ';
      return prefix + l.text;
    }).join('\n') + '\n';
    el.scrollTop = el.scrollHeight;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${sharedStyles}
        :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 20px; gap: 14px; }
        .console-header { display: flex; align-items: center; gap: 10px; }
        .console-header h2 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .console-card { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .console-output {
          flex: 1; overflow-y: auto; background: #0d1117; color: #e6edf3;
          font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; line-height: 1.6;
          padding: 14px; border-radius: var(--mc-radius-sm) var(--mc-radius-sm) 0 0;
          border: 1px solid var(--mc-border); border-bottom: none;
          white-space: pre-wrap; word-break: break-all;
        }
        .console-input-row {
          display: flex; gap: 8px; align-items: center;
          background: #161b22; border: 1px solid var(--mc-border);
          border-radius: 0 0 var(--mc-radius-sm) var(--mc-radius-sm); padding: 8px 12px;
        }
        .console-prompt { color: #22c55e; font-family: monospace; font-size: 13px; }
        .console-input {
          flex: 1; background: transparent; border: none; color: #e6edf3;
          font-family: monospace; font-size: 13px; outline: none;
        }
      </style>
      <div class="console-header">
        <h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          MeshCore Console
        </h2>
        <button class="mc-btn mc-btn-ghost" id="clear-btn">Clear</button>
      </div>
      <div class="quick-btns">
        ${this._QUICK.map(q => `<button class="mc-btn mc-btn-secondary quick-cmd" data-cmd="${escHtml(q.cmd)}">${escHtml(q.label)}</button>`).join('')}
      </div>
      <div class="mc-card console-card" style="padding:0">
        <div class="console-output">Ready. Type a command or use the quick buttons above.\n</div>
        <div class="console-input-row">
          <span class="console-prompt">$</span>
          <input class="console-input" placeholder="enter command…" autocomplete="off" spellcheck="false">
          <button class="mc-btn mc-btn-primary" id="run-btn">Run</button>
        </div>
      </div>`;

    const input = this.shadowRoot.querySelector('.console-input');
    this.shadowRoot.querySelector('#run-btn').addEventListener('click', () => {
      const cmd = input.value.trim();
      input.value = '';
      this._run(cmd);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const cmd = input.value.trim(); input.value = ''; this._run(cmd); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this._histIdx = Math.min(this._histIdx + 1, this._history.length - 1); input.value = this._history[this._histIdx] || ''; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this._histIdx = Math.max(this._histIdx - 1, -1); input.value = this._histIdx >= 0 ? this._history[this._histIdx] : ''; }
    });
    this.shadowRoot.querySelector('#clear-btn').addEventListener('click', () => { this._log = []; this._renderLog(); });
    this.shadowRoot.querySelectorAll('.quick-cmd').forEach(btn => {
      btn.addEventListener('click', () => this._run(btn.dataset.cmd));
    });
  }
}

customElements.define('meshcore-console-view', MeshCoreConsoleView);


// ── Map View ──────────────────────────────────────────────────────────────────
// Leaflet is loaded into document.head to avoid HA CSP restrictions on shadow DOM.
// CartoDB tiles used — free, no API key, no usage complaints.

const LEAFLET_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

// Minimal Leaflet CSS injected directly into shadow roots to fix shadow DOM tile rendering.
// (The document.head CSS doesn't cascade into shadow DOM, causing the jigsaw/blank-tile effect.)
const LEAFLET_SHADOW_CSS = `
  .leaflet-pane, .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow,
  .leaflet-tile-pane, .leaflet-overlay-pane, .leaflet-shadow-pane,
  .leaflet-marker-pane, .leaflet-tooltip-pane, .leaflet-popup-pane,
  .leaflet-map-pane canvas, .leaflet-map-pane svg { position: absolute; }
  .leaflet-map-pane { z-index: 400; }
  .leaflet-tile-pane { z-index: 200; }
  .leaflet-overlay-pane { z-index: 400; }
  .leaflet-shadow-pane { z-index: 500; }
  .leaflet-marker-pane { z-index: 600; }
  .leaflet-tooltip-pane { z-index: 650; }
  .leaflet-popup-pane { z-index: 700; }
  .leaflet-map-pane { top: 0; left: 0; }
  .leaflet-tile { filter: inherit; visibility: inherit; }
  .leaflet-tile-loaded { visibility: inherit; }
  .leaflet-zoom-box { width: 0; height: 0; box-sizing: border-box; z-index: 800; }
  .leaflet-overlay-pane svg { -moz-user-select: none; }
  .leaflet-pane > svg, .leaflet-pane > canvas { position: absolute; left: 0; top: 0; }
  .leaflet-container { overflow: hidden; }
  .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow {
    -webkit-user-select: none; -moz-user-select: none; user-select: none;
    -webkit-user-drag: none; }
  .leaflet-tile::selection { background: transparent; }
  .leaflet-tile::-moz-selection { background: transparent; }
  .leaflet-image-layer, .leaflet-layer { position: absolute; left: 0; top: 0; }
  .leaflet-container { -webkit-tap-highlight-color: transparent; background: #1a1a2e; }
  .leaflet-container a { -webkit-tap-highlight-color: rgba(51,181,229,.4); }
  .leaflet-tile { box-sizing: border-box !important; }
  .leaflet-zoom-anim .leaflet-zoom-animated { will-change: transform; }
  .leaflet-zoom-anim .leaflet-zoom-animated { -webkit-transition: -webkit-transform 0.25s cubic-bezier(0,0,0.25,1); transition: transform 0.25s cubic-bezier(0,0,0.25,1); }
  .leaflet-pan-anim .leaflet-tile, .leaflet-zoom-anim .leaflet-tile { -webkit-transition: none; transition: none; }
  .leaflet-popup { position: absolute; text-align: center; margin-bottom: 20px; }
  .leaflet-popup-content-wrapper { padding: 1px; text-align: left; border-radius: 8px; background: white; color: #333; box-shadow: 0 3px 14px rgba(0,0,0,.4); }
  .leaflet-popup-content { margin: 10px 12px; line-height: 1.4; }
  .leaflet-popup-tip-container { width: 40px; height: 20px; position: absolute; left: 50%; margin-left: -20px; overflow: hidden; pointer-events: none; }
  .leaflet-popup-tip { background: white; width: 17px; height: 17px; padding: 1px; margin: -10px auto 0; transform: rotate(45deg); box-shadow: 0 3px 14px rgba(0,0,0,.4); }
  .leaflet-popup-close-button { position: absolute; top: 0; right: 0; border: none; text-align: center; width: 18px; height: 14px; font: 16px/14px Tahoma,Verdana,sans-serif; color: #757575; text-decoration: none; background: transparent; }
  .leaflet-popup-close-button:hover { color: #585858; }
  .leaflet-control { position: relative; z-index: 800; pointer-events: visiblePainted; pointer-events: auto; }
  .leaflet-top, .leaflet-bottom { position: absolute; z-index: 1000; pointer-events: none; }
  .leaflet-top { top: 0; } .leaflet-right { right: 0; }
  .leaflet-bottom { bottom: 0; } .leaflet-left { left: 0; }
  .leaflet-control { float: left; clear: both; }
  .leaflet-right .leaflet-control { float: right; }
  .leaflet-top .leaflet-control { margin-top: 10px; }
  .leaflet-bottom .leaflet-control { margin-bottom: 10px; }
  .leaflet-left .leaflet-control { margin-left: 10px; }
  .leaflet-right .leaflet-control { margin-right: 10px; }
  .leaflet-control-zoom a { width: 26px; height: 26px; line-height: 26px; display: block; text-align: center; text-decoration: none; color: black; font: bold 18px 'Lucida Console',Monaco,monospace; background: white; border-bottom: 1px solid #ccc; }
  .leaflet-control-zoom a:hover { background-color: #f4f4f4; }
  .leaflet-control-zoom-in { border-radius: 4px 4px 0 0; }
  .leaflet-control-zoom-out { border-radius: 0 0 4px 4px; }
  .leaflet-control-zoom { border: 2px solid rgba(0,0,0,0.2); border-radius: 4px; box-shadow: none; }
  .leaflet-bar { box-shadow: 0 1px 5px rgba(0,0,0,.65); border-radius: 4px; }
  .leaflet-attribution-flag { display: inline !important; vertical-align: middle; width: 1em; height: 0.6667em; }
  .leaflet-control-attribution { padding: 0 5px; background: rgba(255,255,255,.7); font-size: 11px; }
  .leaflet-control-attribution a { text-decoration: none; } .leaflet-control-attribution a:hover { text-decoration: underline; }
  .leaflet-container .leaflet-control-attribution { background: rgba(255,255,255,0.7); margin: 0; }
  .leaflet-left .leaflet-control-scale { margin-left: 5px; }
  .leaflet-bottom .leaflet-control-scale { margin-bottom: 5px; }
  .leaflet-control-scale-line { padding: 0 5px 1px; font-size: 11px; white-space: nowrap; overflow: hidden; border: 2px solid #777; border-top: none; background: rgba(255,255,255,.5); }
  .leaflet-div-icon { background: #fff; border: 1px solid #666; }
`;

let _leafletLoading = null;

function _loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (_leafletLoading) return _leafletLoading;

  _leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS_URL;
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.setAttribute('data-leaflet', '1');
    script.onload  = () => { _leafletLoading = null; resolve(window.L); };
    script.onerror = () => { _leafletLoading = null; reject(new Error('Leaflet failed to load')); };
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('Leaflet load timeout')), 15000);
  });
  return _leafletLoading;
}

export class MeshCoreMapView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass        = null;
    this._allContacts = [];
    this._gpsContacts = [];
    this._leafletMap  = null;
    this._loaded      = false;
  }

  set hass(val) {
    const first = this._hass === null;
    this._hass = val;
    if (first) this._loadAndDraw();
  }

  disconnectedCallback() {
    if (this._leafletMap) { this._leafletMap.remove(); this._leafletMap = null; }
  }

  async _loadAndDraw() {
    this._renderShell();
    const badge = this.shadowRoot.querySelector('.map-badge');
    if (badge) badge.textContent = 'Loading\u2026';

    try {
      const res = await this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_contacts' });
      this._allContacts = res.contacts || [];
      this._gpsContacts = this._allContacts.filter(c => c.lat != null && c.lon != null);
    } catch (e) {
      showToast('Map load failed: ' + e.message, 'error');
    }

    if (badge) {
      badge.textContent = this._gpsContacts.length > 0
        ? this._gpsContacts.length + ' / ' + this._allContacts.length + ' on map'
        : this._allContacts.length + ' contact(s) \u00b7 no GPS';
    }

    this._renderSidebar();
    await this._drawMap();
  }

  _renderSidebar() {
    const sidebar = this.shadowRoot.querySelector('.mc-map-sidebar');
    if (!sidebar) return;

    let html = '<div class="cl-header">Contacts (' + this._allContacts.length + ')</div>';

    if (this._allContacts.length === 0) {
      html += '<div class="cl-empty">No contacts yet.<br>They appear once your node hears others on the mesh.</div>';
    } else {
      this._allContacts.forEach(c => {
        const hasGps   = c.lat != null && c.lon != null;
        const dotColor = c.state === 'fresh' ? '#22c55e' : c.state === 'stale' ? '#eab308' : '#4b5563';
        const snrHtml  = c.snr != null
          ? '<span style="color:' + snrColor(c.snr) + '">' + escHtml(String(c.snr)) + 'dB</span> &middot; '
          : '';
        const gpsLabel = hasGps ? '\uD83D\uDCCD ' : '';
        const stateLabel = c.state || '';
        const seenHtml = c.last_seen ? ' &middot; ' + formatTime(c.last_seen) : '';

        html += '<div class="cl-item' + (hasGps ? ' cl-has-gps' : '') + '"'
          + ' data-lat="' + (c.lat ?? '') + '" data-lon="' + (c.lon ?? '') + '">'
          + '<div class="cl-dot" style="background:' + dotColor + '"></div>'
          + '<div class="cl-body">'
          + '<div class="cl-name">' + escHtml(c.name || c.pubkey_prefix) + '</div>'
          + '<div class="cl-meta">' + snrHtml + gpsLabel + escHtml(stateLabel) + seenHtml + '</div>'
          + '</div></div>';
      });
    }

    sidebar.innerHTML = html;

    sidebar.querySelectorAll('.cl-item.cl-has-gps').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        if (this._leafletMap && !isNaN(lat) && !isNaN(lon)) {
          this._leafletMap.flyTo([lat, lon], 15, { duration: 1 });
        }
      });
    });
  }

  async _drawMap() {
    const mapDiv = this.shadowRoot.querySelector('#mc-leaflet-map');
    if (!mapDiv) return;

    if (this._leafletMap) { this._leafletMap.remove(); this._leafletMap = null; }

    let L;
    try {
      L = await _loadLeaflet();
    } catch (e) {
      mapDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px;text-align:center;padding:20px">'
        + '<div>&#x26A0;&#xFE0F; Could not load Leaflet map library.<br>Check your internet connection.</div></div>';
      return;
    }

    const homeLat = this._hass?.config?.latitude  ?? 51.5;
    const homeLon = this._hass?.config?.longitude ?? -0.09;

    // Use requestAnimationFrame to ensure the div is in the rendered DOM with real dimensions
    await new Promise(r => requestAnimationFrame(r));

    const map = L.map(mapDiv, { zoomControl: true, preferCanvas: true });
    this._leafletMap = map;

    // CartoDB Voyager — free, no API key, good detail, no usage restrictions
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors \u00a9 <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Home marker
    const homeIcon = L.divIcon({
      html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">&#x1F3E0;</div>',
      className: '', iconSize: [24, 24], iconAnchor: [12, 22],
    });
    L.marker([homeLat, homeLon], { icon: homeIcon })
      .addTo(map)
      .bindPopup('<strong>Home</strong><br><span style="color:#6b7280;font-size:12px">HA home location</span>');

    const snrCol = snr => {
      const n = parseFloat(snr);
      if (isNaN(n)) return '#6b7280';
      if (n >= 5)   return '#22c55e';
      if (n >= 0)   return '#eab308';
      if (n >= -10) return '#f97316';
      return '#ef4444';
    };

    const fmtTs = ts => {
      if (!ts) return null;
      const d = new Date(ts);
      if (isNaN(d.getTime())) return null;
      const s = (Date.now() - d) / 1000;
      if (s < 60)    return 'just now';
      if (s < 3600)  return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const bounds = [[homeLat, homeLon]];

    this._gpsContacts.forEach(c => {
      const col  = snrCol(c.snr);
      const stateColor = c.state === 'fresh' ? col : c.state === 'stale' ? '#eab308' : '#6b7280';
      const icon = L.divIcon({
        html: '<div style="width:14px;height:14px;border-radius:50%;background:' + stateColor
          + ';border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,.5)"></div>',
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const ts  = fmtTs(c.last_seen);
      const popup = '<div style="font-size:13px;min-width:160px;line-height:1.5">'
        + '<strong style="display:block;margin-bottom:3px">' + escHtml(c.name || c.pubkey_prefix) + '</strong>'
        + '<div style="font-family:monospace;font-size:11px;color:#6b7280">' + escHtml(c.pubkey_prefix || '') + '</div>'
        + '<div style="font-size:12px;color:#6b7280">Status: ' + escHtml(c.state || '—') + '</div>'
        + (c.snr  != null ? '<div style="font-size:12px;color:#6b7280">SNR: <span style="color:' + col + '">' + c.snr + ' dB</span></div>' : '')
        + (ts     ? '<div style="font-size:12px;color:#6b7280">Last seen: ' + ts + '</div>' : '')
        + (c.path ? '<div style="font-size:12px;color:#6b7280">Path: ' + escHtml(String(c.path)) + '</div>' : '')
        + '<div style="font-size:11px;color:#9ca3af">' + Number(c.lat).toFixed(5) + ', ' + Number(c.lon).toFixed(5) + '</div>'
        + '</div>';
      L.marker([c.lat, c.lon], { icon }).addTo(map).bindPopup(popup);
      bounds.push([c.lat, c.lon]);
    });

    if (this._gpsContacts.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView([homeLat, homeLon], 10);
    }

    // Force Leaflet to recalculate container size after shadow DOM paint
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
  }

  connectedCallback() { this._render(); }

  _renderShell() {
    if (this.shadowRoot.querySelector('.map-header')) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${sharedStyles}
        ${LEAFLET_SHADOW_CSS}
        :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .map-header {
          padding:12px 20px; border-bottom:1px solid var(--mc-border);
          background:var(--mc-surface); display:flex; align-items:center; gap:10px; flex-shrink:0;
        }
        .map-header h2 { font-size:16px; font-weight:600; display:flex; align-items:center; gap:8px; flex:1; }
        .map-badge { font-size:12px; color:var(--mc-text2); }
        .mc-map-body { flex:1; display:flex; overflow:hidden; min-height:0; }
        .mc-map-sidebar {
          width:220px; flex-shrink:0; overflow-y:auto;
          border-right:1px solid var(--mc-border); background:var(--mc-surface);
        }
        .cl-header {
          padding:10px 14px; font-size:11px; font-weight:600;
          text-transform:uppercase; letter-spacing:.05em; color:var(--mc-text2);
          border-bottom:1px solid var(--mc-border); position:sticky; top:0;
          background:var(--mc-surface); z-index:1;
        }
        .cl-empty { padding:20px 14px; font-size:12px; color:var(--mc-text2); text-align:center; line-height:1.6; }
        .cl-item {
          display:flex; align-items:flex-start; gap:9px; padding:10px 12px;
          border-bottom:1px solid var(--mc-border); cursor:default; transition:background .12s;
        }
        .cl-item.cl-has-gps { cursor:pointer; }
        .cl-item.cl-has-gps:hover { background:rgba(34,197,94,.08); }
        .cl-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; margin-top:4px; }
        .cl-body { flex:1; min-width:0; }
        .cl-name { font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--mc-text); }
        .cl-meta { font-size:11px; color:var(--mc-text2); margin-top:2px; }
        #mc-leaflet-map { flex:1; min-width:0; min-height:0; }
      </style>
      <div class="map-header">
        <h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
          </svg>
          Map
        </h2>
        <span class="map-badge">Loading\u2026</span>
        <button class="mc-btn mc-btn-secondary" id="map-refresh">\u21bb Refresh</button>
      </div>
      <div class="mc-map-body">
        <div class="mc-map-sidebar">
          <div class="cl-header">Contacts</div>
          <div class="cl-empty">Loading\u2026</div>
        </div>
        <div id="mc-leaflet-map"></div>
      </div>`;

    this.shadowRoot.querySelector('#map-refresh').addEventListener('click', () => this._loadAndDraw());
  }

  _render() {
    this._renderShell();
    if (this._hass) this._loadAndDraw();
  }
}

customElements.define('meshcore-map-view', MeshCoreMapView);
