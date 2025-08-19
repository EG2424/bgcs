"""
Drone entity with delta wing shape and combat behaviors.
Implements 6 behavior modes: Random Search, Follow Target, Follow Teammate, 
Waypoint Mode, Kamikaze, and Hold Position.
"""

import random
import math
from typing import Optional, Dict, Any, List
from .base import Entity, Vector3


class Drone(Entity):
    """
    Drone entity with delta wing shape and combat behaviors.
    
    Behavior Modes:
    - Random Search: Patrol random waypoints
    - Follow Target: Maintain distance from a specific target entity
    - Follow Teammate: Formation flying with another drone
    - Waypoint Mode: Navigate predefined patrol routes
    - Kamikaze: Active hunting mode with sacrificial attacks
    - Hold Position: Stationary defensive posture
    
    Visual States (Color Coding):
    - Green: Idle/searching
    - Yellow: Tracking target
    - Red: Engaging/kamikaze mode
    - Orange: Hunting for targets
    - Cyan: Kamikaze disabled
    - Grey: Destroyed
    """
    
    def __init__(self, entity_id: Optional[str] = None, position: Optional[Vector3] = None):
        super().__init__(entity_id, position)
        self.entity_type = "drone"
        
        # Drone-specific properties
        self.max_speed = 25.0  # m/s (higher than base)
        self.detection_radius = 150.0  # meters (better sensors)
        self.collision_radius = 3.0  # meters (smaller profile)
        
        # Behavior properties
        self.target_entity_id: Optional[str] = None  # Target to follow/attack
        self.teammate_entity_id: Optional[str] = None  # Teammate to follow
        self.follow_distance: float = 20.0  # meters
        self.kamikaze_enabled: bool = True
        self.hunting_range: float = 200.0  # meters
        
        # Movement properties
        self.turn_rate: float = math.pi  # radians/second
        self.approach_threshold: float = 5.0  # meters
        self.patrol_area_size: float = 100.0  # meters
        
        # State tracking
        self.last_random_target_time: float = 0.0
        self.random_target_interval: float = 10.0  # seconds
        self.engagement_range: float = 10.0  # meters for kamikaze
        
        # Valid behavior modes
        self.valid_modes = [
            "random_search",
            "follow_target", 
            "follow_teammate",
            "waypoint_mode",
            "kamikaze",
            "hold_position"
        ]
        
        self.current_mode = "random_search"  # Default mode
    
    def update(self, delta_time: float) -> None:
        """Update drone state based on current behavior mode."""
        super().update(delta_time)
        
        if self.destroyed:
            return
        
        # Execute behavior based on current mode
        if self.current_mode == "random_search":
            self._update_random_search(delta_time)
        elif self.current_mode == "follow_target":
            self._update_follow_target(delta_time)
        elif self.current_mode == "follow_teammate":
            self._update_follow_teammate(delta_time)
        elif self.current_mode == "waypoint_mode":
            self._update_waypoint_mode(delta_time)
        elif self.current_mode == "kamikaze":
            self._update_kamikaze(delta_time)
        elif self.current_mode == "hold_position":
            self._update_hold_position(delta_time)
    
    def _update_random_search(self, delta_time: float) -> None:
        """Random Search: Patrol random waypoints."""
        current_time = self.last_update_time
        
        # Check if we need a new random target
        if (current_time - self.last_random_target_time > self.random_target_interval or
            self._is_at_target()):
            
            # Generate random position within patrol area
            center = Vector3(0, 0, 50)  # Default patrol center
            angle = random.uniform(0, 2 * math.pi)
            distance = random.uniform(0, self.patrol_area_size)
            
            self.target_position = Vector3(
                center.x + distance * math.cos(angle),
                center.y + distance * math.sin(angle),
                random.uniform(30, 100)  # Random altitude
            )
            
            self.last_random_target_time = current_time
        
        self._move_towards_target(delta_time)
    
    def _update_follow_target(self, delta_time: float) -> None:
        """Follow Target: Maintain distance from a specific target entity."""
        if not self.target_entity_id:
            # No target, switch to random search
            self.set_mode("random_search")
            return
        
        # Note: In a full implementation, this would query the state manager
        # for the target entity. For now, we maintain position.
        self._move_towards_target(delta_time)
    
    def _update_follow_teammate(self, delta_time: float) -> None:
        """Follow Teammate: Formation flying with another drone."""
        if not self.teammate_entity_id:
            # No teammate, switch to random search
            self.set_mode("random_search")
            return
        
        # Note: In a full implementation, this would query the state manager
        # for the teammate entity and maintain formation.
        self._move_towards_target(delta_time)
    
    def _update_waypoint_mode(self, delta_time: float) -> None:
        """Waypoint Mode: Navigate predefined patrol routes."""
        if self._is_at_target():
            # Get next waypoint
            next_waypoint = self.get_next_waypoint()
            if next_waypoint:
                self.target_position = next_waypoint
            else:
                # No more waypoints, hold position
                self.set_mode("hold_position")
                return
        
        self._move_towards_target(delta_time)
    
    def _update_kamikaze(self, delta_time: float) -> None:
        """Kamikaze: Active hunting mode with sacrificial attacks."""
        if not self.kamikaze_enabled:
            self.set_mode("random_search")
            return
        
        if not self.target_entity_id:
            # Hunt mode - look for targets
            # Note: In full implementation, this would scan for enemy entities
            self._move_towards_target(delta_time)
        else:
            # Attack mode - engage target
            self._move_towards_target(delta_time)
            
            # Check if close enough to engage
            distance_to_target = self.position.distance_to(self.target_position)
            if distance_to_target <= self.engagement_range:
                # Kamikaze attack - destroy self and target
                self.take_damage(1.0)  # Destroy self
    
    def _update_hold_position(self, delta_time: float) -> None:
        """Hold Position: Stationary defensive posture."""
        # Maintain current position with small adjustments
        self.velocity = Vector3(0, 0, 0)
        
        # Small hover adjustments
        hover_amplitude = 2.0
        hover_frequency = 0.5
        time_offset = self.last_update_time * hover_frequency
        
        hover_x = hover_amplitude * math.sin(time_offset)
        hover_z = hover_amplitude * math.cos(time_offset * 0.7)
        
        self.velocity = Vector3(hover_x, 0, hover_z)
    
    def _move_towards_target(self, delta_time: float) -> None:
        """Move towards target position with realistic flight dynamics."""
        direction = self.target_position - self.position
        distance = direction.magnitude()
        
        if distance < self.approach_threshold:
            # Close enough, reduce speed
            self.velocity = self.velocity * 0.8
            return
        
        # Calculate desired direction
        if distance > 0:
            desired_direction = direction.normalize()
            
            # Update heading towards target
            target_heading = math.atan2(desired_direction.y, desired_direction.x)
            heading_diff = target_heading - self.heading
            
            # Normalize angle difference
            while heading_diff > math.pi:
                heading_diff -= 2 * math.pi
            while heading_diff < -math.pi:
                heading_diff += 2 * math.pi
            
            # Turn towards target
            max_turn = self.turn_rate * delta_time
            if abs(heading_diff) > max_turn:
                self.heading += max_turn if heading_diff > 0 else -max_turn
            else:
                self.heading = target_heading
            
            # Calculate velocity based on heading
            speed = min(self.max_speed, distance * 2)  # Slow down when close
            self.velocity = Vector3(
                speed * math.cos(self.heading),
                speed * math.sin(self.heading),
                desired_direction.z * speed * 0.5  # Slower vertical movement
            )
    
    def _is_at_target(self) -> bool:
        """Check if drone is at target position."""
        return self.position.distance_to(self.target_position) < self.approach_threshold
    
    def set_mode(self, mode: str) -> bool:
        """Set drone behavior mode."""
        if mode in self.valid_modes:
            self.current_mode = mode
            return True
        return False
    
    def set_target_entity(self, entity_id: str) -> None:
        """Set target entity for follow/attack behaviors."""
        self.target_entity_id = entity_id
    
    def set_teammate_entity(self, entity_id: str) -> None:
        """Set teammate entity for formation flying."""
        self.teammate_entity_id = entity_id
    
    def set_follow_distance(self, distance: float) -> None:
        """Set follow distance for formation/follow behaviors."""
        self.follow_distance = max(5.0, distance)
    
    def enable_kamikaze(self, enabled: bool) -> None:
        """Enable or disable kamikaze attacks."""
        self.kamikaze_enabled = enabled
        if not enabled and self.current_mode == "kamikaze":
            self.set_mode("random_search")
    
    def get_visual_state(self) -> str:
        """Get color coding for visual representation."""
        if self.destroyed:
            return "grey"
        elif self.current_mode == "kamikaze":
            return "red" if self.kamikaze_enabled else "cyan"
        elif self.current_mode == "follow_target" and self.target_entity_id:
            return "yellow"
        elif self.current_mode == "random_search":
            return "orange"
        else:
            return "green"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert drone to dictionary for serialization."""
        data = super().to_dict()
        data.update({
            "target_entity_id": self.target_entity_id,
            "teammate_entity_id": self.teammate_entity_id,
            "follow_distance": self.follow_distance,
            "kamikaze_enabled": self.kamikaze_enabled,
            "hunting_range": self.hunting_range,
            "turn_rate": self.turn_rate,
            "approach_threshold": self.approach_threshold,
            "patrol_area_size": self.patrol_area_size,
            "engagement_range": self.engagement_range,
            "valid_modes": self.valid_modes,
            "visual_state": self.get_visual_state()
        })
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Drone':
        """Create drone from dictionary."""
        drone = cls(
            entity_id=data.get("id"),
            position=Vector3(**data.get("position", {}))
        )
        
        # Set base properties
        base_data = {k: v for k, v in data.items() if k not in [
            "target_entity_id", "teammate_entity_id", "follow_distance", 
            "kamikaze_enabled", "hunting_range", "turn_rate", 
            "approach_threshold", "patrol_area_size", "engagement_range"
        ]}
        drone = Entity.from_dict(base_data)
        drone.__class__ = cls
        drone.entity_type = "drone"
        
        # Set drone-specific properties
        drone.target_entity_id = data.get("target_entity_id")
        drone.teammate_entity_id = data.get("teammate_entity_id")
        drone.follow_distance = data.get("follow_distance", 20.0)
        drone.kamikaze_enabled = data.get("kamikaze_enabled", True)
        drone.hunting_range = data.get("hunting_range", 200.0)
        drone.turn_rate = data.get("turn_rate", math.pi)
        drone.approach_threshold = data.get("approach_threshold", 5.0)
        drone.patrol_area_size = data.get("patrol_area_size", 100.0)
        drone.engagement_range = data.get("engagement_range", 10.0)
        
        return drone