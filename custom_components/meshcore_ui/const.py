"""Constants for MeshCore UI integration."""

DOMAIN = "meshcore_ui"
INTEGRATION_NAME = "MeshCore UI"
PANEL_URL = "meshcore-ui"
PANEL_TITLE = "MeshCore"
PANEL_ICON = "mdi:router-wireless"

# Storage
STORAGE_VERSION = 1
STORAGE_KEY = "meshcore_ui_data"

# Sensor entity IDs
SENSOR_MESSAGES_TODAY = f"{DOMAIN}_messages_today"
SENSOR_ACTIVE_CONTACTS = f"{DOMAIN}_active_contacts"

# WebSocket command types
WS_TYPE_GET_STATE = f"{DOMAIN}/get_state"
WS_TYPE_SEND_MESSAGE = f"{DOMAIN}/send_message"
WS_TYPE_GET_MESSAGES = f"{DOMAIN}/get_messages"
WS_TYPE_GET_CONTACTS = f"{DOMAIN}/get_contacts"
WS_TYPE_GET_NODE_INFO = f"{DOMAIN}/get_node_info"
WS_TYPE_EXECUTE_COMMAND = f"{DOMAIN}/execute_command"
WS_TYPE_CLEAR_MESSAGES = f"{DOMAIN}/clear_messages"
WS_TYPE_DELETE_MESSAGE = f"{DOMAIN}/delete_message"
WS_TYPE_EXPORT_MESSAGES = f"{DOMAIN}/export_messages"
WS_TYPE_UPDATE_CONTACT_ALIAS = f"{DOMAIN}/update_contact_alias"
WS_TYPE_REMOVE_CONTACT = f"{DOMAIN}/remove_contact"
WS_TYPE_ADD_CONTACT = f"{DOMAIN}/add_contact"
WS_TYPE_SEND_ADVERT = f"{DOMAIN}/send_advert"
WS_TYPE_SET_CHANNEL = f"{DOMAIN}/set_channel"
WS_TYPE_PING_CONTACT = f"{DOMAIN}/ping_contact"

# HA meshcore integration domain (the underlying meshcore integration)
MESHCORE_DOMAIN = "meshcore"

# Event types fired on the HA event bus by meshcore integration
MESHCORE_EVENT_MESSAGE = "meshcore_message"
MESHCORE_EVENT_CONNECTED = "meshcore_connected"
MESHCORE_EVENT_DISCONNECTED = "meshcore_disconnected"

# Message types from meshcore events
MSG_TYPE_CHANNEL = "channel"
MSG_TYPE_CONTACT = "contact"

# Default message limit per conversation
DEFAULT_MESSAGE_LIMIT = 500

# Active contact threshold (seconds)
ACTIVE_CONTACT_WINDOW = 3600  # 1 hour
