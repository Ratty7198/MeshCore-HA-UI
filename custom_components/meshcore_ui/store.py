"""Persistent storage for MeshCore UI integration."""
from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION, DEFAULT_MESSAGE_LIMIT

_LOGGER = logging.getLogger(__name__)


class MeshCoreUIStore:
    """Manages persistent storage for MeshCore UI data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {
            "messages": {},          # keyed by conversation_id
            "contact_aliases": {},   # pubkey_prefix -> display name override
            "daily_counts": {},      # date string -> count
            "settings": {},
        }

    async def async_load(self) -> None:
        """Load data from store."""
        stored = await self._store.async_load()
        if stored:
            self._data.update(stored)
        _LOGGER.debug("MeshCore UI store loaded")

    async def async_save(self) -> None:
        """Save data to store."""
        await self._store.async_save(self._data)

    # ── Messages ──────────────────────────────────────────────────────────────

    def get_messages(self, conversation_id: str) -> list[dict]:
        return self._data["messages"].get(conversation_id, [])

    def get_all_conversations(self) -> dict[str, list[dict]]:
        return self._data["messages"]

    async def async_add_message(
        self,
        conversation_id: str,
        message: dict,
        limit: int = DEFAULT_MESSAGE_LIMIT,
    ) -> None:
        """Add a message to a conversation, trim if over limit."""
        if conversation_id not in self._data["messages"]:
            self._data["messages"][conversation_id] = []
        self._data["messages"][conversation_id].append(message)
        # Trim
        if len(self._data["messages"][conversation_id]) > limit:
            self._data["messages"][conversation_id] = self._data["messages"][conversation_id][-limit:]
        # Bump daily count
        today = date.today().isoformat()
        counts = self._data.setdefault("daily_counts", {})
        counts[today] = counts.get(today, 0) + 1
        await self.async_save()

    async def async_clear_messages(self, conversation_id: str | None = None) -> None:
        """Clear messages for a conversation or all."""
        if conversation_id:
            self._data["messages"].pop(conversation_id, None)
        else:
            self._data["messages"] = {}
        await self.async_save()

    async def async_delete_message(self, conversation_id: str, message_id: str) -> bool:
        """Delete a single message. Returns True if found."""
        msgs = self._data["messages"].get(conversation_id, [])
        before = len(msgs)
        self._data["messages"][conversation_id] = [
            m for m in msgs if m.get("id") != message_id
        ]
        if len(self._data["messages"][conversation_id]) < before:
            await self.async_save()
            return True
        return False

    def get_messages_today(self) -> int:
        today = date.today().isoformat()
        return self._data.get("daily_counts", {}).get(today, 0)

    # ── Contact aliases ───────────────────────────────────────────────────────

    def get_contact_alias(self, pubkey_prefix: str) -> str | None:
        return self._data["contact_aliases"].get(pubkey_prefix)

    async def async_set_contact_alias(self, pubkey_prefix: str, alias: str) -> None:
        self._data["contact_aliases"][pubkey_prefix] = alias
        await self.async_save()

    async def async_remove_contact_alias(self, pubkey_prefix: str) -> None:
        self._data["contact_aliases"].pop(pubkey_prefix, None)
        await self.async_save()

    def get_all_aliases(self) -> dict[str, str]:
        return dict(self._data["contact_aliases"])

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_setting(self, key: str, default: Any = None) -> Any:
        return self._data["settings"].get(key, default)

    async def async_set_setting(self, key: str, value: Any) -> None:
        self._data["settings"][key] = value
        await self.async_save()
