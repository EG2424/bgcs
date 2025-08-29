# BGCS WebSocket Architecture & ROS2 Integration Guide

## Current Architecture Overview

### System Components

The BGCS (UAV Ground Control Station) system consists of three main layers:

1. **Frontend (React/Three.js)** - Web-based UI with 3D visualization
2. **Backend API (FastAPI)** - WebSocket + REST API server
3. **Simulation Engine** - Entity management and physics simulation

---

## Current WebSocket Communication Flow

### 1. Connection Establishment

**Frontend → Backend:**
```javascript
// WebSocket connection to ws://localhost:8000/ws
websocket = new WebSocket(url);
```

**Backend Response:**
```json
{
  "type": "connection_established",
  "data": {
    "client_id": "client_1",
    "server_time": "2025-08-26T12:00:00Z",
    "simulation_running": true
  }
}
```

### 2. Real-time State Updates (20 FPS)

**Backend → Frontend (Broadcast):**
```json
{
  "type": "state_update",
  "data": {
    "entities": {
      "drone-1": {
        "id": "drone-1",
        "entity_type": "drone",
        "position": {"x": 45.2, "y": 25.0, "z": -12.8},
        "velocity": {"x": 2.1, "y": 0.0, "z": 1.5},
        "rotation": {"x": 0.0, "y": 1.57, "z": 0.0},
        "current_mode": "random_search",
        "selected": false,
        "destroyed": false,
        "detection_radius": 50.0
      }
    },
    "selected_entities": ["drone-1"],
    "simulation_running": true,
    "fps": 60.0,
    "stats": {
      "entities_created": 8,
      "entities_destroyed": 0
    }
  }
}
```

### 3. Command Messages

**Frontend → Backend:**

#### Spawn New Drone
```json
{
  "type": "spawn_entity",
  "data": {
    "type": "drone",
    "id": "drone-new",
    "position": {"x": 100, "y": 50, "z": 0},
    "properties": {
      "current_mode": "random_search",
      "detection_radius": 75.0
    }
  }
}
```

#### Update Drone Mode
```json
{
  "type": "set_entity_mode",
  "data": {
    "entity_id": "drone-1",
    "mode": "follow_target"
  }
}
```

#### Set Waypoint Path
```json
{
  "type": "set_entity_path",
  "data": {
    "entity_id": "drone-1",
    "path": [
      {"x": 100, "y": 50, "z": 0},
      {"x": 200, "y": 50, "z": 100}
    ],
    "replace": true
  }
}
```

#### Delete Entity
```json
{
  "type": "delete_entity",
  "data": {
    "entity_id": "drone-1"
  }
}
```

---

## Backend Architecture Deep Dive

### Simulation Engine (`backend/simulation/engine.py`)

**Key Responsibilities:**
- **60 FPS Fixed Timestep Loop** - Maintains consistent physics updates
- **Entity Lifecycle Management** - Spawn/update/destroy entities
- **Physics Updates** - Position, velocity, collision detection
- **Detection System** - Drone-target detection within radius
- **Performance Monitoring** - FPS tracking, frame timing

**Core Update Loop:**
```python
async def _update_simulation(self, delta_time: float):
    # Process spawn queue (new entities)
    await self._process_spawn_queue()
    
    # Update all entities (physics, AI, movement)
    self._update_entities(delta_time)
    
    # Process detection system (drone→target detection)
    self._update_detection_system()
    
    # Process destroy queue (entity removal)
    self._process_destroy_queue()
    
    # Update state manager (broadcast state changes)
    self.state_manager.update_simulation(delta_time)
```

### WebSocket Manager (`backend/api/websocket.py`)

**Key Features:**
- **Connection Management** - Multiple client support
- **Message Routing** - 12+ message types with handlers
- **State Broadcasting** - 20 FPS state updates to all clients
- **Command Processing** - Spawn, control, delete operations
- **Error Handling** - Validation and error responses

**Message Handlers:**
```python
self.message_handlers = {
    "ping": self._handle_ping,
    "get_state": self._handle_get_state,
    "spawn_entity": self._handle_spawn_entity,
    "set_entity_mode": self._handle_set_entity_mode,
    "set_entity_path": self._handle_set_entity_path,
    "delete_entity": self._handle_delete_entity,
    "select_entity": self._handle_select_entity,
    "simulation_control": self._handle_simulation_control,
    # ... more handlers
}
```

