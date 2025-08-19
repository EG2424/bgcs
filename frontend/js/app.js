/**
 * BGCS Frontend Application - Chunk 4: Frontend Shell
 * Basic app initialization and UI interactions
 */

class BGCSApp {
    constructor() {
        this.initialized = false;
        this.canvas = null;
        this.ctx = null;
        
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
            this.setupUIElements();
            this.setupEventListeners();
            this.setupConsole();
            this.startUIUpdateLoop();
            
            this.initialized = true;
            this.log('BGCS Ground Control Station initialized', 'info');
            this.log('Frontend shell loaded successfully', 'success');
            
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
        
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        // Basic canvas setup
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw placeholder content
        this.drawPlaceholderContent();
        
        console.log('Canvas initialized:', this.canvas.width, 'x', this.canvas.height);
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
            
            // Control panel
            spawnDrone: document.getElementById('spawn-drone'),
            spawnTarget: document.getElementById('spawn-target'),
            deleteSelected: document.getElementById('delete-selected'),
            
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
        const buttons = [
            'spawnDrone', 'spawnTarget', 'deleteSelected',
            'startSimulation', 'pauseSimulation', 'stopSimulation'
        ];
        
        buttons.forEach(buttonKey => {
            const button = this.elements[buttonKey];
            if (button) {
                button.addEventListener('click', () => {
                    this.log(`${buttonKey} clicked (placeholder)`, 'info');
                    // Placeholder - will be implemented in later chunks
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
        
        // Update button states
        if (this.elements.viewTop) {
            this.elements.viewTop.classList.toggle('active', view === 'top');
        }
        if (this.elements.view3D) {
            this.elements.view3D.classList.toggle('active', view === '3d');
        }
        
        this.log(`Switched to ${view} view`, 'info');
        this.drawPlaceholderContent();
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Redraw content after resize
        if (this.initialized) {
            this.drawPlaceholderContent();
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
        if (this.elements.showGrid && this.elements.showGrid.checked) {
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
            '3D rendering and entity visualization will be implemented in Chunk 5',
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
        let frameCount = 0;
        let lastTime = performance.now();
        let fps = 0;
        
        const updateLoop = (currentTime) => {
            frameCount++;
            
            // Update FPS counter every second
            if (currentTime - lastTime >= 1000) {
                fps = Math.round(frameCount * 1000 / (currentTime - lastTime));
                frameCount = 0;
                lastTime = currentTime;
                
                if (this.elements.fpsCounter) {
                    this.elements.fpsCounter.textContent = fps.toString();
                }
            }
            
            // Update other UI elements
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
        // Update entity counter (placeholder)
        if (this.elements.entityCounter) {
            this.elements.entityCounter.textContent = '0'; // Will be updated with real data
        }
        
        // Update selected counter
        if (this.elements.selectedCounter) {
            this.elements.selectedCounter.textContent = this.selectedEntities.size.toString();
        }
        
        // Update connection status
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.className = 'status-indicator offline'; // Placeholder
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
            const isCollapsed = console.style.height === '48px';
            console.style.height = isCollapsed ? 'var(--console-height)' : '48px';
            
            const toggleButton = this.elements.toggleConsole;
            if (toggleButton) {
                const svg = toggleButton.querySelector('svg path');
                if (svg) {
                    svg.setAttribute('d', isCollapsed ? 
                        'M18 15L12 9L6 15' : 'M6 9L12 15L18 9');
                }
            }
            
            this.log(isCollapsed ? 'Console expanded' : 'Console collapsed', 'info');
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