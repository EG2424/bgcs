"""
Base entity class for all entities in the BGCS system.
Provides common properties for position, physics, and state management.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import time
import uuid
import math

def safe_float(value: float) -> float:
    """Convert float to JSON-safe value, handling inf and NaN."""
    if math.isinf(value):
        return 1000000.0 if value > 0 else -1000000.0  # Large but finite values
    elif math.isnan(value):
        return 0.0
    return value


@dataclass
class Vector3:
    """3D vector for position, velocity, etc."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    
    def __add__(self, other: 'Vector3') -> 'Vector3':
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)
    
    def __sub__(self, other: 'Vector3') -> 'Vector3':
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)
    
    def __mul__(self, scalar: float) -> 'Vector3':
        return Vector3(self.x * scalar, self.y * scalar, self.z * scalar)
    
    def magnitude(self) -> float:
        """Calculate vector magnitude."""
        return (self.x ** 2 + self.y ** 2 + self.z ** 2) ** 0.5
    
    def normalize(self) -> 'Vector3':
        """Return normalized vector."""
        mag = self.magnitude()
        if mag == 0:
            return Vector3(0, 0, 0)
        return Vector3(self.x / mag, self.y / mag, self.z / mag)
    
    def distance_to(self, other: 'Vector3') -> float:
        """Calculate distance to another vector."""
        return (other - self).magnitude()


class Entity:
    """Base class for all entities in the simulation."""
    
    def __init__(self, entity_id: Optional[str] = None, position: Optional[Vector3] = None):
        # Identity
        self.id: str = entity_id or str(uuid.uuid4())
        self.entity_type: str = "entity"
        
        # Position & Kinematics
        self.position: Vector3 = position or Vector3(0, 0, 0)
        self.heading: float = 0.0  # radians
        self.velocity: Vector3 = Vector3(0, 0, 0)  # m/s
        
        # Physics Properties
        self.max_speed: float = 10.0  # m/s
        self.detection_radius: float = 100.0  # meters
        self.collision_radius: float = 5.0  # meters
        
        # State Flags
        self.health: float = 1.0  # 0.0 (destroyed) to 1.0 (full health)
        self.detected: bool = False  # Detected by friendly assets
        self.selected: bool = False  # Selected in GUI
        self.destroyed: bool = False  # Destroyed state
        
        # Control Data
        self.target_position: Vector3 = Vector3(0, 0, 0)  # 3D target position
        self.waypoints: List[Vector3] = []  # Waypoint queue
        self.current_mode: str = "idle"  # Current behavior mode
        
        # Timestamps
        self.created_time: float = time.time()
        self.last_update_time: float = time.time()
    
    def update(self, delta_time: float) -> None:
        """Update entity state. Override in subclasses."""
        self.last_update_time = time.time()
        
        # Basic physics update
        if not self.destroyed:
            # Apply velocity
            self.position = self.position + (self.velocity * delta_time)
            
            # Clamp velocity to max speed
            if self.velocity.magnitude() > self.max_speed:
                self.velocity = self.velocity.normalize() * self.max_speed
    
    def set_target_position(self, target: Vector3) -> None:
        """Set target position for movement."""
        self.target_position = target
    
    def add_waypoint(self, waypoint: Vector3) -> None:
        """Add waypoint to queue."""
        self.waypoints.append(waypoint)
    
    def clear_waypoints(self) -> None:
        """Clear all waypoints."""
        self.waypoints.clear()
    
    def get_next_waypoint(self) -> Optional[Vector3]:
        """Get next waypoint and remove it from queue."""
        if self.waypoints:
            return self.waypoints.pop(0)
        return None
    
    def distance_to(self, other: 'Entity') -> float:
        """Calculate distance to another entity."""
        return self.position.distance_to(other.position)
    
    def is_within_detection_range(self, other: 'Entity') -> bool:
        """Check if another entity is within detection range."""
        return self.distance_to(other) <= self.detection_radius
    
    def is_colliding_with(self, other: 'Entity') -> bool:
        """Check if colliding with another entity."""
        combined_radius = self.collision_radius + other.collision_radius
        return self.distance_to(other) <= combined_radius
    
    def take_damage(self, damage: float) -> None:
        """Apply damage to entity."""
        self.health = max(0.0, self.health - damage)
        if self.health <= 0.0:
            self.destroyed = True
    
    def heal(self, amount: float) -> None:
        """Heal entity."""
        if not self.destroyed:
            self.health = min(1.0, self.health + amount)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert entity to dictionary for serialization."""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "position": {"x": safe_float(self.position.x), "y": safe_float(self.position.y), "z": safe_float(self.position.z)},
            "heading": safe_float(self.heading),
            "velocity": {"x": safe_float(self.velocity.x), "y": safe_float(self.velocity.y), "z": safe_float(self.velocity.z)},
            "max_speed": safe_float(self.max_speed),
            "detection_radius": safe_float(self.detection_radius),
            "collision_radius": safe_float(self.collision_radius),
            "health": safe_float(self.health),
            "detected": self.detected,
            "selected": self.selected,
            "destroyed": self.destroyed,
            "target_position": {"x": safe_float(self.target_position.x), "y": safe_float(self.target_position.y), "z": safe_float(self.target_position.z)},
            "waypoints": [{"x": safe_float(wp.x), "y": safe_float(wp.y), "z": safe_float(wp.z)} for wp in self.waypoints],
            "current_mode": self.current_mode,
            "created_time": self.created_time,
            "last_update_time": self.last_update_time
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Entity':
        """Create entity from dictionary."""
        entity = cls(
            entity_id=data.get("id"),
            position=Vector3(**data.get("position", {}))
        )
        
        # Set properties
        entity.heading = data.get("heading", 0.0)
        entity.velocity = Vector3(**data.get("velocity", {}))
        entity.max_speed = data.get("max_speed", 10.0)
        entity.detection_radius = data.get("detection_radius", 100.0)
        entity.collision_radius = data.get("collision_radius", 5.0)
        entity.health = data.get("health", 1.0)
        entity.detected = data.get("detected", False)
        entity.selected = data.get("selected", False)
        entity.destroyed = data.get("destroyed", False)
        entity.target_position = Vector3(**data.get("target_position", {}))
        entity.current_mode = data.get("current_mode", "idle")
        entity.created_time = data.get("created_time", time.time())
        entity.last_update_time = data.get("last_update_time", time.time())
        
        # Set waypoints
        waypoints_data = data.get("waypoints", [])
        entity.waypoints = [Vector3(**wp) for wp in waypoints_data]
        
        return entity