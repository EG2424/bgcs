class DockSystem {
    constructor() {
        this.dock = null;
        this.currentTab = null;
        this.isExpanded = false;
        this.selectedEntities = new Set();
        
        this.init();
    }
    
    init() {
        this.dock = document.getElementById('right-dock');
        if (!this.dock) {
            console.error('Right dock not found');
            return;
        }
        
        this.setupEventListeners();
        this.setupDefaultState();
        
        // Try to connect to entity manager immediately
        this.connectToEntityManager();
    }
    
    setupEventListeners() {
        // Spine slot clicks
        const spineSlots = document.querySelectorAll('.spine-slot');
        spineSlots.forEach(slot => {
            slot.addEventListener('click', (e) => {
                const tabName = slot.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
        
        // Entity manager connection handled in separate method
        
        // Action button listeners
        this.setupActionListeners();
        this.setupLogListeners();
        
        // Setup collapsible sections
        this.setupCollapsibleSections();
        
        // Window resize listener removed - using fixed widths
    }
    
    setupActionListeners() {
        // Setup military action sliders
        this.setupMilitarySliders();
    }
    
    setupMilitarySliders() {
        const takeoffSlider = document.getElementById('takeoff-slider');
        const landSlider = document.getElementById('land-slider');
        
        if (takeoffSlider) {
            this.initializeMilitarySlider(takeoffSlider, 'takeoff');
        }
        
        if (landSlider) {
            this.initializeMilitarySlider(landSlider, 'land');
        }
    }
    
    initializeMilitarySlider(sliderContainer, action) {
        const thumb = sliderContainer.querySelector('.slider-thumb');
        const rail = sliderContainer.querySelector('.slider-rail');
        
        if (!thumb || !rail) return;
        
        let isDragging = false;
        let mouseOffset = 0;
        
        const self = this;
        
        // Initialize position
        thumb.style.left = '0px';
        thumb.style.transition = '';
        
        thumb.addEventListener('mousedown', (e) => {
            if (sliderContainer.classList.contains('disabled')) return;
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            
            // Calculate offset from mouse to thumb left edge
            const thumbRect = thumb.getBoundingClientRect();
            mouseOffset = e.clientX - thumbRect.left;
            
            // Disable transitions during drag
            thumb.style.transition = 'none';
            document.body.style.userSelect = 'none';
            thumb.style.cursor = 'grabbing';
        });
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const railRect = rail.getBoundingClientRect();
            const thumbWidth = thumb.offsetWidth;
            const maxLeft = railRect.width - thumbWidth - 4;
            
            // Calculate new position based on mouse position minus offset
            let newLeft = (e.clientX - railRect.left) - mouseOffset;
            
            // Constrain to rail bounds
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            
            // Apply position immediately
            thumb.style.left = newLeft + 'px';
            
            // Check if at execute position (75% to the right for easier trigger)
            const progress = newLeft / maxLeft;
            
            // Update slider color gradually based on progress
            self.updateSliderColors(thumb, progress, action);
            
            if (progress >= 0.75) {
                thumb.classList.add('execute');
            } else {
                thumb.classList.remove('execute');
            }
        };
        
        const handleMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            
            document.body.style.userSelect = '';
            thumb.style.cursor = 'grab';
            
            const currentLeft = parseInt(thumb.style.left) || 2;
            const railRect = rail.getBoundingClientRect();
            const thumbWidth = thumb.offsetWidth;
            const maxLeft = railRect.width - thumbWidth - 4;
            const progress = currentLeft / maxLeft;
            
            if (progress >= 0.75) {
                // Execute action
                self.executeAction(action);
            }
            
            // Re-enable transitions and reset
            thumb.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                thumb.style.left = '0px';
                thumb.classList.remove('execute');
                // Reset colors to default
                self.resetSliderColors(thumb);
            }, 100);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    updateSliderColors(thumb, progress, action) {
        // Clamp progress between 0 and 1
        progress = Math.max(0, Math.min(1, progress));
        
        // Define original colors
        const originalBg = { r: 60, g: 60, b: 60, a: 0.9 };
        const originalBorder = { r: 255, g: 255, b: 255, a: 0.2 };
        const originalText = { r: 255, g: 255, b: 255, a: 0.6 };
        
        // Define target colors based on action type
        let targetBg, targetBorder, targetText;
        
        if (action === 'takeoff') {
            // Earth amber for takeoff with solid background
            targetBg = { r: 139, g: 105, b: 20, a: 0.7 };
            targetBorder = { r: 139, g: 105, b: 20, a: 1.0 };
            targetText = { r: 232, g: 232, b: 232, a: 1.0 }; // neutral text
        } else if (action === 'land') {
            // Earth amber for land with solid background
            targetBg = { r: 139, g: 105, b: 20, a: 0.7 };
            targetBorder = { r: 139, g: 105, b: 20, a: 1.0 };
            targetText = { r: 232, g: 232, b: 232, a: 1.0 }; // neutral text
        }
        
        // Interpolate colors based on progress
        const mixedBg = {
            r: Math.round(originalBg.r + (targetBg.r - originalBg.r) * progress),
            g: Math.round(originalBg.g + (targetBg.g - originalBg.g) * progress),
            b: Math.round(originalBg.b + (targetBg.b - originalBg.b) * progress),
            a: originalBg.a + (targetBg.a - originalBg.a) * progress
        };
        
        const mixedBorder = {
            r: Math.round(originalBorder.r + (targetBorder.r - originalBorder.r) * progress),
            g: Math.round(originalBorder.g + (targetBorder.g - originalBorder.g) * progress),
            b: Math.round(originalBorder.b + (targetBorder.b - originalBorder.b) * progress),
            a: originalBorder.a + (targetBorder.a - originalBorder.a) * progress
        };
        
        const mixedText = {
            r: Math.round(originalText.r + (targetText.r - originalText.r) * progress),
            g: Math.round(originalText.g + (targetText.g - originalText.g) * progress),
            b: Math.round(originalText.b + (targetText.b - originalText.b) * progress),
            a: originalText.a + (targetText.a - originalText.a) * progress
        };
        
        // Apply interpolated colors
        thumb.style.background = `rgba(${mixedBg.r}, ${mixedBg.g}, ${mixedBg.b}, ${mixedBg.a})`;
        thumb.style.borderColor = `rgba(${mixedBorder.r}, ${mixedBorder.g}, ${mixedBorder.b}, ${mixedBorder.a})`;
        thumb.style.color = `rgba(${mixedText.r}, ${mixedText.g}, ${mixedText.b}, ${mixedText.a})`;
        
        // Brighten the icon
        const svg = thumb.querySelector('svg');
        if (svg) {
            svg.style.opacity = 0.6 + (progress * 0.4);
        }
    }
    
    resetSliderColors(thumb) {
        // Reset to default colors
        thumb.style.background = '';
        thumb.style.borderColor = '';
        thumb.style.color = '';
        
        // Reset SVG opacity
        const svg = thumb.querySelector('svg');
        if (svg) {
            svg.style.opacity = '';
        }
    }
    
    setupLogListeners() {
        const pauseBtn = document.getElementById('pause-logs');
        const clearBtn = document.getElementById('clear-logs');
        const filterChips = document.querySelectorAll('.filter-chip');
        
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.toggleLogPause();
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearLogs();
            });
        }
        
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.toggleLogFilter(chip.getAttribute('data-filter'));
            });
        });
    }
    
    setupDefaultState() {
        // Start collapsed
        this.isExpanded = false;
        this.dock.classList.remove('expanded');
        
        // Hide all panels
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => {
            panel.classList.remove('active');
        });
        
        // Default tab
        if (window.BGCS_CONFIG && window.BGCS_CONFIG.DEFAULT_DOCK_TAB) {
            this.currentTab = window.BGCS_CONFIG.DEFAULT_DOCK_TAB;
        } else {
            this.currentTab = 'actions';
        }
        
        // Setup console controls
        this.setupConsoleListeners();
    }
    
    switchTab(tabName) {
        // If clicking same tab while expanded, collapse
        if (this.isExpanded && this.currentTab === tabName) {
            this.collapse();
            return;
        }
        
        // Update current tab
        this.currentTab = tabName;
        
        // Update spine slot states
        const spineSlots = document.querySelectorAll('.spine-slot');
        spineSlots.forEach(slot => {
            slot.classList.toggle('active', slot.getAttribute('data-tab') === tabName);
        });
        
        // Update panel states
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.getAttribute('data-panel') === tabName);
        });
        
        // Expand dock
        this.expand();
        
        // If switching to console tab, force update console display
        if (tabName === 'console' && window.bgcsApp && window.bgcsApp.updateConsoleDisplay) {
            setTimeout(() => {
                window.bgcsApp.updateConsoleDisplay();
            }, 50);
        }
    }
    
    expand() {
        if (this.isExpanded) return;
        
        this.isExpanded = true;
        this.dock.classList.add('expanded');
        
        // Activate current spine slot and panel
        const activeSpineSlot = document.querySelector(`.spine-slot[data-tab="${this.currentTab}"]`);
        const activePanel = this.dock.querySelector(`[data-panel="${this.currentTab}"]`);
        
        if (activeSpineSlot) activeSpineSlot.classList.add('active');
        if (activePanel) activePanel.classList.add('active');
    }
    
    collapse() {
        if (!this.isExpanded) return;
        
        this.isExpanded = false;
        this.dock.classList.remove('expanded');
        
        // Deactivate all spine slots and panels
        const spineSlots = document.querySelectorAll('.spine-slot');
        const panels = this.dock.querySelectorAll('.dock-panel');
        
        spineSlots.forEach(slot => slot.classList.remove('active'));
        panels.forEach(panel => panel.classList.remove('active'));
    }
    
    onSelectionChange(selectionData) {
        // Get selected entity IDs
        const selectedIds = selectionData.selected || [];
        const selectedCount = selectedIds.length;
        
        // Get actual entity objects from entity manager
        let selectedEntities = [];
        
        if (window.entityManager && window.entityManager.entities) {
            selectedEntities = selectedIds.map(id => {
                const entity = window.entityManager.entities.get(id);
                
                // If not found, try alternative approaches
                if (!entity) {
                    // Try finding by searching all entities
                    for (const [entityId, entityObj] of window.entityManager.entities.entries()) {
                        if (entityId === id || entityObj.id === id || entityObj.name === id) {
                            return entityObj;
                        }
                    }
                }
                
                return entity;
            }).filter(Boolean);
        } else {
            // Create mock entity objects from IDs
            selectedEntities = selectedIds.map(id => {
                return {
                    id: id,
                    name: id,
                    callsign: id,
                    type: id.startsWith('drone') ? 'drone' : 'entity'
                };
            });
        }
        
        this.selectedEntities = new Set(selectedEntities);
        
        // Update UI elements
        this.updateActionButtons(selectedCount);
        this.updateCameraPanel(selectedEntities);
        this.updateLogPanel(selectedCount);
        
        // Auto-expand/collapse based on selection - INSTANT
        if (selectedCount > 0 && !this.isExpanded) {
            this.switchTab(this.currentTab || 'actions');
        } else if (selectedCount === 0 && this.isExpanded) {
            this.collapse();
        }
    }
    
    updateActionButtons(selectedCount) {
        const takeoffSlider = document.getElementById('takeoff-slider');
        const landSlider = document.getElementById('land-slider');
        const takeoffCount = document.getElementById('takeoff-count');
        const landCount = document.getElementById('land-count');
        const subtitle = document.getElementById('actions-selected-count');
        
        if (selectedCount > 0) {
            if (takeoffSlider) takeoffSlider.classList.remove('disabled');
            if (landSlider) landSlider.classList.remove('disabled');
            
            if (takeoffCount) takeoffCount.textContent = selectedCount;
            if (landCount) landCount.textContent = selectedCount;
            
            if (subtitle) subtitle.textContent = `${selectedCount} selected`;
        } else {
            if (takeoffSlider) takeoffSlider.classList.add('disabled');
            if (landSlider) landSlider.classList.add('disabled');
            
            if (takeoffCount) takeoffCount.textContent = '';
            if (landCount) landCount.textContent = '';
            
            if (subtitle) subtitle.textContent = 'No selection';
        }
    }
    
    updateCameraPanel(selectedEntities) {
        const entityCount = document.getElementById('camera-entity-count');
        const feedContainer = document.getElementById('camera-feed-container');
        
        if (!feedContainer) return;
        
        // Clear existing feeds
        feedContainer.innerHTML = '';
        
        if (selectedEntities && selectedEntities.length > 0) {
            if (entityCount) {
                entityCount.textContent = `${selectedEntities.length} selected`;
            }
            
            // Create camera feed for each selected entity
            selectedEntities.forEach((entity, index) => {
                const feedItem = this.createCameraFeedItem(entity, false);
                feedContainer.appendChild(feedItem);
            });
        } else {
            if (entityCount) entityCount.textContent = 'No selection';
            
            // Show placeholder when nothing selected
            const placeholder = document.createElement('div');
            placeholder.className = 'camera-placeholder';
            placeholder.innerHTML = `
                <svg class="camera-placeholder-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Select entities to view camera feeds</span>
            `;
            feedContainer.appendChild(placeholder);
        }
    }
    
    createCameraFeedItem(entity, isPrimary = false) {
        const feedItem = document.createElement('div');
        feedItem.className = `camera-feed-item${isPrimary ? ' primary' : ''}`;
        feedItem.setAttribute('data-entity-id', entity.id);
        
        const entityName = entity.name || entity.id || entity.callsign || 'Unknown';
        
        feedItem.innerHTML = `
            <div class="camera-feed-header">
                <span class="camera-feed-title">${entityName}</span>
                <div class="camera-feed-status">
                    <span>--fps</span>
                    <span>--ms</span>
                    <span>--</span>
                </div>
            </div>
            <div class="camera-placeholder">
                <svg class="camera-placeholder-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>No stream available</span>
            </div>
        `;
        
        return feedItem;
    }
    
    executeAction(actionType) {
        if (this.selectedEntities.size === 0) return;
        
        // Execute action directly without confirmation (slider-based interface)
        const entityCount = this.selectedEntities.size;
        
        // Dispatch action to entity system
        document.dispatchEvent(new CustomEvent('executeEntityAction', {
            detail: {
                action: actionType,
                entities: Array.from(this.selectedEntities)
            }
        }));
    }
    
    toggleLogPause() {
        if (window.telemetryStubs) {
            if (window.telemetryStubs.isPaused) {
                window.telemetryStubs.resume();
                document.getElementById('pause-logs').title = 'Pause';
            } else {
                window.telemetryStubs.pause();
                document.getElementById('pause-logs').title = 'Resume';
            }
        }
    }
    
    clearLogs() {
        if (window.telemetryStubs) {
            window.telemetryStubs.clear();
        } else {
            const logsContent = document.getElementById('logs-content');
            if (logsContent) {
                logsContent.innerHTML = '';
            }
        }
    }
    
    setupConsoleListeners() {
        const clearConsoleBtn = document.getElementById('clear-console');
        const toggleConsoleBtn = document.getElementById('toggle-console');
        
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => {
                this.clearConsole();
            });
        }
        
        if (toggleConsoleBtn) {
            toggleConsoleBtn.addEventListener('click', () => {
                this.collapse();
            });
        }
    }
    
    clearConsole() {
        // Call the main app's clearConsole method if available
        if (window.bgcsApp && window.bgcsApp.clearConsole) {
            window.bgcsApp.clearConsole();
        } else {
            // Fallback: clear directly
            const consoleContent = document.getElementById('console-content');
            if (consoleContent) {
                consoleContent.innerHTML = '';
            }
        }
    }
    
    toggleLogFilter(filter) {
        const chips = document.querySelectorAll('.filter-chip');
        
        if (filter === 'all') {
            // Activate 'all' and deactivate others
            chips.forEach(chip => {
                chip.classList.toggle('active', chip.getAttribute('data-filter') === 'all');
            });
        } else {
            // Deactivate 'all' if it's active
            const allChip = document.querySelector('.filter-chip[data-filter="all"]');
            if (allChip && allChip.classList.contains('active')) {
                allChip.classList.remove('active');
            }
            
            // Toggle the clicked filter
            const clickedChip = document.querySelector(`.filter-chip[data-filter="${filter}"]`);
            if (clickedChip) {
                clickedChip.classList.toggle('active');
            }
            
            // If no filters are active, activate 'all'
            const activeFilters = document.querySelectorAll('.filter-chip.active');
            if (activeFilters.length === 0 && allChip) {
                allChip.classList.add('active');
            }
        }
        
    }
    
    updateLogPanel(selectedCount) {
        // Clear existing logs when selection changes
        const logsContent = document.getElementById('logs-content');
        if (logsContent && selectedCount === 0) {
            logsContent.innerHTML = '';
        }
        
        // Update telemetry stubs with current entities
        if (window.telemetryStubs && selectedCount > 0) {
            const entityNames = Array.from(this.selectedEntities)
                .map(entity => entity.name || entity.id || entity.callsign)
                .filter(Boolean);
            window.telemetryStubs.entities = entityNames;
        }
    }
    
    updateDockWidth() {
        const panelWidths = {
            camera: '330px',    // Fixed width
            actions: '310px',   // Fixed width
            logs: '450px'       // Fixed width
        };
        
        const width = panelWidths[this.currentTab] || '320px';
        this.dock.style.width = width;
    }
    
    connectToEntityManager() {
        // Try multiple connection points
        let connected = false;
        
        // Method 1: Entity Manager events
        if (window.entityManager) {
            window.entityManager.on('selection_changed', (data) => {
                this.onSelectionChange(data);
            });
            connected = true;
        }
        
        // Method 2: UI Controls (direct integration)
        if (window.bgcsApp && window.bgcsApp.uiControls) {
            this.connectToUIControls();
            connected = true;
        }
        
        // Method 3: Monitor changes via polling (fallback)
        if (!connected) {
            this.startSelectionPolling();
            connected = true;
        }
        
        if (!connected) {
            // Retry connection
            setTimeout(() => {
                this.connectToEntityManager();
            }, 500);
        }
        
        return connected;
    }
    
    connectToUIControls() {
        // Hook into the existing updateSelectionUI method
        const uiControls = window.bgcsApp.uiControls;
        const originalUpdate = uiControls.updateSelectionUI.bind(uiControls);
        
        uiControls.updateSelectionUI = () => {
            originalUpdate();
            
            // Get selected entities and notify dock
            const selectedEntityIds = Array.from(uiControls.selectedEntities);
            const selectedEntities = selectedEntityIds.map(id => window.entityManager?.entities.get(id)).filter(Boolean);
            
            this.onSelectionChange({
                selected: selectedEntityIds
            });
        };
        
    }
    
    startSelectionPolling() {
        // Fallback: Poll for selection changes
        let lastSelection = new Set();
        
        setInterval(() => {
            if (window.bgcsApp && window.bgcsApp.uiControls) {
                const currentSelection = window.bgcsApp.uiControls.selectedEntities;
                
                if (!this.setsEqual(lastSelection, currentSelection)) {
                    const selectedEntityIds = Array.from(currentSelection);
                    
                    this.onSelectionChange({
                        selected: selectedEntityIds
                    });
                    
                    lastSelection = new Set(currentSelection);
                }
            }
        }, 200); // Check every 200ms
    }
    
    setsEqual(set1, set2) {
        if (set1.size !== set2.size) return false;
        for (const item of set1) {
            if (!set2.has(item)) return false;
        }
        return true;
    }
    
    setupCollapsibleSections() {
        const actionsHeader = document.getElementById('actions-header');
        const actionsContent = document.getElementById('actions-content');
        
        if (!actionsHeader || !actionsContent) return;
        
        // Set initial state (expanded by default)
        let isCollapsed = false;
        
        actionsHeader.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            
            if (isCollapsed) {
                actionsHeader.classList.add('collapsed');
                actionsContent.classList.add('collapsed');
            } else {
                actionsHeader.classList.remove('collapsed');
                actionsContent.classList.remove('collapsed');
            }
        });
    }
}

// Initialize dock system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dockSystem = new DockSystem();
});

// Debug function - can be called from console
window.testDockSelection = function() {
    console.log('Testing dock selection...');
    console.log('EntityManager:', !!window.entityManager);
    console.log('DockSystem:', !!window.dockSystem);
    
    if (window.entityManager) {
        const selectedEntities = window.entityManager.getSelectedEntities();
        console.log('Currently selected entities:', selectedEntities);
        
        // Manually trigger selection change
        if (window.dockSystem) {
            window.dockSystem.onSelectionChange({
                selected: selectedEntities.map(e => e.id)
            });
        }
    }
};