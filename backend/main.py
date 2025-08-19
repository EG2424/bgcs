"""
FastAPI main application for BGCS (UAV Ground Control Station).
Provides WebSocket for real-time updates and REST API for commands.
Serves frontend static files.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict, Set
import asyncio
import json
import logging
from pathlib import Path

# Import BGCS components
from .state.manager import state_manager
from .simulation.engine import SimulationEngine
from .entities.drone import Drone
from .entities.target import Target

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="BGCS Backend", version="1.0.0")

# WebSocket connection manager
class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        if not self.active_connections:
            return
        
        message_str = json.dumps(message)
        disconnected = set()
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except Exception:
                disconnected.add(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

# Global connection manager
manager = ConnectionManager()

# Initialize simulation engine
simulation_engine = SimulationEngine(state_manager)

# App lifespan management
@app.on_event("startup")
async def startup_event():
    """Start the simulation engine on app startup."""
    logger.info("Starting BGCS simulation engine...")
    
    # Set state manager references for entities
    def setup_entity_state_manager(entity):
        if hasattr(entity, 'set_state_manager'):
            entity.set_state_manager(state_manager)
    
    # Hook into entity creation to set state manager
    original_create_entity = state_manager.create_entity
    def create_entity_with_manager(*args, **kwargs):
        entity = original_create_entity(*args, **kwargs)
        if entity:
            setup_entity_state_manager(entity)
        return entity
    state_manager.create_entity = create_entity_with_manager
    
    # Start simulation
    await simulation_engine.start()
    
    # Spawn initial test scenario
    simulation_engine.spawn_test_scenario(num_drones=5, num_targets=3)
    logger.info("BGCS startup complete")

@app.on_event("shutdown")
async def shutdown_event():
    """Stop the simulation engine on app shutdown."""
    logger.info("Stopping BGCS simulation engine...")
    await simulation_engine.stop()
    logger.info("BGCS shutdown complete")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication."""
    await manager.connect(websocket)
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                logger.info(f"Received WebSocket message: {message}")
                
                # Echo message back for now (will be replaced with proper message routing)
                await manager.broadcast({
                    "type": "echo",
                    "data": message,
                    "timestamp": asyncio.get_event_loop().time()
                })
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received: {data}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/status")
async def get_status():
    """Get system status."""
    performance_stats = simulation_engine.get_performance_stats()
    entity_counts = state_manager.get_entity_count_by_type()
    
    return {
        "status": "running",
        "connections": len(manager.active_connections),
        "version": "1.0.0",
        "simulation": performance_stats,
        "entities": entity_counts,
        "total_entities": state_manager.get_entity_count()
    }

@app.get("/api/simulation/start")
async def start_simulation():
    """Start simulation."""
    success = await simulation_engine.start()
    status = "started" if success else "already_running"
    
    await manager.broadcast({
        "type": "simulation_status",
        "status": status
    })
    return {"message": f"Simulation {status}", "success": success}

@app.get("/api/simulation/stop")
async def stop_simulation():
    """Stop simulation."""
    success = await simulation_engine.stop()
    status = "stopped" if success else "not_running"
    
    await manager.broadcast({
        "type": "simulation_status", 
        "status": status
    })
    return {"message": f"Simulation {status}", "success": success}

@app.get("/api/simulation/pause")
async def pause_simulation():
    """Pause simulation."""
    simulation_engine.pause()
    await manager.broadcast({
        "type": "simulation_status",
        "status": "paused"
    })
    return {"message": "Simulation paused"}

@app.get("/api/simulation/resume")
async def resume_simulation():
    """Resume simulation."""
    simulation_engine.resume()
    await manager.broadcast({
        "type": "simulation_status",
        "status": "resumed"
    })
    return {"message": "Simulation resumed"}

@app.get("/api/simulation/speed/{multiplier}")
async def set_simulation_speed(multiplier: float):
    """Set simulation speed multiplier."""
    simulation_engine.set_speed_multiplier(multiplier)
    await manager.broadcast({
        "type": "simulation_speed",
        "speed": multiplier
    })
    return {"message": f"Simulation speed set to {multiplier}x"}

@app.get("/api/entities")
async def get_entities():
    """Get all entities."""
    snapshot = state_manager.get_state_snapshot()
    return {
        "entities": snapshot["entities"],
        "selected": snapshot["selected_entities"],
        "count": len(snapshot["entities"])
    }

@app.post("/api/spawn/drone")
async def spawn_drone(x: float = 0, y: float = 0, z: float = 50, mode: str = "random_search"):
    """Spawn a new drone."""
    from .entities.base import Vector3
    success = simulation_engine.spawn_entity(
        "drone", 
        position=Vector3(x, y, z),
        current_mode=mode
    )
    
    if success:
        await manager.broadcast({
            "type": "entity_spawned",
            "entity_type": "drone",
            "position": {"x": x, "y": y, "z": z}
        })
        return {"message": "Drone spawned successfully"}
    else:
        return {"message": "Failed to spawn drone", "success": False}

@app.post("/api/spawn/target")
async def spawn_target(x: float = 0, y: float = 0, z: float = 0, role: str = "unknown"):
    """Spawn a new target."""
    from .entities.base import Vector3
    success = simulation_engine.spawn_entity(
        "target",
        position=Vector3(x, y, z),
        role=role
    )
    
    if success:
        await manager.broadcast({
            "type": "entity_spawned",
            "entity_type": "target",
            "position": {"x": x, "y": y, "z": z}
        })
        return {"message": "Target spawned successfully"}
    else:
        return {"message": "Failed to spawn target", "success": False}

@app.post("/api/test_scenario")
async def spawn_test_scenario(drones: int = 10, targets: int = 5):
    """Spawn test scenario."""
    simulation_engine.spawn_test_scenario(drones, targets)
    await manager.broadcast({
        "type": "test_scenario_spawned",
        "drones": drones,
        "targets": targets
    })
    return {"message": f"Test scenario spawned: {drones} drones, {targets} targets"}

# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
    
    @app.get("/")
    async def read_root():
        """Serve main HTML file."""
        index_path = frontend_path / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"message": "Frontend not found"}
else:
    @app.get("/")
    async def read_root():
        """Fallback root endpoint."""
        return {"message": "BGCS Backend Running - Frontend not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)