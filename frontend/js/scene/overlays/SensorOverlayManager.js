/**
 * BGCS Sensor Overlay Manager
 * Manages footprint and viewshed overlays for selected entities with gimbal support
 */

class BGCSSensorOverlayManager {
    constructor(renderer3D, terrain) {
        this.renderer3D = renderer3D;
        this.terrain = terrain;
        
        // Feature flags
        this.globalEnabled = true;
        this.footprintEnabled = false;
        
        // Overlay renderers
        this.footprintRenderer = null;
        
        // Entity tracking
        this.selectedEntities = new Set();
        this.sensorData = new Map(); // entityId -> sensor configurations
        this.overlayMeshes = new Map(); // entityId -> Three.js meshes
        
        // Performance throttling
        this.lastUpdateTime = 0;
        this.updateInterval = 16; // ~60 FPS for overlays (match drone movement)
        
        // Animation loop for continuous updates
        this.isAnimating = false;
        this.animationFrameId = null;
        
        this.initialized = false;
    }
    
    /**
     * Initialize overlay system
     */
    async init() {
        if (this.initialized) return true;
        
        try {
            // Load overlay renderers
            if (typeof BGCSFootprintOverlay !== 'undefined') {
                this.footprintRenderer = new BGCSFootprintOverlay(this.renderer3D.scene, this.terrain);
                await this.footprintRenderer.init();
            }
            
            // Load default sensor configurations
            this.loadDefaultSensorConfigs();
            
            // Start continuous update loop
            this.startUpdateLoop();
            
            this.initialized = true;
            console.log('SensorOverlayManager initialized with continuous updates');
            return true;
            
        } catch (error) {
            console.warn('SensorOverlayManager initialization failed:', error);
            return false;
        }
    }
    
    /**
     * Load default sensor configurations for different vehicle types
     */
    loadDefaultSensorConfigs() {
        // Default drone camera sensors with gimbal capabilities
        this.defaultSensors = {
            drone: {
                main_cam: {
                    type: "camera",
                    fov_horizontal_deg: 70,  // Horizontal field of view
                    fov_vertical_deg: 52.5,  // Vertical field of view (4:3 aspect ratio)
                    near: 0.5,               // Minimum range (meters)
                    far: 500.0,              // Maximum range (meters) - increased for better visibility
                    
                    // Gimbal configuration
                    gimbal: {
                        pan: -15,            // Current pan angle (degrees, relative to vehicle heading)
                        tilt: -60,           // Current tilt angle (degrees, negative = down)
                        pan_range: [-180, 180],  // Pan limits
                        tilt_range: [-90, 30],   // Tilt limits
                        stabilized: true     // Gimbal stabilization enabled
                    },
                    
                    // Physical mount offset from entity center
                    mount_offset: { x: 0, y: -0.1, z: 0.05 },
                    
                    // Visual properties
                    color: 0x4a9eff,         // Military blue for drone camera footprint
                    opacity: 0.25
                }
            },
            
            // Military reconnaissance drone
            recon_drone: {
                main_cam: {
                    type: "camera",
                    fov_horizontal_deg: 45,  // Narrower FOV for recon
                    fov_vertical_deg: 33.75,
                    near: 1.0,
                    far: 800.0,              // Longer range for surveillance
                    
                    gimbal: {
                        pan: 20, tilt: -65,
                        pan_range: [-180, 180],
                        tilt_range: [-90, 20],
                        stabilized: true
                    },
                    
                    mount_offset: { x: 0, y: -0.08, z: 0.03 },
                    color: 0x7c4dff,         // Military purple for recon
                    opacity: 0.3
                }
            },
            
            // Attack/strike drone  
            strike_drone: {
                targeting_cam: {
                    type: "camera",
                    fov_horizontal_deg: 30,  // Narrow targeting FOV
                    fov_vertical_deg: 22.5,
                    near: 0.5,
                    far: 600.0,
                    
                    gimbal: {
                        pan: -30, tilt: -70,
                        pan_range: [-120, 120],
                        tilt_range: [-90, 10],
                        stabilized: true
                    },
                    
                    mount_offset: { x: 0, y: -0.12, z: 0.08 },
                    color: 0xff5722,         // Military orange-red for targeting
                    opacity: 0.35
                }
            },
            
            target: {
                // Targets don't have sensor footprints - they are what gets detected
            }
        };
    }
    
