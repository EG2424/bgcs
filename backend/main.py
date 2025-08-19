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
    return {
        "status": "running",
        "connections": len(manager.active_connections),
        "version": "1.0.0"
    }

@app.get("/api/simulation/start")
async def start_simulation():
    """Start simulation (placeholder)."""
    await manager.broadcast({
        "type": "simulation_status",
        "status": "started"
    })
    return {"message": "Simulation started"}

@app.get("/api/simulation/stop")
async def stop_simulation():
    """Stop simulation (placeholder)."""
    await manager.broadcast({
        "type": "simulation_status", 
        "status": "stopped"
    })
    return {"message": "Simulation stopped"}

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