/**
 * Entity State Manager for BGCS Frontend
 * Manages client-side entity state synchronization with backend
 */

class BGCSEntityStateManager {
    constructor() {
        // Entity storage
        this.entities = new Map();
        this.selectedEntities = new Set();
        
        // State tracking
        this.lastUpdateTime = 0;
        this.updateCount = 0;
        this.fps = 0;
        this.simulationRunning = false;
        this.simulationSpeed = 1.0;
        this.simulationTime = 0.0;
        
        // Event system
        this.eventListeners = new Map();
        
        // Statistics
        this.stats = {
            entities_created: 0,
            entities_destroyed: 0,
            events_logged: 0,
            messages_sent: 0
        };
        
        // Recent events and messages
        this.recentEvents = [];
        this.recentMessages = [];
        
        // Entity interpolation for smooth movement
        this.interpolationEnabled = true; // Re-enabled with shorter duration
        this.interpolationFactor = 0.1;
        
        // Performance tracking
        this.lastFpsUpdate = Date.now();
        this.frameCount = 0;
        
    }
    
    /**
     * Process complete state update from server
     */
    processStateUpdate(stateData) {
        const startTime = performance.now();
        
        try {
            // Update simulation state
            this.simulationRunning = stateData.simulation_running || false;
            this.simulationSpeed = stateData.simulation_speed || 1.0;
            this.simulationTime = stateData.simulation_time || 0.0;
            this.fps = stateData.fps || 0;
            
            // Update statistics
            if (stateData.stats) {
                Object.assign(this.stats, stateData.stats);
            }
            
            // Update recent events
            if (stateData.recent_events) {
                this.recentEvents = stateData.recent_events;
            }
            
            // Update recent messages
            if (stateData.recent_messages) {
                this.recentMessages = stateData.recent_messages;
            }
            
            // Update selection state
            if (stateData.selected_entities) {
                this.updateSelection(stateData.selected_entities);
            }
            
            // Process entity updates
            if (stateData.entities) {
                this.updateEntities(stateData.entities);
            }
            
            // Update performance tracking
            this.lastUpdateTime = Date.now();
            this.updateCount++;
            this.updateFrameCount();
            
            // Emit state update event
            this.emit('state_updated', {
                entities: this.entities,
                selectedEntities: this.selectedEntities,
                stats: this.getStats()
            });
            
            const processingTime = performance.now() - startTime;
            if (processingTime > 50) { // Only warn if processing takes over 50ms (was 10ms)
                console.warn(`State update processing took ${processingTime.toFixed(2)}ms`);
            }
            
        } catch (error) {
            console.error('Error processing state update:', error);
        }
    }
    
    /**
     * Update entities from server data
     */
    updateEntities(entitiesData) {
        const existingEntityIds = new Set(this.entities.keys());
        const serverEntityIds = new Set(Object.keys(entitiesData));
        
        // Update or create entities
        for (const [entityId, entityData] of Object.entries(entitiesData)) {
            const existingEntity = this.entities.get(entityId);
            
            if (existingEntity) {
                // Update existing entity
                this.updateEntity(existingEntity, entityData);
            } else {
                // Create new entity
                this.createEntity(entityId, entityData);
            }
            
            existingEntityIds.delete(entityId);
        }
        
        // Remove entities that no longer exist on server
        for (const entityId of existingEntityIds) {
            this.removeEntity(entityId);
        }
    }
    
    /**
     * Create new entity from server data
     */
    createEntity(entityId, entityData) {
        const entity = {
            id: entityId,
            type: entityData.entity_type || 'entity',
            
            // Position and movement
            position: this.createVector3(entityData.position),
            targetPosition: this.createVector3(entityData.target_position),
            velocity: this.createVector3(entityData.velocity),
            heading: entityData.heading || 0,
            
            // Entity properties
            maxSpeed: entityData.max_speed || 10,
            detectionRadius: entityData.detection_radius || 100,
            collisionRadius: entityData.collision_radius || 5,
            
            // State flags
            health: entityData.health || 1.0,
            detected: entityData.detected || false,
            selected: entityData.selected || false,
            destroyed: entityData.destroyed || false,
            
            // Control data
            waypoints: (entityData.waypoints || []).map(wp => this.createVector3(wp)),
            currentMode: entityData.current_mode || 'idle',
            
            // Entity-specific properties
            ...this.getEntitySpecificProperties(entityData),
            
            // Sensors data from backend (if present)
            sensors: entityData.sensors || null,
            
            // Timestamps
            createdTime: entityData.created_time || Date.now() / 1000,
            lastUpdateTime: entityData.last_update_time || Date.now() / 1000,
            
            // Client-side interpolation data
            _interpolation: {
                lastPosition: this.createVector3(entityData.position),
                targetPosition: this.createVector3(entityData.position),
                startTime: Date.now(),
                duration: 100 // Interpolation duration in ms (optimized for 60 FPS)
            }
        };
        
        this.entities.set(entityId, entity);
        this.stats.entities_created++;
        
        // Emit entity created event
        this.emit('entity_created', entity);
        
        return entity;
    }
    