### State Manager (`backend/state/manager.py`)

**Core Responsibilities:**
- **Entity Storage** - `Dict[str, Entity]` with all active entities
- **Event Logging** - Circular buffer of simulation events
- **Selection Management** - Multi-entity selection state
- **State Serialization** - Convert entities to JSON for WebSocket

---

## Frontend Architecture Deep Dive

### WebSocket Client (`frontend/js/network/websocket.js`)

**Key Features:**
- **Auto-reconnection** - Exponential backoff on connection loss
- **Message Handling** - Type-based message routing
- **Performance Tracking** - Latency monitoring, ping/pong
- **Error Recovery** - JSON parsing error handling

### Entity Manager (`frontend/js/entities/manager.js`)

**State Synchronization:**
- **Real-time Updates** - Processes 20 FPS state updates from backend
- **Interpolation** - Smooth movement between update frames
- **Selection Management** - Client-side selection state
- **Performance Optimization** - Efficient entity updates

### 3D Renderer Integration

**Entity Visualization:**
```javascript
// Update entity position in 3D scene
entity.position.copy(new THREE.Vector3(
    entityData.position.x,
    entityData.position.y, 
    entityData.position.z
));

// Update entity rotation
entity.rotation.copy(new THREE.Euler(
    entityData.rotation.x,
    entityData.rotation.y,
    entityData.rotation.z
));
```

---

# ROS2 Integration Strategy

## Option 1: Replace Simulation Engine (Recommended)

### Architecture Overview

```
[Frontend UI]
     ↕️ WebSocket (20 FPS)
[Backend API Layer]
     ↕️ ROS2 Bridge
[ROS2 Ecosystem]
├── 🚁 Real Drones (via ROS2 nodes)
├── 🎯 Target Detection
├── 🗺️ SLAM/Navigation
└── 📊 Mission Planning
```

### Implementation Steps

#### 1. Create ROS2 Bridge Module

**New File:** `backend/ros2_bridge/bridge.py`
```python
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped
from sensor_msgs.msg import NavSatFix
from custom_msgs.msg import DroneStatus, MissionCommand

class BGCSROS2Bridge(Node):
    def __init__(self, state_manager):
        super().__init__('bgcs_bridge')
        self.state_manager = state_manager
        
        # Publishers for drone commands
        self.cmd_publishers = {}  # drone_id → cmd_vel publisher
        
        # Subscribers for drone telemetry
        self.status_subscribers = {}  # drone_id → status subscriber
        
        # Mission coordination
        self.mission_pub = self.create_publisher(MissionCommand, '/mission/command', 10)
        
    def spawn_drone_connection(self, drone_id: str):
        """Create ROS2 pub/sub for new drone"""
        # Command publisher (BGCS → Drone)
        cmd_topic = f'/drone/{drone_id}/cmd_vel'
        self.cmd_publishers[drone_id] = self.create_publisher(Twist, cmd_topic, 10)
        
        # Status subscriber (Drone → BGCS)
        status_topic = f'/drone/{drone_id}/status'
        self.status_subscribers[drone_id] = self.create_subscription(
            DroneStatus, status_topic, 
            lambda msg, id=drone_id: self.handle_drone_status(id, msg), 10)
    
    def handle_drone_status(self, drone_id: str, status_msg: DroneStatus):
        """Process incoming drone telemetry"""
        # Update entity position from real drone
        entity = self.state_manager.get_entity(drone_id)
        if entity:
            entity.position = Vector3(
                status_msg.position.x,
                status_msg.position.y, 
                status_msg.position.z
            )
            entity.battery_level = status_msg.battery_percentage
            entity.mission_status = status_msg.mission_status
```

#### 2. Replace Simulation Engine

**Modified:** `backend/main.py`
```python
# Replace simulation engine with ROS2 bridge
# simulation_engine = SimulationEngine(state_manager)
ros2_bridge = BGCSROS2Bridge(state_manager)

@app.on_event("startup")
async def startup_event():
    # Initialize ROS2 instead of simulation
    rclpy.init()
    
    # Start ROS2 spinning in background thread
    executor = rclpy.executors.MultiThreadedExecutor()
    executor.add_node(ros2_bridge)
    ros2_thread = threading.Thread(target=executor.spin, daemon=True)
    ros2_thread.start()
```

