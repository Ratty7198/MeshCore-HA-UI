# MeshCore UI for Home Assistant

> **Beta / Work in Progress** — This integration is under active development. Expect rough edges and breaking changes. If you run into issues, please [open an issue on GitHub](https://github.com/Daring-Designs/meshcore-ui-ha/issues).

A companion HACS integration that adds a full-featured dashboard for your [MeshCore](https://meshcore.co.uk) mesh network in Home Assistant. Wraps the [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) integration to provide messaging, contact management, a map view, live stats, and a command console — all from the HA sidebar.

---

## Built With

- **Backend** — Python, communicating with your node via the existing [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) integration (TCP, Serial, or BLE). Integrates with Home Assistant via its WebSocket API and async event system.
- **Frontend** — Vanilla ES modules using the Web Components API, served directly by Home Assistant's HTTP server.

## Why Connect MeshCore to Home Assistant?

A MeshCore companion radio plugged into your Home Assistant server becomes an **always-on gateway** to your mesh network. Unlike a phone or laptop that goes to sleep, a home server runs 24/7 — so your node never misses a message.

- **Never miss a message** — Every direct message is captured and stored, even when your phone is off or out of range.
- **Send messages from anywhere** — Open your HA dashboard from any browser or the HA mobile app and send messages to your mesh.
- **Long-term message history** — All messages persist to disk and survive HA restarts.
- **Monitor your mesh passively** — Live stats, sensor readings, and contact activity at a glance.
- **Automate with HA** — Pair with HA automations to get push notifications when a message arrives, or trigger alerts based on contact status.

---

## Features

### Messages Tab

Chat-style messaging interface for both channel broadcasts and direct messages. Conversations are listed in a sidebar (8 channels + DMs per contact). Messages show sender name, SNR, hop count, timestamp, and direction. Messages persist across restarts. Supports up to 200-character messages (MeshCore limit).

### Contacts Tab

Sortable, searchable table of all known mesh contacts. Columns include name, public key prefix, SNR, last seen, battery, and type. Click any contact to open a detail dialog with full info and actions:

- **Message** — opens a DM conversation in the Messages tab
- **Ping** — sends a zero-width-space message to test reachability
- **Remove** — removes the contact from the local database

### Map Tab

Shows contacts with GPS position data. Requires the underlying meshcore-ha entities to expose lat/lon attributes. Contacts without GPS data are excluded.

### Stats Tab

At-a-glance summary cards showing:
- Messages Today
- Node Name, Battery, TX Power, Region, Uptime
- Connection status and pubkey prefix
- Full table of all meshcore sensor entities and their current values
- Send Advertisement button

### Console Tab

Raw MeshCore command console. Type any command supported by the meshcore-ha `execute_command` service. Command history with ↑/↓ navigation. Quick-access buttons for common commands: `device_query`, `get_contacts`, `get_msgs`, `send_advert`, `reset_contacts`.

### Sensor Entities

Two HA sensor entities are created automatically:

| Entity | Description |
|---|---|
| `sensor.meshcore_ui_messages_today` | Count of messages received today |
| `sensor.meshcore_ui_active_contacts` | Contacts with activity in the past hour |

---

## Prerequisites

1. **Home Assistant 2024.1+**
2. **[meshcore-ha](https://github.com/meshcore-dev/meshcore-ha)** integration installed, configured, and working
3. A MeshCore companion radio accessible via TCP, Serial, or BLE (configured in meshcore-ha)

> ⚠️ This integration does **not** connect to the radio directly. It is a UI layer on top of `meshcore-ha`. Install and configure that first.

---

## Installation

### HACS (Recommended)

1. Open **HACS** in Home Assistant
2. Click the three-dot menu → **Custom repositories**
3. Add `https://github.com/Daring-Designs/meshcore-ui-ha` with category **Integration**
4. Find **MeshCore UI** and click **Download**
5. Restart Home Assistant
6. Go to **Settings → Devices & Services → Add Integration** and search for **MeshCore UI**
7. Click through the setup wizard (it will warn if meshcore-ha isn't found)

### Manual

Copy the `custom_components/meshcore_ui` folder into your Home Assistant `config/custom_components/` directory, restart, and add the integration.

---

## Architecture

```
Frontend (Web Components, ES modules)      Backend (Python, WebSocket API)
──────────────────────────────────         ────────────────────────────────
ha_frontend/                               custom_components/meshcore_ui/
  panel.js     (shell + tab router)          __init__.py    (setup + events)
  views.js     (5 tab components)            websocket_api.py (13 WS commands)
  components.js (shared utilities)           store.py  (persistent storage)
  styles.js    (shared CSS)                  config_flow.py (setup wizard)
                                             sensor.py (HA sensor entities)
                                             const.py  (constants)
```

The frontend communicates exclusively with the backend via Home Assistant's WebSocket API. The backend listens to `meshcore_message` events fired by the meshcore-ha integration, persists them, and exposes them to the frontend. Outbound messages are sent by calling meshcore-ha services (`send_channel_message`, `send_direct_message`, `execute_command`).

---

## Troubleshooting

**Panel doesn't appear in sidebar:**
Ensure the integration loaded without errors. Check `Settings → System → Logs` for `meshcore_ui` errors. Try a hard refresh of the browser (Ctrl+Shift+R).

**"meshcore not found" during setup:**
The `meshcore` (meshcore-ha) integration must be installed and have at least one working config entry before setting up this UI integration.

**Messages not appearing:**
The underlying meshcore-ha integration fires `meshcore_message` events. Confirm your radio is connected and messages are flowing by checking the meshcore-ha entities in Developer Tools → States.

**Console commands fail:**
Not all MeshCore CLI commands are supported by the `execute_command` service in meshcore-ha. Refer to the [meshcore-ha documentation](https://meshcore-dev.github.io/meshcore-ha/) for supported commands.

---

## License

MIT

## Related Projects

- [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) — the underlying HA integration this UI wraps
- [meshcore_py](https://github.com/meshcore-dev/meshcore_py) — the Python SDK
- [MeshCore](https://meshcore.co.uk) — the firmware and ecosystem
- [meshtastic-ui-ha](https://github.com/Daring-Designs/meshtastic-ui-ha) — the sibling project for Meshtastic
