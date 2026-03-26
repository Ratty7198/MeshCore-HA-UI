"""Sensor entities for MeshCore UI."""
from __future__ import annotations

import logging
from datetime import datetime

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from .const import DOMAIN, ACTIVE_CONTACT_WINDOW
from .store import MeshCoreUIStore

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up MeshCore UI sensors."""
    store: MeshCoreUIStore = hass.data[DOMAIN][entry.entry_id]["store"]
    async_add_entities([
        MeshCoreUIMessagesTodaySensor(hass, entry, store),
        MeshCoreUIActiveContactsSensor(hass, entry),
    ])


class MeshCoreUIMessagesTodaySensor(SensorEntity):
    """Tracks how many messages have been received today."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.TOTAL_INCREASING
    _attr_icon = "mdi:message-badge"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: MeshCoreUIStore) -> None:
        self._store = store
        self._attr_unique_id = f"{entry.entry_id}_messages_today"
        self._attr_name = "Messages Today"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "MeshCore UI",
            "manufacturer": "MeshCore",
            "model": "UI Dashboard",
        }

    @property
    def native_value(self) -> int:
        return self._store.get_messages_today()

    async def async_update(self) -> None:
        pass  # Store updates trigger HA refresh via async_write_ha_state


class MeshCoreUIActiveContactsSensor(SensorEntity):
    """Tracks contacts active in the past hour."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:account-multiple"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self._hass = hass
        self._attr_unique_id = f"{entry.entry_id}_active_contacts"
        self._attr_name = "Active Contacts"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "MeshCore UI",
            "manufacturer": "MeshCore",
            "model": "UI Dashboard",
        }

    @property
    def native_value(self) -> int:
        """Count binary_sensor.meshcore_*_contact entities with recent activity."""
        count = 0
        now = datetime.utcnow()
        for state in self._hass.states.async_all("binary_sensor"):
            if "meshcore" in state.entity_id and "contact" in state.entity_id:
                last_changed = state.last_changed
                if last_changed:
                    delta = (now - last_changed.replace(tzinfo=None)).total_seconds()
                    if delta <= ACTIVE_CONTACT_WINDOW:
                        count += 1
        return count

    async def async_update(self) -> None:
        pass
