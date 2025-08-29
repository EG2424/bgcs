# BGCS Sensor Overlay System Documentation

## Overview

The BGCS (UAV Ground Control Station) sensor overlay system provides real-time visualization of sensor footprints for selected entities in a 3D terrain environment. The system projects sensor field-of-view (FOV) shapes onto the 3D terrain, accounting for gimbal orientation and terrain conforming.

**Last Updated**: August 27, 2025  
**Version**: 1.0  
**Implementation**: Frontend-only (JavaScript/Three.js)

## Architecture

### Core Components

1. **SensorOverlayManager** - Central coordinator
2. **FootprintOverlay** - Terrain-conforming footprint renderer
3. **Integration Layer** - App.js hooks for selection/lifecycle management

### System Flow

```
Entity Selection → SensorOverlayManager → FootprintOverlay → Three.js Scene
       ↓                    ↓                    ↓              ↓
   UI Controls    →    Sensor Data     →   3D Geometry   →  Terrain Mesh
```

## File Structure

```
frontend/js/scene/overlays/
├── SensorOverlayManager.js       # Main coordinator class
├── FootprintOverlay.js          # Footprint geometry renderer
├── test-sensor-data.js          # Test data utilities
└── debug-sensor-overlays.js     # Debug utilities

frontend/js/
├── app.js                       # Integration layer
└── ui-controls.js              # Selection event handling

frontend/index.html              # UI toggle controls
```

## Key Features

### ✅ Implemented Features

- **Real-time footprint rendering** - 60 FPS animation loop with position tracking
- **Terrain conforming** - Ray casting to project FOV onto 3D terrain
- **Gimbal support** - Camera pan/tilt orientation with configurable ranges
- **Multiple selection** - Supports multiple entities with individual overlays
- **Selection methods** - Works with both direct click and entity menu selection
- **Feature flags** - Toggle-able via UI settings
- **Backwards compatibility** - Non-breaking design, graceful degradation
- **Performance optimized** - Throttled updates, material caching, geometry disposal

### 🚫 Removed Features

- **Viewshed overlays** - Removed per user request (complexity not needed)
- **Frustum overlays** - Never implemented (user preferred footprints)

## Technical Implementation

### 1. SensorOverlayManager Class

**Location**: `frontend/js/scene/overlays/SensorOverlayManager.js`

**Purpose**: Central coordinator managing sensor overlays for selected entities

**Key Methods**:
- `init()` - Initialize overlay system
- `updateSelection(selectedEntityIds)` - Handle entity selection changes
- `updateEntitySensorData(entityId, entityData)` - Update sensor configurations
- `updateAllOverlaysRealtime()` - 60 FPS continuous update loop
- `setFeatureFlags(flags)` - Toggle features on/off

**Configuration System**:
```javascript
// Default sensor configurations by entity type
this.defaultSensors = {
    drone: {
        main_cam: {
            type: "camera",
            fov_horizontal_deg: 70,
            fov_vertical_deg: 52.5,
            near: 0.5,
            far: 200.0,
            gimbal: {
                pan: 0, tilt: -15,
                pan_range: [-180, 180],
                tilt_range: [-90, 30],
                stabilized: true
            },
            mount_offset: { x: 0, y: -0.1, z: 0.05 },
            color: 0x00ff00, opacity: 0.3
        }
    }
}
```

**Animation Loop**:
- Runs at 60 FPS using `requestAnimationFrame`
- Throttled to 20 FPS overlay updates (16ms intervals)
- Position change detection to avoid unnecessary updates
- Automatic cleanup on entity deselection

### 2. FootprintOverlay Class

**Location**: `frontend/js/scene/overlays/FootprintOverlay.js`

**Purpose**: Creates terrain-conforming 3D footprint geometry

**Key Innovation - Terrain Ray Casting**:
```javascript
// Ray casting algorithm for terrain conforming
for (let distance = 1; distance <= range; distance += 2) {
    const worldX = sensorX + rayDirX * distance;
    const worldZ = sensorZ + rayDirZ * distance;
    const rayY = sensorY + rayDirY * distance;
    
    const terrainHeight = this.getTerrainHeight(worldX, worldZ);
    
    if (rayY <= terrainHeight) {
        hitPoint = { x: worldX, y: terrainHeight + 0.5, z: worldZ };
        break;
    }
}
```

