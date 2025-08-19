"""
In-memory state manager for the BGCS system.
Manages entities, events, chat messages, and selected entities.
"""

import time
import uuid
import math
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
    
    def __init__(self, max_events: int = 1000, max_messages: int = 500):
        # Core state
        self.entities: Dict[str, Entity] = {}
        self.selected_entities: List[str] = []
        
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
        entity = entity_class(entity_id, position)
        
        # Set additional properties
        for key, value in kwargs.items():
            if hasattr(entity, key):
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
                        for entity_id, entity in self.entities.items()},
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


# Global state manager instance
state_manager = StateManager()