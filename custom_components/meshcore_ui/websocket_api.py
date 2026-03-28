"""WebSocket API for MeshCore UI frontend."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback

from .const import (
    DOMAIN,
    MESHCORE_DOMAIN,
    WS_TYPE_GET_STATE,
    WS_TYPE_SEND_MESSAGE,
    WS_TYPE_GET_MESSAGES,
    WS_TYPE_GET_CONTACTS,
    WS_TYPE_GET_NODE_INFO,
    WS_TYPE_EXECUTE_COMMAND,
    WS_TYPE_CLEAR_MESSAGES,
    WS_TYPE_DELETE_MESSAGE,
    WS_TYPE_EXPORT_MESSAGES,
    WS_TYPE_UPDATE_CONTACT_ALIAS,
    WS_TYPE_REMOVE_CONTACT,
    WS_TYPE_ADD_CONTACT,
    WS_TYPE_SEND_ADVERT,
    WS_TYPE_SET_CHANNEL,
    WS_TYPE_PING_CONTACT,
)
from .store import MeshCoreUIStore

_LOGGER = logging.getLogger(__name__)


def async_register_commands(hass: HomeAssistant, store: MeshCoreUIStore) -> None:
    """Register all websocket commands."""

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_STATE})
    @callback
    def ws_get_state(hass, connection, msg):
        """Return overall integration state and node info from HA entities."""
        # Connection = any meshcore config entry that is loaded
        meshcore_entries = hass.config_entries.async_entries(MESHCORE_DOMAIN)
        meshcore_connected = any(
            e.state is ConfigEntryState.LOADED for e in meshcore_entries
        )

        # Build node_info by scanning ALL sensor.meshcore_* entities
        node_info: dict[str, Any] = {}
        all_sensors = _gather_all_meshcore_sensors(hass)

        if all_sensors:
            # Pick values by looking for common suffixes in entity IDs
            node_info = {
                "name":        _find_sensor(all_sensors, ["_adv_name", "_name", "_device_name"]),
                "pubkey":      _find_sensor(all_sensors, ["_pubkey_prefix", "_public_key"]),
                "battery_pct": _find_sensor(all_sensors, ["_battery_percentage", "_battery_pct", "_battery"]),
                "battery_v":   _find_sensor(all_sensors, ["_battery_voltage"]),
                "tx_power":    _find_sensor(all_sensors, ["_tx_power", "_txpower"]),
                "uptime":      _find_sensor(all_sensors, ["_uptime"]),
                "freq":        _find_sensor(all_sensors, ["_frequency", "_freq"]),
                "region":      _find_sensor(all_sensors, ["_region"]),
                "node_count":  _find_sensor(all_sensors, ["_node_count", "_nodes"]),
                "rssi":        _find_sensor(all_sensors, ["_rssi"]),
                "snr":         _find_sensor(all_sensors, ["_snr"]),
            }

        connection.send_result(msg["id"], {
            "connected": meshcore_connected,
            "node_info": node_info,
            "messages_today": store.get_messages_today(),
            "sensor_count": len(all_sensors),
        })

    websocket_api.async_register_command(hass, ws_get_state)

    # ── Get contacts ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_CONTACTS})
    @callback
    def ws_get_contacts(hass, connection, msg):
        """Return all known contacts/nodes with alias overlay."""
        contacts = _gather_contacts(hass, store)
        connection.send_result(msg["id"], {"contacts": contacts})

    websocket_api.async_register_command(hass, ws_get_contacts)

    # ── Get node info ─────────────────────────────────────────────────────────

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_NODE_INFO})
    @callback
    def ws_get_node_info(hass, connection, msg):
        """Return full sensor dump from all meshcore entities."""
        sensors = _gather_all_meshcore_sensors(hass)
        # Also include binary_sensors
        binary = {}
        for state in hass.states.async_all("binary_sensor"):
            if "meshcore" in state.entity_id:
                binary[state.entity_id] = {
                    "state": state.state,
                    "attributes": dict(state.attributes),
                    "last_changed": state.last_changed.isoformat() if state.last_changed else None,
                }
        connection.send_result(msg["id"], {"sensors": sensors, "binary_sensors": binary})

    websocket_api.async_register_command(hass, ws_get_node_info)

    # ── Get messages ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_GET_MESSAGES,
        vol.Optional("conversation_id"): str,
        vol.Optional("limit", default=100): int,
        vol.Optional("before_id"): str,
    })
    @callback
    def ws_get_messages(hass, connection, msg):
        """Return stored messages, optionally filtered by conversation."""
        cid = msg.get("conversation_id")
        limit = msg.get("limit", 100)
        before_id = msg.get("before_id")

        if cid:
            msgs = store.get_messages(cid)
        else:
            all_msgs = []
            for msgs_list in store.get_all_conversations().values():
                all_msgs.extend(msgs_list)
            msgs = sorted(all_msgs, key=lambda m: m.get("timestamp", 0))

        if before_id:
            ids = [m["id"] for m in msgs]
            if before_id in ids:
                cut = ids.index(before_id)
                msgs = msgs[:cut]

        msgs = msgs[-limit:]

        aliases = store.get_all_aliases()
        enriched = []
        for m in msgs:
            m2 = dict(m)
            pk = m2.get("sender_pubkey")
            if pk and pk in aliases:
                m2["sender_name"] = aliases[pk]
            enriched.append(m2)

        connection.send_result(msg["id"], {
            "messages": enriched,
            "total": len(store.get_messages(cid) if cid else []),
        })

    websocket_api.async_register_command(hass, ws_get_messages)

    # ── Send message ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_SEND_MESSAGE,
        vol.Required("text"): str,
        vol.Optional("channel_idx"): int,
        vol.Optional("contact_pubkey"): str,
        vol.Optional("conversation_id"): str,
    })
    @callback
    def ws_send_message(hass, connection, msg):
        """Send a message via meshcore integration services."""
        text = msg["text"].strip()
        if not text:
            connection.send_error(msg["id"], "empty_message", "Message cannot be empty")
            return

        channel_idx = msg.get("channel_idx")
        contact_pubkey = msg.get("contact_pubkey")
        cid = msg.get("conversation_id",
                       f"ch_{channel_idx}" if channel_idx is not None else f"dm_{contact_pubkey}")

        async def _send():
            try:
                if contact_pubkey:
                    await hass.services.async_call(
                        MESHCORE_DOMAIN, "send_direct_message",
                        {"contact": contact_pubkey, "message": text},
                        blocking=True,
                    )
                elif channel_idx is not None:
                    await hass.services.async_call(
                        MESHCORE_DOMAIN, "send_channel_message",
                        {"channel_idx": channel_idx, "message": text},
                        blocking=True,
                    )
                else:
                    connection.send_error(msg["id"], "missing_target",
                                          "Specify channel_idx or contact_pubkey")
                    return

                outgoing = {
                    "id": str(uuid.uuid4()),
                    "conversation_id": cid,
                    "text": text,
                    "sender_pubkey": "self",
                    "sender_name": "You",
                    "timestamp": datetime.utcnow().isoformat(),
                    "direction": "out",
                    "status": "sent",
                }
                await store.async_add_message(cid, outgoing)
                connection.send_result(msg["id"], {"success": True, "message": outgoing})
            except Exception as exc:  # noqa: BLE001
                _LOGGER.error("MeshCore send error: %s", exc)
                connection.send_error(msg["id"], "send_failed", str(exc))

        hass.async_create_task(_send())

    websocket_api.async_register_command(hass, ws_send_message)

    # ── Execute command ───────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_EXECUTE_COMMAND,
        vol.Required("command"): str,
        vol.Optional("entry_id"): str,
    })
    @callback
    def ws_execute_command(hass, connection, msg):
        """Execute a raw meshcore CLI command."""
        cmd = msg["command"].strip()
        entry_id = msg.get("entry_id")

        async def _run():
            try:
                svc_data: dict[str, Any] = {"command": cmd}
                if entry_id:
                    svc_data["entry_id"] = entry_id
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "execute_command",
                    svc_data,
                    blocking=True,
                )
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                _LOGGER.error("MeshCore command error: %s", exc)
                connection.send_error(msg["id"], "command_failed", str(exc))

        hass.async_create_task(_run())

    websocket_api.async_register_command(hass, ws_execute_command)

    # ── Clear messages ────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_CLEAR_MESSAGES,
        vol.Optional("conversation_id"): str,
    })
    @callback
    def ws_clear_messages(hass, connection, msg):
        async def _clear():
            await store.async_clear_messages(msg.get("conversation_id"))
            connection.send_result(msg["id"], {"success": True})
        hass.async_create_task(_clear())

    websocket_api.async_register_command(hass, ws_clear_messages)

    # ── Delete message ────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_DELETE_MESSAGE,
        vol.Required("conversation_id"): str,
        vol.Required("message_id"): str,
    })
    @callback
    def ws_delete_message(hass, connection, msg):
        async def _del():
            ok = await store.async_delete_message(msg["conversation_id"], msg["message_id"])
            if ok:
                connection.send_result(msg["id"], {"success": True})
            else:
                connection.send_error(msg["id"], "not_found", "Message not found")
        hass.async_create_task(_del())

    websocket_api.async_register_command(hass, ws_delete_message)

    # ── Export messages ───────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_EXPORT_MESSAGES,
        vol.Optional("conversation_id"): str,
    })
    @callback
    def ws_export_messages(hass, connection, msg):
        cid = msg.get("conversation_id")
        if cid:
            data = {cid: store.get_messages(cid)}
        else:
            data = store.get_all_conversations()
        connection.send_result(msg["id"], {"data": data})

    websocket_api.async_register_command(hass, ws_export_messages)

    # ── Update contact alias ──────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_UPDATE_CONTACT_ALIAS,
        vol.Required("pubkey_prefix"): str,
        vol.Required("alias"): str,
    })
    @callback
    def ws_update_alias(hass, connection, msg):
        async def _save():
            await store.async_set_contact_alias(msg["pubkey_prefix"], msg["alias"])
            connection.send_result(msg["id"], {"success": True})
        hass.async_create_task(_save())

    websocket_api.async_register_command(hass, ws_update_alias)

    # ── Remove contact ────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_REMOVE_CONTACT,
        vol.Required("pubkey_prefix"): str,
    })
    @callback
    def ws_remove_contact(hass, connection, msg):
        async def _remove():
            try:
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "remove_contact",
                    {"contact": msg["pubkey_prefix"]},
                    blocking=True,
                )
                await store.async_remove_contact_alias(msg["pubkey_prefix"])
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                connection.send_error(msg["id"], "remove_failed", str(exc))
        hass.async_create_task(_remove())

    websocket_api.async_register_command(hass, ws_remove_contact)

    # ── Add contact ───────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_ADD_CONTACT,
        vol.Required("pubkey_prefix"): str,
    })
    @callback
    def ws_add_contact(hass, connection, msg):
        async def _add():
            try:
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "add_contact",
                    {"contact": msg["pubkey_prefix"]},
                    blocking=True,
                )
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                connection.send_error(msg["id"], "add_failed", str(exc))
        hass.async_create_task(_add())

    websocket_api.async_register_command(hass, ws_add_contact)

    # ── Send advertisement ────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_SEND_ADVERT,
        vol.Optional("flood", default=True): bool,
    })
    @callback
    def ws_send_advert(hass, connection, msg):
        async def _advert():
            try:
                cmd = f"send_advert {str(msg.get('flood', True)).lower()}"
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "execute_command",
                    {"command": cmd},
                    blocking=True,
                )
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                connection.send_error(msg["id"], "advert_failed", str(exc))
        hass.async_create_task(_advert())

    websocket_api.async_register_command(hass, ws_send_advert)

    # ── Set channel ───────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_SET_CHANNEL,
        vol.Required("index"): int,
        vol.Required("name"): str,
        vol.Optional("hash"): str,
    })
    @callback
    def ws_set_channel(hass, connection, msg):
        async def _set_ch():
            try:
                ch_hash = msg.get("hash", "")
                cmd = f"set_channel {msg['index']} {msg['name']}"
                if ch_hash:
                    cmd += f" {ch_hash}"
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "execute_command",
                    {"command": cmd},
                    blocking=True,
                )
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                connection.send_error(msg["id"], "set_channel_failed", str(exc))
        hass.async_create_task(_set_ch())

    websocket_api.async_register_command(hass, ws_set_channel)

    # ── Ping contact ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): WS_TYPE_PING_CONTACT,
        vol.Required("pubkey_prefix"): str,
    })
    @callback
    def ws_ping_contact(hass, connection, msg):
        async def _ping():
            try:
                await hass.services.async_call(
                    MESHCORE_DOMAIN, "execute_command",
                    {"command": f"send_msg {msg['pubkey_prefix']} \u200b"},
                    blocking=True,
                )
                connection.send_result(msg["id"], {"success": True})
            except Exception as exc:  # noqa: BLE001
                connection.send_error(msg["id"], "ping_failed", str(exc))
        hass.async_create_task(_ping())

    websocket_api.async_register_command(hass, ws_ping_contact)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _state_val(hass: HomeAssistant, entity_id: str) -> Any:
    state = hass.states.get(entity_id)
    if state and state.state not in ("unknown", "unavailable"):
        return state.state
    return None


def _get_meshcore_entry_id(hass: HomeAssistant) -> str | None:
    entries = hass.config_entries.async_entries(MESHCORE_DOMAIN)
    if entries:
        return entries[0].entry_id
    return None


def _gather_all_meshcore_sensors(hass: HomeAssistant) -> dict[str, Any]:
    """Return all sensor.meshcore_* entities as a dict keyed by entity_id."""
    result = {}
    for state in hass.states.async_all("sensor"):
        if "meshcore" in state.entity_id:
            result[state.entity_id] = {
                "state": state.state,
                "attributes": dict(state.attributes),
                "last_changed": state.last_changed.isoformat() if state.last_changed else None,
                "friendly_name": state.attributes.get("friendly_name", state.entity_id),
            }
    return result


def _find_sensor(sensors: dict, suffixes: list[str]) -> Any:
    """Find the first sensor whose entity_id ends with one of the given suffixes."""
    for suffix in suffixes:
        for eid, data in sensors.items():
            if eid.endswith(suffix):
                val = data["state"]
                if val not in ("unknown", "unavailable", None, ""):
                    return val
    return None


def _gather_contacts(hass: HomeAssistant, store: MeshCoreUIStore) -> list[dict]:
    """
    Gather contact list from meshcore-ha binary sensor entities.

    meshcore-ha creates binary_sensor.meshcore_* contact sensors with these
    documented attributes: pubkey_prefix, adv_name, added_to_node, type,
    last_advert, last_advert_formatted, latitude (optional), longitude (optional)
    """
    contacts: list[dict] = []
    aliases = store.get_all_aliases()
    seen: set[str] = set()

    # Primary: binary_sensor.meshcore_* contact sensors
    for state in hass.states.async_all("binary_sensor"):
        eid = state.entity_id
        if "meshcore" not in eid:
            continue
        attrs = state.attributes

        # meshcore-ha contact sensors always have pubkey_prefix in attrs
        pubkey = attrs.get("pubkey_prefix") or attrs.get("public_key")
        if not pubkey:
            continue
        if pubkey in seen:
            continue
        seen.add(pubkey)

        name = aliases.get(pubkey) or attrs.get("adv_name") or pubkey

        # Timestamps
        last_advert_raw = attrs.get("last_advert")
        last_advert_iso = attrs.get("last_advert_formatted")
        if last_advert_iso:
            last_seen = last_advert_iso
        elif last_advert_raw:
            try:
                from datetime import datetime, timezone
                last_seen = datetime.fromtimestamp(
                    int(last_advert_raw), tz=timezone.utc
                ).isoformat()
            except Exception:
                last_seen = str(last_advert_raw)
        else:
            last_seen = None

        # GPS
        lat = attrs.get("latitude")
        lon = attrs.get("longitude")
        try:
            lat = float(lat) if lat is not None else None
            lon = float(lon) if lon is not None else None
        except (TypeError, ValueError):
            lat = lon = None

        # Node type label
        node_type_map = {1: "client", 2: "repeater", 3: "room_server", 4: "sensor"}
        raw_type = attrs.get("type")
        try:
            node_type = node_type_map.get(int(raw_type), "contact") if raw_type is not None else "contact"
        except (TypeError, ValueError):
            node_type = "contact"

        contacts.append({
            "pubkey_prefix": pubkey,
            "name": name,
            "alias": aliases.get(pubkey),
            "last_seen": last_seen,
            "last_advert_ts": last_advert_raw,
            "snr": attrs.get("last_snr"),
            "rssi": attrs.get("last_rssi"),
            "path": attrs.get("out_path") or attrs.get("path"),
            "type": node_type,
            "added_to_node": attrs.get("added_to_node", False),
            "battery_pct": attrs.get("battery_percentage"),
            "entity_id": eid,
            "state": state.state,
            "lat": lat,
            "lon": lon,
        })

    # Supplement: device_tracker.meshcore_*_gps for GPS
    for state in hass.states.async_all("device_tracker"):
        eid = state.entity_id
        if "meshcore" not in eid or not eid.endswith("_gps"):
            continue
        attrs = state.attributes
        lat = attrs.get("latitude")
        lon = attrs.get("longitude")
        if lat is None or lon is None:
            continue
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            continue

        pubkey = attrs.get("pubkey_prefix") or attrs.get("public_key")
        if pubkey:
            for c in contacts:
                if c["pubkey_prefix"] == pubkey and c["lat"] is None:
                    c["lat"] = lat
                    c["lon"] = lon
                    break
            else:
                if pubkey not in seen:
                    seen.add(pubkey)
                    contacts.append({
                        "pubkey_prefix": pubkey,
                        "name": aliases.get(pubkey) or attrs.get("friendly_name", pubkey),
                        "alias": aliases.get(pubkey),
                        "last_seen": None, "last_advert_ts": None,
                        "snr": None, "rssi": None, "path": None,
                        "type": "gps_tracker", "added_to_node": False,
                        "battery_pct": attrs.get("battery_level"),
                        "entity_id": eid, "state": "fresh",
                        "lat": lat, "lon": lon,
                    })

    # Sort by last_advert timestamp descending, cap at 100
    def _ts(c: dict) -> float:
        try:
            return float(c.get("last_advert_ts") or 0)
        except (TypeError, ValueError):
            return 0.0

    contacts.sort(key=_ts, reverse=True)
    return contacts[:100]