    /**
     * Update existing entity with server data
     */
    updateEntity(entity, entityData) {
        const oldPosition = { ...entity.position };
        
        const newPos = this.createVector3(entityData.position);
        const positionChanged = Math.abs(entity.position.x - newPos.x) > 0.01 ||
                               Math.abs(entity.position.y - newPos.y) > 0.01 ||
                               Math.abs(entity.position.z - newPos.z) > 0.01;
        
        // Update interpolation target if position changed
        if (this.interpolationEnabled && positionChanged) {
            entity._interpolation.lastPosition = { ...entity.position };
            entity._interpolation.targetPosition = newPos;
            entity._interpolation.startTime = Date.now();
            
        } else if (!this.interpolationEnabled) {
            // If interpolation is disabled, update position directly
            Object.assign(entity.position, newPos);
        }
        // If interpolation is enabled and position changed, let interpolatePositions() handle the position updates
        Object.assign(entity.targetPosition, this.createVector3(entityData.target_position));
        Object.assign(entity.velocity, this.createVector3(entityData.velocity));
        entity.heading = entityData.heading || entity.heading;
        
        // Update state flags
        entity.health = entityData.health ?? entity.health;
        entity.detected = entityData.detected ?? entity.detected;
        entity.selected = entityData.selected ?? entity.selected;
        entity.destroyed = entityData.destroyed ?? entity.destroyed;
        
        // Update control data
        entity.currentMode = entityData.current_mode || entity.currentMode;
        if (entityData.waypoints) {
            entity.waypoints = entityData.waypoints.map(wp => this.createVector3(wp));
        }
        
        // Update entity-specific properties
        Object.assign(entity, this.getEntitySpecificProperties(entityData));
        
        // Update sensors data from backend (if present)
        if (entityData.sensors) {
            entity.sensors = entityData.sensors;
        }
        
        // Update timestamp
        entity.lastUpdateTime = entityData.last_update_time || Date.now() / 1000;
        
        // Emit entity updated event
        this.emit('entity_updated', entity, oldPosition);
    }
    
    /**
     * Get entity-specific properties based on type
     */
    getEntitySpecificProperties(entityData) {
        const properties = {};
        
        switch (entityData.entity_type) {
            case 'drone':
                properties.targetEntityId = entityData.target_entity_id;
                properties.teammateEntityId = entityData.teammate_entity_id;
                properties.followDistance = entityData.follow_distance || 20;
                properties.kamikazeEnabled = entityData.kamikaze_enabled ?? true;
                properties.huntingRange = entityData.hunting_range || 200;
                properties.turnRate = entityData.turn_rate || Math.PI;
                properties.approachThreshold = entityData.approach_threshold || 5;
                properties.patrolAreaSize = entityData.patrol_area_size || 100;
                properties.engagementRange = entityData.engagement_range || 10;
                properties.validModes = entityData.valid_modes || ['hold_position'];
                properties.visualState = entityData.visual_state || 'green';
                break;
                
            case 'target':
                properties.targetType = entityData.target_type || 'generic';
                properties.confidence = entityData.confidence || 0.5;
                properties.lastDetectionTime = entityData.last_detection_time;
                properties.detectionState = entityData.detection_state || 'undetected';
                properties.threat_level = entityData.threat_level || 'low';
                properties.validModes = entityData.valid_modes || ['hold_position'];
                properties.visualState = entityData.visual_state || 'red';
                break;
        }
        
        return properties;
    }
    
    /**
     * Remove entity
     */
    removeEntity(entityId) {
        const entity = this.entities.get(entityId);
        if (!entity) return false;
        
        this.entities.delete(entityId);
        this.selectedEntities.delete(entityId);
        this.stats.entities_destroyed++;
        
        // Emit entity removed event
        this.emit('entity_removed', entity);
        
        return true;
    }
    
