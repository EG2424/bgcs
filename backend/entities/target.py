"""
Target entity (tank, car, infantry, SAM, ship, jammer, etc.) detectable by friendly assets.
May move and can be targeted by drones. Displayed in the GUI with state-aware visuals.
"""

import time
from typing import Optional, Dict, Any
from .base import Entity, Vector3, safe_float


class Target(Entity):
    """
    Generic target (tank, car, infantry, SAM, ship, jammer, etc.) detectable by friendly assets.
    May move and can be targeted by drones. Displayed in the GUI with state-aware visuals.
    
    Target Behaviors:
    - Waypoint Mode: Patrol routes (mobile targets supported, controllable only in simulation/training mode)
    - Hold Position: Defensive stationary posture (controllable only in simulation/training mode)
    
    Visual States (GUI):
    - Red: Not detected by friendly assets
    - Blue: Detected/discovered by friendly assets (shown in GUI)
    - Amber chevrons: Moving state indicator (animated overlay, observation in real ops; simulated in training/demo)
    - Magenta outline/reticle: Targeted by one or more drones
    - Grey: Destroyed
    - Black "X": Destruction marker overlay
    """
    
    def __init__(self, entity_id: Optional[str] = None, position: Optional[Vector3] = None):
        super().__init__(entity_id, position)
        self.entity_type = "target"
        
        # Target-specific properties
        self.max_speed = 15.0  # m/s (typical ground vehicle)
        self.detection_radius = 50.0  # meters (limited sensors)
        self.collision_radius = 4.0  # meters (vehicle size)
        
        # Observation-based properties (GCS doesn't control enemy speed)
        self.observed_velocity: Vector3 = Vector3(0, 0, 0)  # m/s (estimated)
        self.last_seen_time: float = 0.0  # timestamp (sec)
        self.confidence: float = 0.0  # 0..1 classification confidence
        
        # Classification / Role
        self.role: str = "unknown"  # e.g., tank, car, infantry, SAM, ship, jammer
        self.affiliation: str = "hostile"  # hostile | neutral | friendly
        
        # GUI Flags (drive rendering only)
        self.is_moving: bool = False  # show moving chevrons when True
        self.is_targeted: bool = False  # show targeting reticle when True
        
        # Movement properties for simulation/training mode
        self.patrol_speed: float = 5.0  # m/s when patrolling
        self.turn_rate: float = 1.0  # radians/second (slower than drones)
        self.approach_threshold: float = 10.0  # meters
        
        # Movement state
        self._last_micro_movement = time.time()
        self._patrol_waypoint_timer = 0.0
        self._patrol_waypoint_interval = 30.0  # Change direction every 30 seconds
        
        # Valid behavior modes (only in simulation/training)
        self.valid_modes = [
            "waypoint_mode",
            "hold_position"
        ]
        
        self.current_mode = "hold_position"  # Default mode
        
        # Detection state
        self.detection_time: float = 0.0  # When first detected
        self.detection_count: int = 0  # Number of times detected
    
    def update(self, delta_time: float) -> None:
        """Update target state based on current behavior mode."""
        super().update(delta_time)
        
        # Enforce ground level constraint - targets stay at ground level (y=0)
        if self.position.y != 0:
            self.position.y = 0
            self.velocity.y = 0  # No vertical movement for ground vehicles
        
        if self.destroyed:
            return
        
        # Update movement flags
        self.is_moving = self.velocity.magnitude() > 0.1
        
        # Update last seen time if detected
        if self.detected:
            self.last_seen_time = self.last_update_time
        
        # Execute behavior based on current mode (simulation/training only)
        if self.current_mode == "waypoint_mode":
            self._update_waypoint_mode(delta_time)
        elif self.current_mode == "hold_position":
            self._update_hold_position(delta_time)
    
    def _update_waypoint_mode(self, delta_time: float) -> None:
        """Waypoint Mode: Patrol routes (simulation/training mode only)."""
        self._patrol_waypoint_timer += delta_time
        
        if self._is_at_target() or self._patrol_waypoint_timer >= self._patrol_waypoint_interval:
            # Get next waypoint or generate random patrol point
            next_waypoint = self.get_next_waypoint()
            if next_waypoint:
                self.target_position = next_waypoint
            else:
                # Generate random waypoint near current position
                import random
                import math
                angle = random.uniform(0, 2 * math.pi)
                distance = random.uniform(20, 100)  # 20-100m patrol range
                
                self.target_position = Vector3(
                    self.position.x + distance * math.cos(angle),
                    self.position.y + distance * math.sin(angle),
                    0  # Ground level
                )
            
            self._patrol_waypoint_timer = 0.0
        
        self._move_towards_target(delta_time)
    
    def _update_hold_position(self, delta_time: float) -> None:
        """Hold Position: Defensive stationary posture."""
        # Stop movement
        self.velocity = Vector3(0, 0, 0)
        
        # Small random movement for realism every 30 seconds
        current_time = time.time()
        if current_time - self._last_micro_movement > 30.0:
            import random
            # Small random adjustment (1-3 meters) - stay on ground
            self.target_position = Vector3(
                self.position.x + random.uniform(-3, 3),
                0,  # Keep targets at ground level
                self.position.z + random.uniform(-3, 3)
            )
            self._last_micro_movement = current_time
            
            # Occasionally rotate (change heading)
            if random.random() < 0.3:  # 30% chance
                self.heading += random.uniform(-0.5, 0.5)  # Small rotation
    
    def _move_towards_target(self, delta_time: float) -> None:
        """Move towards target position with ground vehicle dynamics."""
        direction = self.target_position - self.position
        distance = direction.magnitude()
        
        if distance < self.approach_threshold:
            # Close enough, stop
            self.velocity = Vector3(0, 0, 0)
            return
        
        # Calculate desired direction (ground movement only)
        if distance > 0:
            desired_direction = direction.normalize()
            
            # Ground vehicles move in 2D
            desired_direction.z = 0
            
            # Update heading towards target
            import math
            target_heading = math.atan2(desired_direction.y, desired_direction.x)
            heading_diff = target_heading - self.heading
            
            # Normalize angle difference
            while heading_diff > math.pi:
                heading_diff -= 2 * math.pi
            while heading_diff < -math.pi:
                heading_diff += 2 * math.pi
            
            # Turn towards target (slower than drones)
            max_turn = self.turn_rate * delta_time
            if abs(heading_diff) > max_turn:
                self.heading += max_turn if heading_diff > 0 else -max_turn
            else:
                self.heading = target_heading
            
            # Calculate velocity based on heading
            speed = min(self.patrol_speed, distance)
            self.velocity = Vector3(
                speed * math.cos(self.heading),
                speed * math.sin(self.heading),
                0  # Ground level
            )
    
    def _is_at_target(self) -> bool:
        """Check if target is at target position."""
        return self.position.distance_to(self.target_position) < self.approach_threshold
    
    def set_mode(self, mode: str) -> bool:
        """Set target behavior mode (simulation/training only)."""
        if mode in self.valid_modes:
            self.current_mode = mode
            return True
        return False
    
    def mark_detected(self, detector_id: str, confidence: float = 1.0) -> None:
        """Mark target as detected by friendly asset."""
        if not self.detected:
            self.detection_time = time.time()
            self.detection_count = 1
        else:
            self.detection_count += 1
        
        self.detected = True
        self.confidence = max(self.confidence, confidence)
        self.last_seen_time = time.time()
    
    def mark_targeted(self, targeted: bool = True) -> None:
        """Mark target as being targeted by drones."""
        self.is_targeted = targeted
    
    def set_role(self, role: str) -> None:
        """Set target role/classification."""
        valid_roles = [
            "unknown", "tank", "car", "infantry", "SAM", 
            "ship", "jammer", "building", "bunker"
        ]
        if role in valid_roles:
            self.role = role
    
    def set_affiliation(self, affiliation: str) -> None:
        """Set target affiliation."""
        valid_affiliations = ["hostile", "neutral", "friendly", "unknown"]
        if affiliation in valid_affiliations:
            self.affiliation = affiliation
    
    def update_observed_velocity(self, velocity: Vector3) -> None:
        """Update observed velocity (from external sensors)."""
        self.observed_velocity = velocity
        self.is_moving = velocity.magnitude() > 0.1
    
    def get_visual_state(self) -> str:
        """Get color coding for visual representation."""
        if self.destroyed:
            return "grey"
        elif not self.detected:
            return "red"  # Not detected by friendly assets
        elif self.is_targeted:
            return "magenta"  # Targeted by drones
        else:
            return "blue"  # Detected/discovered
    
    def get_time_since_detection(self) -> float:
        """Get time since last detection in seconds."""
        if self.last_seen_time == 0:
            return float('inf')
        return time.time() - self.last_seen_time
    
    def is_stale_detection(self, threshold: float = 60.0) -> bool:
        """Check if detection is stale (older than threshold seconds)."""
        return self.get_time_since_detection() > threshold
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert target to dictionary for serialization."""
        data = super().to_dict()
        data.update({
            "observed_velocity": {
                "x": safe_float(self.observed_velocity.x),
                "y": safe_float(self.observed_velocity.y), 
                "z": safe_float(self.observed_velocity.z)
            },
            "last_seen_time": safe_float(self.last_seen_time),
            "confidence": safe_float(self.confidence),
            "role": self.role,
            "affiliation": self.affiliation,
            "is_moving": self.is_moving,
            "is_targeted": self.is_targeted,
            "patrol_speed": safe_float(self.patrol_speed),
            "turn_rate": safe_float(self.turn_rate),
            "approach_threshold": safe_float(self.approach_threshold),
            "detection_time": safe_float(self.detection_time),
            "detection_count": self.detection_count,
            "visual_state": self.get_visual_state(),
            "time_since_detection": self.get_time_since_detection(),
            "is_stale_detection": self.is_stale_detection()
        })
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Target':
        """Create target from dictionary."""
        target = cls(
            entity_id=data.get("id"),
            position=Vector3(**data.get("position", {}))
        )
        
        # Set base properties
        base_data = {k: v for k, v in data.items() if k not in [
            "observed_velocity", "last_seen_time", "confidence", "role", 
            "affiliation", "is_moving", "is_targeted", "patrol_speed",
            "turn_rate", "approach_threshold", "detection_time", "detection_count"
        ]}
        target = Entity.from_dict(base_data)
        target.__class__ = cls
        target.entity_type = "target"
        
        # Set target-specific properties
        observed_vel_data = data.get("observed_velocity", {})
        target.observed_velocity = Vector3(**observed_vel_data)
        target.last_seen_time = data.get("last_seen_time", 0.0)
        target.confidence = data.get("confidence", 0.0)
        target.role = data.get("role", "unknown")
        target.affiliation = data.get("affiliation", "hostile")
        target.is_moving = data.get("is_moving", False)
        target.is_targeted = data.get("is_targeted", False)
        target.patrol_speed = data.get("patrol_speed", 5.0)
        target.turn_rate = data.get("turn_rate", 1.0)
        target.approach_threshold = data.get("approach_threshold", 10.0)
        target.detection_time = data.get("detection_time", 0.0)
        target.detection_count = data.get("detection_count", 0)
        
        return target