"""
WebSocket message handler for BGCS real-time communication.
Handles incoming WebSocket messages and routes commands to appropriate handlers.
"""

import json
import asyncio
import logging
from typing import Dict, Any, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

from ..state.manager import state_manager
from ..simulation.engine import SimulationEngine
from ..entities.base import Vector3

logger = logging.getLogger(__name__)

# Global simulation engine reference (set in main.py)
simulation_engine = None

def set_simulation_engine(engine):
    """Set the simulation engine reference."""
    global simulation_engine
    simulation_engine = engine


class WebSocketMessage:
    """Represents a WebSocket message."""
    
    def __init__(self, message_type: str, data: Dict[str, Any], client_id: Optional[str] = None):
        self.type = message_type
        self.data = data
        self.client_id = client_id
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "data": self.data,
            "client_id": self.client_id,
            "timestamp": self.timestamp
        }


class WebSocketManager:
    """Manages WebSocket connections and message routing."""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.client_counter = 0
        self.message_handlers = {}
        self.broadcast_queue = asyncio.Queue()
        self.setup_message_handlers()
    
    def setup_message_handlers(self):
        """Setup message type handlers."""
        self.message_handlers = {
            "ping": self._handle_ping,
            "get_state": self._handle_get_state,
            "spawn_entity": self._handle_spawn_entity,
            "set_entity_mode": self._handle_set_entity_mode,
            "set_entity_path": self._handle_set_entity_path,
            "delete_entity": self._handle_delete_entity,
            "select_entity": self._handle_select_entity,
            "deselect_entity": self._handle_deselect_entity,
            "clear_selection": self._handle_clear_selection,
            "simulation_control": self._handle_simulation_control,
            "chat_message": self._handle_chat_message,
            "subscribe": self._handle_subscribe,
            "unsubscribe": self._handle_unsubscribe
        }
    
    async def connect(self, websocket: WebSocket) -> str:
        """Accept new WebSocket connection and return client ID."""
        await websocket.accept()
        self.client_counter += 1
        client_id = f"client_{self.client_counter}"
        self.active_connections[client_id] = websocket
        
        logger.info(f"WebSocket client {client_id} connected. Total connections: {len(self.active_connections)}")
        
        # Send welcome message
        await self._send_to_client(client_id, {
            "type": "connection_established",
            "data": {
                "client_id": client_id,
                "server_time": datetime.now().isoformat(),
                "simulation_running": simulation_engine.running
            }
        })
        
        # Send initial state
        await self._send_state_update(client_id)
        
        return client_id
    
    def disconnect(self, client_id: str):
        """Remove WebSocket connection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"WebSocket client {client_id} disconnected. Total connections: {len(self.active_connections)}")
    
    async def handle_message(self, client_id: str, message: str):
        """Handle incoming WebSocket message."""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            message_data = data.get("data", {})
            
            if message_type in self.message_handlers:
                response = await self.message_handlers[message_type](client_id, message_data)
                if response:
                    await self._send_to_client(client_id, response)
            else:
                await self._send_error(client_id, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            await self._send_error(client_id, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            await self._send_error(client_id, "Internal server error")
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients."""
        if not self.active_connections:
            return
        
        message_str = json.dumps(message)
        disconnected = []
        
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(message_str)
            except Exception as e:
                logger.warning(f"Failed to send to client {client_id}: {e}")
                disconnected.append(client_id)
        
        # Remove disconnected clients
        for client_id in disconnected:
            self.disconnect(client_id)
    
    async def _send_to_client(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"Failed to send to client {client_id}: {e}")
                self.disconnect(client_id)
    
    async def _send_error(self, client_id: str, error_message: str):
        """Send error message to client."""
        await self._send_to_client(client_id, {
            "type": "error",
            "data": {"message": error_message}
        })
    
    async def _send_state_update(self, client_id: Optional[str] = None):
        """Send state update to client(s)."""
        try:
            snapshot = state_manager.get_state_snapshot()
            message = {
                "type": "state_update",
                "data": snapshot
            }
            
            if client_id:
                await self._send_to_client(client_id, message)
            else:
                await self.broadcast(message)
                
        except Exception as e:
            logger.error(f"Error sending state update: {e}")
    
    # Message Handlers
    
    async def _handle_ping(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle ping message."""
        return {
            "type": "pong",
            "data": {
                "timestamp": datetime.now().isoformat(),
                "client_id": client_id
            }
        }
    
    async def _handle_get_state(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle state request."""
        try:
            snapshot = state_manager.get_state_snapshot()
            return {
                "type": "state_response",
                "data": snapshot
            }
        except Exception as e:
            return {
                "type": "error",
                "data": {"message": f"Failed to get state: {e}"}
            }
    
    async def _handle_spawn_entity(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity spawn command."""
        try:
            entity_type = data.get("type")
            entity_id = data.get("id")
            position_data = data.get("position", {})
            properties = data.get("properties", {})
            
            if not entity_type:
                return {"type": "error", "data": {"message": "Entity type required"}}
            
            if entity_type not in ["drone", "target"]:
                return {"type": "error", "data": {"message": "Invalid entity type"}}
            
            position = Vector3(
                position_data.get("x", 0),
                position_data.get("y", 0),
                position_data.get("z", 0)
            )
            
            success = simulation_engine.spawn_entity(entity_type, entity_id, position, **properties)
            
            if success:
                # Broadcast spawn event
                await self.broadcast({
                    "type": "entity_spawned",
                    "data": {
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                        "position": position_data,
                        "spawned_by": client_id
                    }
                })
                
                return {
                    "type": "command_success",
                    "data": {"message": f"Spawned {entity_type}", "entity_id": entity_id}
                }
            else:
                return {
                    "type": "error",
                    "data": {"message": "Failed to spawn entity"}
                }
                
        except Exception as e:
            return {
                "type": "error",
                "data": {"message": f"Spawn error: {e}"}
            }
    
    async def _handle_set_entity_mode(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity mode change command."""
        try:
            entity_id = data.get("entity_id")
            mode = data.get("mode")
            
            if not entity_id or not mode:
                return {"type": "error", "data": {"message": "Entity ID and mode required"}}
            
            entity = state_manager.get_entity(entity_id)
            if not entity:
                return {"type": "error", "data": {"message": "Entity not found"}}
            
            if hasattr(entity, 'set_mode'):
                success = entity.set_mode(mode)
                if success:
                    state_manager.log_event("mode_changed", entity_id, {
                        "new_mode": mode,
                        "changed_by": client_id
                    })
                    
                    await self.broadcast({
                        "type": "entity_mode_changed",
                        "data": {
                            "entity_id": entity_id,
                            "mode": mode,
                            "changed_by": client_id
                        }
                    })
                    
                    return {
                        "type": "command_success",
                        "data": {"message": f"Mode set to {mode}"}
                    }
                else:
                    return {"type": "error", "data": {"message": "Invalid mode"}}
            else:
                return {"type": "error", "data": {"message": "Entity does not support mode changes"}}
                
        except Exception as e:
            return {"type": "error", "data": {"message": f"Mode change error: {e}"}}
    
    async def _handle_set_entity_path(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity path setting command."""
        try:
            entity_id = data.get("entity_id")
            path_data = data.get("path", [])
            replace = data.get("replace", True)
            
            if not entity_id:
                return {"type": "error", "data": {"message": "Entity ID required"}}
            
            entity = state_manager.get_entity(entity_id)
            if not entity:
                return {"type": "error", "data": {"message": "Entity not found"}}
            
            if replace:
                entity.clear_waypoints()
            
            waypoints_added = 0
            for pos_data in path_data:
                waypoint = Vector3(
                    pos_data.get("x", 0),
                    pos_data.get("y", 0),
                    pos_data.get("z", 0)
                )
                entity.add_waypoint(waypoint)
                waypoints_added += 1
            
            if waypoints_added > 0 and hasattr(entity, 'set_mode'):
                entity.set_mode("waypoint_mode")
            
            state_manager.log_event("path_changed", entity_id, {
                "waypoints_added": waypoints_added,
                "replace": replace,
                "changed_by": client_id
            })
            
            await self.broadcast({
                "type": "entity_path_changed",
                "data": {
                    "entity_id": entity_id,
                    "path": path_data,
                    "waypoints_added": waypoints_added,
                    "changed_by": client_id
                }
            })
            
            return {
                "type": "command_success",
                "data": {"message": f"Path set with {waypoints_added} waypoints"}
            }
            
        except Exception as e:
            return {"type": "error", "data": {"message": f"Path setting error: {e}"}}
    
    async def _handle_delete_entity(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity deletion command."""
        try:
            entity_id = data.get("entity_id")
            
            if not entity_id:
                return {"type": "error", "data": {"message": "Entity ID required"}}
            
            entity = state_manager.get_entity(entity_id)
            if not entity:
                return {"type": "error", "data": {"message": "Entity not found"}}
            
            success = simulation_engine.destroy_entity(entity_id)
            
            if success:
                await self.broadcast({
                    "type": "entity_deleted",
                    "data": {
                        "entity_id": entity_id,
                        "deleted_by": client_id
                    }
                })
                
                return {
                    "type": "command_success",
                    "data": {"message": f"Entity {entity_id} deleted"}
                }
            else:
                return {"type": "error", "data": {"message": "Failed to delete entity"}}
                
        except Exception as e:
            return {"type": "error", "data": {"message": f"Deletion error: {e}"}}
    
    async def _handle_select_entity(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity selection command."""
        try:
            entity_id = data.get("entity_id")
            multi_select = data.get("multi_select", False)
            
            if not entity_id:
                return {"type": "error", "data": {"message": "Entity ID required"}}
            
            # Clear selection if not multi-selecting
            if not multi_select:
                state_manager.clear_selection()
            
            success = state_manager.select_entity(entity_id)
            
            if success:
                await self.broadcast({
                    "type": "entity_selected",
                    "data": {
                        "entity_id": entity_id,
                        "selected_by": client_id,
                        "selected_entities": state_manager.selected_entities
                    }
                })
                
                return {
                    "type": "command_success",
                    "data": {"message": f"Entity {entity_id} selected"}
                }
            else:
                return {"type": "error", "data": {"message": "Entity not found"}}
                
        except Exception as e:
            return {"type": "error", "data": {"message": f"Selection error: {e}"}}
    
    async def _handle_deselect_entity(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle entity deselection command."""
        try:
            entity_id = data.get("entity_id")
            
            if not entity_id:
                return {"type": "error", "data": {"message": "Entity ID required"}}
            
            success = state_manager.deselect_entity(entity_id)
            
            await self.broadcast({
                "type": "entity_deselected",
                "data": {
                    "entity_id": entity_id,
                    "deselected_by": client_id,
                    "selected_entities": state_manager.selected_entities
                }
            })
            
            return {
                "type": "command_success",
                "data": {"message": f"Entity {entity_id} deselected"}
            }
            
        except Exception as e:
            return {"type": "error", "data": {"message": f"Deselection error: {e}"}}
    
    async def _handle_clear_selection(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle clear selection command."""
        try:
            selected_count = len(state_manager.selected_entities)
            state_manager.clear_selection()
            
            await self.broadcast({
                "type": "selection_cleared",
                "data": {
                    "cleared_count": selected_count,
                    "cleared_by": client_id
                }
            })
            
            return {
                "type": "command_success",
                "data": {"message": f"Cleared {selected_count} selections"}
            }
            
        except Exception as e:
            return {"type": "error", "data": {"message": f"Clear selection error: {e}"}}
    
    async def _handle_simulation_control(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle simulation control commands."""
        try:
            command = data.get("command")
            
            if command == "start":
                success = await simulation_engine.start()
                message = "started" if success else "already running"
            elif command == "stop":
                success = await simulation_engine.stop()
                message = "stopped" if success else "not running"
            elif command == "pause":
                simulation_engine.pause()
                success = True
                message = "paused"
            elif command == "resume":
                simulation_engine.resume()
                success = True
                message = "resumed"
            elif command == "set_speed":
                speed = data.get("speed", 1.0)
                simulation_engine.set_speed_multiplier(speed)
                success = True
                message = f"speed set to {speed}x"
            else:
                return {"type": "error", "data": {"message": "Invalid simulation command"}}
            
            await self.broadcast({
                "type": "simulation_control",
                "data": {
                    "command": command,
                    "success": success,
                    "message": message,
                    "controlled_by": client_id
                }
            })
            
            return {
                "type": "command_success",
                "data": {"message": f"Simulation {message}"}
            }
            
        except Exception as e:
            return {"type": "error", "data": {"message": f"Simulation control error: {e}"}}
    
    async def _handle_chat_message(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle chat message."""
        try:
            message = data.get("message", "")
            sender = data.get("sender", client_id)
            
            state_manager.add_chat_message(sender, message, "user")
            
            await self.broadcast({
                "type": "chat_message",
                "data": {
                    "sender": sender,
                    "message": message,
                    "timestamp": datetime.now().isoformat(),
                    "from_client": client_id
                }
            })
            
            return None  # No direct response needed
            
        except Exception as e:
            return {"type": "error", "data": {"message": f"Chat error: {e}"}}
    
    async def _handle_subscribe(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle subscription to specific update types."""
        # For now, all clients get all updates
        # Future enhancement could filter updates based on subscriptions
        return {
            "type": "subscription_confirmed",
            "data": {"message": "Subscribed to updates"}
        }
    
    async def _handle_unsubscribe(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle unsubscription from update types."""
        return {
            "type": "unsubscription_confirmed",
            "data": {"message": "Unsubscribed from updates"}
        }


# Global WebSocket manager instance
websocket_manager = WebSocketManager()


async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint handler."""
    client_id = await websocket_manager.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            await websocket_manager.handle_message(client_id, data)
            
    except WebSocketDisconnect:
        websocket_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        websocket_manager.disconnect(client_id)


async def start_periodic_updates():
    """Start periodic state updates to all clients."""
    while True:
        try:
            if websocket_manager.active_connections:
                await websocket_manager._send_state_update()
            await asyncio.sleep(0.1)  # 10 FPS update rate for WebSocket
        except Exception as e:
            logger.error(f"Error in periodic updates: {e}")
            await asyncio.sleep(1)  # Wait longer on error