    /**
     * Update selected entities for overlay rendering
     */
    updateSelection(selectedEntityIds) {
        if (!this.initialized || !this.globalEnabled) return;
        
        const newSelection = new Set(selectedEntityIds);
        
        // Remove overlays for deselected entities
        for (const entityId of this.selectedEntities) {
            if (!newSelection.has(entityId)) {
                this.removeEntityOverlays(entityId);
            }
        }
        
        // Add overlays for newly selected entities
        for (const entityId of newSelection) {
            if (!this.selectedEntities.has(entityId)) {
                this.addEntityOverlays(entityId);
            }
        }
        
        this.selectedEntities = newSelection;
    }
    
    /**
     * Start continuous update loop for real-time overlay updates
     */
    startUpdateLoop() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        const updateLoop = () => {
            if (!this.isAnimating) return;
            
            this.updateAllOverlaysRealtime();
            this.animationFrameId = requestAnimationFrame(updateLoop);
        };
        
        this.animationFrameId = requestAnimationFrame(updateLoop);
    }
    
    /**
     * Stop continuous update loop
     */
    stopUpdateLoop() {
        this.isAnimating = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Update all overlays in real-time (called every frame)
     */
    updateAllOverlaysRealtime() {
        if (!this.globalEnabled) {
            return;
        }
        
        if (this.selectedEntities.size === 0) {
            return;
        }
        
        // Throttle expensive operations
        const now = Date.now();
        const shouldUpdate = (now - this.lastUpdateTime) >= this.updateInterval;
        
        if (!shouldUpdate) return;
        this.lastUpdateTime = now;
        
        // Get current entity positions from 3D renderer
        for (const entityId of this.selectedEntities) {
            this.updateEntityOverlaysFromRenderer(entityId);
        }
    }
    
    /**
     * Update entity overlays using current position from 3D renderer
     */
    updateEntityOverlaysFromRenderer(entityId) {
        if (!this.renderer3D || !this.renderer3D.entities) return;
        
        const entityMesh = this.renderer3D.entities.get(entityId);
        if (!entityMesh) return;
        
        // Get current position and rotation from 3D mesh
        const currentPosition = {
            x: entityMesh.position.x,
            y: entityMesh.position.y,
            z: entityMesh.position.z
        };
        
        const currentRotation = {
            x: entityMesh.rotation.x,
            y: entityMesh.rotation.y,
            z: entityMesh.rotation.z
        };
        
        // Update sensor data with current transform
        const existingSensorData = this.sensorData.get(entityId);
        if (existingSensorData) {
            // Check if position actually changed (avoid unnecessary updates)
            const oldPos = existingSensorData.position;
            const oldRot = existingSensorData.rotation;
            
            const posChanged = !oldPos || 
                Math.abs(oldPos.x - currentPosition.x) > 0.05 || 
                Math.abs(oldPos.z - currentPosition.z) > 0.05 ||
                Math.abs((oldRot?.y || 0) - currentRotation.y) > 0.005;
            
            if (posChanged) {
                
                // Update position and rotation in sensor data
                existingSensorData.position = currentPosition;
                existingSensorData.rotation = currentRotation;
                
                // Update the actual overlay meshes
                this.updateEntityOverlays(entityId);
            }
        }
    }
    
    /**
     * Update entity sensor data from WebSocket state
     */
    updateEntitySensorData(entityId, entityData) {
        if (!this.initialized || !this.globalEnabled) return;
        
        // Get entity type for default sensors
        const entityType = this.getEntityType(entityId, entityData);
        const defaultSensors = this.defaultSensors[entityType] || {};
        
        
        // Check if this is a new entity (first time we're setting sensor data)
        const isNewEntity = !this.sensorData.has(entityId);
        const existingSensorData = this.sensorData.get(entityId);
        
        // Merge provided sensor data with defaults
        const sensors = {};
        
        // If backend provides sensor data, use it; otherwise use defaults
        if (entityData.sensors && Object.keys(entityData.sensors).length > 0) {
            // Backend sensor data available - merge with defaults
            for (const [sensorId, defaultSensor] of Object.entries(defaultSensors)) {
                const backendSensor = entityData.sensors[sensorId];
                
                if (backendSensor) {
                    // Use backend sensor data with defaults as fallback
                    sensors[sensorId] = {
                        ...defaultSensor,  // Static configuration (FOV, ranges, colors)
                        enabled: backendSensor.enabled !== undefined ? backendSensor.enabled : defaultSensor.enabled || true
                    };
                    
                    // Use backend gimbal data if available
                    if (backendSensor.gimbal) {
                        sensors[sensorId].gimbal = {
                            ...defaultSensor.gimbal,  // Keep static config (ranges, etc.)
                            pan: backendSensor.gimbal.pan,   // Use backend dynamic values
                            tilt: backendSensor.gimbal.tilt  // Use backend dynamic values
                        };
                    } else if (defaultSensor.gimbal) {
                        // No backend gimbal data, use defaults
                        sensors[sensorId].gimbal = { ...defaultSensor.gimbal };
                    }
                } else {
                    // Backend doesn't have this sensor, use defaults
                    sensors[sensorId] = { ...defaultSensor };
                }
            }
            
            // Also add any backend sensors not in defaults
            for (const [sensorId, backendSensor] of Object.entries(entityData.sensors)) {
                if (!sensors[sensorId]) {
                    sensors[sensorId] = {
                        type: "camera",
                        enabled: backendSensor.enabled !== undefined ? backendSensor.enabled : true,
                        // Add basic defaults for unknown sensors
                        fov_horizontal_deg: 70,
                        fov_vertical_deg: 52.5,
                        near: 0.5,
                        far: 200.0,
                        color: 0x4a9eff,
                        opacity: 0.25,
                        gimbal: backendSensor.gimbal || { pan: 0, tilt: -15 }
                    };
                }
            }
        } else {
            // No backend sensor data - use defaults (graceful fallback)
            for (const [sensorId, defaultSensor] of Object.entries(defaultSensors)) {
                sensors[sensorId] = { ...defaultSensor };
            }
        }
        
        // Store merged sensor configuration
        this.sensorData.set(entityId, {
            position: entityData.position || { x: 0, y: 0, z: 0 },
            rotation: entityData.rotation || { x: 0, y: 0, z: 0 },
            sensors: sensors
        });
        
        // Update overlays if entity is selected
        if (this.selectedEntities.has(entityId)) {
            this.updateEntityOverlays(entityId);
        }
    }
    
    /**
     * Add overlays for newly selected entity
     */
    addEntityOverlays(entityId) {
        // Skip targets - they don't have sensor footprints
        const entityType = this.getEntityType(entityId, {});
        if (entityType === 'target') {
            return;
        }
        
        let sensorData = this.sensorData.get(entityId);
        
        // If no sensor data exists, create default data from renderer position
        if (!sensorData) {
            if (this.renderer3D && this.renderer3D.entities && this.renderer3D.entities.has(entityId)) {
                const entityMesh = this.renderer3D.entities.get(entityId);
                const entityType = this.getEntityType(entityId, {});
                const defaultSensors = this.defaultSensors[entityType] || {};
                
                sensorData = {
                    position: {
                        x: entityMesh.position.x,
                        y: entityMesh.position.y,
                        z: entityMesh.position.z
                    },
                    rotation: {
                        x: entityMesh.rotation.x,
                        y: entityMesh.rotation.y,
                        z: entityMesh.rotation.z
                    },
                    sensors: { ...defaultSensors }
                };
                
                this.sensorData.set(entityId, sensorData);
            } else {
                return; // Can't create overlays without position data
            }
        }
        
        if (!sensorData.sensors) return;
        
        const overlays = {};
        
        // Create footprint overlays for each sensor
        if (this.footprintEnabled && this.footprintRenderer) {
            for (const [sensorId, sensor] of Object.entries(sensorData.sensors)) {
                const footprintMesh = this.footprintRenderer.createFootprint(
                    entityId, 
                    sensorId, 
                    sensor, 
                    sensorData.position, 
                    sensorData.rotation
                );
                
                if (footprintMesh) {
                    overlays[`${sensorId}_footprint`] = footprintMesh;
                }
            }
        }
        
        if (Object.keys(overlays).length > 0) {
            this.overlayMeshes.set(entityId, overlays);
        }
    }
    
    /**
     * Update overlays for existing entity (position/sensor changes)
     */
    updateEntityOverlays(entityId) {
        // Skip throttling for individual entity updates - already handled in realtime loop
        // This allows more responsive updates when position changes are detected
        
        const sensorData = this.sensorData.get(entityId);
        const overlays = this.overlayMeshes.get(entityId);
        
        if (!sensorData || !overlays) return;
        
        // Update each overlay mesh with new position/orientation
        for (const [overlayKey, mesh] of Object.entries(overlays)) {
            // Fix: overlayKey is "main_cam_footprint", need to split differently
            const lastUnderscoreIndex = overlayKey.lastIndexOf('_');
            const sensorId = overlayKey.substring(0, lastUnderscoreIndex); // "main_cam"
            const overlayType = overlayKey.substring(lastUnderscoreIndex + 1); // "footprint"
            
            const sensor = sensorData.sensors[sensorId];
            if (!sensor) continue;
            
            if (overlayType === 'footprint' && this.footprintRenderer) {
                this.footprintRenderer.updateFootprint(
                    mesh, sensor, sensorData.position, sensorData.rotation
                );
            }
        }
    }
    
    /**
     * Remove overlays for deselected entity
     */
    removeEntityOverlays(entityId) {
        const overlays = this.overlayMeshes.get(entityId);
        if (!overlays) return;
        
        // Remove all overlay meshes from scene
        for (const mesh of Object.values(overlays)) {
            if (mesh && mesh.parent) {
                mesh.parent.remove(mesh);
            }
            
            // Dispose geometry and material
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(mat => mat.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        
        this.overlayMeshes.delete(entityId);
    }
    
    /**
     * Remove entity from tracking when deleted
     */
    removeEntity(entityId) {
        this.removeEntityOverlays(entityId);
        this.sensorData.delete(entityId);
        this.selectedEntities.delete(entityId);
    }
    
    /**
     * Get entity type from entity data
     */
    getEntityType(entityId, entityData) {
        if (entityData.entity_type) return entityData.entity_type;
        if (entityData.type) return entityData.type;
        if (entityId.includes('drone')) return 'drone';
        if (entityId.includes('target')) return 'target';
        return 'drone'; // Default fallback
    }
    
    /**
     * Set overlay feature flags
     */
    setFeatureFlags(flags) {
        if (flags.globalEnabled !== undefined) {
            this.globalEnabled = flags.globalEnabled;
        }
        if (flags.footprintEnabled !== undefined) {
            this.footprintEnabled = flags.footprintEnabled;
        }
        
        // Refresh overlays if settings changed
        if (this.globalEnabled) {
            this.refreshAllOverlays();
        } else {
            this.clearAllOverlays();
        }
    }
    
    /**
     * Refresh all current overlays
     */
    refreshAllOverlays() {
        const selectedIds = Array.from(this.selectedEntities);
        this.clearAllOverlays();
        this.updateSelection(selectedIds);
    }
    
    /**
     * Clear all overlays
     */
    clearAllOverlays() {
        for (const entityId of this.selectedEntities) {
            this.removeEntityOverlays(entityId);
        }
    }
    
    /**
     * Dispose of all resources and stop update loop
     */
    dispose() {
        this.stopUpdateLoop();
        this.clearAllOverlays();
        this.sensorData.clear();
        this.overlayMeshes.clear();
        this.selectedEntities.clear();
        this.initialized = false;
    }
    
    /**
     * Update gimbal orientation for specific sensor
     */
    updateSensorGimbal(entityId, sensorId, gimbalData) {
        const entitySensorData = this.sensorData.get(entityId);
        if (!entitySensorData || !entitySensorData.sensors[sensorId]) return;
        
        // Update gimbal data
        const sensor = entitySensorData.sensors[sensorId];
        if (sensor.gimbal) {
            sensor.gimbal = {
                ...sensor.gimbal,
                ...gimbalData
            };
            
            // Clamp values to ranges
            if (sensor.gimbal.pan_range) {
                sensor.gimbal.pan = Math.max(sensor.gimbal.pan_range[0], 
                    Math.min(sensor.gimbal.pan_range[1], sensor.gimbal.pan));
            }
            if (sensor.gimbal.tilt_range) {
                sensor.gimbal.tilt = Math.max(sensor.gimbal.tilt_range[0], 
                    Math.min(sensor.gimbal.tilt_range[1], sensor.gimbal.tilt));
            }
            
            // Update overlays if entity is selected
            if (this.selectedEntities.has(entityId)) {
                this.updateEntityOverlays(entityId);
            }
        }
    }
    
    /**
     * Get debug info for monitoring
     */
    getDebugInfo() {
        return {
            initialized: this.initialized,
            globalEnabled: this.globalEnabled,
            footprintEnabled: this.footprintEnabled,
            selectedEntities: this.selectedEntities.size,
            trackedEntities: this.sensorData.size,
            activeOverlays: this.overlayMeshes.size,
            hasFootprintRenderer: !!this.footprintRenderer,
            hasTerrain: !!this.terrain
        };
    }
}

// Make globally accessible
window.BGCSSensorOverlayManager = BGCSSensorOverlayManager;