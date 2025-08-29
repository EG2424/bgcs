"""
In-memory state manager for the BGCS system.
Manages entities, events, chat messages, and selected entities.
"""

import time
import uuid
import math
import json
import os
from typing import Dict, List, Optional, Any, Type
from collections import deque
from dataclasses import dataclass

def safe_float(value: float) -> float:
    """Convert float to JSON-safe value, handling inf and NaN."""
    if math.isinf(value):
        return 1000000.0 if value > 0 else -1000000.0  # Large but finite values
    elif math.isnan(value):
        return 0.0
    return value

from ..entities.base import Entity, Vector3
from ..entities.drone import Drone
from ..entities.target import Target


@dataclass
class SimulationEvent:
    """Represents a simulation event for logging."""
    timestamp: float
    event_type: str
    entity_id: Optional[str] = None
    data: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": safe_float(self.timestamp),
            "event_type": self.event_type,
            "entity_id": self.entity_id,
            "data": self.data or {}
        }


@dataclass
class ChatMessage:
    """Represents a chat message."""
    timestamp: float
    sender: str
    message: str
    message_type: str = "user"  # user, system, ai
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": safe_float(self.timestamp),
            "sender": self.sender,
            "message": self.message,
            "message_type": self.message_type
        }


@dataclass
class EntityGroup:
    """Represents a group of entities."""
    id: str
    name: str
    members: List[str]  # List of entity IDs
    created_time: float
    sort_index: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "members": self.members,
            "created_time": safe_float(self.created_time),
            "sort_index": self.sort_index
        }