#### 3. Update WebSocket Handlers

**Modified:** `backend/api/websocket.py`
```python
async def _handle_spawn_entity(self, client_id: str, data: Dict[str, Any]):
    """Handle drone connection request"""
    drone_id = data.get("id")
    
    # Create entity in state manager
    entity = state_manager.create_entity("drone", drone_id, position)
    
    # Create ROS2 connection for real drone
    ros2_bridge.spawn_drone_connection(drone_id)
    
    return {"type": "command_success", "data": {"message": f"Connected to drone {drone_id}"}}

async def _handle_set_entity_mode(self, client_id: str, data: Dict[str, Any]):
    """Send mission command to real drone"""
    drone_id = data.get("entity_id")
    mode = data.get("mode")
    
    # Send ROS2 command
    mission_cmd = MissionCommand()
    mission_cmd.drone_id = drone_id
    mission_cmd.command = mode  # "takeoff", "land", "waypoint_mode", etc.
    ros2_bridge.mission_pub.publish(mission_cmd)
    
    return {"type": "command_success", "data": {"message": f"Mission sent to {drone_id}"}}
```

### ROS2 Topics and Messages

#### Custom Message Types

**`custom_msgs/msg/DroneStatus.msg`**
```
# Drone telemetry message
string drone_id
geometry_msgs/Point position
geometry_msgs/Vector3 velocity  
float32 battery_percentage
string mission_status           # "idle", "flying", "landing", etc.
sensor_msgs/NavSatFix gps_position
bool emergency_status
```

**`custom_msgs/msg/MissionCommand.msg`**
```
# Mission command from BGCS
string drone_id
string command                  # "takeoff", "land", "waypoint_mode", "hold_position"
geometry_msgs/Point[] waypoints # For waypoint missions
float32 altitude               # Target altitude
float32 speed                  # Target speed
```

#### Topic Structure

```
📡 ROS2 Topics:
├── /drone/{drone_id}/cmd_vel          → Twist (movement commands)
├── /drone/{drone_id}/status           → DroneStatus (telemetry)
├── /drone/{drone_id}/gps              → NavSatFix (GPS position)
├── /mission/command                   → MissionCommand (mission control)
├── /target/detected                   → DetectedTarget (target info)
└── /system/heartbeat                  → SystemStatus (health monitoring)
```

### Real-time Data Flow

#### 1. Drone Position Updates
```
🚁 Real Drone → ROS2 /drone/status → Bridge → StateManager → WebSocket → 🖥️ Frontend UI
```

#### 2. Mission Commands  
```
🖥️ Frontend UI → WebSocket → Bridge → ROS2 /mission/command → 🚁 Real Drone
```

#### 3. Waypoint Navigation
```
👆 User clicks map → Frontend → WebSocket spawn_entity → Bridge → ROS2 waypoint mission → 🚁 Drone flies
```

---

## Option 2: Hybrid Simulation + Real Drones

### Architecture

```
[Frontend UI]
     ↕️ WebSocket
[Backend API]
├── 🎮 Simulation Engine (simulated entities)
└── 🌉 ROS2 Bridge (real drones)
```

**Use Cases:**
- **Training Mode** - Practice with simulated drones
- **Mixed Operations** - Some real drones + some simulated targets
- **Development** - Test UI without real hardware

---

## Implementation Timeline

### Phase 1: Foundation (1-2 weeks)
- [ ] Set up ROS2 workspace and custom messages
- [ ] Create basic ROS2 bridge module
- [ ] Test WebSocket → ROS2 command flow

### Phase 2: Core Integration (2-3 weeks)  
- [ ] Replace spawn/delete with ROS2 connection management
- [ ] Implement real-time telemetry processing
- [ ] Update frontend to handle real drone data

### Phase 3: Advanced Features (2-4 weeks)
- [ ] Mission planning integration
- [ ] Multi-drone coordination
- [ ] Target detection from real sensors
- [ ] Emergency handling and failsafes

### Phase 4: Production Ready (1-2 weeks)
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] Security and authentication
- [ ] Comprehensive testing

---

## Benefits of This Architecture

