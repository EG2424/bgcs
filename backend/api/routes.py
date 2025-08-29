"""
REST API routes for BGCS entity management and simulation control.
Provides endpoints for spawning, controlling, and managing entities.
"""

from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging
import time

from ..entities.base import Vector3
from ..state.manager import state_manager
from ..simulation.engine import SimulationEngine

logger = logging.getLogger(__name__)

# Create API router
router = APIRouter(prefix="/api", tags=["BGCS API"])

# Pydantic models for request/response validation

class Position(BaseModel):
    """3D position model."""
    x: float = Field(..., description="X coordinate in meters")
    y: float = Field(..., description="Y coordinate in meters") 
    z: float = Field(..., description="Z coordinate in meters")

class SpawnRequest(BaseModel):
    """Request model for spawning entities."""
    type: str = Field(..., description="Entity type (drone, target)")
    id: Optional[str] = Field(None, description="Optional entity ID")
    position: Position = Field(..., description="Spawn position")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Additional entity properties")

class ModeRequest(BaseModel):
    """Request model for changing entity mode."""
    mode: str = Field(..., description="New entity mode")

class PathRequest(BaseModel):
    """Request model for setting entity path."""
    path: List[Position] = Field(..., description="List of waypoint positions")
    replace: bool = Field(True, description="Replace existing path or append")

class GroupRequest(BaseModel):
    """Request model for creating entity groups."""
    name: str = Field(..., description="Group name")
    members: List[str] = Field(..., description="List of entity IDs")

class GroupUpdateRequest(BaseModel):
    """Request model for updating entity groups."""
    name: Optional[str] = Field(None, description="New group name")
    members: Optional[List[str]] = Field(None, description="New list of entity IDs")

class OrderRequest(BaseModel):
    """Request model for reordering entities or groups."""
    ordered_ids: List[str] = Field(..., description="List of IDs in desired order")

class StatusResponse(BaseModel):
    """Response model for status information."""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

class EntityResponse(BaseModel):
    """Response model for entity information."""
    id: str
    type: str
    position: Position
    status: str
    properties: Dict[str, Any]

# Global references (set in main.py)
connection_manager = None
simulation_engine = None

def set_connection_manager(manager):
    """Set the connection manager for broadcasting."""
    global connection_manager
    connection_manager = manager

def set_simulation_engine(engine):
    """Set the simulation engine for API operations."""
    global simulation_engine
    simulation_engine = engine

async def broadcast_update(message_type: str, data: Dict[str, Any]):
    """Broadcast update to all connected WebSocket clients."""
    if connection_manager:
        await connection_manager.broadcast({
            "type": message_type,
            "timestamp": state_manager.simulation_time,
            "data": data
        })

# Simulation Control Endpoints

@router.get("/status")
async def get_system_status():
    """Get comprehensive system status."""
    try:
        performance_stats = simulation_engine.get_performance_stats()
        entity_counts = state_manager.get_entity_count_by_type()
        
        return {
            "status": "running",
            "simulation": performance_stats,
            "entities": {
                "total": state_manager.get_entity_count(),
                "by_type": entity_counts,
                "selected": len(state_manager.selected_entities)
            },
            "events": len(state_manager.events),
            "messages": len(state_manager.chat_messages)
        }
    except Exception as e:
        logger.error(f"Error getting system status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get system status")

@router.get("/state")
async def get_simulation_state():
    """Get complete simulation state snapshot."""
    try:
        snapshot = state_manager.get_state_snapshot()
        return {
            "success": True,
            "state": snapshot
        }
    except Exception as e:
        logger.error(f"Error getting simulation state: {e}")
        raise HTTPException(status_code=500, detail="Failed to get simulation state")

# Entity Management Endpoints

