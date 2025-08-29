"""
Simulation engine for BGCS with fixed timestep physics.
Provides 60 FPS simulation loop with entity management and performance tracking.
"""

import asyncio
import time
import logging
import math
import random
from typing import Dict, List, Optional, Set
from ..state.manager import StateManager
from ..entities.base import Entity, Vector3
from ..entities.drone import Drone
from ..entities.target import Target

logger = logging.getLogger(__name__)


class SimulationEngine:
    """
    Core simulation engine with fixed timestep physics.
    
    Features:
    - Fixed 60 FPS timestep with configurable speed multiplier
    - Entity spawning, updating, and destruction with validation
    - Performance tracking with FPS monitoring
    - Detection system for entity interactions
    - Event-driven architecture for state changes
    """
    
    def __init__(self, state_manager: StateManager):
        self.state_manager = state_manager
        
        # Simulation timing  
        self.target_fps = 60.0  # Restored to 60 FPS for smoother movement
        self.fixed_timestep = 1.0 / self.target_fps  # 16.67ms
        self.speed_multiplier = 1.0
        self.max_frame_time = 0.05  # 50ms max to prevent spiral of death
        
        # Simulation state
        self.running = False
        self.paused = False
        self.simulation_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.frame_count = 0
        self.last_fps_time = 0.0
        self.current_fps = 0.0
        self.frame_times: List[float] = []
        self.max_frame_times = 60  # Keep last 60 frame times
        
        # Entity management
        self.spawn_queue: List[Dict] = []
        self.destroy_queue: Set[str] = set()
        
        # Detection system
        self.detection_range_default = 100.0
        self.last_detection_check = 0.0
        self.detection_check_interval = 0.1  # Check every 100ms
        
        logger.info("Simulation engine initialized")
    
    async def start(self) -> bool:
        """Start the simulation loop."""
        if self.running:
            logger.warning("Simulation already running")
            return False
        
        self.running = True
        self.paused = False
        self.frame_count = 0
        self.last_fps_time = time.time()
        self.frame_times.clear()
        
        # Start the simulation task
        self.simulation_task = asyncio.create_task(self._simulation_loop())
        
        self.state_manager.start_simulation()
        logger.info("Simulation started")
        return True
    
    async def stop(self) -> bool:
        """Stop the simulation loop."""
        if not self.running:
            logger.warning("Simulation not running")
            return False
        
        self.running = False
        
        if self.simulation_task:
            self.simulation_task.cancel()
            try:
                await self.simulation_task
            except asyncio.CancelledError:
                pass
            self.simulation_task = None
        
        self.state_manager.stop_simulation()
        logger.info("Simulation stopped")
        return True
    
    def pause(self) -> None:
        """Pause the simulation."""
        self.paused = True
        logger.info("Simulation paused")
    
    def resume(self) -> None:
        """Resume the simulation."""
        self.paused = False
        logger.info("Simulation resumed")
    
    def set_speed_multiplier(self, multiplier: float) -> None:
        """Set simulation speed multiplier."""
        self.speed_multiplier = max(0.1, min(10.0, multiplier))
        self.state_manager.set_simulation_speed(self.speed_multiplier)
        logger.info(f"Simulation speed set to {self.speed_multiplier}x")
    
    async def _simulation_loop(self) -> None:
        """Main simulation loop with fixed timestep."""
        accumulator = 0.0
        current_time = time.time()
        
        try:
            while self.running:
                frame_start = time.time()
                new_time = frame_start
                frame_time = new_time - current_time
                
                # Prevent spiral of death
                if frame_time > self.max_frame_time:
                    frame_time = self.max_frame_time
                
                current_time = new_time
                accumulator += frame_time
                
                # Fixed timestep updates
                effective_timestep = self.fixed_timestep * self.speed_multiplier
                
                while accumulator >= effective_timestep:
                    if not self.paused:
                        await self._update_simulation(effective_timestep)
                    accumulator -= effective_timestep
                
                # Performance tracking
                self._update_performance_metrics(frame_start)
                
                # Sleep to maintain target FPS
                frame_duration = time.time() - frame_start
                sleep_time = self.fixed_timestep - frame_duration
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                
        except asyncio.CancelledError:
            logger.info("Simulation loop cancelled")
        except Exception as e:
            logger.error(f"Simulation loop error: {e}")
            self.running = False
    
    async def _update_simulation(self, delta_time: float) -> None:
        """Update simulation state for one timestep."""
        # Process spawn queue
        await self._process_spawn_queue()
        
        # Update all entities
        self._update_entities(delta_time)
        
        # Process detection system
        self._update_detection_system()
        
        # Process destroy queue
        self._process_destroy_queue()
        
        # Update state manager
        self.state_manager.update_simulation(delta_time)
        
        self.frame_count += 1
    
    async def _process_spawn_queue(self) -> None:
        """Process entity spawn requests."""
        while self.spawn_queue:
            spawn_data = self.spawn_queue.pop(0)
            entity_type = spawn_data.get("type")
            entity_id = spawn_data.get("id")
            position = spawn_data.get("position", Vector3(0, 0, 0))
            properties = spawn_data.get("properties", {})
            
            # Create entity
            entity = self.state_manager.create_entity(
                entity_type, entity_id, position, **properties
            )
            
            if entity:
                self.state_manager.log_event("entity_spawned", entity.id, {
                    "type": entity_type,
                    "position": {"x": position.x, "y": position.y, "z": position.z}
                })
                logger.debug(f"Spawned {entity_type} with ID {entity.id}")
    
    def _update_entities(self, delta_time: float) -> None:
        """Update all entities."""
        for entity in list(self.state_manager.entities.values()):
            if not entity.destroyed:
                entity.update(delta_time)
                
                # Check for out-of-bounds entities
                if self._is_entity_out_of_bounds(entity):
                    self._handle_out_of_bounds_entity(entity)
    
    def _update_detection_system(self) -> None:
        """Update entity detection system."""
        current_time = time.time()
        
        # Only check detection periodically for performance
        if current_time - self.last_detection_check < self.detection_check_interval:
            return
        
        self.last_detection_check = current_time
        
        # Get all drones and targets
        drones = self.state_manager.get_entities_by_type("drone")
        targets = self.state_manager.get_entities_by_type("target")
        
        # Check drone detection of targets
        for drone in drones:
            if drone.destroyed:
                continue
                
            for target in targets:
                if target.destroyed:
                    continue
                
                distance = drone.distance_to(target)
                if distance <= drone.detection_radius:
                    # Target detected
                    if not target.detected:
                        target.mark_detected(drone.id, confidence=0.8)
                        self.state_manager.log_event("target_detected", target.id, {
                            "detector": drone.id,
                            "distance": distance,
                            "confidence": 0.8
                        })
                        logger.debug(f"Drone {drone.id} detected target {target.id}")
                    
                    # Target detected but don't automatically change drone behavior
                    # Drones will maintain their current mode and won't auto-switch to follow_target
    
    def _process_destroy_queue(self) -> None:
        """Process entity destruction requests."""
        for entity_id in list(self.destroy_queue):
            if self.state_manager.remove_entity(entity_id):
                logger.debug(f"Destroyed entity {entity_id}")
            self.destroy_queue.remove(entity_id)
    
    def _is_entity_out_of_bounds(self, entity: Entity) -> bool:
        """Check if entity is out of simulation bounds."""
        bounds = 1000.0  # 1km boundary
        pos = entity.position
        return (abs(pos.x) > bounds or abs(pos.y) > bounds or 
                pos.z < -10 or pos.z > 500)
    
    def _handle_out_of_bounds_entity(self, entity: Entity) -> None:
        """Handle entity that went out of bounds."""
        if isinstance(entity, Drone):
            # Return drones to center without changing their mode
            entity.set_target_position(Vector3(0, 0, 50))
            # Don't force waypoint_mode - preserve user-set mode
        elif isinstance(entity, Target):
            # Return targets to center area instead of destroying them
            entity.set_target_position(Vector3(
                random.uniform(-50, 50), 
                0,  # Ground level
                random.uniform(-50, 50)
            ))
        
        logger.debug(f"Entity {entity.id} went out of bounds")
    
    def _update_performance_metrics(self, frame_start: float) -> None:
        """Update performance tracking metrics."""
        frame_time = time.time() - frame_start
        self.frame_times.append(frame_time)
        
        # Keep only recent frame times
        if len(self.frame_times) > self.max_frame_times:
            self.frame_times.pop(0)
        
        # Update FPS every second
        current_time = time.time()
        if current_time - self.last_fps_time >= 1.0:
            self.current_fps = self.frame_count
            self.frame_count = 0
            self.last_fps_time = current_time
            
            # Update state manager FPS
            self.state_manager.fps = self.current_fps
    
    # Public API methods
    
    def spawn_entity(self, entity_type: str, entity_id: Optional[str] = None, 
                    position: Optional[Vector3] = None, **properties) -> bool:
        """Queue entity for spawning."""
        if entity_type not in ["drone", "target", "entity"]:
            logger.warning(f"Invalid entity type: {entity_type}")
            return False
        
        spawn_data = {
            "type": entity_type,
            "id": entity_id,
            "position": position or Vector3(0, 0, 0),
            "properties": properties
        }
        
        self.spawn_queue.append(spawn_data)
        return True
    
    def destroy_entity(self, entity_id: str) -> bool:
        """Queue entity for destruction."""
        if entity_id in self.state_manager.entities:
            self.destroy_queue.add(entity_id)
            return True
        return False
    
    def spawn_test_scenario(self, num_drones: int = 10, num_targets: int = 5) -> None:
        """Spawn a test scenario with drones and targets."""
        import random
        
        # Clean up any empty groups (removes groups with no valid entity members)
        self.state_manager.cleanup_empty_groups()
        
        # Helper function to generate short random IDs
        def generate_short_id():
            import string
            chars = string.ascii_uppercase + string.digits
            return ''.join(random.choice(chars) for _ in range(3))
        
        # Spawn drones in a circle around origin (closer to center)
        for i in range(num_drones):
            angle = (2 * 3.14159 * i) / num_drones
            radius = 50 + random.uniform(-20, 20)  # Much closer to center (30-70m radius)
            x = radius * math.cos(angle)  # East-West
            y = random.uniform(50, 80)  # Altitude (50-80m above ground)
            z = radius * math.sin(angle)  # North-South
            
            self.spawn_entity(
                "drone",
                f"drone-{generate_short_id()}",
                Vector3(x, y, z),
                current_mode="random_search"
            )
        
        # Spawn targets randomly (closer to center)
        for i in range(num_targets):
            x = random.uniform(-80, 80)  # East-West (-80 to +80m)
            y = 0  # Ground level (Y is up/down in 3D space)
            z = random.uniform(-80, 80)  # North-South (-80 to +80m)
            
            roles = ["tank", "car", "infantry", "SAM"]
            role = random.choice(roles)
            
            self.spawn_entity(
                "target",
                f"target-{generate_short_id()}",
                Vector3(x, y, z),
                role=role,
                current_mode="hold_position"
            )
        
        logger.info(f"Spawned test scenario: {num_drones} drones, {num_targets} targets")
    
    def get_performance_stats(self) -> Dict[str, float]:
        """Get current performance statistics."""
        avg_frame_time = sum(self.frame_times) / len(self.frame_times) if self.frame_times else 0
        max_frame_time = max(self.frame_times) if self.frame_times else 0
        
        return {
            "fps": self.current_fps,
            "target_fps": self.target_fps,
            "speed_multiplier": self.speed_multiplier,
            "entity_count": len(self.state_manager.entities),
            "avg_frame_time": avg_frame_time * 1000,  # Convert to ms
            "max_frame_time": max_frame_time * 1000,  # Convert to ms
            "running": self.running,
            "paused": self.paused
        }


