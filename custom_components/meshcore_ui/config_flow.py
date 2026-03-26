"""Config flow for MeshCore UI integration."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN, MESHCORE_DOMAIN, INTEGRATION_NAME


class MeshCoreUIConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle MeshCore UI setup."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle initial setup step."""
        errors: dict[str, str] = {}

        # Only allow one instance
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        # Check meshcore integration is present
        meshcore_entries = self.hass.config_entries.async_entries(MESHCORE_DOMAIN)
        if not meshcore_entries:
            errors["base"] = "meshcore_not_found"

        if user_input is not None and not errors:
            return self.async_create_entry(
                title=INTEGRATION_NAME,
                data={},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({}),
            errors=errors,
            description_placeholders={
                "meshcore_status": "found" if meshcore_entries else "NOT FOUND — install meshcore-ha first",
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return MeshCoreUIOptionsFlow(config_entry)


class MeshCoreUIOptionsFlow(config_entries.OptionsFlow):
    """MeshCore UI options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(
                    "message_limit",
                    default=self.config_entry.options.get("message_limit", 500),
                ): vol.All(int, vol.Range(min=50, max=5000)),
            }),
        )