### ✅ **Minimal Frontend Changes**
- WebSocket protocol stays the same
- UI components unchanged
- Same 3D visualization system

### ✅ **Real-time Performance**
- Maintains 20 FPS state updates
- Low-latency command transmission
- Efficient ROS2 pub/sub pattern

### ✅ **Scalability**
- Easy to add new drones (just new ROS2 topics)
- Supports mixed real/simulated entities
- Modular ROS2 integration

### ✅ **ROS2 Ecosystem Integration**
- Compatible with existing ROS2 packages
- Standard navigation and SLAM integration  
- Community-supported drone frameworks

---

## Next Steps

1. **Choose Integration Approach** - Full replacement vs. hybrid
2. **Set Up ROS2 Workspace** - Install ROS2, create custom messages
3. **Create Bridge Module** - Start with basic pub/sub connection
4. **Test Real Drone Connection** - Verify bidirectional communication
5. **Integrate with WebSocket Layer** - Replace simulation calls with ROS2

The existing WebSocket architecture provides an excellent foundation for ROS2 integration with minimal changes to the frontend UI system.

---

# Detailed Simulation-to-GUI Communication Architecture

## Overview: Three-Layer Indirect Communication

The BGCS system implements a **three-layer architecture** where the simulation engine **never directly communicates** with the WebSocket layer. This design provides clean separation of concerns and different update frequencies.

```
┌─────────────────────┐    60 FPS Updates    ┌─────────────────────┐    20 FPS Snapshots    ┌─────────────────────┐
│  Simulation Engine  │ ──────────────────→  │   State Manager     │ ───────────────────→   │  WebSocket Manager  │
│  (Physics & Logic)  │                      │  (Entity Storage)   │                        │  (Network Layer)    │
└─────────────────────┘                      └─────────────────────┘                        └─────────────────────┘
                                                        ↓                                             ↓
                                              ┌─────────────────────┐                        ┌─────────────────────┐
                                              │  Entity Dictionary  │                        │   JSON Serialization │
                                              │ Dict[str, Entity]   │                        │   WebSocket Broadcast │
                                              └─────────────────────┘                        └─────────────────────┘
```

## Layer 1: Simulation Engine (`backend/simulation/engine.py`)

### Core Responsibilities
- **60 FPS Physics Loop**: Fixed timestep simulation at 16.67ms intervals
- **Entity Lifecycle**: Spawn, update, destroy entities via queues
- **AI Behaviors**: Drone modes (random_search, follow_target, waypoint_mode, etc.)
- **Physics Systems**: Position, velocity, collision detection
- **Detection Systems**: Drone-target proximity detection

### Key Methods and Communication

#### Main Update Loop
```python
async def _update_simulation(self, delta_time: float) -> None:
    """Core 60 FPS update cycle"""
    # 1. Process spawn requests from WebSocket commands
    await self._process_spawn_queue()
    
    # 2. Update all entity physics and AI
    self._update_entities(delta_time)
    
    # 3. Handle detection systems (drone→target)
    self._update_detection_system()
    
    # 4. Process destruction requests from WebSocket commands
    self._process_destroy_queue()
    
    # 5. CRITICAL: Push all changes to State Manager
    self.state_manager.update_simulation(delta_time)
    
    self.frame_count += 1
```

#### Entity Processing Pipeline
```python
def _update_entities(self, delta_time: float) -> None:
    """Update all entities with physics and AI behaviors"""
    for entity in list(self.state_manager.entities.values()):
        if not entity.destroyed:
            # Update entity physics (position, velocity)
            entity.update(delta_time)
            
            # Check boundaries and handle out-of-bounds
            if self._is_entity_out_of_bounds(entity):
                self._handle_out_of_bounds_entity(entity)
```

#### Command Processing (WebSocket → Simulation)
```python
def spawn_entity(self, entity_type: str, entity_id: str, position: Vector3, **properties) -> bool:
    """Queue entity for spawning (called from WebSocket handlers)"""
    spawn_data = {
        "type": entity_type,
        "id": entity_id, 
        "position": position,
        "properties": properties
    }
    self.spawn_queue.append(spawn_data)  # Processed in next simulation frame
    return True

def destroy_entity(self, entity_id: str) -> bool:
    """Queue entity for destruction (called from WebSocket handlers)"""
    if entity_id in self.state_manager.entities:
        self.destroy_queue.add(entity_id)  # Processed in next simulation frame
        return True
    return False
```