**Geometry Creation**:
- Fan-shaped geometry with 20 segments for smooth curves
- Each vertex projected onto actual terrain height
- Handles sensor tilt for downward-angled cameras
- Raised 0.5m above terrain for visibility from all angles

**Material System**:
- Cached materials for performance (`materialKey = color_opacity`)
- Double-sided rendering for multi-angle visibility
- Transparency support with configurable opacity
- Proper disposal to prevent memory leaks

### 3. Integration Layer

**Selection Integration** (`ui-controls.js`):
```javascript
// Added to selectEntity(), deselectEntity(), clearSelection()
if (window.bgcsApp) {
    window.bgcsApp.updateSensorOverlaySelection();
}
```

**Lifecycle Management** (`app.js`):
```javascript
// Entity creation
if (this.sensorOverlayManager) {
    this.sensorOverlayManager.updateEntitySensorData(entity.id, entity);
}

// Entity updates  
if (this.sensorOverlayManager) {
    this.sensorOverlayManager.updateEntitySensorData(entity.id, entityDataForOverlay);
}

// Selection changes
updateSensorOverlaySelection() {
    const selectedEntityIds = Array.from(this.uiControls.selectedEntities || new Set());
    this.sensorOverlayManager.updateSelection(selectedEntityIds);
}
```

## Data Flow

### Entity Selection Flow
1. User selects entity (click or menu)
2. UI controls update `selectedEntities` Set
3. UI controls call `window.bgcsApp.updateSensorOverlaySelection()`
4. App calls `sensorOverlayManager.updateSelection(selectedEntityIds)`
5. Manager creates/removes overlays as needed
6. FootprintOverlay generates terrain-conforming geometry
7. Geometry added to Three.js scene

### Real-time Update Flow
1. Animation loop runs every frame (60 FPS)
2. Position change detection (5cm threshold for position, 0.005 rad for rotation)
3. If changed, update sensor data with current 3D mesh transform
4. Call `updateEntityOverlays()` to regenerate geometry
5. Dispose old geometry and create new terrain-conforming geometry

## Performance Optimizations

### Update Throttling
- **Animation loop**: 60 FPS using `requestAnimationFrame`
- **Overlay updates**: Throttled to ~20 FPS (16ms intervals)
- **Position detection**: 5cm movement or 0.005 radian rotation threshold

### Memory Management
- **Geometry disposal**: Automatic cleanup of old BufferGeometry
- **Material caching**: Reuse materials with same color/opacity
- **Entity cleanup**: Remove overlays when entities deleted or deselected

### Rendering Optimization
- **Double-sided materials**: Avoid backface culling issues
- **Elevated positioning**: 0.5-1.0m above terrain for multi-angle visibility
- **Segment optimization**: 20 segments balance between smoothness and performance

## Configuration

### UI Controls
**Location**: Options menu → Display section
- **Footprints toggle**: Enable/disable sensor footprint overlays

### Feature Flags
```javascript
sensorOverlayManager.setFeatureFlags({
    globalEnabled: true,      // Master enable/disable
    footprintEnabled: true    // Footprint overlays on/off
});
```

### Sensor Configuration
Sensors can be configured per entity via WebSocket data or defaults:
```javascript
entityData.sensors = {
    main_cam: {
        fov_horizontal_deg: 70,
        fov_vertical_deg: 52.5,
        gimbal: { pan: 10, tilt: -20 }
        // ... other parameters
    }
};
```

## Debugging Tools

### Debug Functions (`debug-sensor-overlays.js`)
```javascript
// Console commands available globally
debugSensorOverlays()          // Detailed system status
monitorSensorUpdates(10000)    // Watch position changes for 10 seconds  
forceUpdateOverlays()          // Manually trigger overlay updates
```

### Debug Information
```javascript
// Get system status
const debugInfo = sensorOverlayManager.getDebugInfo();
console.log(debugInfo);
// Returns: initialized, globalEnabled, footprintEnabled, selectedEntities count, etc.
```

## Common Issues & Solutions

### Issue: Overlays not updating with vehicle movement
**Cause**: Animation loop not running or throttling too aggressive
**Solution**: Check `isAnimating` flag, verify `startUpdateLoop()` called

### Issue: Overlays only visible from top view
**Cause**: Geometry at ground level (z=0) gets clipped
**Solution**: Elevate geometry 0.5-1.0m above terrain (`terrainHeight + 0.5`)

