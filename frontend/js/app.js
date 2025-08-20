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
        
        // Console
        this.console = {
            maxEntries: 1000,
            entries: []
        };
        
        console.log('BGCS App initialized');
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            this.setupCanvas();
            this.setup3DScene();
            this.setupControls();
            this.setupUIElements();
            this.setupEventListeners();
            this.setupConsole();
            
            this.startUIUpdateLoop();
            this.startRendering();
            
            this.initialized = true;
            this.log('BGCS Ground Control Station initialized', 'info');
            this.log('3D Scene Foundation loaded successfully', 'success');
            
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
        console.log('Canvas initialized:', this.canvas.width, 'x', this.canvas.height);
    }
    
    /**
     * Setup 3D scene components
     */
    setup3DScene() {
        try {
            // Initialize camera manager
            this.cameraManager = new BGCSCameraManager(this.canvas);
            if (!this.cameraManager.init()) {
                throw new Error('Failed to initialize camera manager');
            }
            window.bgcsCameras = this.cameraManager; // Make globally accessible
            
            // Initialize 3D renderer
            this.renderer3D = new BGCS3DRenderer(this.canvas);
            if (!this.renderer3D.init()) {
                throw new Error('Failed to initialize 3D renderer');
            }
            window.bgcs3D = this.renderer3D; // Make globally accessible
            
            // Add some demo entities for testing
            this.addDemoEntities();
            
            console.log('3D Scene setup complete');
            this.log('3D Scene Foundation initialized', 'success');
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
            
            console.log('Control systems setup complete');
            this.log('UI and Entity Controls initialized', 'success');
        } catch (error) {
            console.error('Control systems setup failed:', error);
            this.log(`Control systems setup failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Add demo entities for testing
     */
    addDemoEntities() {
        if (!this.renderer3D || !this.entityControls) return;
        
        // Add demo entities closer to center and at ground level for better visibility
        console.log('Adding demo entities...');
        
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
        
        console.log('Added demo entities with data models');
        
        this.log('Added 3 demo entities to scene', 'info');
        this.log('Selection: Click to select, Shift+click for multi-select, Drag entities around', 'info');
        this.log('Camera Controls: Left drag = orbit(3D)/pan(2D), Middle drag = pan, Wheel = zoom, Keys 1/2 = switch view', 'info');
        this.log('Console Commands: bgcsApp.spawnMultiple("drone", 5) or bgcsApp.spawnMultiple("target", 3)', 'info');
    }
    
    /**
     * Spawn a new entity (drone or target)
     */
    spawnEntity(type) {
        if (!this.renderer3D || !this.entityControls) {
            this.log('Cannot spawn: 3D scene not initialized', 'error');
            return;
        }
        
        // Generate unique ID
        const timestamp = Date.now();
        const randomId = Math.floor(Math.random() * 1000);
        const entityId = `${type}_${timestamp}_${randomId}`;
        
        // Generate random position
        const position = this.getRandomSpawnPosition();
        
        // Create entity data model
        const entityData = this.entityControls.createEntity(entityId, type, {
            x: position.x,
            y: position.y, 
            z: position.z,
            yaw: Math.random() * 360
        });
        
        // Add to 3D scene
        this.renderer3D.addEntity(entityId, type, position);
        
        // Set random initial mode
        if (type === 'drone') {
            const modes = ['hold_position', 'random_search', 'waypoint_mode'];
            const randomMode = modes[Math.floor(Math.random() * modes.length)];
            this.entityControls.setEntityMode(entityId, randomMode);
        }
        
        // Add to Assets panel
        this.addEntityToList(entityData);
        
        // Log success
        this.log(`Spawned ${type} "${entityId}" at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`, 'success');
        
        console.log(`Spawned ${type}:`, entityId, 'at position:', position);
        
        return entityId;
    }
    
    /**
     * Generate random spawn position
     */
    getRandomSpawnPosition() {
        // Spawn in a reasonable area around the origin
        const range = 30; // -30 to +30 in X and Z
        const minHeight = 2; // Reasonable height for 3D spheres
        const maxHeight = 8; // Good altitude range for UAVs
        
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
            selectedCounter: document.getElementById('selected-counter'),
            
            // Options menu
            optionsToggle: document.getElementById('options-toggle'),
            optionsPanel: document.getElementById('options-panel'),
            entityScale: document.getElementById('entity-scale'),
            scaleValue: document.getElementById('scale-value'),
            showDetectionRanges: document.getElementById('show-detection-ranges'),
            showWaypoints: document.getElementById('show-waypoints'),
            showGrid: document.getElementById('show-grid'),
            
            // Entity controls
            entitySearch: document.getElementById('entity-search'),
            entityList: document.getElementById('entity-list'),
            groupsList: document.getElementById('groups-list'),
            refreshEntities: document.getElementById('refresh-entities'),
            collapseEntities: document.getElementById('collapse-entities'),
            
            // Options menu controls replaced canvas controls
            
            // Control panel
            spawnDrone: document.getElementById('spawn-drone'),
            spawnTarget: document.getElementById('spawn-target'),
            deleteSelected: document.getElementById('delete-selected'),
            focusSelected: document.getElementById('focus-selected'),
            clearAllWaypoints: document.getElementById('clear-all-waypoints'),
            centerView: document.getElementById('center-view'),
            
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
        
        console.log('UI elements setup complete');
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
            if (!e.target.closest('.header-options')) {
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
        if (this.elements.refreshEntities) {
            this.elements.refreshEntities.addEventListener('click', () => this.refreshEntityList());
        }
        
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
        
        console.log('Event listeners setup complete');
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
        
        if (this.elements.focusSelected) {
            this.elements.focusSelected.addEventListener('click', () => {
                this.focusOnSelectedEntities();
            });
        }
        
        if (this.elements.clearAllWaypoints) {
            this.elements.clearAllWaypoints.addEventListener('click', () => {
                this.clearAllWaypoints();
            });
        }
        
        if (this.elements.centerView) {
            this.elements.centerView.addEventListener('click', () => {
                this.centerView();
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
        
        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const mode = e.target.dataset.mode;
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
        
        // Placeholder click handling
        this.log(`Canvas clicked at (${Math.round(x)}, ${Math.round(y)})`, 'info');
        
        // Simple click feedback - draw a circle
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 10, 0, 2 * Math.PI);
        this.ctx.stroke();
        
        // Fade the circle after a short time
        setTimeout(() => {
            this.drawPlaceholderContent();
        }, 1000);
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
        }
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
        if (!this.ctx) return;
        
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid if enabled
        const showGridCheckbox = this.elements.showGrid || document.getElementById('show-grid');
        if (showGridCheckbox && showGridCheckbox.checked) {
            this.drawGrid();
        }
        
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
     * Draw grid overlay
     */
    drawGrid() {
        if (!this.ctx) return;
        
        const gridSize = 50;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    /**
     * Start UI update loop
     */
    startUIUpdateLoop() {
        const updateLoop = () => {
            // Update UI elements
            this.updateUI();
            
            requestAnimationFrame(updateLoop);
        };
        
        requestAnimationFrame(updateLoop);
        console.log('UI update loop started');
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
        
        // Update selected counter
        if (this.elements.selectedCounter) {
            this.elements.selectedCounter.textContent = this.selectedEntities.size.toString();
        }
        
        // Update connection status
        if (this.elements.connectionStatus) {
            const status = this.renderer3D ? 'online' : 'offline';
            this.elements.connectionStatus.className = `status-indicator ${status}`;
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
            
            // Prevent text selection on shift+click
            if (e.shiftKey) {
                e.preventDefault();
                window.getSelection().removeAllRanges();
            }
            
            // Handle multi-select with shift key
            if (e.shiftKey) {
                this.toggleEntitySelection(entityData.entity_id);
            } else {
                this.selectEntityFromList(entityData.entity_id);
            }
        });
        
        // Add to list
        entityList.appendChild(entityItem);
        
        // Update entity counter
        this.updateEntityCounter();
        
        console.log(`Added entity ${entityData.entity_id} to assets panel`);
    }
    
    /**
     * Remove entity from the Assets panel list
     */
    removeEntityFromList(entityId) {
        console.log(`removeEntityFromList called for: ${entityId}`);
        
        const entityList = this.elements.entityList;
        if (!entityList) {
            console.error('Entity list element not found!');
            return;
        }
        
        // Debug: Show all current entities in the list
        const allItems = entityList.querySelectorAll('.entity-item');
        console.log('Current entities in list before deletion:', Array.from(allItems).map(item => ({
            id: item.dataset.entityId,
            element: item
        })));
        
        // Try multiple selector approaches to ensure we find the entity
        let entityItem = entityList.querySelector(`[data-entity-id="${entityId}"]`);
        console.log(`CSS selector result:`, entityItem);
        
        // If first approach failed, try finding by iterating through items
        if (!entityItem) {
            console.log('CSS selector failed, trying manual iteration...');
            for (const item of allItems) {
                console.log(`Checking item with dataset.entityId: "${item.dataset.entityId}" against "${entityId}"`);
                if (item.dataset.entityId === entityId) {
                    entityItem = item;
                    console.log('Found match via manual iteration!');
                    break;
                }
            }
        }
        
        if (entityItem) {
            console.log(`Successfully found entity item, removing:`, entityItem);
            entityItem.remove();
            console.log(`Removed entity ${entityId} from assets panel`);
            
            // Verify it was actually removed
            const remainingItems = entityList.querySelectorAll('.entity-item');
            console.log('Remaining entities after deletion:', Array.from(remainingItems).map(item => item.dataset.entityId));
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
        console.log(`selectEntityFromList called for: ${entityId}`);
        if (this.uiControls) {
            console.log('Clearing selection...');
            this.uiControls.clearSelection();
            console.log('Selecting entity...');
            this.uiControls.selectEntity(entityId);
            console.log('Focusing on selected...');
            this.uiControls.focusOnSelected();
            console.log('Selected entities after selection:', Array.from(this.uiControls.selectedEntities));
        } else {
            console.error('uiControls not available!');
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
            }
        }
    }
    
    /**
     * Apply behavior mode to selected entities
     */
    applyModeToSelected(mode) {
        if (!this.entityControls || !this.uiControls) {
            this.log('Cannot apply mode: Control systems not initialized', 'error');
            return;
        }
        
        const selectedEntities = this.uiControls.getSelectedEntities();
        
        if (selectedEntities.length === 0) {
            this.log('No entities selected. Please select entities first.', 'warning');
            return;
        }
        
        // Apply mode to selected entities using entity controls
        this.entityControls.setSelectedEntitiesMode(mode);
        
        // Auto-create group if waypoint mode is applied to multiple entities
        if (mode === 'waypoint_mode' && selectedEntities.length >= 2) {
            this.autoCreateGroupForWaypoints(selectedEntities);
        }
        
        // Update entity items in the list to reflect new mode
        selectedEntities.forEach(entityId => {
            const entityData = this.entityControls.getEntity(entityId);
            if (entityData) {
                this.updateEntityInList(entityData);
            }
        });
        
        this.log(`Applied ${mode} mode to ${selectedEntities.length} selected entities`, 'success');
    }
    
    /**
     * Delete selected entities
     */
    deleteSelectedEntities() {
        console.log('=== DELETE SELECTED ENTITIES CALLED ===');
        
        if (!this.uiControls) {
            console.log('UI controls not initialized');
            this.log('Cannot delete: UI controls not initialized', 'error');
            return;
        }
        
        const selectedEntities = this.uiControls.getSelectedEntities();
        console.log('Selected entities for deletion:', selectedEntities);
        
        if (selectedEntities.length === 0) {
            console.log('No entities selected');
            this.log('No entities selected to delete', 'warning');
            return;
        }
        
        // Delete each selected entity
        selectedEntities.forEach(entityId => {
            console.log(`Deleting entity: ${entityId}`);
            this.removeEntity(entityId);
        });
        
        console.log(`=== COMPLETED DELETING ${selectedEntities.length} ENTITIES ===`);
        this.log(`Deleted ${selectedEntities.length} selected entities`, 'success');
    }
    
    /**
     * Focus camera on selected entities
     */
    focusOnSelectedEntities() {
        if (!this.uiControls) {
            this.log('Cannot focus: UI controls not initialized', 'error');
            return;
        }
        
        const selectedEntities = this.uiControls.getSelectedEntities();
        
        if (selectedEntities.length === 0) {
            this.log('No entities selected to focus on', 'warning');
            return;
        }
        
        // Use UI controls focus functionality
        this.uiControls.focusOnSelected();
        this.log(`Focused camera on ${selectedEntities.length} selected entities`, 'success');
    }
    
    /**
     * Clear all waypoints for all entities
     */
    clearAllWaypoints() {
        if (!this.entityControls) {
            this.log('Cannot clear waypoints: Entity controls not initialized', 'error');
            return;
        }
        
        // Use entity controls method
        this.entityControls.clearAllWaypoints();
        this.log('Cleared all waypoints for all entities', 'success');
    }
    
    /**
     * Center camera view
     */
    centerView() {
        if (!this.cameraManager) {
            this.log('Cannot center view: Camera manager not initialized', 'error');
            return;
        }
        
        // Reset camera to center/origin
        this.cameraManager.focusOn(new THREE.Vector3(0, 0, 0));
        this.log('Centered camera view', 'success');
    }
    
    /**
     * Remove entity completely
     */
    removeEntity(entityId) {
        console.log(`=== STARTING DELETION OF ENTITY: ${entityId} ===`);
        
        // Remove from 3D scene
        if (this.renderer3D) {
            console.log(`Removing ${entityId} from 3D scene`);
            this.renderer3D.removeEntity(entityId);
        }
        
        // Remove from entity controls
        if (this.entityControls) {
            console.log(`Removing ${entityId} from entity controls`);
            this.entityControls.deleteEntity(entityId);
        }
        
        // Remove from Assets panel
        console.log(`Removing ${entityId} from Assets panel`);
        this.removeEntityFromList(entityId);
        
        // Update entity counter
        console.log(`Updating entity counter after deleting ${entityId}`);
        this.updateEntityCounter();
        
        // Clear selection if it was selected
        if (this.uiControls && this.uiControls.selectedEntities.has(entityId)) {
            console.log(`Clearing selection for ${entityId}`);
            this.uiControls.deselectEntity(entityId);
        }
        
        console.log(`=== COMPLETED DELETION OF ENTITY: ${entityId} ===`);
        this.log(`Deleted entity ${entityId}`, 'info');
    }
    
    /**
     * Refresh entity list
     */
    refreshEntityList() {
        this.log('Refreshing entity list...', 'info');
        
        const entityList = this.elements.entityList;
        if (!entityList) return;
        
        // Clear existing list
        entityList.innerHTML = '';
        
        // Repopulate from entity controls data
        if (this.entityControls) {
            const allEntities = this.entityControls.getAllEntities();
            allEntities.forEach(entityData => {
                this.addEntityToList(entityData);
            });
            
            this.log(`Refreshed ${allEntities.length} entities in list`, 'info');
        }
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
     * TEST METHOD: Delete first entity in the assets list
     */
    testDeleteFirstEntity() {
        console.log('=== TEST DELETE FIRST ENTITY ===');
        const entityList = this.elements.entityList;
        if (!entityList) {
            console.error('Entity list not found');
            return;
        }
        
        const firstEntity = entityList.querySelector('.entity-item');
        if (firstEntity) {
            const entityId = firstEntity.dataset.entityId;
            console.log(`Testing deletion of first entity: ${entityId}`);
            this.removeEntity(entityId);
        } else {
            console.log('No entities found in list');
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
     * Create a new group with specified entities
     */
    createGroup(entityIds, groupName = null) {
        if (!entityIds || entityIds.length === 0) {
            this.log('Cannot create group: No entities provided', 'error');
            return null;
        }
        
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
        groupItem.addEventListener('click', () => {
            this.selectGroup(groupData.id);
        });
        
        groupsList.appendChild(groupItem);
        console.log(`Added group ${groupData.name} to groups panel`);
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
        
        // Update group item visual state
        this.updateGroupSelection(groupId, true);
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
     * Remove group from Groups list UI
     */
    removeGroupFromList(groupId) {
        const groupsList = document.getElementById('groups-list');
        if (!groupsList) return;
        
        const groupItem = groupsList.querySelector(`[data-group-id="${groupId}"]`);
        if (groupItem) {
            groupItem.remove();
            console.log(`Removed group ${groupId} from groups panel`);
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
    console.log('DOM loaded, initializing BGCS App...');
    
    const app = new BGCSApp();
    const success = await app.init();
    
    if (success) {
        console.log('BGCS App initialization complete');
        
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