### Critical Communication Pattern
**The simulation engine NEVER directly calls WebSocket methods.** It only:
1. **Reads** commands from queues (populated by WebSocket handlers)
2. **Writes** entity state changes to the State Manager
3. **Updates** entities based on physics and AI logic

## Layer 2: State Manager (`backend/state/manager.py`)

### Role: Central Data Buffer
The State Manager acts as a **thread-safe buffer** between the high-frequency simulation (60 FPS) and lower-frequency network broadcasts (20 FPS).

### Entity Storage and Management
```python
class StateManager:
    def __init__(self):
        self.entities: Dict[str, Entity] = {}        # Primary entity storage
        self.selected_entities: Set[str] = set()     # Selection state
        self.events = deque(maxlen=1000)             # Event log buffer
        self.chat_messages = deque(maxlen=100)       # Chat history
        
        # Performance metrics
        self.fps = 0.0
        self.simulation_speed = 1.0
        self.simulation_running = False
```

### Simulation Engine Interface
```python
def update_simulation(self, delta_time: float) -> None:
    """Called by simulation engine every frame (60 FPS)"""
    if self.simulation_running:
        # Apply simulation speed multiplier
        adjusted_delta = delta_time * self.simulation_speed
        self.simulation_time += adjusted_delta
        
        # Update all entities (this is where entity.update() gets called)
        self.update_entities(adjusted_delta)
        
        # Update performance metrics
        self.update_count += 1
        current_time = time.time()
        if current_time - self.last_fps_update >= 1.0:
            self.fps = self.update_count      # FPS calculation for GUI display
            self.update_count = 0
            self.last_fps_update = current_time

def create_entity(self, entity_type: str, entity_id: str, position: Vector3, **kwargs) -> Entity:
    """Create new entity (called from simulation spawn queue processing)"""
    if entity_type == "drone":
        entity = Drone(entity_id, position, **kwargs)
    elif entity_type == "target":
        entity = Target(entity_id, position, **kwargs)
    else:
        raise ValueError(f"Unknown entity type: {entity_type}")
    
    # Set state manager reference for entity
    if hasattr(entity, 'set_state_manager'):
        entity.set_state_manager(self)
    
    # Store in entity dictionary
    self.entities[entity.id] = entity
    self.stats["entities_created"] += 1
    
    self.log_event("entity_created", entity.id)
    return entity
```

### WebSocket Interface (Critical Serialization Method)
```python
def get_state_snapshot(self) -> Dict[str, Any]:
    """Generate JSON snapshot for WebSocket broadcast (20 FPS)"""
    return {
        # All entities serialized to dict format
        "entities": {
            entity_id: entity.to_dict() 
            for entity_id, entity in list(self.entities.items())
        },
        
        # UI state
        "selected_entities": self.selected_entities.copy(),
        
        # Simulation status
        "simulation_running": self.simulation_running,
        "simulation_speed": safe_float(self.simulation_speed),
        "simulation_time": safe_float(self.simulation_time),
        "fps": safe_float(self.fps),
        
        # Performance and logging data
        "stats": {k: safe_float(v) if isinstance(v, float) else v 
                 for k, v in self.stats.items()},
        "recent_events": [event.to_dict() for event in self.get_recent_events(20)],
        "recent_messages": [msg.to_dict() for msg in self.get_recent_messages(10)]
    }
```

### Entity Data Format
Each entity's `to_dict()` method provides structured data:
```python
def to_dict(self) -> Dict[str, Any]:
    """Entity serialization for network transmission"""
    return {
        "id": self.id,
        "entity_type": self.type,
        "position": {"x": self.position.x, "y": self.position.y, "z": self.position.z},
        "velocity": {"x": self.velocity.x, "y": self.velocity.y, "z": self.velocity.z},
        "rotation": {"x": self.rotation.x, "y": self.rotation.y, "z": self.rotation.z},
        "current_mode": self.current_mode,
        "selected": self.selected,
        "destroyed": self.destroyed,
        "detection_radius": self.detection_radius,
        "health": self.health,
        "last_updated": time.time()
    }
```

## Layer 3: WebSocket Manager (`backend/api/websocket.py`)