@router.post("/spawn", response_model=StatusResponse)
async def spawn_entity(request: SpawnRequest):
    """Spawn a new entity in the simulation."""
    try:
        # Validate entity type
        if request.type not in ["drone", "target"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid entity type: {request.type}. Must be 'drone' or 'target'"
            )
        
        # Create position vector
        position = Vector3(request.position.x, request.position.y, request.position.z)
        
        # Spawn entity
        success = simulation_engine.spawn_entity(
            request.type,
            request.id,
            position,
            **request.properties
        )
        
        if success:
            # Broadcast spawn event
            await broadcast_update("entity_spawned", {
                "entity_type": request.type,
                "entity_id": request.id,
                "position": {"x": position.x, "y": position.y, "z": position.z},
                "properties": request.properties
            })
            
            return StatusResponse(
                success=True,
                message=f"Successfully spawned {request.type}",
                data={"entity_id": request.id, "type": request.type}
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to spawn entity")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error spawning entity: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/entities", response_model=List[EntityResponse])
async def list_entities():
    """Get list of all entities."""
    try:
        entities = []
        for entity_id, entity in state_manager.entities.items():
            entities.append(EntityResponse(
                id=entity.id,
                type=entity.entity_type,
                position=Position(x=entity.position.x, y=entity.position.y, z=entity.position.z),
                status="destroyed" if entity.destroyed else "active",
                properties={
                    "health": entity.health,
                    "detected": entity.detected,
                    "selected": entity.selected,
                    "current_mode": getattr(entity, 'current_mode', 'unknown'),
                    "sort_index": entity.sort_index
                }
            ))
        
        return entities
        
    except Exception as e:
        logger.error(f"Error listing entities: {e}")
        raise HTTPException(status_code=500, detail="Failed to list entities")

