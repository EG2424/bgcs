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
        const minHeight = 2;
        const maxHeight = 15;
        
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
            fpsCounter: document.getElementById('fps-counter'),
            entityCounter: document.getElementById('entity-counter'),
            selectedCounter: document.getElementById('selected-counter'),
            
            // View controls
            viewTop: document.getElementById('view-top'),
            view3D: document.getElementById('view-3d'),
            
            // Canvas controls
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
            
            // Canvas controls toggle
            canvasControlsToggle: document.getElementById('canvas-controls-toggle'),
            canvasControlsPanel: document.getElementById('canvas-controls-panel'),
            
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
        
        // View controls
        if (this.elements.viewTop) {
            this.elements.viewTop.addEventListener('click', () => this.setView('top'));
        }
        if (this.elements.view3D) {
            this.elements.view3D.addEventListener('click', () => this.setView('3d'));
        }
        
        // Scale control
        if (this.elements.entityScale) {
            this.elements.entityScale.addEventListener('input', (e) => {
                this.entityScale = parseFloat(e.target.value);
                if (this.elements.scaleValue) {
                    this.elements.scaleValue.textContent = `${this.entityScale.toFixed(1)}x`;
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
        
        // Other buttons (keep existing functionality)
        const otherButtons = ['deleteSelected', 'focusSelected', 'clearAllWaypoints', 'centerView'];
        otherButtons.forEach(buttonKey => {
            const button = this.elements[buttonKey];
            if (button) {
                button.addEventListener('click', () => {
                    this.log(`${buttonKey} clicked (placeholder)`, 'info');
                    // Will be implemented when needed
                });
            }
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.log(`Filter changed to: ${e.target.dataset.filter}`, 'info');
            });
        });
        
        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.log(`Mode changed to: ${e.target.dataset.mode}`, 'info');
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
                    this.log('Delete selected (placeholder)', 'info');
                }
                break;
        }
    }
    
    /**
     * Set current view mode
     */
    setView(view) {
        this.currentView = view;
        
        // Update 3D camera if available
        if (this.cameraManager) {
            this.cameraManager.setView(view);
        }
        
        // Update button states
        if (this.elements.viewTop) {
            this.elements.viewTop.classList.toggle('active', view === 'top');
        }
        if (this.elements.view3D) {
            this.elements.view3D.classList.toggle('active', view === '3d');
        }
        
        this.log(`Switched to ${view} view`, 'info');
        
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
        if (this.elements.fpsCounter && this.renderer3D) {
            this.elements.fpsCounter.textContent = this.renderer3D.getFPS().toString();
        }
        
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
     * Refresh entity list
     */
    refreshEntityList() {
        this.log('Refreshing entity list...', 'info');
        // Placeholder - will be implemented when WebSocket client is ready
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