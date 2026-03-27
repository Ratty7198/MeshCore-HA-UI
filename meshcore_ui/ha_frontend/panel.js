// MeshCore UI Panel — main entry point
// Registered as <meshcore-ui-panel> in the HA sidebar.

import { sharedStyles } from './styles.js';
import { showToast, connectionBadge } from './components.js';
import './views.js';

const TABS = [
  { id: 'messages', label: 'Messages',  icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { id: 'contacts', label: 'Contacts',  icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0' },
  { id: 'map',      label: 'Map',       icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 2 0 1 1 0 0 0-2 0' },
  { id: 'stats',    label: 'Stats',     icon: 'M18 20V10M12 20V4M6 20v-6' },
  { id: 'console',  label: 'Console',   icon: 'M4 17l6-6-6-6M12 19h8' },
];

class MeshCoreUIPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._narrow = false;
    this._activeTab = 'messages';
    this._connected = false;
    this._connectionChecked = false;
  }

  set hass(val) {
    this._hass = val;
    const view = this.shadowRoot.querySelector('.mc-view-slot > *');
    if (view) view.hass = val;
    if (!this._connectionChecked) {
      this._connectionChecked = true;
      this._checkConnection();
      this._subscribeEvents();
    }
  }

  set narrow(val) { this._narrow = val; }
  set panel(val) { /* config from HA */ }

  connectedCallback() {
    this._render();
    // Listen for navigate events from child views
    this.shadowRoot.addEventListener('navigate', (e) => {
      const { tab, conversation } = e.detail;
      this._switchTab(tab);
      if (conversation) {
        const view = this.shadowRoot.querySelector('meshcore-messages-view');
        if (view) setTimeout(() => view._selectConversation(conversation), 100);
      }
    });
  }

  async _checkConnection() {
    if (!this._hass) return;
    try {
      const res = await this._hass.connection.sendMessagePromise({ type: 'meshcore_ui/get_state' });
      this._connected = res.connected;
      this._updateConnectionBadge();
    } catch (_) { /* integration may not be loaded yet */ }
  }

  _subscribeEvents() {
    if (!this._hass) return;
    this._hass.connection.subscribeEvents((event) => {
      this._connected = event.data?.connected;
      this._updateConnectionBadge();
    }, 'meshcore_ui_connection_change');
  }

  _updateConnectionBadge() {
    const badge = this.shadowRoot.querySelector('.mc-conn-badge');
    if (badge) badge.outerHTML = `<span class="mc-conn-badge">${connectionBadge(this._connected)}</span>`;
  }

  _switchTab(id) {
    this._activeTab = id;
    // Update tab highlights
    this.shadowRoot.querySelectorAll('.mc-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === id);
    });
    // Replace view
    const slot = this.shadowRoot.querySelector('.mc-view-slot');
    if (!slot) return;
    slot.innerHTML = '';
    const tagMap = {
      messages: 'meshcore-messages-view',
      contacts: 'meshcore-contacts-view',
      map:      'meshcore-map-view',
      stats:    'meshcore-stats-view',
      console:  'meshcore-console-view',
    };
    const tag = tagMap[id];
    if (tag) {
      const el = document.createElement(tag);
      if (this._hass) el.hass = this._hass;
      slot.appendChild(el);
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${sharedStyles}
        :host {
          display: flex; flex-direction: column; height: 100vh;
          background: var(--mc-bg); color: var(--mc-text);
          overflow: hidden;
        }

        /* ── Header ── */
        .mc-header {
          display: flex; align-items: center; gap: 12px;
          padding: 0 20px; height: 56px; flex-shrink: 0;
          background: var(--mc-surface); border-bottom: 1px solid var(--mc-border);
        }
        .mc-logo {
          display: flex; align-items: center; gap: 10px;
          font-size: 15px; font-weight: 700; letter-spacing: -0.02em;
        }
        .mc-logo svg { color: var(--mc-accent); }
        .mc-header-spacer { flex: 1; }
        .mc-conn-badge {}

        /* ── Tab bar ── */
        .mc-tabbar {
          display: flex; align-items: center; gap: 2px;
          padding: 0 12px; border-bottom: 1px solid var(--mc-border);
          background: var(--mc-surface); flex-shrink: 0; overflow-x: auto;
        }
        .mc-tabbar::-webkit-scrollbar { height: 0; }
        .mc-tab {
          display: flex; align-items: center; gap: 7px; padding: 12px 14px;
          font-size: 13px; font-weight: 500; color: var(--mc-text2);
          cursor: pointer; border-bottom: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap; user-select: none;
        }
        .mc-tab svg { width: 16px; height: 16px; flex-shrink: 0; }
        .mc-tab:hover { color: var(--mc-text); }
        .mc-tab.active { color: var(--mc-accent); border-bottom-color: var(--mc-accent); }

        /* ── View slot ── */
        .mc-view-slot {
          flex: 1; overflow: hidden; display: flex; flex-direction: column;
        }
        .mc-view-slot > * { flex: 1; min-height: 0; }
      </style>

      <!-- Header -->
      <header class="mc-header">
        <div class="mc-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          MeshCore
        </div>
        <div class="mc-header-spacer"></div>
        <span class="mc-conn-badge">${connectionBadge(false)}</span>
      </header>

      <!-- Tab bar -->
      <nav class="mc-tabbar">
        ${TABS.map(t => `
          <div class="mc-tab ${t.id === this._activeTab ? 'active' : ''}" data-tab="${t.id}" role="tab" tabindex="0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="${t.icon}"/>
            </svg>
            ${t.label}
          </div>`).join('')}
      </nav>

      <!-- View slot -->
      <div class="mc-view-slot"></div>`;

    // Tab click handlers
    this.shadowRoot.querySelectorAll('.mc-tab').forEach(el => {
      el.addEventListener('click', () => this._switchTab(el.dataset.tab));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._switchTab(el.dataset.tab); });
    });

    // Mount initial view
    this._switchTab(this._activeTab);

    // Check connection after render
    if (this._hass) this._checkConnection();
  }
}

customElements.define('meshcore-ui-panel', MeshCoreUIPanel);
