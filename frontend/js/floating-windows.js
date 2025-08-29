/**
 * BGCS Floating Window System
 * Military-style floating windows with drag, resize, and dock/undock capabilities
 */

class FloatingWindowManager {
    constructor() {
        this.windows = new Map();
        this.zIndexCounter = 2000;
        this.activeWindow = null;
        
        this.init();
    }
    
    init() {
        // Create window container
        this.container = document.createElement('div');
        this.container.id = 'floating-window-container';
        this.container.className = 'floating-window-container';
        document.body.appendChild(this.container);
        
        // Global event listeners
        this.setupGlobalListeners();
        
    }
    
    setupGlobalListeners() {
        // Click outside to deactivate windows
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.floating-window') && !e.target.closest('.dock-panel')) {
                this.deactivateAllWindows();
            }
        });
        
        // ESC to close active window
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeWindow) {
                this.closeWindow(this.activeWindow.id);
            }
        });
    }
    
    createWindow(panelId, config) {
        const windowId = `window_${panelId}_${Date.now()}`;
        
        // Create floating window instance
        const floatingWindow = new FloatingWindow(windowId, panelId, config, this);
        this.windows.set(windowId, floatingWindow);
        
        // Add to DOM
        this.container.appendChild(floatingWindow.element);
        
        // Set as active
        this.setActiveWindow(windowId);
        
        return floatingWindow;
    }
    
    closeWindow(windowId) {
        const window = this.windows.get(windowId);
        if (!window) {
            console.warn(`⚠️ Window ${windowId} not found for closing`);
            return false;
        }
        
        console.log(`🗑️ Closing floating window ${windowId} for panel ${window.panelId}`);
        
        // Notify dock system to clean up state for this panel
        if (globalThis.dockSystem) {
            console.log(`📞 Notifying dock system to clean up panel: ${window.panelId}`);
            globalThis.dockSystem.onFloatingWindowClosed(window.panelId);
        } else {
            console.warn('⚠️ DockSystem not available for cleanup');
        }
        
        // Remove from DOM
        window.element.remove();
        
        // Clean up
        this.windows.delete(windowId);
        
        // Update active window
        if (this.activeWindow && this.activeWindow.id === windowId) {
            this.activeWindow = null;
            // Set most recent window as active
            if (this.windows.size > 0) {
                const lastWindow = Array.from(this.windows.values()).pop();
                this.setActiveWindow(lastWindow.id);
            }
        }
        
        console.log(`❌ Closed floating window: ${windowId}`);
        return true;
    }
    
    setActiveWindow(windowId) {
        const window = this.windows.get(windowId);
        if (!window) return;
        
        // Deactivate all windows
        this.deactivateAllWindows();
        
        // Activate target window
        this.activeWindow = window;
        window.element.classList.add('active');
        window.element.style.zIndex = ++this.zIndexCounter;
        
    }
    
    deactivateAllWindows() {
        this.windows.forEach(window => {
            window.element.classList.remove('active');
        });
        this.activeWindow = null;
    }
    
    getWindowsForPanel(panelId) {
        return Array.from(this.windows.values()).filter(win => win.panelId === panelId);
    }
    
    hasWindowsForPanel(panelId) {
        return this.getWindowsForPanel(panelId).length > 0;
    }
    
    // Debug info
    getState() {
        return {
            windowCount: this.windows.size,
            activeWindow: this.activeWindow?.id || null,
            zIndexCounter: this.zIndexCounter,
            windows: Array.from(this.windows.keys())
        };
    }
}

class FloatingWindow {
    constructor(windowId, panelId, config, manager) {
        this.id = windowId;
        this.panelId = panelId;
        this.config = config;
        this.manager = manager;
        
        // Window state
        this.isDragging = false;
        this.isResizing = false;
        this.position = { x: 100, y: 100 };
        this.size = { width: parseInt(config.width) || 320, height: 400 };
        
        // Create DOM structure
        this.createElement();
        this.setupEventListeners();
        
        // Position window (avoid overlaps)
        this.positionWindow();
    }
    
    createElement() {
        // Main window container
        this.element = document.createElement('div');
        this.element.className = 'floating-window';
        this.element.setAttribute('data-window-id', this.id);
        this.element.setAttribute('data-panel-id', this.panelId);
        
        // Window chrome structure
        this.element.innerHTML = `
            <div class="window-chrome">
                <div class="window-header" data-drag-handle="true">
                    <div class="window-title">
                        <svg class="window-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${this.getIconSVG()}
                        </svg>
                        <span class="window-title-text">${this.config.name || this.panelId}</span>
                    </div>
                    <div class="window-controls">
                        <button class="window-btn dock-btn" title="Dock" data-action="dock">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3h18v18H3z"/>
                                <path d="M9 3v18"/>
                            </svg>
                        </button>
                        <button class="window-btn close-btn" title="Close" data-action="close">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="window-content" id="content_${this.id}">
                <!-- Panel content will be moved here -->
            </div>
            <div class="window-resize-handle" data-resize-handle="se"></div>
        `;
        
        // Apply initial size and position
        this.element.style.width = this.size.width + 'px';
        this.element.style.height = this.size.height + 'px';
        this.element.style.left = this.position.x + 'px';
        this.element.style.top = this.position.y + 'px';
    }
    
    getIconSVG() {
        const icons = {
            camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
            actions: '<polygon points="3,11 22,2 13,21 11,13 3,11"/>',
            logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/>',
            console: '<polyline points="4,17 10,11 4,5"/><line x1="12" y1="19" x2="20" y2="19"/>'
        };
        return icons[this.panelId] || icons.console;
    }
    
