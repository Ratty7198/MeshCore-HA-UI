"""MeshCore UI integration for Home Assistant."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, Event, callback

from .const import (
    DOMAIN,
    PANEL_URL,
    PANEL_TITLE,
    PANEL_ICON,
    MESHCORE_EVENT_MESSAGE,
    MESHCORE_EVENT_CONNECTED,
    MESHCORE_EVENT_DISCONNECTED,
    MSG_TYPE_CHANNEL,
    MSG_TYPE_CONTACT,
)
from .store import MeshCoreUIStore
from .websocket_api import async_register_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the MeshCore UI component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up MeshCore UI from config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Initialize store
    store = MeshCoreUIStore(hass)
    await store.async_load()

    hass.data[DOMAIN][entry.entry_id] = {
        "store": store,
        "unsub_listeners": [],
    }

    # Register WebSocket commands
    async_register_commands(hass, store)

    # Listen for meshcore_message events and persist them
    @callback
    def _handle_message(event: Event) -> None:
        data = event.data
        msg_type = data.get("message_type", MSG_TYPE_CHANNEL)
        channel_idx = data.get("channel_idx")
        sender_pk = data.get("sender_pubkey") or data.get("pubkey_prefix", "unknown")
        sender_name = data.get("sender_name") or store.get_contact_alias(sender_pk) or sender_pk

        if msg_type == MSG_TYPE_CONTACT:
            cid = f"dm_{sender_pk}"
        else:
            cid = f"ch_{channel_idx or 0}"

        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": cid,
            "text": data.get("message", ""),
            "sender_pubkey": sender_pk,
            "sender_name": sender_name,
            "timestamp": data.get("timestamp") or datetime.utcnow().isoformat(),
            "direction": "in",
            "channel_idx": channel_idx,
            "message_type": msg_type,
            "snr": data.get("snr"),
            "rssi": data.get("rssi"),
            "hops": data.get("hop_count"),
            "rx_log_data": data.get("rx_log_data"),
        }

        hass.async_create_task(store.async_add_message(cid, message))

        # Fire UI push event so frontend updates in real-time
        hass.bus.async_fire(f"{DOMAIN}_new_message", {
            "conversation_id": cid,
            "message": message,
        })

    unsub_msg = hass.bus.async_listen(MESHCORE_EVENT_MESSAGE, _handle_message)

    @callback
    def _handle_connected(event: Event) -> None:
        hass.bus.async_fire(f"{DOMAIN}_connection_change", {"connected": True})

    @callback
    def _handle_disconnected(event: Event) -> None:
        hass.bus.async_fire(f"{DOMAIN}_connection_change", {"connected": False})

    unsub_conn = hass.bus.async_listen(MESHCORE_EVENT_CONNECTED, _handle_connected)
    unsub_disc = hass.bus.async_listen(MESHCORE_EVENT_DISCONNECTED, _handle_disconnected)

    hass.data[DOMAIN][entry.entry_id]["unsub_listeners"] = [unsub_msg, unsub_conn, unsub_disc]

    # Register sidebar panel
    await _async_register_panel(hass)

    # Set up sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload MeshCore UI config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        data = hass.data[DOMAIN].pop(entry.entry_id, {})
        for unsub in data.get("unsub_listeners", []):
            unsub()

        # Remove panel
        try:
            frontend.async_remove_panel(hass, PANEL_URL)
        except Exception:  # noqa: BLE001
            pass

    return unload_ok


async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel pointing at our JS bundle."""
    root = Path(__file__).parent

    # Serve our static files — use the current HA API
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            url_path="/meshcore_ui",
            path=str(root / "ha_frontend"),
            cache_headers=False,
        )
    ])

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="meshcore-ui-panel",
        frontend_url_path=PANEL_URL,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        module_url="/meshcore_ui/panel.js",
    )
    _LOGGER.info("MeshCore UI panel registered at /%s", PANEL_URL)