    /**
     * Update selection state
     */
    updateSelection(selectedEntityIds) {
        const oldSelection = new Set(this.selectedEntities);
        this.selectedEntities = new Set(selectedEntityIds);
        
        // Update entity selection flags
        for (const entity of this.entities.values()) {
            entity.selected = this.selectedEntities.has(entity.id);
        }
        
        // Emit selection change event if changed
        if (!this.setsEqual(oldSelection, this.selectedEntities)) {
            this.emit('selection_changed', {
                selected: Array.from(this.selectedEntities),
                previousSelection: Array.from(oldSelection)
            });
        }
    }
    
    /**
     * Interpolate entity positions for smooth movement
     */
    interpolatePositions() {
        if (!this.interpolationEnabled) return;
        
        const now = Date.now();
        let activeInterpolations = 0;
        
        for (const entity of this.entities.values()) {
            const interp = entity._interpolation;
            if (!interp.startTime) continue;
            
            activeInterpolations++;
            const elapsed = now - interp.startTime;
            const progress = Math.min(elapsed / interp.duration, 1.0);
            
            if (progress < 1.0) {
                // Interpolate between last and target position
                const factor = this.easeInOutSine(progress);
                
                const oldPosition = { ...entity.position };
                entity.position.x = this.lerp(interp.lastPosition.x, interp.targetPosition.x, factor);
                entity.position.y = this.lerp(interp.lastPosition.y, interp.targetPosition.y, factor);
                entity.position.z = this.lerp(interp.lastPosition.z, interp.targetPosition.z, factor);
                
                
                // Emit update event so 3D renderer gets the interpolated position
                this.emit('entity_updated', entity, oldPosition);
            } else {
                // Interpolation complete
                const oldPosition = { ...entity.position };
                entity.position = { ...interp.targetPosition };
                interp.startTime = null;
                
                
                // Emit final position update
                this.emit('entity_updated', entity, oldPosition);
            }
        }
        
    }
    
    /**
     * Get entity by ID
     */
    getEntity(entityId) {
        return this.entities.get(entityId);
    }
    
    /**
     * Update entity mode immediately
     */
    updateEntityMode(entityId, newMode) {
        const entity = this.entities.get(entityId);
        if (entity) {
            entity.currentMode = newMode;
            // Emit update event
            this.emit('entity_updated', entity, entity.position);
            return true;
        }
        return false;
    }
    
    /**
     * Get all entities
     */
    getAllEntities() {
        return Array.from(this.entities.values());
    }
    
    /**
     * Get entities by type
     */
    getEntitiesByType(type) {
        return Array.from(this.entities.values()).filter(entity => entity.type === type);
    }
    
    /**
     * Get selected entities
     */
    getSelectedEntities() {
        return Array.from(this.selectedEntities).map(id => this.entities.get(id)).filter(Boolean);
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            entityCount: this.entities.size,
            selectedCount: this.selectedEntities.size,
            fps: this.fps,
            simulationRunning: this.simulationRunning,
            simulationSpeed: this.simulationSpeed,
            simulationTime: this.simulationTime
        };
    }
    
    // Event system
    
    /**
     * Add event listener
     */
    on(eventType, listener) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(listener);
    }
    
    /**
     * Remove event listener
     */
    off(eventType, listener) {
        if (this.eventListeners.has(eventType)) {
            const listeners = this.eventListeners.get(eventType);
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * Emit event
     */
    emit(eventType, ...args) {
        if (this.eventListeners.has(eventType)) {
            const listeners = this.eventListeners.get(eventType);
            listeners.forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error(`Error in ${eventType} event listener:`, error);
                }
            });
        }
    }
    
    // Utility methods
    
    /**
     * Create Vector3 object
     */
    createVector3(data) {
        if (!data) return { x: 0, y: 0, z: 0 };
        return {
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0
        };
    }
    
    /**
     * Check if two sets are equal
     */
    setsEqual(set1, set2) {
        if (set1.size !== set2.size) return false;
        for (const item of set1) {
            if (!set2.has(item)) return false;
        }
        return true;
    }
    
    /**
     * Linear interpolation
     */
    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    /**
     * Ease out quart function for smooth interpolation
     */
    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }
    
    /**
     * Ease in-out sine function for very smooth interpolation
     */
    easeInOutSine(t) {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }
    
    /**
     * Update frame count for FPS calculation
     */
    updateFrameCount() {
        this.frameCount++;
        const now = Date.now();
        
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }
    
    /**
     * Clear all entities and state
     */
    clear() {
        this.entities.clear();
        this.selectedEntities.clear();
        this.recentEvents = [];
        this.recentMessages = [];
        
        this.emit('state_cleared');
    }
}

// Export for use in other modules
window.BGCSEntityStateManager = BGCSEntityStateManager;