    setupEventListeners() {
        // Window activation
        this.element.addEventListener('mousedown', (e) => {
            this.manager.setActiveWindow(this.id);
        });
        
        // Window controls
        const controls = this.element.querySelectorAll('.window-btn');
        controls.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                this.handleControlAction(action);
            });
        });
        
        // Drag functionality
        this.setupDragListeners();
        
        // Resize functionality
        this.setupResizeListeners();
    }
    
    setupDragListeners() {
        const header = this.element.querySelector('[data-drag-handle="true"]');
        if (!header) return;
        
        let dragStart = null;
        let windowStart = null;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-btn')) return; // Don't drag on buttons
            
            this.isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
            windowStart = { x: this.position.x, y: this.position.y };
            
            // Visual feedback
            this.element.classList.add('dragging');
            document.body.classList.add('dragging-window');
            
            e.preventDefault();
        });
        
        const handleMouseMove = (e) => {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;
            
            this.position.x = windowStart.x + deltaX;
            this.position.y = windowStart.y + deltaY;
            
            // Keep window on screen
            this.constrainPosition();
            
            this.element.style.left = this.position.x + 'px';
            this.element.style.top = this.position.y + 'px';
        };
        
        const handleMouseUp = () => {
            if (!this.isDragging) return;
            
            this.isDragging = false;
            dragStart = null;
            windowStart = null;
            
            // Remove visual feedback
            this.element.classList.remove('dragging');
            document.body.classList.remove('dragging-window');
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    setupResizeListeners() {
        const resizeHandle = this.element.querySelector('.window-resize-handle');
        if (!resizeHandle) return;
        
        let resizeStart = null;
        let sizeStart = null;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            resizeStart = { x: e.clientX, y: e.clientY };
            sizeStart = { width: this.size.width, height: this.size.height };
            
            this.element.classList.add('resizing');
            document.body.classList.add('resizing-window');
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        const handleMouseMove = (e) => {
            if (!this.isResizing) return;
            
            const deltaX = e.clientX - resizeStart.x;
            const deltaY = e.clientY - resizeStart.y;
            
            this.size.width = Math.max(250, sizeStart.width + deltaX);
            this.size.height = Math.max(200, sizeStart.height + deltaY);
            
            this.element.style.width = this.size.width + 'px';
            this.element.style.height = this.size.height + 'px';
        };
        
        const handleMouseUp = () => {
            if (!this.isResizing) return;
            
            this.isResizing = false;
            resizeStart = null;
            sizeStart = null;
            
            this.element.classList.remove('resizing');
            document.body.classList.remove('resizing-window');
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    positionWindow() {
        // Smart positioning - avoid overlaps with existing windows
        const existingWindows = Array.from(this.manager.windows.values())
            .filter(w => w.id !== this.id);
        
        let offset = existingWindows.length * 30;
        this.position.x = 100 + offset;
        this.position.y = 100 + offset;
        
        // Keep on screen
        this.constrainPosition();
        
        this.element.style.left = this.position.x + 'px';
        this.element.style.top = this.position.y + 'px';
    }
    
    constrainPosition() {
        const margin = 50;
        const maxX = window.innerWidth - this.size.width - margin;
        const maxY = window.innerHeight - this.size.height - margin;
        
        this.position.x = Math.max(margin, Math.min(maxX, this.position.x));
        this.position.y = Math.max(margin, Math.min(maxY, this.position.y));
    }
    
    handleControlAction(action) {
        switch (action) {
            case 'dock':
                this.dockWindow();
                break;
            case 'close':
                this.manager.closeWindow(this.id);
                break;
        }
    }
    
    dockWindow() {
        // Return panel content to dock and let dock system handle window closing
        if (globalThis.dockSystem) {
            globalThis.dockSystem.dockPanelFromWindow(this.panelId);
            
            // Let the dock system close the window after it's done processing
            setTimeout(() => {
                this.manager.closeWindow(this.id);
            }, 100);
        } else {
            // Fallback: just close the window if dock system not available
            this.manager.closeWindow(this.id);
        }
    }
    
    moveContentToDock() {
        // Move panel content back to dock
        const windowContent = this.element.querySelector('.window-content');
        const dockPanel = document.querySelector(`[data-panel="${this.panelId}"]`);
        
        if (windowContent && dockPanel) {
            const panelContent = dockPanel.querySelector('.panel-content');
            if (panelContent) {
                // Move all content back
                while (windowContent.firstChild) {
                    panelContent.appendChild(windowContent.firstChild);
                }
            }
        }
    }
    
    // Get window state for debugging
    getState() {
        return {
            id: this.id,
            panelId: this.panelId,
            position: this.position,
            size: this.size,
            isDragging: this.isDragging,
            isResizing: this.isResizing,
            isActive: this.element.classList.contains('active')
        };
    }
}

// Global window manager instance
let windowManager = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    windowManager = new FloatingWindowManager();
    window.windowManager = windowManager; // Global access for debugging
});

// Debug functions
window.debugWindows = function() {
    if (!windowManager) {
        console.error('WindowManager not initialized');
        return;
    }
    
    console.log('🪟 Window Manager State:', windowManager.getState());
    windowManager.windows.forEach((win, id) => {
        console.log(`  ${id}:`, win.getState());
    });
};

window.createTestWindow = function(panelId = 'camera') {
    if (!windowManager) {
        console.error('WindowManager not initialized');
        return;
    }
    
    const config = {
        name: `Test ${panelId}`,
        width: '400px'
    };
    
    return windowManager.createWindow(panelId, config);
};