class StateManager:
    """
    In-memory state manager for the BGCS system.
    
    Manages:
    - Entities Dictionary: Dict[str, Entity] storing all active entities
    - Event Log: Circular buffer of last 1000 events
    - Chat Messages: Circular buffer of last 500 messages
    - Selected Entities: List of currently selected entity IDs
    - Terrain Grid: 2D grid system for movement and collision checks
    """
    
    # Class variables to persist across instance recreation
    _persistent_entity_order: Dict[str, int] = {}
    _persistent_group_order: List[str] = []
    _persistent_groups: Dict[str, EntityGroup] = {}
    
    def __init__(self, max_events: int = 1000, max_messages: int = 500):
        # Core state
        self.entities: Dict[str, Entity] = {}
        self.selected_entities: List[str] = []
        self.groups: Dict[str, EntityGroup] = StateManager._persistent_groups
        
        # Event and message logs (circular buffers)
        self.events: deque = deque(maxlen=max_events)
        self.chat_messages: deque = deque(maxlen=max_messages)
        
        # Entity type registry
        self.entity_types: Dict[str, Type[Entity]] = {
            "entity": Entity,
            "drone": Drone,
            "target": Target
        }
        
        # Simulation state
        self.simulation_running: bool = False
        self.simulation_speed: float = 1.0
        self.simulation_time: float = 0.0
        
        # Performance tracking
        self.fps: float = 0.0
        self.update_count: int = 0
        self.last_fps_update: float = time.time()
        
        # Terrain grid (simplified 2D grid for movement)
        self.terrain_width: int = 1000  # meters
        self.terrain_height: int = 1000  # meters
        self.terrain_resolution: float = 10.0  # meters per grid cell
        
        # Display ordering (use class variables for persistence)
        self.entity_order = StateManager._persistent_entity_order
        self.group_order = StateManager._persistent_group_order
        
        
        # Statistics
        self.stats = {
            "entities_created": 0,
            "entities_destroyed": 0,
            "events_logged": 0,
            "messages_sent": 0
        }
    
    # Entity Management
    
    def add_entity(self, entity: Entity) -> bool:
        """Add entity to the state."""
        if entity.id in self.entities:
            return False
        
        # Apply saved sort_index if it exists
        if entity.id in self.entity_order:
            entity.sort_index = self.entity_order[entity.id]
        
        self.entities[entity.id] = entity
        self.stats["entities_created"] += 1
        
        self.log_event("entity_created", entity.id, {
            "entity_type": entity.entity_type,
            "position": {"x": entity.position.x, "y": entity.position.y, "z": entity.position.z}
        })
        
        return True
    
    def remove_entity(self, entity_id: str) -> bool:
        """Remove entity from the state."""
        if entity_id not in self.entities:
            return False
        
        entity = self.entities[entity_id]
        del self.entities[entity_id]
        
        # Remove from selection if selected
        if entity_id in self.selected_entities:
            self.selected_entities.remove(entity_id)
        
        self.stats["entities_destroyed"] += 1
        
        self.log_event("entity_removed", entity_id, {
            "entity_type": entity.entity_type
        })
        
        return True
    
    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get entity by ID."""
        return self.entities.get(entity_id)
    
    def get_entities_by_type(self, entity_type: str) -> List[Entity]:
        """Get all entities of a specific type."""
        return [entity for entity in self.entities.values() 
                if entity.entity_type == entity_type]
    
    def create_entity(self, entity_type: str, entity_id: Optional[str] = None, 
                     position: Optional[Vector3] = None, **kwargs) -> Optional[Entity]:
        """Create and add a new entity."""
        if entity_type not in self.entity_types:
            return None
        
        entity_class = self.entity_types[entity_type]
        entity = entity_class(entity_id, position, **kwargs)
        
        # Set additional properties that weren't handled in constructor
        for key, value in kwargs.items():
            if hasattr(entity, key) and getattr(entity, key) != value:
                setattr(entity, key, value)
        
        if self.add_entity(entity):
            return entity
        return None
    
    def update_entities(self, delta_time: float) -> None:
        """Update all entities."""
        for entity in list(self.entities.values()):
            if not entity.destroyed:
                entity.update(delta_time)
            else:
                # Remove destroyed entities after a delay
                if time.time() - entity.last_update_time > 5.0:  # 5 second delay
                    self.remove_entity(entity.id)
    
    # Selection Management
    
    def select_entity(self, entity_id: str) -> bool:
        """Select an entity."""
        if entity_id in self.entities and entity_id not in self.selected_entities:
            self.selected_entities.append(entity_id)
            self.entities[entity_id].selected = True
            
            self.log_event("entity_selected", entity_id)
            return True
        return False
    
    def deselect_entity(self, entity_id: str) -> bool:
        """Deselect an entity."""
        if entity_id in self.selected_entities:
            self.selected_entities.remove(entity_id)
            if entity_id in self.entities:
                self.entities[entity_id].selected = False
            
            self.log_event("entity_deselected", entity_id)
            return True
        return False
    
    def clear_selection(self) -> None:
        """Clear all selected entities."""
        for entity_id in self.selected_entities:
            if entity_id in self.entities:
                self.entities[entity_id].selected = False
        
        self.selected_entities.clear()
        self.log_event("selection_cleared")
    
    def get_selected_entities(self) -> List[Entity]:
        """Get all selected entities."""
        return [self.entities[entity_id] for entity_id in self.selected_entities 
                if entity_id in self.entities]
    
    # Event Logging
    
    def log_event(self, event_type: str, entity_id: Optional[str] = None, 
                  data: Optional[Dict[str, Any]] = None) -> None:
        """Log a simulation event."""
        event = SimulationEvent(
            timestamp=time.time(),
            event_type=event_type,
            entity_id=entity_id,
            data=data
        )
        
        self.events.append(event)
        self.stats["events_logged"] += 1
    
    def get_recent_events(self, count: int = 10) -> List[SimulationEvent]:
        """Get recent events."""
        return list(self.events)[-count:]
    
    def get_events_by_type(self, event_type: str, count: int = 10) -> List[SimulationEvent]:
        """Get recent events of a specific type."""
        filtered_events = [event for event in self.events if event.event_type == event_type]
        return filtered_events[-count:]
    
    # Chat Messages
    
    def add_chat_message(self, sender: str, message: str, 
                        message_type: str = "user") -> None:
        """Add a chat message."""
        chat_message = ChatMessage(
            timestamp=time.time(),
            sender=sender,
            message=message,
            message_type=message_type
        )
        
        self.chat_messages.append(chat_message)
        self.stats["messages_sent"] += 1
    
    def get_recent_messages(self, count: int = 50) -> List[ChatMessage]:
        """Get recent chat messages."""
        return list(self.chat_messages)[-count:]
    
    # Simulation Control
    
    def start_simulation(self) -> None:
        """Start the simulation."""
        self.simulation_running = True
        self.log_event("simulation_started")
    
    def stop_simulation(self) -> None:
        """Stop the simulation."""
        self.simulation_running = False
        self.log_event("simulation_stopped")
    
    def set_simulation_speed(self, speed: float) -> None:
        """Set simulation speed multiplier."""
        self.simulation_speed = max(0.1, min(10.0, speed))  # Clamp between 0.1x and 10x
        self.log_event("simulation_speed_changed", data={"speed": self.simulation_speed})
    
    def update_simulation(self, delta_time: float) -> None:
        """Update simulation state."""
        if self.simulation_running:
            # Apply simulation speed
            adjusted_delta = delta_time * self.simulation_speed
            self.simulation_time += adjusted_delta
            
            # Update entities
            self.update_entities(adjusted_delta)
            
            # Update performance metrics
            self.update_count += 1
            current_time = time.time()
            if current_time - self.last_fps_update >= 1.0:
                self.fps = self.update_count
                self.update_count = 0
                self.last_fps_update = current_time
    
    # State Serialization
    
    def get_state_snapshot(self) -> Dict[str, Any]:
        """Get complete state snapshot for serialization."""
        return {
            "entities": {entity_id: entity.to_dict() 
                        for entity_id, entity in list(self.entities.items())},
            "groups": {group_id: group.to_dict() 
                      for group_id, group in self.groups.items()},
            "selected_entities": self.selected_entities.copy(),
            "simulation_running": self.simulation_running,
            "simulation_speed": safe_float(self.simulation_speed),
            "simulation_time": safe_float(self.simulation_time),
            "fps": safe_float(self.fps),
            "stats": {k: safe_float(v) if isinstance(v, float) else v 
                     for k, v in self.stats.items()},
            "recent_events": [event.to_dict() for event in self.get_recent_events(20)],
            "recent_messages": [msg.to_dict() for msg in self.get_recent_messages(10)]
        }
    
    def load_state_snapshot(self, snapshot: Dict[str, Any]) -> bool:
        """Load state from snapshot."""
        try:
            # Clear current state
            self.entities.clear()
            self.selected_entities.clear()
            
            # Load entities
            entities_data = snapshot.get("entities", {})
            for entity_id, entity_data in entities_data.items():
                entity_type = entity_data.get("entity_type", "entity")
                if entity_type in self.entity_types:
                    entity_class = self.entity_types[entity_type]
                    entity = entity_class.from_dict(entity_data)
                    self.entities[entity_id] = entity
            
            # Load other state
            self.selected_entities = snapshot.get("selected_entities", [])
            self.simulation_running = snapshot.get("simulation_running", False)
            self.simulation_speed = snapshot.get("simulation_speed", 1.0)
            self.simulation_time = snapshot.get("simulation_time", 0.0)
            
            self.log_event("state_loaded")
            return True
            
        except Exception as e:
            self.log_event("state_load_error", data={"error": str(e)})
            return False
    
    # Utility Methods
    
    def get_entity_count(self) -> int:
        """Get total entity count."""
        return len(self.entities)
    
    def get_entity_count_by_type(self) -> Dict[str, int]:
        """Get entity count by type."""
        counts = {}
        for entity in self.entities.values():
            entity_type = entity.entity_type
            counts[entity_type] = counts.get(entity_type, 0) + 1
        return counts
    
    def find_entities_in_radius(self, center: Vector3, radius: float) -> List[Entity]:
        """Find all entities within radius of center point."""
        entities_in_radius = []
        for entity in self.entities.values():
            if entity.position.distance_to(center) <= radius:
                entities_in_radius.append(entity)
        return entities_in_radius
    
    def clear_all_state(self) -> None:
        """Clear all state (entities, events, messages)."""
        self.entities.clear()
        self.selected_entities.clear()
        self.events.clear()
        self.chat_messages.clear()
        self.simulation_running = False
        self.simulation_time = 0.0
        
        # Reset stats
        self.stats = {
            "entities_created": 0,
            "entities_destroyed": 0,
            "events_logged": 0,
            "messages_sent": 0
        }
        
        self.log_event("state_cleared")
    
    # Group Management
    
    def create_group(self, group_id: str, name: str, members: List[str]) -> Optional[EntityGroup]:
        """Create a new group."""
        if group_id in self.groups:
            return None
        
        # Validate that all members exist
        valid_members = [member_id for member_id in members if member_id in self.entities]
        
        group = EntityGroup(
            id=group_id,
            name=name,
            members=valid_members,
            created_time=time.time()
        )
        
        # Apply saved sort_index if it exists
        if group_id in StateManager._persistent_groups:
            group.sort_index = StateManager._persistent_groups[group_id].sort_index
        
        # Store in both instance and class variable for persistence
        self.groups[group_id] = group
        StateManager._persistent_groups[group_id] = group
        
        self.log_event("group_created", None, {
            "group_id": group_id,
            "group_name": name,
            "members": valid_members,
            "member_count": len(valid_members)
        })
        
        return group
    
    def get_group(self, group_id: str) -> Optional[EntityGroup]:
        """Get group by ID."""
        return self.groups.get(group_id)
    
    def update_group(self, group_id: str, name: Optional[str] = None, members: Optional[List[str]] = None) -> bool:
        """Update group properties."""
        group = self.groups.get(group_id)
        if not group:
            return False
        
        if name is not None:
            group.name = name
        
        if members is not None:
            # Validate that all members exist
            valid_members = [member_id for member_id in members if member_id in self.entities]
            group.members = valid_members
        
        self.log_event("group_updated", None, {
            "group_id": group_id,
            "group_name": group.name,
            "members": group.members,
            "member_count": len(group.members)
        })
        
        return True
    
    def delete_group(self, group_id: str) -> bool:
        """Delete a group."""
        if group_id not in self.groups:
            return False
        
        group = self.groups[group_id]
        del self.groups[group_id]
        
        # Remove from class variable for persistence
        if group_id in StateManager._persistent_groups:
            del StateManager._persistent_groups[group_id]
        
        # Remove from group order
        if group_id in self.group_order:
            self.group_order.remove(group_id)
        
        self.log_event("group_deleted", None, {
            "group_id": group_id,
            "group_name": group.name
        })
        
        return True
    
    def get_all_groups(self) -> List[EntityGroup]:
        """Get all groups."""
        return list(self.groups.values())
    
    def add_entity_to_group(self, group_id: str, entity_id: str) -> bool:
        """Add entity to group."""
        group = self.groups.get(group_id)
        if not group or entity_id not in self.entities:
            return False
        
        if entity_id not in group.members:
            group.members.append(entity_id)
            self.log_event("entity_added_to_group", entity_id, {
                "group_id": group_id,
                "group_name": group.name
            })
        
        return True
    
    def remove_entity_from_group(self, group_id: str, entity_id: str) -> bool:
        """Remove entity from group."""
        group = self.groups.get(group_id)
        if not group:
            return False
        
        if entity_id in group.members:
            group.members.remove(entity_id)
            self.log_event("entity_removed_from_group", entity_id, {
                "group_id": group_id,
                "group_name": group.name
            })
        
        return True
    
    def get_entity_groups(self, entity_id: str) -> List[EntityGroup]:
        """Get all groups that contain the specified entity."""
        return [group for group in self.groups.values() if entity_id in group.members]
    
    def cleanup_empty_groups(self) -> List[str]:
        """Remove groups with no valid members. Returns list of deleted group IDs."""
        empty_groups = []
        
        for group_id, group in list(self.groups.items()):
            # Filter out members that no longer exist
            valid_members = [member_id for member_id in group.members if member_id in self.entities]
            
            if not valid_members:
                empty_groups.append(group_id)
                self.delete_group(group_id)
            elif len(valid_members) < len(group.members):
                # Update group with only valid members
                group.members = valid_members
        
        return empty_groups
    
    def set_group_order(self, ordered_ids: List[str]) -> None:
        """Set the display order for groups."""
        self.group_order = ordered_ids.copy()
        # Update sort_index for each group (similar to entity ordering)
        for index, group_id in enumerate(ordered_ids):
            # Update persistent storage
            if group_id in self._persistent_groups:
                self._persistent_groups[group_id].sort_index = index
            # Update current instance if it exists
            if group_id in self.groups:
                self.groups[group_id].sort_index = index
    
    def get_group_order(self) -> List[str]:
        """Get the current group display order."""
        return self.group_order.copy()
    
    def get_group_sort_index(self, group_id: str) -> int:
        """Get the sort index for a group."""
        if group_id in self._persistent_groups:
            return self._persistent_groups[group_id].sort_index
        elif group_id in self.groups:
            return self.groups[group_id].sort_index
        return 0
    
    def has_saved_group_sort_index(self, group_id: str) -> bool:
        """Check if group has a saved sort index."""
        return group_id in self._persistent_groups or group_id in self.groups
    
    def set_entity_order(self, ordered_ids: List[str]) -> None:
        """Set the display order for entities."""
        for index, entity_id in enumerate(ordered_ids):
            # Update class variable (persists across instance recreation)
            StateManager._persistent_entity_order[entity_id] = index
            # Also update instance reference
            self.entity_order[entity_id] = index
            # Update the actual entity if it exists
            entity = self.get_entity(entity_id)
            if entity:
                entity.sort_index = index
        
    
    def get_entity_sort_index(self, entity_id: str) -> int:
        """Get the sort index for an entity."""
        return self.entity_order.get(entity_id, 0)
    
    def has_saved_sort_index(self, entity_id: str) -> bool:
        """Check if entity has a saved sort index."""
        return entity_id in self.entity_order
    
    


# Global state manager instance
state_manager = StateManager()