### Issue: Overlays floating in mid-air
**Cause**: Ray casting not properly finding terrain intersection
**Solution**: Verify terrain integration, check `getTerrainHeight()` function

### Issue: Multiple selection only shows one overlay
**Cause**: Selection events not propagating to overlay system
**Solution**: Ensure `updateSensorOverlaySelection()` called in selection handlers

## ROS2 Readiness

The system is designed for future ROS2 integration:

### Data Structure Compatibility
- Sensor configurations match typical ROS2 camera_info topics
- Gimbal states align with ROS2 joint_state messages
- Position/rotation use standard ROS2 geometry_msgs

### Extension Points
- `updateEntitySensorData()` can receive ROS2 sensor messages
- Gimbal updates via `updateSensorGimbal()` method
- Real-time position updates already integrated

### WebSocket Integration
Current WebSocket protocol can be extended:
```javascript
// Current format - ready for ROS2 bridge
{
    entity_id: "drone_001",
    position: { x, y, z },
    rotation: { x, y, z },
    sensors: {
        main_cam: {
            gimbal: { pan: 10, tilt: -20 }
        }
    }
}
```

## Usage Examples

### Basic Setup
```javascript
// Initialize in app.js
await this.setupSensorOverlays();

// The system automatically handles:
// - Entity selection changes
// - Real-time position updates  
// - Terrain conforming geometry
// - UI toggle integration
```

### Manual Control
```javascript
// Enable/disable system
app.sensorOverlayManager.setFeatureFlags({ globalEnabled: false });

// Update specific entity sensor data
app.sensorOverlayManager.updateEntitySensorData('drone_001', {
    position: { x: 100, y: 50, z: 200 },
    rotation: { x: 0, y: 1.57, z: 0 },
    sensors: {
        main_cam: {
            gimbal: { pan: 15, tilt: -30 }
        }
    }
});

// Force selection update
app.updateSensorOverlaySelection();
```

### Custom Sensor Configuration
```javascript
// Add custom sensor type to defaults
sensorOverlayManager.defaultSensors.custom_drone = {
    thermal_cam: {
        type: "camera",
        fov_horizontal_deg: 30,
        fov_vertical_deg: 24,
        far: 500,
        color: 0xff0000,  // Red footprint
        opacity: 0.4
    }
};
```

## Testing

### Test Data Generation
```javascript
// Available in test-sensor-data.js
createTestSensorData();        // Generate test entities with sensor data
updateTestGimbalData();        // Simulate gimbal movement
```

### Manual Testing Scenarios
1. **Single Selection**: Select one drone, verify footprint appears
2. **Multiple Selection**: Select multiple entities, verify all show footprints  
3. **Direct Click**: Click entity in 3D view, verify footprint appears
4. **Menu Selection**: Select from entity menu, verify footprint appears
5. **Real-time Updates**: Move entity, verify footprint follows
6. **Terrain Conforming**: Check footprint follows terrain contours
7. **Toggle Control**: Use UI toggle, verify enable/disable works

## Future Enhancements

### Potential Additions
- **Sensor zoom visualization** - Dynamic FOV based on zoom level
- **Multiple sensors per entity** - Support for multi-camera payloads  
- **Dynamic sensor switching** - Toggle between different sensor views
- **Recording/playback** - Save/replay sensor coverage patterns
- **Coverage analysis** - Calculate terrain coverage percentages
- **Mission planning** - Integrate with waypoint system for coverage planning

### Performance Improvements
- **Level-of-detail** - Reduce geometry complexity at distance
- **Frustum culling** - Only update visible overlays
- **Instanced rendering** - Batch similar overlays for GPU efficiency
- **Web Workers** - Offload ray casting to separate thread

---

## Implementation Summary

This sensor overlay system successfully provides:
✅ Real-time 3D sensor footprint visualization  
✅ Terrain-conforming geometry with ray casting  
✅ Gimbal-aware orientation support  
✅ Multiple entity selection handling  
✅ Performance-optimized rendering  
✅ Backwards-compatible integration  
✅ UI toggle controls  
✅ Debug and monitoring tools  
✅ ROS2-ready architecture  

The system is production-ready and provides a solid foundation for advanced sensor visualization in the BGCS UAV Ground Control Station.