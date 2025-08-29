class DockSystem {
    constructor() {
        this.dock = null;
        this.currentTab = null;
        this.isExpanded = false;
        this.selectedEntities = new Set();
        
        // Taskbar state management
        this.openTabs = new Set(); // Track which tabs are "open" (have been clicked)
        this.minimizedTabs = new Set(); // Track which tabs are minimized
        
        // Panel configuration - flexible system for adding new panels
        this.panelConfigs = {
            camera: { name: 'Camera Feeds', icon: 'camera', width: '330px' },
            actions: { name: 'Actions', icon: 'actions', width: '310px' },
            logs: { name: 'Telemetry Logs', icon: 'logs', width: '450px' },
            console: { name: 'Console', icon: 'console', width: '320px' }
        };
        
        // Floating window integration
        this.floatingPanels = new Set(); // Track which panels are floating
        this.panelsBeingDocked = new Set(); // Track panels in the process of being docked (prevent cleanup)
        this.dragThreshold = 10; // Pixels to start drag-to-undock
        
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
        
        // Setup drag-to-undock for panel headers
        this.setupDragToUndock();
        
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
        // Start collapsed with no tabs open
        this.isExpanded = false;
        this.dock.classList.remove('expanded');
        this.openTabs.clear();
        this.minimizedTabs.clear();
        
        // Hide all panels
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => {
            panel.classList.remove('active');
        });
        
        // No default tab - clean taskbar state
        this.currentTab = null;
        
        // Initialize taskbar visual states
        this.updateTaskbarStates();
        
        // Setup console controls
        this.setupConsoleListeners();
        
        console.log('🏗️ Dock system initialized with taskbar behavior');
    }
    
    switchTab(tabName) {
        // Check current state
        const isCurrentlyActive = this.isExpanded && this.currentTab === tabName;
        const isFloating = this.floatingPanels.has(tabName);
        const isMinimized = this.minimizedTabs.has(tabName);
        
        if (isCurrentlyActive) {
            // Close/minimize current active tab
            this.minimizeTab(tabName);
            return;
        }
        
        if (isFloating) {
            // If panel is floating, bring floating window to front
            const windows = window.windowManager?.getWindowsForPanel(tabName) || [];
            if (windows.length > 0) {
                window.windowManager.setActiveWindow(windows[0].id);
                console.log(`🪟 Brought floating ${tabName} to front`);
                return;
            }
        }
        
        if (isMinimized && isFloating) {
            // Restore minimized floating tab (future feature)
            this.restoreTab(tabName);
            return;
        }
        
        // Open tab in dock (normal case)
        this.openTab(tabName);
    }
    
    openTab(tabName) {
        // Clean up previous tab if it's not floating and not deliberately minimized
        if (this.currentTab && this.currentTab !== tabName) {
            const prevTab = this.currentTab;
            
            // Only clean up if the previous tab is not floating
            if (!this.floatingPanels.has(prevTab)) {
                // Remove previous tab from open state (close it completely)
                this.openTabs.delete(prevTab);
                this.minimizedTabs.delete(prevTab);
                console.log(`🗑️ Cleaned up previous tab: ${prevTab}`);
            }
        }
        
        // Mark current tab as open
        this.openTabs.add(tabName);
        this.minimizedTabs.delete(tabName); // Remove from minimized
        
        // Update current tab
        this.currentTab = tabName;
        
        // Update taskbar visual states
        this.updateTaskbarStates();
        
        // Update panel states
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.getAttribute('data-panel') === tabName);
        });
        
        // Expand dock
        this.expand();
        
        // Panel-specific initialization
        if (tabName === 'console' && window.bgcsApp && window.bgcsApp.updateConsoleDisplay) {
            setTimeout(() => {
                window.bgcsApp.updateConsoleDisplay();
            }, 50);
        }
        
        console.log(`📱 Opened tab: ${tabName}`);
    }
    
    minimizeTab(tabName) {
        // For single-dock UI, minimizing means closing completely (unless floating)
        if (!this.floatingPanels.has(tabName)) {
            // Close the tab completely
            this.openTabs.delete(tabName);
            this.minimizedTabs.delete(tabName);
            console.log(`❌ Closed tab: ${tabName}`);
        } else {
            // If floating, just mark as minimized (for future multi-window support)
            this.minimizedTabs.add(tabName);
            console.log(`➖ Minimized floating tab: ${tabName}`);
        }
        
        // Clear current tab
        if (this.currentTab === tabName) {
            this.currentTab = null;
        }
        
        // Update taskbar visual states
        this.updateTaskbarStates();
        
        // Collapse dock
        this.collapse();
    }
    
    restoreTab(tabName) {
        // Remove from minimized
        this.minimizedTabs.delete(tabName);
        
        // Set as current and expand
        this.currentTab = tabName;
        
        // Update taskbar visual states
        this.updateTaskbarStates();
        
        // Update panel states
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.getAttribute('data-panel') === tabName);
        });
        
        // Expand dock
        this.expand();
        
        console.log(`⬆️ Restored tab: ${tabName}`);
    }
    
    closeTab(tabName) {
        // Remove from all tracking sets
        this.openTabs.delete(tabName);
        this.minimizedTabs.delete(tabName);
        
        // If closing current tab, collapse dock
        if (this.currentTab === tabName) {
            this.collapse();
            this.currentTab = null;
        }
        
        // Update taskbar visual states
        this.updateTaskbarStates();
        
        console.log(`❌ Closed tab: ${tabName}`);
    }
    
    updateTaskbarStates() {
        console.log(`🎨 Updating taskbar states...`);
        const spineSlots = document.querySelectorAll('.spine-slot');
        
        spineSlots.forEach(slot => {
            const tabName = slot.getAttribute('data-tab');
            const isOpen = this.openTabs.has(tabName);
            const isActive = this.isExpanded && this.currentTab === tabName;
            const isMinimized = this.minimizedTabs.has(tabName);
            const isFloating = this.floatingPanels.has(tabName);
            
            console.log(`   ${tabName}: open=${isOpen}, active=${isActive}, minimized=${isMinimized}, floating=${isFloating}`);
            
            // Remove all state classes
            slot.classList.remove('active', 'open', 'minimized', 'floating');
            
            // Apply current states - floating takes priority
            if (isFloating) {
                slot.classList.add('floating'); // Panel is in floating window
                console.log(`     -> Added 'floating' class`);
            } else if (isActive) {
                slot.classList.add('active'); // Currently visible panel
                console.log(`     -> Added 'active' class`);
            } else if (isOpen && isMinimized) {
                slot.classList.add('open', 'minimized'); // Open but minimized
                console.log(`     -> Added 'open minimized' classes`);
            } else if (isOpen) {
                slot.classList.add('open'); // Open in background
                console.log(`     -> Added 'open' class`);
            } else {
                console.log(`     -> No classes added (default state)`);
            }
            
            // Update tooltip to show current state
            this.updateTabTooltip(slot, tabName, isOpen, isActive, isMinimized, isFloating);
        });
    }
    
    updateTabTooltip(slot, tabName, isOpen, isActive, isMinimized, isFloating) {
        const config = this.panelConfigs[tabName];
        const baseName = config ? config.name : tabName;
        
        let tooltip = baseName;
        
        if (isFloating) {
            tooltip += ' (Floating - Click to bring to front)';
        } else if (isActive) {
            tooltip += ' (Active - Click to minimize)';
        } else if (isMinimized) {
            tooltip += ' (Minimized - Click to restore)';
        } else if (isOpen) {
            tooltip += ' (Open - Click to show)';
        } else {
            tooltip += ' (Click to open / Drag header to float)';
        }
        
        slot.setAttribute('title', tooltip);
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
        
        // Deactivate all panels but maintain taskbar state
        const panels = this.dock.querySelectorAll('.dock-panel');
        panels.forEach(panel => panel.classList.remove('active'));
        
        // Update taskbar states (don't clear active, just update visual states)
        this.updateTaskbarStates();
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
        // Clear existing logs when selection changes (but not if logs panel is floating)
        const logsContent = document.getElementById('logs-content');
        const isLogsFloating = this.floatingPanels.has('logs');
        
        if (logsContent && selectedCount === 0 && !isLogsFloating) {
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
        if (!this.currentTab) {
            this.dock.style.width = '0px';
            return;
        }
        
        // Use flexible panel config system
        const config = this.panelConfigs[this.currentTab];
        const width = config ? config.width : '320px';
        this.dock.style.width = width;
    }
    
    // Method to add new panels dynamically
    addPanel(panelId, config) {
        this.panelConfigs[panelId] = {
            name: config.name || panelId,
            icon: config.icon || 'default',
            width: config.width || '320px'
        };
        
        console.log(`➕ Added panel config: ${panelId}`, this.panelConfigs[panelId]);
    }
    
    // Get current taskbar state for debugging
    getTaskbarState() {
        return {
            openTabs: Array.from(this.openTabs),
            minimizedTabs: Array.from(this.minimizedTabs),
            floatingPanels: Array.from(this.floatingPanels),
            currentTab: this.currentTab,
            isExpanded: this.isExpanded
        };
    }
    
    setupDragToUndock() {
        // Add drag handles to all panel headers
        const panelHeaders = document.querySelectorAll('.dock-panel .panel-header');
        
        panelHeaders.forEach(header => {
            const panel = header.closest('.dock-panel');
            const panelId = panel?.getAttribute('data-panel');
            
            if (!panelId) return;
            
            this.makePanelHeaderDraggable(header, panelId);
        });
    }
    
    makePanelHeaderDraggable(header, panelId) {
        let dragStart = null;
        let hasDraggedBeyondThreshold = false;
        
        header.addEventListener('mousedown', (e) => {
            // Only start drag on header area, not buttons
            if (e.target.closest('button, .btn-icon')) return;
            
            dragStart = { x: e.clientX, y: e.clientY };
            hasDraggedBeyondThreshold = false;
            
            // Add visual feedback
            header.style.cursor = 'grabbing';
            
            e.preventDefault();
        });
        
        const handleMouseMove = (e) => {
            if (!dragStart) return;
            
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance > this.dragThreshold && !hasDraggedBeyondThreshold) {
                hasDraggedBeyondThreshold = true;
                
                // Show drag feedback
                header.classList.add('dragging-to-undock');
                document.body.classList.add('dragging-panel');
                
                console.log(`🏗️ Started drag-to-undock for ${panelId}`);
            }
            
            if (hasDraggedBeyondThreshold) {
                // Update drag preview position
                this.updateDragPreview(e.clientX, e.clientY);
            }
        };
        
        const handleMouseUp = (e) => {
            if (!dragStart) return;
            
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Clean up drag state
            dragStart = null;
            header.style.cursor = '';
            header.classList.remove('dragging-to-undock');
            document.body.classList.remove('dragging-panel');
            this.removeDragPreview();
            
            // If dragged beyond threshold, undock the panel
            if (distance > this.dragThreshold) {
                this.undockPanel(panelId, e.clientX, e.clientY);
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    updateDragPreview(x, y) {
        // Create or update drag preview
        let preview = document.getElementById('drag-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'drag-preview';
            preview.className = 'drag-preview';
            preview.innerHTML = '📋 Release to create floating window';
            document.body.appendChild(preview);
        }
        
        preview.style.left = (x + 10) + 'px';
        preview.style.top = (y - 10) + 'px';
        preview.style.display = 'block';
    }
    
    removeDragPreview() {
        const preview = document.getElementById('drag-preview');
        if (preview) {
            preview.remove();
        }
    }
    
    undockPanel(panelId, x, y) {
        // Don't undock if panel is already floating
        if (this.floatingPanels.has(panelId)) {
            console.log(`⚠️ Panel ${panelId} is already floating`);
            return;
        }
        
        // Check if window manager is available
        if (!window.windowManager) {
            console.error('WindowManager not available - cannot undock panel');
            return;
        }
        
        const config = this.panelConfigs[panelId];
        if (!config) {
            console.error(`No config found for panel: ${panelId}`);
            return;
        }
        
        // Create floating window
        const floatingWindow = window.windowManager.createWindow(panelId, config);
        
        // Position near drag release point
        floatingWindow.position.x = Math.max(50, x - 200);
        floatingWindow.position.y = Math.max(50, y - 20);
        floatingWindow.constrainPosition();
        floatingWindow.element.style.left = floatingWindow.position.x + 'px';
        floatingWindow.element.style.top = floatingWindow.position.y + 'px';
        
        // Move panel content to floating window
        this.movePanelToWindow(panelId, floatingWindow);
        
        // Update tracking
        this.floatingPanels.add(panelId);
        this.openTabs.add(panelId); // Mark as open in floating state
        this.minimizedTabs.delete(panelId); // Remove from minimized
        
        // If this was the current tab, collapse dock
        if (this.currentTab === panelId) {
            this.collapse();
            this.currentTab = null;
        }
        
        // Update taskbar states
        this.updateTaskbarStates();
        
        console.log(`🪟 Undocked panel ${panelId} to floating window`);
    }
    
    movePanelToWindow(panelId, floatingWindow) {
        const dockPanel = document.querySelector(`[data-panel="${panelId}"]`);
        const windowContent = floatingWindow.element.querySelector('.window-content');
        
        if (!dockPanel || !windowContent) {
            console.error(`Cannot move panel ${panelId} - elements not found`);
            return;
        }
        
        // Clone the panel content structure
        const panelContent = dockPanel.querySelector('.panel-content');
        if (panelContent) {
            
            // Create a wrapper div that matches dock panel structure
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'floating-panel-content';
            
            // Move all content to floating window
            while (panelContent.firstChild) {
                contentWrapper.appendChild(panelContent.firstChild);
            }
            
            windowContent.appendChild(contentWrapper);
            
            
            // CRITICAL: Update JavaScript references for logs and console
            this.updateFloatingPanelReferences(panelId, floatingWindow);
        }
        
        // Hide the dock panel
        dockPanel.style.display = 'none';
    }
    
    updateFloatingPanelReferences(panelId, floatingWindow) {
        // Update JavaScript references for panels that use getElementById
        if (panelId === 'console') {
            // Update app.js console content reference
            if (window.bgcsApp && window.bgcsApp.elements) {
                const newConsoleContent = floatingWindow.element.querySelector('#console-content');
                
                if (newConsoleContent) {
                    // Clear the cached reference to force re-lookup
                    window.bgcsApp.elements.consoleContent = null;
                    
                    // Set the new reference
                    window.bgcsApp.elements.consoleContent = newConsoleContent;
                    
                    // Refresh console display to show existing entries
                    setTimeout(() => {
                        window.bgcsApp.updateConsoleDisplay();
                    }, 100);
                }
            }
        } else if (panelId === 'logs') {
            // Force a refresh of existing logs if entities are selected
            if (window.telemetryStubs && window.dockSystem.selectedEntities.size > 0) {
                setTimeout(() => {
                    // Re-render recent log entries to the floating window
                    const recentEntries = window.telemetryStubs.logEntries.slice(0, 50);
                    recentEntries.reverse().forEach(entry => {
                        window.telemetryStubs.renderLogEntry(entry);
                    });
                }, 200);
            }
        }
    }
    
    dockPanelFromWindow(panelId) {
        // Called when floating window is docked back
        if (!this.floatingPanels.has(panelId)) {
            console.log(`⚠️ Panel ${panelId} is not floating`);
            return;
        }
        
        // Mark panel as being docked to prevent cleanup
        this.panelsBeingDocked.add(panelId);
        
        // Find the floating window
        const windows = window.windowManager?.getWindowsForPanel(panelId) || [];
        const floatingWindow = windows[0];
        
        if (floatingWindow) {
            // Move content back to dock
            this.moveWindowContentToDock(panelId, floatingWindow);
        }
        
        // Show the dock panel
        const dockPanel = document.querySelector(`[data-panel="${panelId}"]`);
        if (dockPanel) {
            dockPanel.style.display = '';
        }
        
        // Update tracking
        this.floatingPanels.delete(panelId);
        
        // Open the panel in dock
        this.openTab(panelId);
        
        // Remove from docking set after a delay (after window closing cleanup would have run)
        setTimeout(() => {
            this.panelsBeingDocked.delete(panelId);
        }, 300);
        
        console.log(`⚓ Docked panel ${panelId} from floating window`);
    }
    
    moveWindowContentToDock(panelId, floatingWindow) {
        const windowContent = floatingWindow.element.querySelector('.window-content');
        const dockPanel = document.querySelector(`[data-panel="${panelId}"]`);
        
        if (!windowContent || !dockPanel) return;
        
        const dockPanelContent = dockPanel.querySelector('.panel-content');
        const floatingContent = windowContent.querySelector('.floating-panel-content');
        
        if (dockPanelContent && floatingContent) {
            // Move all content back
            while (floatingContent.firstChild) {
                dockPanelContent.appendChild(floatingContent.firstChild);
            }
            
            // CRITICAL: Restore JavaScript references for logs and console
            this.restoreDockedPanelReferences(panelId);
        }
    }
    
    restoreDockedPanelReferences(panelId) {
        // Restore JavaScript references when content moves back to dock
        if (panelId === 'console') {
            // Restore app.js console content reference
            if (window.bgcsApp && window.bgcsApp.elements) {
                const dockedConsoleContent = document.getElementById('console-content');
                
                if (dockedConsoleContent) {
                    // Clear the cached reference first
                    window.bgcsApp.elements.consoleContent = null;
                    
                    // Set the new reference
                    window.bgcsApp.elements.consoleContent = dockedConsoleContent;
                    
                    // Refresh display
                    setTimeout(() => {
                        window.bgcsApp.updateConsoleDisplay();
                    }, 100);
                }
            }
        }
    }
    
    // Check if panel is available (not floating)
    isPanelAvailable(panelId) {
        return !this.floatingPanels.has(panelId);
    }
    
    // Restore panel content from floating window before it's destroyed
    restorePanelContentFromFloatingWindow(panelId) {
        // Find the floating window that's about to be closed
        const windows = window.windowManager?.getWindowsForPanel(panelId) || [];
        const floatingWindow = windows[0];
        
        const dockPanel = document.querySelector(`[data-panel="${panelId}"]`);
        
        if (floatingWindow && dockPanel) {
            // Restore visibility first
            dockPanel.style.display = '';
            
            // Move content back from floating window to dock
            this.moveWindowContentToDock(panelId, floatingWindow);
        }
    }
    
    // Called when a floating window is closed (not docked back)
    onFloatingWindowClosed(panelId) {
        // Check if this panel is being docked - if so, skip cleanup
        if (this.panelsBeingDocked.has(panelId)) {
            return;
        }
        
        // Remove from all tracking sets
        this.floatingPanels.delete(panelId);
        this.openTabs.delete(panelId);
        this.minimizedTabs.delete(panelId);
        
        // If this was the current tab, clear it
        if (this.currentTab === panelId) {
            this.collapse();
            this.currentTab = null;
        }
        
        // CRITICAL: Restore dock panel visibility and content from floating window
        this.restorePanelContentFromFloatingWindow(panelId);
        
        // Update taskbar visual states
        this.updateTaskbarStates();
        
        console.log(`   After cleanup:`, {
            floating: Array.from(this.floatingPanels),
            open: Array.from(this.openTabs),
            minimized: Array.from(this.minimizedTabs),
            current: this.currentTab
        });
        console.log(`✅ State cleaned up for ${panelId}`);
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

// Debug functions - can be called from console
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

// Debug taskbar system
window.debugTaskbar = function() {
    if (!window.dockSystem) {
        console.error('DockSystem not initialized');
        return;
    }
    
    const state = window.dockSystem.getTaskbarState();
    console.log('📱 Taskbar State:', state);
    console.log('🗂️ Panel Configs:', window.dockSystem.panelConfigs);
    
    // Visual state check
    const spineSlots = document.querySelectorAll('.spine-slot');
    console.log('👁️ Visual States:');
    spineSlots.forEach(slot => {
        const tabName = slot.getAttribute('data-tab');
        const classes = Array.from(slot.classList);
        console.log(`  ${tabName}: ${classes.join(', ')}`);
    });
};

// Quick taskbar commands
window.openTab = (tabName) => window.dockSystem?.openTab(tabName);
window.minimizeTab = (tabName) => window.dockSystem?.minimizeTab(tabName);
window.restoreTab = (tabName) => window.dockSystem?.restoreTab(tabName);
window.closeTab = (tabName) => window.dockSystem?.closeTab(tabName);

// Floating window commands
window.floatPanel = (panelId) => window.dockSystem?.undockPanel(panelId, 300, 200);
window.dockPanel = (panelId) => window.dockSystem?.dockPanelFromWindow(panelId);

// Quick demo function
window.demoFloatingWindows = function() {
    console.log('🎬 BGCS Floating Windows Demo');
    console.log('1. Opening multiple panels...');
    
    setTimeout(() => window.openTab('camera'), 500);
    setTimeout(() => window.floatPanel('camera'), 1000);
    setTimeout(() => window.openTab('actions'), 1500);
    setTimeout(() => window.floatPanel('actions'), 2000);
    setTimeout(() => window.openTab('logs'), 2500);
    
    console.log('2. Demo complete! You should see floating windows.');
    console.log('   - Drag windows by their headers');
    console.log('   - Resize using bottom-right corner');
    console.log('   - Click dock button to return to dock');
};

// Test state cleanup bug
window.testStateCleanup = function() {
    console.log('🧪 Testing state cleanup bug fix...');
    console.log('1. Opening camera tab...');
    window.openTab('camera');
    
    setTimeout(() => {
        console.log('2. Floating camera...');
        window.floatPanel('camera');
    }, 500);
    
    setTimeout(() => {
        console.log('3. Closing floating window (should clean up state)...');
        const cameraWindows = window.windowManager?.getWindowsForPanel('camera') || [];
        if (cameraWindows.length > 0) {
            window.windowManager.closeWindow(cameraWindows[0].id);
        }
    }, 1500);
    
    setTimeout(() => {
        console.log('4. Opening actions tab (should not show camera indicator)...');
        window.openTab('actions');
        debugTaskbar();
    }, 2500);
};

// Test Phase 1 taskbar bug (tab switching cleanup)
window.testBasicTaskbar = function() {
    console.log('🧪 Testing basic taskbar bug (tab switching)...');
    console.log('1. Opening camera tab...');
    window.openTab('camera');
    
    setTimeout(() => {
        console.log('2. Opening actions tab (should clean up camera)...');
        window.openTab('actions');
        debugTaskbar();
    }, 1000);
    
    setTimeout(() => {
        console.log('3. Opening logs tab (should clean up actions)...');
        window.openTab('logs');
        debugTaskbar();
    }, 2000);
};

// Test minimize/close behavior
window.testMinimizeBehavior = function() {
    console.log('🧪 Testing minimize behavior...');
    console.log('1. Opening camera tab...');
    window.openTab('camera');
    
    setTimeout(() => {
        console.log('2. Clicking camera again (should close/minimize)...');
        window.dockSystem.switchTab('camera');
        debugTaskbar();
    }, 1000);
    
    setTimeout(() => {
        console.log('3. Opening actions tab (camera should be completely gone)...');
        window.openTab('actions');
        debugTaskbar();
    }, 2000);
};

// Test X button close bug
window.testXButtonClose = function() {
    console.log('🧪 Testing X button close bug...');
    console.log('1. Opening camera in dock...');
    window.openTab('camera');
    
    setTimeout(() => {
        console.log('2. Floating camera...');
        window.floatPanel('camera');
    }, 500);
    
    setTimeout(() => {
        console.log('3. Closing floating window with X button...');
        const cameraWindows = window.windowManager?.getWindowsForPanel('camera') || [];
        if (cameraWindows.length > 0) {
            window.windowManager.closeWindow(cameraWindows[0].id);
        }
    }, 1500);
    
    setTimeout(() => {
        console.log('4. Trying to reopen camera in dock (should work)...');
        window.openTab('camera');
        console.log('✅ If camera panel opened, the bug is fixed!');
    }, 2500);
};