/**
 * BGCS Entity Controls - Chunk 5: Enhanced 3D Scene Foundation
 * Entity command interface for mode selection, target setting, and command validation
 */

class BGCSEntityControls {
    constructor(renderer3D, uiControls) {
        this.renderer3D = renderer3D;
        this.uiControls = uiControls;
        
        // Entity data model (shared state)
        this.entities = new Map(); // entityId -> entityData
        
        // Available entity modes
        this.droneMode = [
            'random_search',
            'follow_target', 
            'follow_teammate',
            'waypoint_mode',
            'kamikaze',
            'hold_position'
        ];
        
        this.targetModes = [
            'waypoint_mode',
            'hold_position'
        ];
        
        // Waypoint management
        this.waypoints = new Map(); // entityId -> waypoint array
        
        // Command queue for validation
        this.commandQueue = [];
        
        console.log('BGCSEntityControls initialized');
    }
    
    /**
     * Initialize entity controls
     */
    init() {
        try {
            this.setupModeControls();
            this.setupCommandButtons();
            this.setupWaypointSystem();
            
            console.log('Entity Controls initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize entity controls:', error);
            return false;
        }
    }
    
    /**
     * Setup mode control dropdowns and buttons
     */
    setupModeControls() {
        // Get mode buttons from the UI
        const modeButtons = document.querySelectorAll('.mode-btn');
        
        modeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.setSelectedEntitiesMode(mode);
            });
        });
        
        // Create dynamic mode selector for selected entities
        this.createModeSelector();
        
        console.log('Mode controls setup complete');
    }
    
    /**
     * Create dynamic mode selector in selection panel
     */
    createModeSelector() {
        const selectionContent = document.getElementById('selection-content');
        if (!selectionContent) return;
        
        // This will be populated when entities are selected
    }
    
    /**
     * Setup command buttons
     */
    setupCommandButtons() {
        // Focus selected button
        const focusBtn = document.getElementById('focus-selected');
        if (focusBtn) {
            focusBtn.addEventListener('click', () => {
                this.uiControls.focusOnSelected();
            });
        }
        
        // Clear waypoints button
        const clearWaypointsBtn = document.getElementById('clear-all-waypoints');
        if (clearWaypointsBtn) {
            clearWaypointsBtn.addEventListener('click', () => {
                this.clearAllWaypoints();
            });
        }
        
        // Delete selected button
        const deleteBtn = document.getElementById('delete-selected');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteSelectedEntities();
            });
        }
        
        console.log('Command buttons setup complete');
    }
    
    /**
     * Setup waypoint system
     */
    setupWaypointSystem() {
        // Waypoint placement will be handled through UI controls
        // This sets up the waypoint management system
        
        console.log('Waypoint system setup complete');
    }
    
    /**
     * Create or update entity data model
     */
    createEntity(entityId, type, initialData = {}) {
        const entityData = {
            entity_id: entityId,
            type: type,
            pose: {
                x: initialData.x || 0,
                y: initialData.y || 5,
                z: initialData.z || 0,
                yaw: initialData.yaw || 0,
                pitch: initialData.pitch || 0,
                roll: initialData.roll || 0
            },
            mode: type === 'drone' ? 'hold_position' : 'hold_position',
            path: [],
            target_id: null,
            teammate_id: null,
            properties: {
                speed: 5.0,
                detection_radius: 10.0,
                max_altitude: 100.0
            },
            ui: {
                selected: false,
                highlight: false,
                visible: true
            },
            status: {
                health: 100,
                battery: 100,
                connection: 'online'
            }
        };
        
        this.entities.set(entityId, entityData);
        this.waypoints.set(entityId, []);
        
        console.log(`Created entity data for ${entityId}:`, entityData);
        return entityData;
    }
    
    /**
     * Update entity data
     */
    updateEntity(entityId, updates) {
        const entity = this.entities.get(entityId);
        if (!entity) return null;
        
        // Deep merge updates
        this.deepMerge(entity, updates);
        
        // Update 3D representation
        this.sync3DEntity(entityId);
        
        return entity;
    }
    
    /**
     * Sync entity data with 3D representation
     */
    sync3DEntity(entityId) {
        const entity = this.entities.get(entityId);
        const mesh = this.renderer3D.entities.get(entityId);
        
        if (!entity || !mesh) return;
        
        // Update position
        mesh.position.set(entity.pose.x, entity.pose.y, entity.pose.z);
        
        // Update rotation (yaw, pitch, roll)
        mesh.rotation.set(
            THREE.MathUtils.degToRad(entity.pose.pitch),
            THREE.MathUtils.degToRad(entity.pose.yaw),
            THREE.MathUtils.degToRad(entity.pose.roll)
        );
        
        // Update visibility
        mesh.visible = entity.ui.visible;
        
        // Update selection state
        if (entity.ui.selected) {
            this.uiControls.selectEntity(entityId);
        }
    }
    
    /**
     * Set mode for selected entities
     */
    setSelectedEntitiesMode(mode) {
        const selectedIds = this.uiControls.getSelectedEntities();
        
        if (selectedIds.length === 0) {
            if (window.bgcsApp) {
                window.bgcsApp.log('No entities selected for mode change', 'warning');
            }
            return;
        }
        
        // Validate mode for each entity type
        const validCommands = [];
        const invalidCommands = [];
        
        selectedIds.forEach(entityId => {
            const entity = this.entities.get(entityId);
            if (!entity) return;
            
            if (this.validateModeForEntity(entity.type, mode)) {
                validCommands.push({ entityId, mode });
            } else {
                invalidCommands.push({ entityId, mode, reason: `Mode ${mode} not valid for ${entity.type}` });
            }
        });
        
        // Execute valid commands
        validCommands.forEach(cmd => {
            this.setEntityMode(cmd.entityId, cmd.mode);
        });
        
        // Report results
        if (validCommands.length > 0) {
            if (window.bgcsApp) {
                window.bgcsApp.log(`Set ${validCommands.length} entities to ${mode} mode`, 'success');
            }
        }
        
        if (invalidCommands.length > 0) {
            if (window.bgcsApp) {
                window.bgcsApp.log(`${invalidCommands.length} entities could not be set to ${mode} mode`, 'warning');
            }
        }
    }
    
    /**
     * Set mode for specific entity
     */
    setEntityMode(entityId, mode) {
        const entity = this.entities.get(entityId);
        if (!entity) return false;
        
        // Validate mode
        if (!this.validateModeForEntity(entity.type, mode)) {
            console.warn(`Invalid mode ${mode} for entity type ${entity.type}`);
            return false;
        }
        
        // Update entity data
        entity.mode = mode;
        
        // Clear incompatible data based on mode
        if (mode !== 'waypoint_mode') {
            entity.path = [];
        }
        if (mode !== 'follow_target') {
            entity.target_id = null;
        }
        if (mode !== 'follow_teammate') {
            entity.teammate_id = null;
        }
        
        // Visual feedback
        this.updateEntityModeVisual(entityId, mode);
        
        // Send command to backend (TODO: implement WebSocket client)
        this.queueCommand('set_mode', { entityId, mode });
        
        console.log(`Set entity ${entityId} mode to ${mode}`);
        return true;
    }
    
    /**
     * Validate if mode is valid for entity type
     */
    validateModeForEntity(entityType, mode) {
        if (entityType === 'drone') {
            return this.droneMode.includes(mode);
        } else if (entityType === 'target') {
            return this.targetModes.includes(mode);
        }
        return false;
    }
    
    /**
     * Add waypoint to entity
     */
    addWaypoint(entityId, position) {
        const entity = this.entities.get(entityId);
        if (!entity) return false;
        
        // Add to path
        entity.path.push({
            x: position.x,
            y: position.y || 5, // Default altitude
            z: position.z
        });
        
        // Update waypoint visualization
        this.updateWaypointVisual(entityId);
        
        // If entity isn't in waypoint mode, suggest switching
        if (entity.mode !== 'waypoint_mode') {
            if (window.bgcsApp) {
                window.bgcsApp.log(`Added waypoint to ${entityId}. Consider switching to waypoint mode.`, 'info');
            }
        }
        
        console.log(`Added waypoint to ${entityId}:`, position);
        return true;
    }
    
    /**
     * Remove waypoint from entity
     */
    removeWaypoint(entityId, waypointIndex) {
        const entity = this.entities.get(entityId);
        if (!entity || waypointIndex >= entity.path.length) return false;
        
        entity.path.splice(waypointIndex, 1);
        this.updateWaypointVisual(entityId);
        
        console.log(`Removed waypoint ${waypointIndex} from ${entityId}`);
        return true;
    }
    
    /**
     * Clear all waypoints for entity
     */
    clearEntityWaypoints(entityId) {
        const entity = this.entities.get(entityId);
        if (!entity) return false;
        
        entity.path = [];
        this.updateWaypointVisual(entityId);
        
        console.log(`Cleared all waypoints for ${entityId}`);
        return true;
    }
    
    /**
     * Clear all waypoints for all entities
     */
    clearAllWaypoints() {
        let count = 0;
        this.entities.forEach((entity, entityId) => {
            if (entity.path.length > 0) {
                entity.path = [];
                this.updateWaypointVisual(entityId);
                count++;
            }
        });
        
        if (window.bgcsApp) {
            window.bgcsApp.log(`Cleared waypoints for ${count} entities`, 'info');
        }
    }
    
    /**
     * Set target for entity (for follow_target mode)
     */
    setEntityTarget(entityId, targetId) {
        const entity = this.entities.get(entityId);
        const target = this.entities.get(targetId);
        
        if (!entity || !target) return false;
        
        entity.target_id = targetId;
        
        // Switch to follow_target mode if not already
        if (entity.mode !== 'follow_target') {
            this.setEntityMode(entityId, 'follow_target');
        }
        
        console.log(`Set ${entityId} to follow target ${targetId}`);
        return true;
    }
    
    /**
     * Set teammate for entity (for follow_teammate mode)
     */
    setEntityTeammate(entityId, teammateId) {
        const entity = this.entities.get(entityId);
        const teammate = this.entities.get(teammateId);
        
        if (!entity || !teammate) return false;
        
        entity.teammate_id = teammateId;
        
        // Switch to follow_teammate mode if not already
        if (entity.mode !== 'follow_teammate') {
            this.setEntityMode(entityId, 'follow_teammate');
        }
        
        console.log(`Set ${entityId} to follow teammate ${teammateId}`);
        return true;
    }
    
    /**
     * Update entity mode visual indication
     */
    updateEntityModeVisual(entityId, mode) {
        const mesh = this.renderer3D.entities.get(entityId);
        if (!mesh) return;
        
        // Color coding based on mode
        const modeColors = {
            'hold_position': 0x666666,  // Gray
            'random_search': 0x00FF00,  // Green
            'follow_target': 0xFF8C00,  // Orange
            'follow_teammate': 0x9400D3, // Purple
            'waypoint_mode': 0x0080FF,  // Blue
            'kamikaze': 0xFF0000       // Red
        };
        
        const color = modeColors[mode] || 0x666666;
        
        // Update material color (preserve selection if selected)
        if (!mesh.material.originalColor) {
            mesh.material.originalColor = mesh.material.color.clone();
        }
        
        if (!this.uiControls.selectedEntities.has(entityId)) {
            mesh.material.color.setHex(color);
            mesh.material.originalColor.setHex(color);
        }
    }
    
    /**
     * Update waypoint visualization
     */
    updateWaypointVisual(entityId) {
        // TODO: Implement waypoint line rendering
        // This would create line geometry connecting waypoints
        const entity = this.entities.get(entityId);
        if (!entity) return;
        
        console.log(`Updated waypoint visual for ${entityId}, waypoints:`, entity.path.length);
    }
    
    /**
     * Queue command for validation and sending
     */
    queueCommand(command, data) {
        const cmd = {
            command,
            data,
            timestamp: Date.now(),
            validated: this.validateCommand(command, data)
        };
        
        this.commandQueue.push(cmd);
        
        // TODO: Send to backend via WebSocket
        console.log('Queued command:', cmd);
    }
    
    /**
     * Validate command structure and data
     */
    validateCommand(command, data) {
        switch (command) {
            case 'set_mode':
                return data.entityId && data.mode && 
                       this.entities.has(data.entityId) &&
                       this.validateModeForEntity(this.entities.get(data.entityId).type, data.mode);
            
            case 'set_waypoint':
                return data.entityId && data.position &&
                       typeof data.position.x === 'number' &&
                       typeof data.position.z === 'number';
            
            case 'set_target':
                return data.entityId && data.targetId &&
                       this.entities.has(data.entityId) &&
                       this.entities.has(data.targetId);
            
            default:
                return false;
        }
    }
    
    /**
     * Delete selected entities
     */
    deleteSelectedEntities() {
        const selectedIds = this.uiControls.getSelectedEntities();
        
        selectedIds.forEach(entityId => {
            this.deleteEntity(entityId);
        });
        
        this.uiControls.clearSelection();
        
        if (window.bgcsApp) {
            window.bgcsApp.log(`Deleted ${selectedIds.length} entities`, 'info');
        }
    }
    
    /**
     * Delete specific entity
     */
    deleteEntity(entityId) {
        // Remove from data model
        this.entities.delete(entityId);
        this.waypoints.delete(entityId);
        
        // Remove from 3D scene
        this.renderer3D.removeEntity(entityId);
        
        // Remove from selection
        this.uiControls.deselectEntity(entityId);
        
        // Queue delete command
        this.queueCommand('delete_entity', { entityId });
        
        console.log(`Deleted entity ${entityId}`);
    }
    
    /**
     * Get entity data by ID
     */
    getEntity(entityId) {
        return this.entities.get(entityId);
    }
    
    /**
     * Get all entities
     */
    getAllEntities() {
        return Array.from(this.entities.values());
    }
    
    /**
     * Deep merge objects
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }
}

// Make available globally
window.BGCSEntityControls = BGCSEntityControls;