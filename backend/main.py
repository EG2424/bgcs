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

# Import API components
from .api.routes import router as api_router, set_connection_manager, set_simulation_engine as set_routes_simulation_engine
from .api.websocket import websocket_endpoint, websocket_manager, start_periodic_updates, set_simulation_engine as set_websocket_simulation_engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="BGCS Backend", 
    version="1.0.0",
    description="UAV Ground Control Station Backend API"
)

# Initialize simulation engine
simulation_engine = SimulationEngine(state_manager)

# Include API router
app.include_router(api_router)

# Set up connection manager for API routes
set_connection_manager(websocket_manager)

# Set up simulation engine reference for API routes
set_routes_simulation_engine(simulation_engine)
set_websocket_simulation_engine(simulation_engine)

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
    
    # Start periodic WebSocket updates
    asyncio.create_task(start_periodic_updates())
    
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
async def websocket_handler(websocket: WebSocket):
    """WebSocket endpoint for real-time communication."""
    await websocket_endpoint(websocket)

# Test endpoint to verify current main.py is loaded
@app.get("/test-current-main")
async def test_current_main():
    """Test endpoint to verify main.py is current."""
    return {"message": "Current main.py is loaded", "router_included": True}


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