### Role: Network Communication Layer
Handles all client connections and provides the bridge between HTTP/WebSocket protocols and the internal state system.

### Periodic State Broadcasting
```python
async def start_periodic_updates():
    """Background task: Broadcast state to all clients at 20 FPS"""
    while True:
        try:
            if websocket_manager.active_connections:
                # CRITICAL: Calls state manager, NOT simulation engine
                await websocket_manager._send_state_update()
            
            await asyncio.sleep(0.05)  # 50ms = 20 FPS update rate
        except Exception as e:
            logger.error(f"Error in periodic updates: {e}")
            await asyncio.sleep(1)  # Recovery delay

async def _send_state_update(self, client_id: Optional[str] = None):
    """Send current state to client(s)"""
    try:
        # Get snapshot from state manager (NOT from simulation)
        snapshot = state_manager.get_state_snapshot()
        
        message = {
            "type": "state_update",
            "data": snapshot
        }
        
        # Broadcast to one or all clients
        if client_id:
            await self._send_to_client(client_id, message)
        else:
            await self.broadcast(message)
            
    except Exception as e:
        logger.error(f"Error sending state update: {e}")
```

### Command Processing (GUI → Simulation)
WebSocket handlers **never directly call simulation methods**. Instead, they use simulation engine's queue-based API:

```python
async def _handle_spawn_entity(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Handle spawn command from GUI"""
    entity_type = data.get("type")
    entity_id = data.get("id")
    position_data = data.get("position", {})
    properties = data.get("properties", {})
    
    position = Vector3(
        position_data.get("x", 0),
        position_data.get("y", 0), 
        position_data.get("z", 0)
    )
    
    # CRITICAL: Uses simulation engine's queue-based API
    success = simulation_engine.spawn_entity(entity_type, entity_id, position, **properties)
    
    if success:
        # Notify all clients
        await self.broadcast({
            "type": "entity_spawned",
            "data": {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "position": position_data,
                "spawned_by": client_id
            }
        })
        
        return {"type": "command_success", "data": {"message": f"Spawned {entity_type}"}}
    else:
        return {"type": "error", "data": {"message": "Failed to spawn entity"}}

async def _handle_set_entity_mode(self, client_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Handle mode change command from GUI"""
    entity_id = data.get("entity_id")
    mode = data.get("mode")
    
    # Direct entity manipulation via state manager
    entity = state_manager.get_entity(entity_id)
    if not entity:
        return {"type": "error", "data": {"message": "Entity not found"}}
    
    if hasattr(entity, 'set_mode'):
        success = entity.set_mode(mode)
        if success:
            # Log the change
            state_manager.log_event("mode_changed", entity_id, {
                "new_mode": mode,
                "changed_by": client_id
            })
            
            # Broadcast to all clients
            await self.broadcast({
                "type": "entity_mode_changed",
                "data": {
                    "entity_id": entity_id,
                    "mode": mode,
                    "changed_by": client_id
                }
            })
            
            return {"type": "command_success", "data": {"message": f"Mode set to {mode}"}}
```

## Detailed Data Flow Analysis

### Flow 1: Entity Position Update (60 FPS Internal)

```
1. Simulation Engine (_update_simulation)
   ├── drone.update(delta_time)
   │   ├── Physics calculation: position += velocity * delta_time
   │   ├── AI behavior: random_search movement
   │   └── Update internal state
   │
   ├── state_manager.update_simulation(delta_time)
   │   └── Updates performance metrics (FPS counter)
   │
   └── [NO WebSocket communication at this step]

2. WebSocket Manager (every 50ms)
   ├── state_manager.get_state_snapshot()
   │   └── Serializes ALL entities to JSON
   │
   ├── Broadcast to all connected clients
   │   └── message = {"type": "state_update", "data": {...}}
   │
   └── Frontend receives update and interpolates movement
```

### Flow 2: GUI Command Processing (User Click → Simulation)