@router.get("/entity/{entity_id}")
async def get_entity(entity_id: str):
    """Get detailed information about a specific entity."""
    try:
        entity = state_manager.get_entity(entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
        
        # Get entity data
        entity_data = entity.to_dict()
        
        return {
            "success": True,
            "entity": entity_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entity {entity_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/entity/{entity_id}/mode", response_model=StatusResponse)
async def set_entity_mode(entity_id: str, request: ModeRequest):
    """Set entity behavior mode."""
    try:
        entity = state_manager.get_entity(entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
        
        # Check if entity supports mode setting
        if hasattr(entity, 'set_mode'):
            success = entity.set_mode(request.mode)
            if success:
                # Log mode change event
                state_manager.log_event("mode_changed", entity_id, {
                    "old_mode": getattr(entity, 'current_mode', 'unknown'),
                    "new_mode": request.mode
                })
                
                # Broadcast mode change
                await broadcast_update("entity_mode_changed", {
                    "entity_id": entity_id,
                    "mode": request.mode
                })
                
                return StatusResponse(
                    success=True,
                    message=f"Mode set to {request.mode}",
                    data={"entity_id": entity_id, "mode": request.mode}
                )
            else:
                raise HTTPException(status_code=400, detail=f"Invalid mode: {request.mode}")
        else:
            raise HTTPException(status_code=400, detail="Entity does not support mode changes")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting entity mode: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/entity/{entity_id}/path", response_model=StatusResponse)
async def set_entity_path(entity_id: str, request: PathRequest):
    """Set entity waypoint path."""
    try:
        entity = state_manager.get_entity(entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
        
        # Clear existing waypoints if replacing
        if request.replace:
            entity.clear_waypoints()
        
        # Add waypoints
        waypoints_added = 0
        for pos in request.path:
            waypoint = Vector3(pos.x, pos.y, pos.z)
            entity.add_waypoint(waypoint)
            waypoints_added += 1
        
        # Switch to waypoint mode if waypoints were added
        if waypoints_added > 0 and hasattr(entity, 'set_mode'):
            entity.set_mode("waypoint_mode")
        
        # Log path change event
        state_manager.log_event("path_changed", entity_id, {
            "waypoints_added": waypoints_added,
            "total_waypoints": len(entity.waypoints),
            "replace": request.replace
        })
        
        # Broadcast path change
        await broadcast_update("entity_path_changed", {
            "entity_id": entity_id,
            "path": [{"x": p.x, "y": p.y, "z": p.z} for p in request.path],
            "waypoints_count": len(entity.waypoints)
        })
        
        return StatusResponse(
            success=True,
            message=f"Path set with {waypoints_added} waypoints",
            data={"entity_id": entity_id, "waypoints": waypoints_added}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting entity path: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/entity/{entity_id}", response_model=StatusResponse)
async def delete_entity(entity_id: str):
    """Delete an entity from the simulation."""
    try:
        entity = state_manager.get_entity(entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
        
        # Use simulation engine to properly destroy entity
        success = simulation_engine.destroy_entity(entity_id)
        
        if success:
            # Broadcast deletion
            await broadcast_update("entity_deleted", {
                "entity_id": entity_id,
                "entity_type": entity.entity_type
            })
            
            return StatusResponse(
                success=True,
                message=f"Entity {entity_id} deleted successfully",
                data={"entity_id": entity_id}
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to delete entity")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entity: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Selection Management

@router.post("/entity/{entity_id}/select", response_model=StatusResponse)
async def select_entity(entity_id: str):
    """Select an entity."""
    try:
        success = state_manager.select_entity(entity_id)
        if success:
            await broadcast_update("entity_selected", {
                "entity_id": entity_id,
                "selected_count": len(state_manager.selected_entities)
            })
            
            return StatusResponse(
                success=True,
                message=f"Entity {entity_id} selected",
                data={"entity_id": entity_id}
            )
        else:
            raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error selecting entity: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/entity/{entity_id}/deselect", response_model=StatusResponse)
async def deselect_entity(entity_id: str):
    """Deselect an entity."""
    try:
        success = state_manager.deselect_entity(entity_id)
        if success:
            await broadcast_update("entity_deselected", {
                "entity_id": entity_id,
                "selected_count": len(state_manager.selected_entities)
            })
            
            return StatusResponse(
                success=True,
                message=f"Entity {entity_id} deselected",
                data={"entity_id": entity_id}
            )
        else:
            return StatusResponse(
                success=False,
                message=f"Entity {entity_id} was not selected"
            )
            
    except Exception as e:
        logger.error(f"Error deselecting entity: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/selection/clear", response_model=StatusResponse)
async def clear_selection():
    """Clear all entity selections."""
    try:
        selected_count = len(state_manager.selected_entities)
        state_manager.clear_selection()
        
        await broadcast_update("selection_cleared", {
            "previously_selected": selected_count
        })
        
        return StatusResponse(
            success=True,
            message=f"Cleared {selected_count} selections",
            data={"cleared_count": selected_count}
        )
        
    except Exception as e:
        logger.error(f"Error clearing selection: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Group Management

@router.get("/groups", response_model=StatusResponse)
async def get_groups():
    """Get all groups."""
    try:
        groups = state_manager.get_all_groups()
        groups_data = [group.to_dict() for group in groups]
        
        return StatusResponse(
            success=True,
            message=f"Retrieved {len(groups)} groups",
            data={"groups": groups_data}
        )
        
    except Exception as e:
        logger.error(f"Error getting groups: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/groups", response_model=StatusResponse)
async def create_group(request: GroupRequest):
    """Create an entity group."""
    try:
        # Validate that all entities exist
        missing_entities = []
        valid_entities = []
        
        for entity_id in request.members:
            entity = state_manager.get_entity(entity_id)
            if entity:
                valid_entities.append(entity_id)
            else:
                missing_entities.append(entity_id)
        
        if missing_entities:
            raise HTTPException(
                status_code=400, 
                detail=f"Entities not found: {missing_entities}"
            )
        
        # Generate unique group ID
        import uuid
        group_id = f"group_{str(uuid.uuid4())[:8]}"
        
        # Create the group
        group = state_manager.create_group(group_id, request.name, valid_entities)
        if not group:
            raise HTTPException(status_code=400, detail="Failed to create group")
        
        # Broadcast group creation
        await broadcast_update("group_created", group.to_dict())
        
        return StatusResponse(
            success=True,
            message=f"Group '{request.name}' created with {len(valid_entities)} members",
            data=group.to_dict()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/groups/order", response_model=StatusResponse)
async def update_group_order(request: OrderRequest):
    """Update the display order of groups."""
    try:
        state_manager.set_group_order(request.ordered_ids)
        
        # Broadcast to clients
        if connection_manager:
            await connection_manager.broadcast({
                "type": "groups_reordered",
                "ordered_ids": request.ordered_ids
            })
        
        return StatusResponse(success=True, message="Group order updated")
        
    except Exception as e:
        logger.error(f"Error updating group order: {e}")
        raise HTTPException(status_code=500, detail="Failed to update group order")

@router.get("/groups/{group_id}", response_model=StatusResponse)
async def get_group(group_id: str):
    """Get a specific group."""
    try:
        group = state_manager.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        
        return StatusResponse(
            success=True,
            message=f"Retrieved group {group_id}",
            data=group.to_dict()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group {group_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/groups/{group_id}", response_model=StatusResponse)
async def update_group(group_id: str, request: GroupUpdateRequest):
    """Update a group."""
    try:
        group = state_manager.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        
        # Validate members if provided
        if request.members is not None:
            missing_entities = []
            for entity_id in request.members:
                if not state_manager.get_entity(entity_id):
                    missing_entities.append(entity_id)
            
            if missing_entities:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Entities not found: {missing_entities}"
                )
        
        # Update the group
        success = state_manager.update_group(group_id, request.name, request.members)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update group")
        
        # Get updated group data
        updated_group = state_manager.get_group(group_id)
        
        # Broadcast group update
        await broadcast_update("group_updated", updated_group.to_dict())
        
        return StatusResponse(
            success=True,
            message=f"Group '{updated_group.name}' updated",
            data=updated_group.to_dict()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating group {group_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/groups/{group_id}", response_model=StatusResponse)
async def delete_group(group_id: str):
    """Delete a group."""
    try:
        group = state_manager.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        
        group_name = group.name
        
        # Delete the group
        success = state_manager.delete_group(group_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete group")
        
        # Broadcast group deletion
        await broadcast_update("group_deleted", {"group_id": group_id, "group_name": group_name})
        
        return StatusResponse(
            success=True,
            message=f"Group '{group_name}' deleted",
            data={"group_id": group_id, "group_name": group_name}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting group {group_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Test and Development Endpoints

@router.post("/test/scenario")
async def spawn_test_scenario(drones: int = 10, targets: int = 5):
    """Spawn a test scenario with specified number of entities."""
    try:
        simulation_engine.spawn_test_scenario(drones, targets)
        
        await broadcast_update("test_scenario_spawned", {
            "drones": drones,
            "targets": targets,
            "total_entities": drones + targets
        })
        
        return StatusResponse(
            success=True,
            message=f"Test scenario spawned: {drones} drones, {targets} targets",
            data={"drones": drones, "targets": targets}
        )
        
    except Exception as e:
        logger.error(f"Error spawning test scenario: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/events")
async def get_recent_events(count: int = 20):
    """Get recent simulation events."""
    try:
        events = state_manager.get_recent_events(count)
        return {
            "success": True,
            "events": [event.to_dict() for event in events]
        }
        
    except Exception as e:
        logger.error(f"Error getting events: {e}")
        raise HTTPException(status_code=500, detail="Failed to get events")

@router.put("/assets/order", response_model=StatusResponse)
async def update_asset_order(request: OrderRequest):
    """Update the display order of assets (entities)."""
    try:
        # Save the order in state manager (persists across test scenario respawns)
        state_manager.set_entity_order(request.ordered_ids)
        
        # Broadcast to clients
        if connection_manager:
            await connection_manager.broadcast({
                "type": "assets_reordered",
                "ordered_ids": request.ordered_ids
            })
        
        return StatusResponse(success=True, message="Asset order updated")
        
    except Exception as e:
        logger.error(f"Error updating asset order: {e}")
        raise HTTPException(status_code=500, detail="Failed to update asset order")

@router.get("/test-browser")
async def test_browser_connection():
    """Simple test endpoint to verify browser-to-server connection."""
    logger.info(f"DEBUG: *** BROWSER TEST ENDPOINT HIT ***")
    return {"success": True, "message": "Browser connection working", "timestamp": time.time()}

@router.post("/groups/{group_id}/members/{entity_id}", response_model=StatusResponse)
async def add_entity_to_group(group_id: str, entity_id: str):
    """Add entity to group."""
    try:
        success = state_manager.add_entity_to_group(group_id, entity_id)
        if not success:
            if not state_manager.get_group(group_id):
                raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
            if not state_manager.get_entity(entity_id):
                raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
            raise HTTPException(status_code=400, detail="Failed to add entity to group")
        
        group = state_manager.get_group(group_id)
        await broadcast_update("group_updated", group.to_dict())
        
        return StatusResponse(
            success=True,
            message=f"Entity {entity_id} added to group {group.name}",
            data=group.to_dict()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding entity to group: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/groups/{group_id}/members/{entity_id}", response_model=StatusResponse)
async def remove_entity_from_group(group_id: str, entity_id: str):
    """Remove entity from group."""
    try:
        group = state_manager.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        
        success = state_manager.remove_entity_from_group(group_id, entity_id)
        if not success:
            raise HTTPException(status_code=400, detail="Entity not in group")
        
        updated_group = state_manager.get_group(group_id)
        await broadcast_update("group_updated", updated_group.to_dict())
        
        return StatusResponse(
            success=True,
            message=f"Entity {entity_id} removed from group {updated_group.name}",
            data=updated_group.to_dict()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing entity from group: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")