/**
 * BGCS Frontend Application - Chunk 4: Frontend Shell
 * Basic app initialization and UI interactions
 */

class BGCSApp {
    constructor() {
        this.initialized = false;
        this.canvas = null;
        this.ctx = null;
        
        // 3D Scene components
        this.renderer3D = null;
        this.cameraManager = null;
        this.uiControls = null;
        this.entityControls = null;
        
        // Network components
        this.websocketClient = null;
        this.entityStateManager = null;
        this.isConnected = false;
        
        // UI State
        this.selectedEntities = new Set();
        this.currentView = 'top'; // 'top' or '3d'
        this.entityScale = 1.0;
        this.simulationSpeed = 1.0;
        
        // UI Elements
        this.elements = {};
        
        // Groups management
        this.groups = new Map(); // groupId -> groupData
        this.groupCounter = 0;
        
        // Track last selected entity for range selection
        this.lastSelectedEntityId = null;
        this.lastSelectedGroupId = null;
        
        // Tab cycling through entities
        this.tabCycleIndex = -1;
        this.tabCycleEntityList = [];
        
        // Console
        this.console = {
            maxEntries: 1000,
            entries: []
        };
        
        // Performance tracking
        this.lastStateUpdate = 0;
        this.stateUpdateCount = 0;
        this.averageLatency = 0;
        
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            this.setupCanvas();
            await this.setup3DScene(); // Now async for terrain loading
            this.setupControls();
            this.setupNetworking();
            this.setupUIElements();
            this.setupEventListeners();
            this.setupConsole();
            
            this.startUIUpdateLoop();
            this.startRendering();
            
            // Connect to backend after UI is ready
            await this.connectToBackend();
            
            this.initialized = true;
            this.log('BGCS Ground Control Station initialized', 'info');
            this.log('3D Scene Foundation with terrain loaded successfully', 'success');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize BGCS App:', error);
            this.log(`Initialization failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Setup canvas element
     */
    setupCanvas() {
        this.canvas = document.getElementById('main-canvas');
        if (!this.canvas) {
            throw new Error('Main canvas not found');
        }
        
        this.resizeCanvas();
    }
    
    /**
     * Setup 3D scene components
     */
    async setup3DScene() {
        try {
            // Initialize camera manager
            this.cameraManager = new BGCSCameraManager(this.canvas);
            if (!this.cameraManager.init()) {
                throw new Error('Failed to initialize camera manager');
            }
            window.bgcsCameras = this.cameraManager; // Make globally accessible
            
            // Initialize 3D renderer (now async for terrain loading)
            this.renderer3D = new BGCS3DRenderer(this.canvas);
            const initSuccess = await this.renderer3D.init();
            if (!initSuccess) {
                throw new Error('Failed to initialize 3D renderer');
            }
            window.bgcs3D = this.renderer3D; // Make globally accessible
            
            // Add some demo entities for testing
            this.addDemoEntities();
            
            this.log('3D Scene Foundation with terrain initialized', 'success');
        } catch (error) {
            console.error('3D Scene setup failed:', error);
            this.log(`3D Scene setup failed: ${error.message}`, 'error');
            
            // Fall back to 2D canvas if 3D fails
            this.setup2DFallback();
        }
    }
    
    /**
     * Setup 2D fallback if 3D fails
     */
    setup2DFallback() {
        // Skip 2D fallback if 3D renderer is active
        if (this.renderer3D) return;
        
        // Only get 2D context if 3D failed
        if (!this.ctx) {
            this.ctx = this.canvas.getContext('2d');
        }
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawPlaceholderContent();
        
        this.log('Using 2D canvas fallback', 'warning');
        console.log('Using 2D canvas fallback');
    }
    
    /**
     * Setup control systems
     */
    setupControls() {
        try {
            // Initialize UI controls
            this.uiControls = new BGCSUIControls(this.canvas, this.renderer3D, this.cameraManager);
            if (!this.uiControls.init()) {
                throw new Error('Failed to initialize UI controls');
            }
            window.bgcsUIControls = this.uiControls; // Make globally accessible
            
            // Initialize entity controls
            this.entityControls = new BGCSEntityControls(this.renderer3D, this.uiControls);
            if (!this.entityControls.init()) {
                throw new Error('Failed to initialize entity controls');
            }
            window.bgcsEntityControls = this.entityControls; // Make globally accessible
            
            this.log('UI and Entity Controls initialized', 'success');
        } catch (error) {
            console.error('Control systems setup failed:', error);
            this.log(`Control systems setup failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Setup networking components
     */
    setupNetworking() {
        try {
            // Initialize entity state manager
            this.entityStateManager = new BGCSEntityStateManager();
            window.bgcsEntityStateManager = this.entityStateManager; // Make globally accessible
            
            // Initialize WebSocket client
            this.websocketClient = new BGCSWebSocketClient();
            window.bgcsWebSocketClient = this.websocketClient; // Make globally accessible
            
            // Setup state manager event listeners
            this.setupStateManagerEvents();
            
            // Setup WebSocket event listeners
            this.setupWebSocketEvents();
            
            this.log('WebSocket client and state manager initialized', 'success');
        } catch (error) {
            console.error('Networking setup failed:', error);
            this.log(`Networking setup failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Setup entity state manager event listeners
     */
    setupStateManagerEvents() {
        // Entity creation
        this.entityStateManager.on('entity_created', (entity) => {
            this.handleEntityCreated(entity);
        });
        
        // Entity updates
        this.entityStateManager.on('entity_updated', (entity, oldPosition) => {
            this.handleEntityUpdated(entity, oldPosition);
        });
        
        // Entity removal
        this.entityStateManager.on('entity_removed', (entity) => {
            this.handleEntityRemoved(entity);
        });
        
        // Selection changes (not used - selection is frontend-only)
        
        // State updates
        this.entityStateManager.on('state_updated', (stateData) => {
            this.handleStateUpdated(stateData);
        });
    }
    
    /**
     * Setup WebSocket event listeners
     */
    setupWebSocketEvents() {
        // Connection events
        this.websocketClient.onConnected((clientId) => {
            this.isConnected = true;
            this.log(`Connected to backend server (Client ID: ${clientId})`, 'success');
            this.updateConnectionStatus('online');
        });
        
        this.websocketClient.onDisconnected(() => {
            this.isConnected = false;
            this.log('Disconnected from backend server', 'warning');
            this.updateConnectionStatus('offline');
        });
        
        // State update messages
        this.websocketClient.onMessage('state_update', (data) => {
            this.entityStateManager.processStateUpdate(data);
            this.stateUpdateCount++;
            this.lastStateUpdate = Date.now();
        });
        
        // Entity event messages
        this.websocketClient.onMessage('entity_spawned', (data) => {
            this.log(`Entity spawned: ${data.entity_type} "${data.entity_id}"`, 'info');
        });
        
        this.websocketClient.onMessage('entity_deleted', (data) => {
            this.log(`Entity deleted: "${data.entity_id}"`, 'info');
        });
        
        this.websocketClient.onMessage('entity_mode_changed', (data) => {
            this.log(`Entity "${data.entity_id}" mode changed to ${data.mode}`, 'info');
            
            // Immediately update entity state for instant UI response
            const entity = this.entityStateManager.getEntity(data.entity_id);
            if (entity) {
                entity.currentMode = data.mode;
            }
            
            // Update control panel immediately if this entity is selected
            if (this.uiControls.selectedEntities.has(data.entity_id)) {
                this.updateControlPanelModes();
            }
        });
        
        this.websocketClient.onMessage('entity_path_changed', (data) => {
            this.log(`Entity "${data.entity_id}" path updated (${data.waypoints_added} waypoints)`, 'info');
        });
        
        // Selection events (not used - selection is frontend-only)
        
        // Simulation control events
        this.websocketClient.onMessage('simulation_control', (data) => {
            this.log(`Simulation ${data.message}`, 'info');
        });
        
        // Chat messages
        this.websocketClient.onMessage('chat_message', (data) => {
            this.log(`[${data.sender}]: ${data.message}`, 'chat');
        });
        
        // Error handling
        this.websocketClient.onMessage('error', (data) => {
            this.log(`Server error: ${data.message}`, 'error');
        });
        
        // JSON parse error handling (silent for cleaner console)
        this.websocketClient.onMessage('parse_error', (data) => {
            // Parse errors handled silently
        });
    }
    
    /**
     * Connect to backend server
     */
    async connectToBackend() {
        try {
            this.log('Connecting to backend server...', 'info');
            await this.websocketClient.connect();
            
            // Start interpolation loop for smooth entity movement
            this.startInterpolationLoop();
            
        } catch (error) {
            console.error('Failed to connect to backend:', error);
            this.log(`Connection failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Start entity position interpolation loop
     */
    startInterpolationLoop() {
        let lastInterpolationTime = 0;
        const targetFPS = 60;
        const frameInterval = 1000 / targetFPS; // 16.67ms
        
        const interpolate = (currentTime) => {
            if (currentTime - lastInterpolationTime >= frameInterval) {
                if (this.entityStateManager) {
                    this.entityStateManager.interpolatePositions();
                }
                lastInterpolationTime = currentTime;
            }
            requestAnimationFrame(interpolate);
        };
        requestAnimationFrame(interpolate);
    }
    
    // ===== ENTITY STATE SYNCHRONIZATION HANDLERS =====
    
    /**
     * Handle entity created from state manager
     */
    handleEntityCreated(entity) {
        // Add entity to 3D scene
        if (this.renderer3D) {
            this.renderer3D.addEntity(entity.id, entity.type, entity.position);
            
            // Set visual properties based on entity data
            this.updateEntityVisuals(entity);
        }
        
        // Add entity to Assets panel
        this.addEntityToList({
            entity_id: entity.id,
            type: entity.type,
            mode: entity.currentMode || 'idle'
        });
        
        // Update tab cycle list
        this.updateTabCycleEntityList();
    }
    
    /**
     * Handle entity updated from state manager
     */
    handleEntityUpdated(entity, oldPosition) {
        // Update 3D scene position
        if (this.renderer3D) {
            this.renderer3D.updateEntityPosition(entity.id, entity.position);
            this.updateEntityVisuals(entity);
        }
        
        // Update Assets panel if mode changed
        if (entity.currentMode) {
            this.updateEntityInList({
                entity_id: entity.id,
                type: entity.type,
                mode: entity.currentMode
            });
        }
        
        // Update control panel if this entity is selected and mode changed
        if (this.uiControls && this.uiControls.selectedEntities.has(entity.id)) {
            this.updateControlPanelModes();
        }
    }
    
    /**
     * Handle entity removed from state manager
     */
    handleEntityRemoved(entity) {
        // Remove from 3D scene
        if (this.renderer3D) {
            this.renderer3D.removeEntity(entity.id);
        }
        
        // Remove from Assets panel
        this.removeEntityFromList(entity.id);
        
        // Remove from groups
        this.cleanupEmptyGroups(entity.id);
        
        // Update tab cycle list
        this.updateTabCycleEntityList();
    }
    
    
    /**
     * Handle complete state update from state manager
     */
    handleStateUpdated(stateData) {
        // Update performance metrics
        this.updatePerformanceDisplay(stateData.stats);
    }
    
    /**
     * Update entity visual properties in 3D scene
     */
    updateEntityVisuals(entity) {
        if (!this.renderer3D) return;
        
        // For now, just ensure the entity exists in the 3D scene
        // Color and selection updates will be handled when we implement 
        // the visual enhancement features in future chunks
        
        // The 3D renderer currently supports:
        // - updateEntityPosition (which is called in handleEntityUpdated)
        // - addEntity / removeEntity for basic lifecycle
        
        // Future chunk will add:
        // - updateEntityColor
        // - setEntitySelected
        // - visual mode indicators
        
        // Visual updates will be implemented in future chunks
    }
    
    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.className = `status-indicator ${status}`;
        }
        
        // Update mission title to show connection status
        if (this.elements.missionTitle) {
            const baseTitle = 'UAV Ground Control Station';
            const statusText = status === 'online' ? ' - Connected' : ' - Disconnected';
            this.elements.missionTitle.textContent = baseTitle + statusText;
        }
    }
    
    /**
     * Update performance display with backend statistics
     */
    updatePerformanceDisplay(stats) {
        // This could update a performance panel if we had one
        // For now, just track the stats
        if (stats && stats.fps) {
            this.backendFPS = stats.fps;
        }
    }
    
    /**
     * Add demo entities for testing (only if not connected to backend)
     */
    addDemoEntities() {
        // Only add demo entities if we're not connected to backend
        if (this.isConnected && this.websocketClient) {
            this.log('Connected to backend - live entities will be synchronized', 'info');
            return;
        }
        
        if (!this.renderer3D || !this.entityControls) return;
        
        // Add demo entities closer to center and at ground level for better visibility
        
        // Create entity data models
        const drone1Data = this.entityControls.createEntity('demo_drone_1', 'drone', { x: 0, y: 3, z: 0, yaw: 0 });
        const target1Data = this.entityControls.createEntity('demo_target_1', 'target', { x: -5, y: 1, z: 5 });
        const drone2Data = this.entityControls.createEntity('demo_drone_2', 'drone', { x: 5, y: 4, z: -5, yaw: 90 });
        
        // Add to 3D scene
        this.renderer3D.addEntity('demo_drone_1', 'drone', { x: 0, y: 3, z: 0 });
        this.renderer3D.addEntity('demo_target_1', 'target', { x: -5, y: 1, z: 5 });
        this.renderer3D.addEntity('demo_drone_2', 'drone', { x: 5, y: 4, z: -5 });
        
        // Set different modes for demonstration
        this.entityControls.setEntityMode('demo_drone_1', 'random_search');
        this.entityControls.setEntityMode('demo_drone_2', 'hold_position');
        
        // Add some waypoints to drone 1
        this.entityControls.addWaypoint('demo_drone_1', { x: 10, y: 5, z: 0 });
        this.entityControls.addWaypoint('demo_drone_1', { x: 10, y: 5, z: 10 });
        this.entityControls.addWaypoint('demo_drone_1', { x: -10, y: 5, z: 10 });
        
        // Add demo entities to Assets panel
        this.addEntityToList(drone1Data);
        this.addEntityToList(target1Data);
        this.addEntityToList(drone2Data);
        
        this.log('Added 3 demo entities to scene (offline mode)', 'info');
        this.log('Selection: Click to select, Shift+click for multi-select, Drag entities around', 'info');
        this.log('Camera Controls: Left drag = orbit(3D)/pan(2D), Middle drag = pan, Wheel = zoom, Keys 1/2 = switch view', 'info');
        this.log('Keyboard: Tab = cycle entities, Shift+Tab = reverse cycle, Del = delete, H = focus', 'info');
        this.log('Console Commands: bgcsApp.spawnMultiple("drone", 5) or bgcsApp.spawnMultiple("target", 3)', 'info');
    }
    
    /**
     * Spawn a new entity (drone or target)
     */
    async spawnEntity(type) {
        if (!this.websocketClient || !this.isConnected) {
            this.log('Cannot spawn: Not connected to backend server', 'error');
            return;
        }
        
        // Clear button focus to prevent highlighting issues
        this.clearButtonFocus();
        
        try {
            // Generate unique ID
            const timestamp = Date.now();
            const randomId = Math.floor(Math.random() * 1000);
            const entityId = `${type}_${timestamp}_${randomId}`;
            
            // Generate random position
            const position = this.getRandomSpawnPosition();
            
            // Send spawn command to backend
            const response = await this.websocketClient.spawnEntity(type, entityId, position);
            
            if (response && response.entity_id) {
                this.log(`Spawned ${type} "${response.entity_id}" via backend`, 'success');
                return response.entity_id;
            } else {
                this.log(`Failed to spawn ${type} - no response from backend`, 'error');
                return null;
            }
            
        } catch (error) {
            console.error('Error spawning entity:', error);
            this.log(`Failed to spawn ${type}: ${error.message}`, 'error');
            return null;
        }
    }
    
    /**
     * Generate random spawn position
     */
    getRandomSpawnPosition() {
        // Spawn in a reasonable area around the origin
        const range = 30; // -30 to +30 in X and Z
        const minHeight = 50; // Higher altitude for better visibility
        const maxHeight = 80; // Good altitude range for UAVs
        
        return {
            x: (Math.random() - 0.5) * 2 * range,
            y: minHeight + Math.random() * (maxHeight - minHeight),
            z: (Math.random() - 0.5) * 2 * range
        };
    }
    
    /**
     * Spawn multiple entities at once
     */
    spawnMultiple(type, count = 5) {
        const spawnedIds = [];
        
        for (let i = 0; i < count; i++) {
            const id = this.spawnEntity(type);
            if (id) {
                spawnedIds.push(id);
            }
        }
        
        this.log(`Spawned ${spawnedIds.length} ${type}s`, 'info');
        return spawnedIds;
    }
    
    /**
     * Setup UI element references
     */
    setupUIElements() {
        this.elements = {
            // Header elements
            connectionStatus: document.getElementById('connection-status'),
            missionTitle: document.getElementById('mission-title'),
            entityCounter: document.getElementById('entity-counter'),
            
            // Options menu
            optionsToggle: document.getElementById('options-toggle'),
            optionsPanel: document.getElementById('options-panel'),
            entityScale: document.getElementById('entity-scale'),
            scaleValue: document.getElementById('scale-value'),
            showDetectionRanges: document.getElementById('show-detection-ranges'),
            showWaypoints: document.getElementById('show-waypoints'),
            showWireframe: document.getElementById('show-wireframe'),
            showTerrain: document.getElementById('show-terrain'),
            showHeightmapColors: document.getElementById('show-heightmap-colors'),
            showContourLines: document.getElementById('show-contour-lines'),
            
            // Entity controls
            entitySearch: document.getElementById('entity-search'),
            entityList: document.getElementById('entity-list'),
            groupsList: document.getElementById('groups-list'),
            collapseEntities: document.getElementById('collapse-entities'),
            
            // Options menu controls replaced canvas controls
            
            // Control panel
            spawnDrone: document.getElementById('spawn-drone'),
            spawnTarget: document.getElementById('spawn-target'),
            deleteSelected: document.getElementById('delete-selected'),
            
            // Floating control panel
            controlsPanel: document.getElementById('controls-panel'),
            floatingSelectedCount: document.getElementById('floating-selected-count'),
            
            // Simulation controls
            startSimulation: document.getElementById('start-simulation'),
            pauseSimulation: document.getElementById('pause-simulation'),
            stopSimulation: document.getElementById('stop-simulation'),
            simulationSpeed: document.getElementById('simulation-speed'),
            speedValue: document.getElementById('speed-value'),
            
            // Console
            consoleContent: document.getElementById('console-content'),
            clearConsole: document.getElementById('clear-console'),
            toggleConsole: document.getElementById('toggle-console'),
            
            // Selection info
            selectionInfo: document.getElementById('selection-info'),
            selectionContent: document.getElementById('selection-content'),
            clearSelection: document.getElementById('clear-selection')
        };
        
        // Verify critical elements exist
        const criticalElements = ['connectionStatus', 'canvas'];
        for (const elementKey of criticalElements) {
            if (!this.elements[elementKey] && elementKey !== 'canvas') {
                console.warn(`Critical UI element not found: ${elementKey}`);
            }
        }
        
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Options menu toggle
        if (this.elements.optionsToggle) {
            this.elements.optionsToggle.addEventListener('click', () => {
                if (this.elements.optionsPanel) {
                    this.elements.optionsPanel.classList.toggle('active');
                }
            });
        }
        
        // Close options menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.floating-options')) {
                if (this.elements.optionsPanel) {
                    this.elements.optionsPanel.classList.remove('active');
                }
            }
        });
        
        // Scale control
        if (this.elements.entityScale) {
            this.elements.entityScale.addEventListener('input', (e) => {
                this.entityScale = parseFloat(e.target.value);
                if (this.elements.scaleValue) {
                    this.elements.scaleValue.textContent = `${this.entityScale.toFixed(1)}x`;
                }
                // Apply scale to all entities in 3D renderer
                if (this.renderer3D) {
                    this.renderer3D.setEntityScale(this.entityScale);
                }
            });
        }
        
        // Simulation speed control
        if (this.elements.simulationSpeed) {
            this.elements.simulationSpeed.addEventListener('input', (e) => {
                this.simulationSpeed = parseFloat(e.target.value);
                if (this.elements.speedValue) {
                    this.elements.speedValue.textContent = `${this.simulationSpeed.toFixed(1)}x`;
                }
                
                // Send speed change to backend
                if (this.websocketClient && this.websocketClient.connected) {
                    this.websocketClient.send("simulation_control", {
                        command: "set_speed",
                        speed: this.simulationSpeed
                    });
                }
            });
        }
        
        
        // Wireframe mode control
        if (this.elements.showWireframe) {
            this.elements.showWireframe.addEventListener('change', (e) => {
                this.toggleWireframe(e.target.checked);
            });
        }
        
        if (this.elements.showTerrain) {
            this.elements.showTerrain.addEventListener('change', (e) => {
                this.toggleTerrain(e.target.checked);
            });
        }
        
        // Heightmap colormap control
        if (this.elements.showHeightmapColors) {
            this.elements.showHeightmapColors.addEventListener('change', (e) => {
                this.toggleHeightmapColors(e.target.checked);
            });
        }
        
        // Contour lines control
        if (this.elements.showContourLines) {
            this.elements.showContourLines.addEventListener('change', (e) => {
                this.toggleContourLines(e.target.checked);
            });
        }
        
        // Console controls
        if (this.elements.clearConsole) {
            this.elements.clearConsole.addEventListener('click', () => this.clearConsole());
        }
        
        if (this.elements.toggleConsole) {
            this.elements.toggleConsole.addEventListener('click', () => this.toggleConsole());
        }
        
        // Entity list controls
        
        if (this.elements.collapseEntities) {
            this.elements.collapseEntities.addEventListener('click', () => this.toggleEntityListCollapse());
        }
        
        // Entity search functionality
        if (this.elements.entitySearch) {
            this.elements.entitySearch.addEventListener('input', (e) => this.filterEntityList(e.target.value));
        }
        
        // Create group button
        const createGroupBtn = document.getElementById('create-group');
        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', () => {
                this.createGroupFromSelected();
            });
        }
        
        // Canvas controls toggle
        if (this.elements.canvasControlsToggle) {
            this.elements.canvasControlsToggle.addEventListener('click', () => this.toggleCanvasControls());
        }
        
        // Canvas interactions (basic)
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Control buttons (placeholder functionality)
        this.setupControlButtons();
        
    }
    
    /**
     * Setup control button event listeners
     */
    setupControlButtons() {
        // Spawn drone button
        if (this.elements.spawnDrone) {
            this.elements.spawnDrone.addEventListener('click', () => {
                this.spawnEntity('drone');
            });
        }
        
        // Spawn target button  
        if (this.elements.spawnTarget) {
            this.elements.spawnTarget.addEventListener('click', () => {
                this.spawnEntity('target');
            });
        }
        
        // Control Panel buttons
        if (this.elements.deleteSelected) {
            this.elements.deleteSelected.addEventListener('click', () => {
                this.deleteSelectedEntities();
            });
        }
        
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const filterType = e.target.dataset.filter;
                this.filterEntitiesByType(filterType);
                this.log(`Filter changed to: ${filterType}`, 'info');
            });
        });
        
        // Mode buttons (both regular and compact)
        document.querySelectorAll('.mode-btn, .mode-btn-compact').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = btn.dataset.mode;
                
                // Don't update UI immediately - let backend response drive the UI state
                // This prevents flickering between clicked state and actual backend state
                this.applyModeToSelected(mode);
                this.log(`Applied ${mode} mode to selected entities`, 'info');
            });
        });
    }
    
    /**
     * Setup console functionality
     */
    setupConsole() {
        this.log('Console system initialized', 'info');
        
        // Add some example log entries
        setTimeout(() => {
            this.log('Backend connection check...', 'info');
        }, 1000);
        
        setTimeout(() => {
            this.log('WebSocket connection pending', 'warning');
        }, 2000);
    }
    
    /**
     * Handle canvas click events
     */
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Canvas click handling - now handled by 3D UI controls
        this.log(`Canvas clicked at (${Math.round(x)}, ${Math.round(y)})`, 'info');
        
        // Note: Entity selection is handled by the 3D UI controls system
    }
    
    /**
     * Handle canvas mouse move events
     */
    handleCanvasMouseMove(event) {
        // Placeholder - will be used for hover effects in later chunks
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(event) {
        switch (event.code) {
            case 'Digit1':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.setView('top');
                }
                break;
            case 'Digit2':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.setView('3d');
                }
                break;
            case 'KeyH':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.log('Focus selected (placeholder)', 'info');
                }
                break;
            case 'Space':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.log('Hold/Stop (placeholder)', 'info');
                }
                break;
            case 'Delete':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.deleteSelectedEntities();
                }
                break;
            case 'Tab':
                if (!event.target.matches('input')) {
                    event.preventDefault();
                    this.cycleEntities(event.shiftKey); // Shift+Tab for reverse cycling
                }
                break;
        }
    }
    
    /**
     * Cycle through entities with Tab key
     */
    cycleEntities(reverse = false) {
        // Update entity list from current state
        this.updateTabCycleEntityList();
        
        if (this.tabCycleEntityList.length === 0) {
            this.log('No entities available to cycle through', 'info');
            return;
        }
        
        // Move to next/previous entity
        if (reverse) {
            this.tabCycleIndex--;
            if (this.tabCycleIndex < 0) {
                this.tabCycleIndex = this.tabCycleEntityList.length - 1; // Wrap to end
            }
        } else {
            this.tabCycleIndex++;
            if (this.tabCycleIndex >= this.tabCycleEntityList.length) {
                this.tabCycleIndex = 0; // Wrap to beginning
            }
        }
        
        // Get current entity ID
        const entityId = this.tabCycleEntityList[this.tabCycleIndex];
        
        // Select the entity
        if (this.uiControls) {
            this.uiControls.clearSelection();
            this.uiControls.selectEntity(entityId);
            this.uiControls.focusOnSelected();
            
            // Update visual selection in menus
            this.updateAssetMenuSelection();
            this.updateGroupMenuSelection();
            
            // Update control panel
            this.updateControlPanelModes();
            
            // Log the action
            const entityType = this.getEntityType(entityId);
            this.log(`Tabbed to ${entityType} "${entityId}" (${this.tabCycleIndex + 1}/${this.tabCycleEntityList.length})`, 'info');
        }
    }
    
    /**
     * Update the list of entities for tab cycling
     */
    updateTabCycleEntityList() {
        this.tabCycleEntityList = [];
        
        if (this.renderer3D && this.renderer3D.entities) {
            // Get all entity IDs from the 3D renderer
            this.tabCycleEntityList = Array.from(this.renderer3D.entities.keys());
            
            // Sort entities by type then by ID for consistent ordering
            this.tabCycleEntityList.sort((a, b) => {
                const typeA = this.getEntityType(a);
                const typeB = this.getEntityType(b);
                
                if (typeA !== typeB) {
                    // Sort drones first, then targets
                    if (typeA === 'drone') return -1;
                    if (typeB === 'drone') return 1;
                }
                
                // Same type, sort by ID
                return a.localeCompare(b);
            });
        }
        
        // Reset index if current index is out of bounds
        if (this.tabCycleIndex >= this.tabCycleEntityList.length) {
            this.tabCycleIndex = -1;
        }
    }
    
    /**
     * Get entity type from entity ID (helper method)
     */
    getEntityType(entityId) {
        if (entityId.includes('drone')) return 'drone';
        if (entityId.includes('target')) return 'target';
        
        // Try to get from entity controls if available
        if (this.entityControls && this.entityControls.getEntity) {
            const entity = this.entityControls.getEntity(entityId);
            if (entity && entity.type) {
                return entity.type;
            }
        }
        
        return 'entity'; // fallback
    }
    
    /**
     * Set current view mode (legacy - now handled by camera system)
     */
    setView(view) {
        this.currentView = view;
        
        // Update 3D camera if available
        if (this.cameraManager) {
            this.cameraManager.setView(view);
        }
        
        this.log(`Camera: ${view} orientation`, 'info');
        
        // Only draw placeholder if 3D scene is not available
        if (!this.renderer3D) {
            this.drawPlaceholderContent();
        }
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Update 3D renderer if available
        if (this.renderer3D) {
            this.renderer3D.handleResize();
        }
        
        // Redraw content after resize only for 2D fallback
        if (this.initialized && !this.renderer3D) {
            this.drawPlaceholderContent();
        }
    }
    
    /**
     * Start 3D rendering loop
     */
    startRendering() {
        if (this.renderer3D) {
            this.renderer3D.startRendering();
            this.log('3D rendering started', 'success');
        }
    }
    
    /**
     * Draw placeholder content on canvas
     */
    drawPlaceholderContent() {
        // Skip 2D drawing if 3D renderer is active
        if (this.renderer3D) return;
        if (!this.ctx) return;
        
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        
        // Draw placeholder text
        this.ctx.fillStyle = '#666';
        this.ctx.font = '16px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            `${this.currentView.toUpperCase()} VIEW - Simulation Canvas`,
            this.canvas.width / 2,
            this.canvas.height / 2 - 20
        );
        
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.fillText(
            '3D Scene failed to initialize - using 2D fallback',
            this.canvas.width / 2,
            this.canvas.height / 2 + 10
        );
        
        this.ctx.fillText(
            'Click anywhere to test interaction',
            this.canvas.width / 2,
            this.canvas.height / 2 + 30
        );
    }
    
    
    /**
     * Start UI update loop
     */
    startUIUpdateLoop() {
        let lastFrameTime = 0;
        const targetFPS = 30;
        const frameInterval = 1000 / targetFPS; // 33.33ms
        
        const updateLoop = (currentTime) => {
            if (currentTime - lastFrameTime >= frameInterval) {
                // Update UI elements
                this.updateUI();
                lastFrameTime = currentTime;
            }
            
            requestAnimationFrame(updateLoop);
        };
        
        requestAnimationFrame(updateLoop);
    }
    
    /**
     * Update UI elements
     */
    updateUI() {
        // Update FPS counter from 3D renderer
        // FPS counter removed
        
        // Update entity counter 
        if (this.elements.entityCounter) {
            const entityCount = this.renderer3D ? this.renderer3D.entities.size : 0;
            this.elements.entityCounter.textContent = entityCount.toString();
        }
        
        // Sync simulation speed slider with backend state
        if (this.entityManager && this.elements.simulationSpeed) {
            const backendSpeed = this.entityManager.simulationSpeed;
            if (backendSpeed !== this.simulationSpeed) {
                this.simulationSpeed = backendSpeed;
                this.elements.simulationSpeed.value = backendSpeed;
                if (this.elements.speedValue) {
                    this.elements.speedValue.textContent = `${backendSpeed.toFixed(1)}x`;
                }
            }
        }
        
        // Get selected count for floating control panel from frontend UI controls
        const selectedCount = this.uiControls ? this.uiControls.selectedEntities.size : 0;
        
        // Update floating control panel
        this.updateFloatingControlPanel(selectedCount);
        
        // Update connection status
        if (this.elements.connectionStatus) {
            const status = this.renderer3D ? 'online' : 'offline';
            this.elements.connectionStatus.className = `status-indicator ${status}`;
        }
    }
    
    /**
     * Update floating control panel visibility and content
     */
    updateFloatingControlPanel(selectedCount) {
        if (!this.elements.controlsPanel || !this.elements.floatingSelectedCount) return;
        
        // Update selected count in floating panel
        this.elements.floatingSelectedCount.textContent = selectedCount.toString();
        
        // Only update if selection state changed to avoid excessive processing
        const hasSelection = selectedCount > 0;
        const hadSelection = this.elements.controlsPanel.classList.contains('has-selection');
        
        if (hasSelection !== hadSelection) {
            // Selection state changed
            if (hasSelection) {
                this.elements.controlsPanel.classList.add('has-selection');
                // Update mode buttons to reflect current state of selected entities
                this.updateControlPanelModes();
            } else {
                this.elements.controlsPanel.classList.remove('has-selection');
                // Clear any active mode indicators
                this.clearControlPanelModes();
            }
        }
    }
    
    /**
     * Update control panel mode buttons to reflect current entity modes
     */
    updateControlPanelModes() {
        if (!this.uiControls || !this.entityStateManager) return;
        
        const selectedEntityIds = Array.from(this.uiControls.selectedEntities);
        if (selectedEntityIds.length === 0) return;
        
        // Update immediately - no debounce for responsive UI
        this._doUpdateControlPanelModes(selectedEntityIds);
    }
    
    /**
     * Internal method to actually update control panel modes
     */
    _doUpdateControlPanelModes(selectedEntityIds) {
        // Get current modes of selected entities from backend state
        const entityModes = new Set();
        selectedEntityIds.forEach(entityId => {
            const entity = this.entityStateManager.getEntity(entityId);
            if (entity && entity.currentMode) {
                entityModes.add(entity.currentMode);
            }
        });
        
        
        // Clear all active states first
        this.clearControlPanelModes();
        
        // Set active state for current modes
        const modeButtons = document.querySelectorAll('.mode-btn-compact');
        modeButtons.forEach(button => {
            const buttonMode = button.dataset.mode;
            if (entityModes.has(buttonMode)) {
                if (entityModes.size === 1) {
                    // All entities have the same mode - show as active
                    button.classList.add('active');
                } else {
                    // Mixed modes - show as partially active
                    button.classList.add('mixed');
                }
            }
        });
        
        // Update panel header to show mode info
        this.updateControlPanelHeader(selectedEntityIds.length, entityModes);
    }
    
    /**
     * Clear all mode button states in control panel
     */
    clearControlPanelModes() {
        const modeButtons = document.querySelectorAll('.mode-btn-compact');
        modeButtons.forEach(button => {
            button.classList.remove('active', 'mixed');
        });
    }
    
    /**
     * Update control panel header with mode information
     */
    updateControlPanelHeader(entityCount, modes) {
        const header = document.querySelector('.control-panel-header h4');
        if (header) {
            // Remove header text entirely - just show the mode buttons
            header.textContent = '';
        }
        
        // Also clear any subtitle if it exists
        const subtitle = document.querySelector('.control-panel-header .mode-subtitle');
        if (subtitle) {
            subtitle.textContent = '';
        }
        
        // Hide the selected count as well for cleaner look
        const selectedCount = document.querySelector('.control-panel-header .selected-count');
        if (selectedCount) {
            selectedCount.style.display = 'none';
        }
    }
    
    /**
     * Add log entry to console
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = {
            time: timestamp,
            message: message,
            type: type
        };
        
        this.console.entries.push(entry);
        
        // Limit console entries
        if (this.console.entries.length > this.console.maxEntries) {
            this.console.entries.shift();
        }
        
        // Update console display
        this.updateConsoleDisplay();
        
        // Also log to browser console
        console.log(`[${timestamp}] ${message}`);
    }
    
    /**
     * Update console display
     */
    updateConsoleDisplay() {
        if (!this.elements.consoleContent) return;
        
        const html = this.console.entries.map(entry => {
            return `
                <div class="log-entry log-${entry.type}">
                    <span class="log-time">[${entry.time}]</span>
                    <span class="log-message">${entry.message}</span>
                </div>
            `;
        }).join('');
        
        this.elements.consoleContent.innerHTML = html;
        
        // Auto-scroll to bottom
        this.elements.consoleContent.scrollTop = this.elements.consoleContent.scrollHeight;
    }
    
    /**
     * Clear console
     */
    clearConsole() {
        this.console.entries = [];
        this.updateConsoleDisplay();
        this.log('Console cleared', 'info');
    }
    
    /**
     * Toggle console visibility
     */
    toggleConsole() {
        const console = document.getElementById('console');
        if (console) {
            const isExpanded = console.classList.contains('expanded');
            
            if (isExpanded) {
                console.classList.remove('expanded');
            } else {
                console.classList.add('expanded');
            }
            
            const toggleButton = this.elements.toggleConsole;
            if (toggleButton) {
                const svg = toggleButton.querySelector('svg path');
                if (svg) {
                    svg.setAttribute('d', isExpanded ? 
                        'M6 9L12 15L18 9' : 'M18 15L12 9L6 15');
                }
            }
            
            this.log(isExpanded ? 'Console collapsed' : 'Console expanded', 'info');
        }
    }
    
    /**
     * Add entity to the Assets panel list
     */
    addEntityToList(entityData) {
        const entityList = this.elements.entityList;
        if (!entityList) {
            console.warn('Entity list element not found');
            return;
        }
        
        // Create entity list item
        const entityItem = document.createElement('div');
        entityItem.className = `entity-item ${entityData.type}`;
        entityItem.dataset.entityId = entityData.entity_id;
        entityItem.dataset.entityType = entityData.type;
        
        // Get mode color
        const modeColors = {
            'hold_position': '#666666',
            'random_search': '#00FF00', 
            'follow_target': '#FF8C00',
            'follow_teammate': '#9400D3',
            'waypoint_mode': '#0080FF',
            'kamikaze': '#FF0000'
        };
        
        const modeColor = modeColors[entityData.mode] || '#666666';
        
        entityItem.innerHTML = `
            <div class="entity-header">
                <div class="entity-type-icon ${entityData.type}">
                    ${entityData.type === 'drone' ? 
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/></svg>' :
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
                    }
                </div>
                <div class="entity-info">
                    <div class="entity-name">${entityData.entity_id}</div>
                    <div class="entity-status" style="color: ${modeColor}">${entityData.mode}</div>
                </div>
            </div>
        `;
        
        
        // Add click to select functionality
        entityItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent text selection on ctrl+click or shift+click
            if (e.ctrlKey || e.shiftKey) {
                e.preventDefault();
                window.getSelection().removeAllRanges();
            }
            
            // Handle different selection modes
            if (e.ctrlKey) {
                // Ctrl+click: Toggle selection
                this.toggleEntitySelection(entityData.entity_id);
            } else if (e.shiftKey) {
                // Shift+click: Range selection
                this.selectEntityRange(entityData.entity_id);
            } else {
                // Regular click: Single selection
                this.selectEntityFromList(entityData.entity_id);
            }
        });
        
        // Add to list
        entityList.appendChild(entityItem);
        
        // Update entity counter
        this.updateEntityCounter();
        
    }
    
    /**
     * Remove entity from the Assets panel list
     */
    removeEntityFromList(entityId) {
        
        const entityList = this.elements.entityList;
        if (!entityList) {
            console.error('Entity list element not found!');
            return;
        }
        
        const allItems = entityList.querySelectorAll('.entity-item');
        
        // Try multiple selector approaches to ensure we find the entity
        let entityItem = entityList.querySelector(`[data-entity-id="${entityId}"]`);
        
        // If first approach failed, try finding by iterating through items
        if (!entityItem) {
            for (const item of allItems) {
                if (item.dataset.entityId === entityId) {
                    entityItem = item;
                    break;
                }
            }
        }
        
        if (entityItem) {
            entityItem.remove();
            
        } else {
            console.error(`Failed to find entity ${entityId} in assets panel`);
            console.error('Available entities were:', Array.from(allItems).map(item => item.dataset.entityId));
        }
    }
    
    /**
     * Update entity in the Assets panel list
     */
    updateEntityInList(entityData) {
        const entityList = this.elements.entityList;
        if (!entityList) return;
        
        const entityItem = entityList.querySelector(`[data-entity-id="${entityData.entity_id}"]`);
        if (entityItem) {
            // Update only status/mode
            const statusElement = entityItem.querySelector('.entity-status');
            
            if (statusElement) {
                const modeColors = {
                    'hold_position': '#666666',
                    'random_search': '#00FF00', 
                    'follow_target': '#FF8C00',
                    'follow_teammate': '#9400D3',
                    'waypoint_mode': '#0080FF',
                    'kamikaze': '#FF0000'
                };
                const modeColor = modeColors[entityData.mode] || '#666666';
                statusElement.textContent = entityData.mode;
                statusElement.style.color = modeColor;
            }
        }
    }
    
    /**
     * Select entity from list click
     */
    selectEntityFromList(entityId) {
        if (this.uiControls) {
            this.uiControls.clearSelection();
            this.uiControls.selectEntity(entityId);
            this.uiControls.focusOnSelected();
            
            // Track last selected entity for range selection
            this.lastSelectedEntityId = entityId;
            
            // Update visual selection in assets and groups menus
            this.updateAssetMenuSelection();
            this.updateGroupMenuSelection();
            
            // Update control panel to show current modes
            this.updateControlPanelModes();
        }
    }
    
    /**
     * Toggle entity selection
     */
    toggleEntitySelection(entityId) {
        if (this.uiControls) {
            if (this.uiControls.selectedEntities.has(entityId)) {
                this.uiControls.deselectEntity(entityId);
            } else {
                this.uiControls.selectEntity(entityId);
                // Track last selected for range selection
                this.lastSelectedEntityId = entityId;
            }
            
            // Update visual selection in assets and groups menus
            this.updateAssetMenuSelection();
            this.updateGroupMenuSelection();
            
            // Update control panel to show current modes
            this.updateControlPanelModes();
        }
    }

    /**
     * Select range of entities from last selected to clicked entity
     */
    selectEntityRange(entityId) {
        if (!this.uiControls || !this.lastSelectedEntityId) {
            // If no previous selection, just select this entity
            this.selectEntityFromList(entityId);
            return;
        }

        const entityList = this.elements.entityList;
        if (!entityList) return;

        // Get all entity items in DOM order
        const allEntityItems = Array.from(entityList.querySelectorAll('.entity-item'));
        
        // Find indices of start and end entities
        let startIndex = -1;
        let endIndex = -1;
        
        allEntityItems.forEach((item, index) => {
            const itemEntityId = item.dataset.entityId;
            if (itemEntityId === this.lastSelectedEntityId) {
                startIndex = index;
            }
            if (itemEntityId === entityId) {
                endIndex = index;
            }
        });

        if (startIndex === -1 || endIndex === -1) {
            // Fallback to single selection if entities not found
            this.selectEntityFromList(entityId);
            return;
        }

        // Ensure startIndex is before endIndex
        if (startIndex > endIndex) {
            [startIndex, endIndex] = [endIndex, startIndex];
        }

        // Clear current selection
        this.uiControls.clearSelection();

        // Select range
        for (let i = startIndex; i <= endIndex; i++) {
            const itemEntityId = allEntityItems[i].dataset.entityId;
            this.uiControls.selectEntity(itemEntityId);
        }

        // Update last selected to the clicked entity
        this.lastSelectedEntityId = entityId;

        // Update control panel to show current modes of selected entities
        this.updateControlPanelModes();

        // Update visual selection in assets and groups menus
        this.updateAssetMenuSelection();
        this.updateGroupMenuSelection();
    }
    
    /**
     * Apply behavior mode to selected entities
     */
    async applyModeToSelected(mode) {
        if (!this.websocketClient || !this.isConnected) {
            this.log('Cannot apply mode: Not connected to backend server', 'error');
            return;
        }
        
        if (!this.uiControls) {
            this.log('Cannot apply mode: UI controls not initialized', 'error');
            return;
        }
        
        const selectedEntities = Array.from(this.uiControls.selectedEntities);
        
        if (selectedEntities.length === 0) {
            this.log('No entities selected. Please select entities first.', 'warning');
            return;
        }
        
        try {
            // Apply mode to each selected entity via backend
            const promises = selectedEntities.map(entityId => 
                this.websocketClient.setEntityMode(entityId, mode)
            );
            
            const results = await Promise.allSettled(promises);
            
            let successCount = 0;
            let errorCount = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to set mode for entity ${selectedEntities[index]}:`, result.reason);
                }
            });
            
            if (successCount > 0) {
                // Auto-create group if waypoint mode is applied to multiple entities
                if (mode === 'waypoint_mode' && successCount >= 2) {
                    this.autoCreateGroupForWaypoints(selectedEntities.filter((_, index) => 
                        results[index].status === 'fulfilled'
                    ));
                }
                
                this.log(`Applied ${mode} mode to ${successCount} entities${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
                
                // Control panel will update automatically when backend state changes arrive via WebSocket
                // This prevents UI flickering between immediate update and actual backend state
                
            } else {
                this.log(`Failed to apply ${mode} mode to any entities`, 'error');
            }
            
        } catch (error) {
            console.error('Error applying mode to selected entities:', error);
            this.log(`Error applying ${mode} mode: ${error.message}`, 'error');
        }
    }
    
    /**
     * Clear focus from all buttons to prevent unwanted highlighting
     */
    clearButtonFocus() {
        // Blur any currently focused button
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'BUTTON' || activeElement.classList.contains('btn-icon'))) {
            activeElement.blur();
        }
        
        // Focus on canvas instead to maintain keyboard navigation
        if (this.canvas) {
            this.canvas.focus();
        }
    }
    
    /**
     * Delete selected entities
     */
    async deleteSelectedEntities() {
        
        if (!this.websocketClient || !this.isConnected) {
            this.log('Cannot delete: Not connected to backend server', 'error');
            return;
        }
        
        if (!this.uiControls) {
            this.log('Cannot delete: UI controls not initialized', 'error');
            return;
        }
        
        const selectedEntities = Array.from(this.uiControls.selectedEntities);
        if (selectedEntities.length === 0) {
            this.log('No entities selected to delete', 'warning');
            return;
        }
        
        // Clear any focused buttons to prevent focus highlighting issues
        this.clearButtonFocus();
        
        // Check if the selected entities form a complete group
        const groupToDelete = this.findGroupByEntities(selectedEntities);
        
        if (groupToDelete) {
            // If entities form a complete group, delete the group (unbind) instead of deleting entities
            this.deleteGroup(groupToDelete);
            
            // Clear selection via frontend
            if (this.uiControls) {
                this.uiControls.clearSelection();
            }
            
            this.log(`Disbanded group instead of deleting entities`, 'success');
        } else {
            try {
                // Delete individual entities via backend
                const promises = selectedEntities.map(entityId => {
                    return this.websocketClient.deleteEntity(entityId);
                });
                
                const results = await Promise.allSettled(promises);
                
                let successCount = 0;
                let errorCount = 0;
                
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error(`Failed to delete entity ${selectedEntities[index]}:`, result.reason);
                    }
                });
                
                this.log(`Deleted ${successCount} entities${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, successCount > 0 ? 'success' : 'error');
                
            } catch (error) {
                console.error('Error deleting selected entities:', error);
                this.log(`Error deleting entities: ${error.message}`, 'error');
            }
        }
    }
    
    
    
    
    /**
     * Remove entity completely
     */
    removeEntity(entityId) {
        
        // Remove from 3D scene
        if (this.renderer3D) {
            this.renderer3D.removeEntity(entityId);
        }
        
        // Remove from entity controls
        if (this.entityControls) {
            this.entityControls.deleteEntity(entityId);
        }
        
        // Remove from Assets panel
        this.removeEntityFromList(entityId);
        
        // Update entity counter
        this.updateEntityCounter();
        
        // Clear selection if it was selected
        if (this.uiControls && this.uiControls.selectedEntities.has(entityId)) {
            this.uiControls.deselectEntity(entityId);
        }
        
        // Clean up empty groups after entity deletion
        this.cleanupEmptyGroups(entityId);
        
        this.log(`Deleted entity ${entityId}`, 'info');
    }
    
    
    /**
     * Filter entity list based on search term
     */
    filterEntityList(searchTerm) {
        const entityList = this.elements.entityList;
        if (!entityList) return;
        
        // Get current type filter
        const activeFilterButton = document.querySelector('.filter-btn.active');
        const currentTypeFilter = activeFilterButton ? activeFilterButton.dataset.filter : 'all';
        
        const searchLower = searchTerm.toLowerCase();
        const entityItems = entityList.querySelectorAll('.entity-item');
        
        entityItems.forEach(item => {
            const entityId = item.dataset.entityId;
            const entityType = item.dataset.entityType;
            const entityName = item.querySelector('.entity-name')?.textContent || '';
            
            // Check search match
            const searchMatches = !searchTerm || 
                                entityId.toLowerCase().includes(searchLower) ||
                                entityType.toLowerCase().includes(searchLower) ||
                                entityName.toLowerCase().includes(searchLower);
            
            // Check type filter
            const typeMatches = currentTypeFilter === 'all' || entityType === currentTypeFilter;
            
            // Show only if both search and type filters match
            item.style.display = (searchMatches && typeMatches) ? 'block' : 'none';
        });
        
        // Update counter
        this.updateEntityCounter();
    }
    
    /**
     * Filter entity list based on entity type
     */
    filterEntitiesByType(filterType) {
        const entityList = this.elements.entityList;
        if (!entityList) return;
        
        // Get current search term
        const searchInput = this.elements.entitySearch;
        const searchTerm = searchInput ? searchInput.value : '';
        const searchLower = searchTerm.toLowerCase();
        
        const entityItems = entityList.querySelectorAll('.entity-item');
        
        entityItems.forEach(item => {
            const entityId = item.dataset.entityId;
            const entityType = item.dataset.entityType;
            const entityName = item.querySelector('.entity-name')?.textContent || '';
            
            // Check search match
            const searchMatches = !searchTerm || 
                                entityId.toLowerCase().includes(searchLower) ||
                                entityType.toLowerCase().includes(searchLower) ||
                                entityName.toLowerCase().includes(searchLower);
            
            // Check type filter
            const typeMatches = filterType === 'all' || entityType === filterType;
            
            // Show only if both search and type filters match
            item.style.display = (searchMatches && typeMatches) ? 'block' : 'none';
        });
        
        // Update entity counter based on visible items
        this.updateEntityCounter();
    }
    
    /**
     * Update entity counter to show filtered count
     */
    updateEntityCounter() {
        if (this.elements.entityCounter) {
            const entityList = this.elements.entityList;
            if (entityList) {
                const visibleItems = entityList.querySelectorAll('.entity-item[style*="block"], .entity-item:not([style*="none"])');
                this.elements.entityCounter.textContent = visibleItems.length.toString();
            }
        }
    }

    /**
     * Update visual selection highlighting in assets menu
     */
    updateAssetMenuSelection() {
        if (!this.elements.entityList || !this.uiControls) return;
        
        const selectedIds = this.uiControls.selectedEntities;
        const allEntityItems = this.elements.entityList.querySelectorAll('.entity-item');
        
        allEntityItems.forEach(item => {
            const entityId = item.dataset.entityId;
            if (selectedIds.has(entityId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * Update visual selection highlighting in groups menu
     */
    updateGroupMenuSelection() {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList || !this.uiControls) return;
        
        const selectedIds = this.uiControls.selectedEntities;
        const allGroupItems = groupsList.querySelectorAll('.group-item');
        
        allGroupItems.forEach(item => {
            const groupId = item.dataset.groupId;
            const groupData = this.groups.get(groupId);
            
            // Check if all entities in this group are selected
            let allEntitiesSelected = false;
            if (groupData && groupData.entities.length > 0) {
                allEntitiesSelected = groupData.entities.every(entityId => selectedIds.has(entityId));
            }
            
            if (allEntitiesSelected) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * Find group that exactly matches the selected entities
     */
    findGroupByEntities(selectedEntityIds) {
        // Convert to Set for easy comparison
        const selectedSet = new Set(selectedEntityIds);
        
        for (const [groupId, groupData] of this.groups) {
            const groupEntitySet = new Set(groupData.entities);
            
            // Check if selected entities exactly match this group's entities
            if (selectedSet.size === groupEntitySet.size && 
                [...selectedSet].every(id => groupEntitySet.has(id))) {
                return groupId;
            }
        }
        
        return null;
    }

    /**
     * Clean up empty groups after entity deletion
     */
    cleanupEmptyGroups(deletedEntityId) {
        const groupsToDelete = [];
        
        this.groups.forEach((groupData, groupId) => {
            // Remove the deleted entity from the group's entity list
            groupData.entities = groupData.entities.filter(entityId => entityId !== deletedEntityId);
            
            // If group has no entities left, mark it for deletion
            if (groupData.entities.length === 0) {
                groupsToDelete.push(groupId);
            }
        });
        
        // Delete empty groups
        groupsToDelete.forEach(groupId => {
            this.deleteGroup(groupId);
        });
        
        if (groupsToDelete.length > 0) {
            this.log(`Cleaned up ${groupsToDelete.length} empty groups`, 'info');
        }
    }

    /**
     * TEST METHOD: Delete first entity in the assets list
     */
    testDeleteFirstEntity() {
        const entityList = this.elements.entityList;
        if (!entityList) {
            console.error('Entity list not found');
            return;
        }
        
        const firstEntity = entityList.querySelector('.entity-item');
        if (firstEntity) {
            const entityId = firstEntity.dataset.entityId;
            this.removeEntity(entityId);
        } else {
        }
    }
    
    /**
     * TEST METHOD: Test WebSocket connection and functionality
     */
    testWebSocketConnection() {
        
        if (!this.websocketClient) {
            console.error('WebSocket client not initialized');
            return;
        }
        
        const status = this.websocketClient.getStatus();
        if (status.connected) {
            
            // Test ping
            this.websocketClient.send('ping', { test: true })
                .catch(error => console.error('❌ Ping failed:', error));
                
            // Test state request
            this.websocketClient.requestState()
                .then(state => {})
                .catch(error => console.error('❌ State request failed:', error));
                
        }
        
        // Test entity state manager
        if (this.entityStateManager) {
            const stats = this.entityStateManager.getStats();
        }
    }
    
    /**
     * TEST METHOD: Spawn test entity via WebSocket
     */
    async testSpawnEntity() {
        
        if (!this.isConnected) {
            console.error('❌ Not connected to backend');
            return;
        }
        
        try {
            const entityId = await this.spawnEntity('drone');
            if (entityId) {
                
                // Wait a moment, then test mode change
                setTimeout(async () => {
                    try {
                        await this.websocketClient.setEntityMode(entityId, 'kamikaze');
                    } catch (error) {
                        console.error('❌ Mode change failed:', error);
                    }
                }, 1000);
                
            } else {
                console.error('❌ Spawn failed - no entity ID returned');
            }
        } catch (error) {
            console.error('❌ Spawn test failed:', error);
        }
    }
    
    /**
     * Toggle entity list collapse state
     */
    toggleEntityListCollapse() {
        const collapseButton = this.elements.collapseEntities;
        
        // Target the entire sidebar-content instead of just entity-list
        const sidebarContent = document.querySelector('#entities-panel .sidebar-content');
        
        if (!sidebarContent) {
            this.log('Sidebar content element not found', 'error');
            return;
        }
        
        // Check if currently collapsed by checking computed style or explicit style
        const currentDisplay = window.getComputedStyle(sidebarContent).display;
        const isCollapsed = currentDisplay === 'none' || sidebarContent.style.display === 'none';
        
        
        if (isCollapsed) {
            // Expand
            sidebarContent.style.display = '';
            
            // Update button icon to collapse state (down arrow)
            if (collapseButton) {
                const svg = collapseButton.querySelector('svg path');
                if (svg) {
                    svg.setAttribute('d', 'M6 9L12 15L18 9');
                }
                collapseButton.title = 'Collapse All';
            }
            
            this.log('Entity panel expanded', 'success');
        } else {
            // Collapse
            sidebarContent.style.display = 'none';
            
            // Update button icon to expand state (right arrow)
            if (collapseButton) {
                const svg = collapseButton.querySelector('svg path');
                if (svg) {
                    svg.setAttribute('d', 'M9 18L15 12L9 6');
                }
                collapseButton.title = 'Expand All';
            }
            
            this.log('Entity panel collapsed', 'success');
        }
    }
    
    /**
     * Toggle canvas controls panel visibility
     */
    toggleCanvasControls() {
        const panel = this.elements.canvasControlsPanel;
        const toggleButton = this.elements.canvasControlsToggle;
        
        if (!panel) return;
        
        const isHidden = panel.style.display === 'none' || !panel.classList.contains('expanded');
        
        if (isHidden) {
            // Show panel
            panel.style.display = 'block';
            panel.classList.add('expanded');
            
            // Update button icon to close state
            if (toggleButton) {
                const svg = toggleButton.querySelector('svg');
                if (svg) {
                    svg.innerHTML = '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
                }
                toggleButton.title = 'Close Options';
            }
        } else {
            // Hide panel
            panel.classList.remove('expanded');
            setTimeout(() => {
                panel.style.display = 'none';
            }, 200); // Match CSS transition
            
            // Update button icon to options state
            if (toggleButton) {
                const svg = toggleButton.querySelector('svg');
                if (svg) {
                    svg.innerHTML = '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>';
                }
                toggleButton.title = 'View Options';
            }
        }
    }
    
    
    /**
     * Toggle terrain wireframe mode
     */
    toggleWireframe(enabled) {
        if (this.renderer3D && this.renderer3D.terrain) {
            this.renderer3D.terrain.setWireframeMode(enabled);
            this.log(`Terrain wireframe ${enabled ? 'enabled' : 'disabled'}`, 'info');
        } else {
            this.log('Terrain not available', 'warn');
        }
    }
    
    /**
     * Toggle terrain visibility
     */
    toggleTerrain(visible) {
        if (this.renderer3D && this.renderer3D.terrain && this.renderer3D.terrain.terrainMesh) {
            this.renderer3D.terrain.terrainMesh.visible = visible;
            this.log(`Terrain ${visible ? 'shown' : 'hidden'}`, 'info');
        } else {
            this.log('Terrain not available', 'warn');
        }
    }
    
    /**
     * Toggle heightmap colormap mode
     */
    toggleHeightmapColors(enabled) {
        if (this.renderer3D && this.renderer3D.terrain) {
            this.renderer3D.terrain.setColormapMode(enabled);
            this.log(`Heightmap colors ${enabled ? 'enabled' : 'disabled'}`, 'info');
        } else {
            this.log('Terrain not available', 'warn');
        }
    }
    
    /**
     * Toggle contour lines mode
     */
    toggleContourLines(enabled) {
        if (this.renderer3D && this.renderer3D.terrain) {
            this.renderer3D.terrain.setContourLinesMode(enabled);
            this.log(`Contour lines ${enabled ? 'enabled' : 'disabled'}`, 'info');
        } else {
            this.log('Terrain not available', 'warn');
        }
    }
    
    // ===== GROUP MANAGEMENT METHODS =====
    
    /**
     * Create group from currently selected entities
     */
    createGroupFromSelected() {
        if (!this.uiControls) {
            this.log('Cannot create group: UI controls not initialized', 'error');
            return;
        }
        
        const selectedEntities = this.uiControls.getSelectedEntities();
        
        if (selectedEntities.length < 2) {
            this.log('Select at least 2 entities to create a group', 'warning');
            return;
        }
        
        this.createGroup(selectedEntities);
    }
    
    /**
     * Remove entities from their existing groups
     */
    removeEntitiesFromExistingGroups(entityIds) {
        const groupsToUpdate = new Map(); // groupId -> remaining entities
        const groupsToDelete = new Set(); // groups that become empty

        // Find and remove entities from existing groups
        this.groups.forEach((groupData, groupId) => {
            const remainingEntities = groupData.entities.filter(entityId => !entityIds.includes(entityId));
            
            if (remainingEntities.length !== groupData.entities.length) {
                // This group had some entities removed
                if (remainingEntities.length === 0) {
                    // Group becomes empty - mark for deletion
                    groupsToDelete.add(groupId);
                } else {
                    // Group has remaining entities - update it
                    groupsToUpdate.set(groupId, remainingEntities);
                }
            }
        });

        // Update groups with remaining entities
        groupsToUpdate.forEach((remainingEntities, groupId) => {
            const groupData = this.groups.get(groupId);
            if (groupData) {
                groupData.entities = remainingEntities;
                this.updateGroupInList(groupData); // Update the UI display
                this.log(`Removed entities from ${groupData.name} (${remainingEntities.length} entities remaining)`, 'info');
            }
        });

        // Delete empty groups
        groupsToDelete.forEach(groupId => {
            const groupData = this.groups.get(groupId);
            if (groupData) {
                this.log(`Deleted empty group: ${groupData.name}`, 'info');
                this.deleteGroup(groupId);
            }
        });

        // Update visual representation if any groups were modified
        if (groupsToUpdate.size > 0 || groupsToDelete.size > 0) {
            this.updateGroupMenuSelection();
        }
    }

    /**
     * Create a new group with specified entities
     */
    createGroup(entityIds, groupName = null) {
        if (!entityIds || entityIds.length === 0) {
            this.log('Cannot create group: No entities provided', 'error');
            return null;
        }
        
        // Remove entities from their existing groups before adding to new group
        this.removeEntitiesFromExistingGroups(entityIds);
        
        this.groupCounter++;
        const groupId = `group_${this.groupCounter}`;
        const finalGroupName = groupName || `Group ${this.groupCounter}`;
        
        // Get entity types for group classification
        const entityTypes = new Set();
        const entities = [];
        
        entityIds.forEach(entityId => {
            if (this.entityControls) {
                const entityData = this.entityControls.getEntity(entityId);
                if (entityData) {
                    entities.push(entityData);
                    entityTypes.add(entityData.type);
                }
            }
        });
        
        // Determine group type
        let groupType = 'mixed';
        if (entityTypes.size === 1) {
            groupType = Array.from(entityTypes)[0] + 's'; // 'drones' or 'targets'
        }
        
        const groupData = {
            id: groupId,
            name: finalGroupName,
            type: groupType,
            entities: [...entityIds],
            created: new Date().toISOString(),
            waypoints: [],
            mode: 'hold_position'
        };
        
        this.groups.set(groupId, groupData);
        this.addGroupToList(groupData);
        
        this.log(`Created ${finalGroupName} with ${entityIds.length} entities`, 'success');
        return groupId;
    }
    
    /**
     * Add group to the Groups list UI
     */
    addGroupToList(groupData) {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList) {
            console.warn('Groups list element not found');
            return;
        }
        
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        groupItem.dataset.groupId = groupData.id;
        
        groupItem.innerHTML = `
            <div class="group-header">
                <div class="group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-1c0-2.66 5.33-4 8-4s8 1.34 8 4v1H4zM12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                </div>
                <div class="group-info">
                    <div class="group-name">${groupData.name}</div>
                    <div class="group-count">${groupData.entities.length} ${groupData.type}</div>
                </div>
            </div>
        `;
        
        
        // Add click to select functionality
        groupItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent text selection on ctrl+click or shift+click
            if (e.ctrlKey || e.shiftKey) {
                e.preventDefault();
                window.getSelection().removeAllRanges();
            }
            
            // Handle different selection modes
            if (e.ctrlKey) {
                // Ctrl+click: Toggle group selection
                this.toggleGroupSelection(groupData.id);
            } else if (e.shiftKey) {
                // Shift+click: Range selection
                this.selectGroupRange(groupData.id);
            } else {
                // Regular click: Single selection
                this.selectGroup(groupData.id);
            }
        });
        
        groupsList.appendChild(groupItem);
    }
    
    /**
     * Select all entities in a group
     */
    selectGroup(groupId) {
        const groupData = this.groups.get(groupId);
        if (!groupData) {
            this.log(`Group ${groupId} not found`, 'error');
            return;
        }
        
        if (!this.uiControls) {
            this.log('Cannot select group: UI controls not initialized', 'error');
            return;
        }
        
        // Clear current selection
        this.uiControls.clearSelection();
        
        // Select all entities in the group
        let selectedCount = 0;
        groupData.entities.forEach(entityId => {
            if (this.renderer3D && this.renderer3D.entities.has(entityId)) {
                this.uiControls.selectEntity(entityId);
                selectedCount++;
            }
        });
        
        // Focus on the selected group
        if (selectedCount > 0) {
            this.uiControls.focusOnSelected();
            this.log(`Selected ${groupData.name} (${selectedCount} entities)`, 'success');
        } else {
            this.log(`No entities found for ${groupData.name}`, 'warning');
        }
        
        // Track last selected group for range selection
        this.lastSelectedGroupId = groupId;
        
        // Update group item visual state
        this.updateGroupSelection(groupId, true);
    }
    
    /**
     * Toggle group selection (for Ctrl+click)
     */
    toggleGroupSelection(groupId) {
        const groupData = this.groups.get(groupId);
        if (!groupData || !this.uiControls) return;

        // Check if all entities in this group are currently selected
        const allEntitiesSelected = groupData.entities.every(entityId => 
            this.uiControls.selectedEntities.has(entityId)
        );

        if (allEntitiesSelected) {
            // Deselect all entities in the group
            groupData.entities.forEach(entityId => {
                if (this.renderer3D && this.renderer3D.entities.has(entityId)) {
                    this.uiControls.deselectEntity(entityId);
                }
            });
            this.log(`Deselected ${groupData.name}`, 'info');
        } else {
            // Select all entities in the group
            groupData.entities.forEach(entityId => {
                if (this.renderer3D && this.renderer3D.entities.has(entityId)) {
                    this.uiControls.selectEntity(entityId);
                }
            });
            // Track last selected group for range selection
            this.lastSelectedGroupId = groupId;
            this.log(`Added ${groupData.name} to selection`, 'info');
        }

        // Update visual selection
        this.updateAssetMenuSelection();
        this.updateGroupMenuSelection();
    }

    /**
     * Select range of groups from last selected to clicked group
     */
    selectGroupRange(groupId) {
        if (!this.uiControls || !this.lastSelectedGroupId) {
            // If no previous selection, just select this group
            this.selectGroup(groupId);
            return;
        }

        const groupsList = document.getElementById('groups-list');
        if (!groupsList) return;

        // Get all group items in DOM order
        const allGroupItems = Array.from(groupsList.querySelectorAll('.group-item'));
        
        // Find indices of start and end groups
        let startIndex = -1;
        let endIndex = -1;
        
        allGroupItems.forEach((item, index) => {
            const itemGroupId = item.dataset.groupId;
            if (itemGroupId === this.lastSelectedGroupId) {
                startIndex = index;
            }
            if (itemGroupId === groupId) {
                endIndex = index;
            }
        });

        if (startIndex === -1 || endIndex === -1) {
            // Fallback to single selection if groups not found
            this.selectGroup(groupId);
            return;
        }

        // Ensure startIndex is before endIndex
        if (startIndex > endIndex) {
            [startIndex, endIndex] = [endIndex, startIndex];
        }

        // Clear current selection
        this.uiControls.clearSelection();

        // Select range of groups
        let totalEntitiesSelected = 0;
        for (let i = startIndex; i <= endIndex; i++) {
            const itemGroupId = allGroupItems[i].dataset.groupId;
            const groupData = this.groups.get(itemGroupId);
            
            if (groupData) {
                // Select all entities in this group
                groupData.entities.forEach(entityId => {
                    if (this.renderer3D && this.renderer3D.entities.has(entityId)) {
                        this.uiControls.selectEntity(entityId);
                        totalEntitiesSelected++;
                    }
                });
            }
        }

        // Update last selected to the clicked group
        this.lastSelectedGroupId = groupId;

        // Update visual selection
        this.updateAssetMenuSelection();
        this.updateGroupMenuSelection();
        
        this.log(`Selected range: ${endIndex - startIndex + 1} groups (${totalEntitiesSelected} entities)`, 'success');
    }

    /**
     * Delete a group (but not the entities)
     */
    deleteGroup(groupId) {
        const groupData = this.groups.get(groupId);
        if (!groupData) {
            this.log(`Group ${groupId} not found`, 'error');
            return;
        }
        
        // Remove from groups map
        this.groups.delete(groupId);
        
        // Remove from UI
        this.removeGroupFromList(groupId);
        
        this.log(`Deleted group ${groupData.name}`, 'success');
    }
    
    /**
     * Update group information in the Groups list UI
     */
    updateGroupInList(groupData) {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList) return;

        const groupItem = groupsList.querySelector(`[data-group-id="${groupData.id}"]`);
        if (groupItem) {
            // Update the group count display
            const groupCount = groupItem.querySelector('.group-count');
            if (groupCount) {
                groupCount.textContent = `${groupData.entities.length} ${groupData.type}`;
            }
        }
    }

    /**
     * Remove group from Groups list UI
     */
    removeGroupFromList(groupId) {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList) return;
        
        const groupItem = groupsList.querySelector(`[data-group-id="${groupId}"]`);
        if (groupItem) {
            groupItem.remove();
        }
    }
    
    /**
     * Update group selection visual state
     */
    updateGroupSelection(groupId, selected) {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList) return;
        
        // Clear all selections first
        groupsList.querySelectorAll('.group-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to current group
        if (selected) {
            const groupItem = groupsList.querySelector(`[data-group-id="${groupId}"]`);
            if (groupItem) {
                groupItem.classList.add('selected');
            }
        }
    }
    
    /**
     * Auto-create group when waypoints are assigned to multiple selected entities
     */
    autoCreateGroupForWaypoints(entityIds) {
        if (entityIds.length >= 2) {
            // Check if these entities are already in a group together
            const existingGroup = this.findGroupWithEntities(entityIds);
            
            if (!existingGroup) {
                const groupId = this.createGroup(entityIds, `Waypoint Group ${this.groupCounter}`);
                this.log(`Auto-created waypoint group with ${entityIds.length} entities`, 'info');
                return groupId;
            } else {
                this.log(`Updated waypoints for existing ${existingGroup.name}`, 'info');
                return existingGroup.id;
            }
        }
        return null;
    }
    
    /**
     * Find group that contains all specified entities
     */
    findGroupWithEntities(entityIds) {
        for (const [groupId, groupData] of this.groups) {
            const groupEntitySet = new Set(groupData.entities);
            const entityIdSet = new Set(entityIds);
            
            // Check if all entityIds are in this group
            if (entityIds.every(id => groupEntitySet.has(id)) && 
                groupData.entities.length === entityIds.length) {
                return groupData;
            }
        }
        return null;
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    
    const app = new BGCSApp();
    const success = await app.init();
    
    if (success) {
        
        // Make app globally accessible for debugging
        window.bgcsApp = app;
    } else {
        console.error('BGCS App initialization failed');
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (window.bgcsApp) {
        const message = document.hidden ? 'Application paused (tab hidden)' : 'Application resumed';
        window.bgcsApp.log(message, 'info');
    }
});

// Handle unload
window.addEventListener('beforeunload', () => {
    if (window.bgcsApp) {
        window.bgcsApp.log('Application shutting down', 'warning');
    }
});