```
1. Frontend User Action
   ├── User clicks "Spawn Drone" button
   ├── clearButtonFocus() prevents UI highlighting
   └── spawnEntity('drone') called

2. WebSocket Message Sent
   ├── Message: {"type": "spawn_entity", "data": {...}}
   └── Sent to backend via WebSocket

3. WebSocket Handler Processing
   ├── _handle_spawn_entity(client_id, data)
   ├── Validates data and creates position Vector3
   └── simulation_engine.spawn_entity() [QUEUE-BASED]

4. Simulation Engine Processing  
   ├── spawn_queue.append(spawn_data) [Immediate return]
   └── [Next simulation frame processes queue]

5. Next Simulation Frame (16.67ms later)
   ├── _process_spawn_queue()
   ├── state_manager.create_entity()
   ├── New entity added to entities dict
   └── state_manager.log_event("entity_spawned")

6. Next WebSocket Broadcast (up to 50ms later)
   ├── get_state_snapshot() includes new entity
   ├── All clients receive state_update
   └── Frontend adds entity to 3D scene
```

### Flow 3: Real-time State Synchronization

**Frequency Analysis:**
- **Simulation Internal**: 60 FPS (16.67ms intervals)
- **WebSocket Broadcast**: 20 FPS (50ms intervals) 
- **Frontend Rendering**: 60 FPS with interpolation
- **Command Latency**: 16.67ms (simulation) + up to 50ms (broadcast) = ~67ms total

**Memory Flow:**
```python
# Simulation updates entity in-place
drone.position.x += drone.velocity.x * delta_time

# State manager holds reference to same entity object  
entities["drone-1"] = drone  # Same object reference

# WebSocket serializes current state
snapshot = drone.to_dict()  # Creates new dict for JSON transmission

# Frontend receives and updates 3D mesh
entity3D.position.copy(new THREE.Vector3(data.position.x, y, z))
```

## Performance Characteristics and Bottlenecks

### Timing Analysis

| Component | Frequency | Duration | Notes |
|-----------|-----------|----------|-------|
| Simulation Update | 60 FPS | ~1-2ms | Physics + AI processing |
| Entity Serialization | 20 FPS | ~0.5-1ms | JSON conversion |
| WebSocket Broadcast | 20 FPS | ~1-5ms | Network transmission |
| Frontend Interpolation | 60 FPS | ~0.1ms | Smooth movement |

### Memory Usage Patterns

**Entity Storage:**
- **State Manager**: Single source of truth (`Dict[str, Entity]`)
- **Simulation Engine**: Only queue references, no entity copies
- **WebSocket**: Temporary JSON serialization (garbage collected)
- **Frontend**: 3D mesh objects synchronized with backend state

**Buffer Management:**
- **Event Log**: 1000 event circular buffer (`deque(maxlen=1000)`)
- **Chat Messages**: 100 message circular buffer
- **Spawn/Destroy Queues**: Dynamic lists, processed each frame

### Scalability Considerations

**Entity Limits:**
- **Current tested**: ~50-100 entities without performance degradation
- **Bottleneck**: JSON serialization scales O(n) with entity count
- **Network**: 20 FPS broadcasts scale with entity data size

**Client Connections:**
- **Multiple WebSocket clients** supported simultaneously
- **Each client** receives identical state updates
- **Command processing** from any client affects all clients

**Optimization Opportunities:**
- **Delta updates**: Only send changed entity data
- **Spatial partitioning**: Update only entities in client's view
- **Compression**: Binary protocols instead of JSON
- **Client filtering**: Subscribe to specific entity types

## Integration Points for ROS2

### Maintaining the Architecture
The three-layer separation makes ROS2 integration straightforward:

1. **Keep WebSocket Layer Unchanged**: Same 20 FPS JSON broadcasts
2. **Keep State Manager Unchanged**: Same entity storage and serialization  
3. **Replace Simulation Engine**: ROS2 bridge populates State Manager instead

### ROS2 Bridge Implementation
```python
class BGCSROS2Bridge:
    def __init__(self, state_manager):
        self.state_manager = state_manager  # Same state manager interface
        
    def handle_drone_telemetry(self, drone_id: str, telemetry_msg):
        """ROS2 callback: Real drone → State Manager"""
        entity = self.state_manager.get_entity(drone_id)
        if entity:
            # Update position from real drone (same as simulation)
            entity.position = Vector3(
                telemetry_msg.position.x,
                telemetry_msg.position.y,
                telemetry_msg.position.z
            )
            # State manager → WebSocket → Frontend (unchanged)
```

This preserves the exact same WebSocket API while substituting real drone data for simulated physics.

---