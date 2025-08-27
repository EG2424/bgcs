/**
 * BGCS UI Controls - Chunk 5: Enhanced 3D Scene Foundation
 * User interface interaction handling for canvas mouse events, selection, and interactions
 */

class BGCSUIControls {
    constructor(canvas, renderer3D, cameraManager) {
        this.canvas = canvas;
        this.renderer3D = renderer3D;
        this.cameraManager = cameraManager;
        
        // Mouse interaction state
        this.isMouseDown = false;
        this.mouseButton = null;
        this.lastMousePos = { x: 0, y: 0 };
        this.mouseDragThreshold = 5; // pixels
        this.hasDragged = false;
        
        // Selection state
        this.selectedEntities = new Set();
        this.hoveredEntity = null;
        
        // AoE3-style selection controls
        this.doubleClickSameTypeRadiusPx = 120; // Radius for cohort selection
        this.lastClickTime = 0;
        this.lastClickEntity = null;
        this.doubleClickDelay = 400; // ms for double-click detection
        
        // Interaction modes
        this.interactionMode = 'select'; // 'select', 'waypoint', 'pan'
        this.isMultiSelectMode = false;
        
        // Raycaster for 3D hit testing
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // UI feedback
        this.selectionBox = null;
        this.isBoxSelecting = false;
        this.boxSelectStart = { x: 0, y: 0 };
        this.boxSelectEnd = { x: 0, y: 0 };
        this.selectionRectangle = null; // Visual selection rectangle element
        
    }
    
    /**
     * Initialize UI controls and event listeners
     */
    init() {
        try {
            this.setupMouseEvents();
            this.setupKeyboardEvents();
            this.setupTouchEvents();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize UI controls:', error);
            return false;
        }
    }
    
    /**
     * Setup mouse event listeners for canvas interactions
     */
    setupMouseEvents() {
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Mouse down - start interaction
        this.canvas.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });
        
        // Mouse up - end interaction
        this.canvas.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });
        
        // Mouse move - update interaction
        this.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });
        
        // Mouse wheel - zoom or modifier actions
        this.canvas.addEventListener('wheel', (e) => {
            this.handleMouseWheel(e);
        });
        
        // Mouse enter/leave for hover effects
        this.canvas.addEventListener('mouseenter', (e) => {
            this.canvas.style.cursor = 'default';
        });
        
        this.canvas.addEventListener('mouseleave', (e) => {
            this.clearHover();
        });
        
    }
    
    /**
     * Setup keyboard event listeners
     */
    setupKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e);
        });
        
    }
    
    /**
     * Setup touch events for mobile support
     */
    setupTouchEvents() {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            });
            this.handleMouseDown(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseMove(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {
                button: 0
            });
            this.handleMouseUp(mouseEvent);
        });
        
    }
    
    /**
     * Handle mouse down events
     */
    handleMouseDown(e) {
        this.isMouseDown = true;
        this.mouseButton = e.button;
        this.lastMousePos.x = e.clientX;
        this.lastMousePos.y = e.clientY;
        this.hasDragged = false;
        
        // Check for multi-select mode
        this.isMultiSelectMode = e.ctrlKey;
        
        // Handle different mouse buttons and interaction modes
        if (e.button === 0) { // Left mouse button
            // Left mouse is now free for entity selection and other actions
            if (this.interactionMode === 'waypoint') {
                // Set waypoint at clicked location
                this.handleWaypointPlacement(e);
            } else if (this.interactionMode === 'select') {
                // Start box selection immediately (will be cancelled if it's just a click)
                this.startBoxSelection(e);
            }
            // Left click will handle entity selection on mouse up if no drag occurred
        } else if (e.button === 1) { // Middle mouse button
            // Pan camera
            this.interactionMode = 'pan';
        } else if (e.button === 2) { // Right mouse button
            // Camera orbit/pan controls
            this.interactionMode = 'camera';
        }
        
        e.preventDefault();
    }
    
    /**
     * Handle mouse up events
     */
    handleMouseUp(e) {
        if (!this.isMouseDown) return;
        
        const wasDragging = this.hasDragged;
        this.isMouseDown = false;
        
        // Check if this was a click (no significant drag)
        if (!wasDragging && e.button === 0) {
            // Only handle entity selection on click (not drag)
            this.handleEntitySelection(e);
        } else if (wasDragging && e.button === 0 && !this.isBoxSelecting) {
            // Start box selection if we were dragging with left button
            // This case shouldn't happen since we start box selection in mouse move
            // But kept for completeness
        }
        
        // End box selection
        if (this.isBoxSelecting) {
            this.endBoxSelection();
        }
        
        // Reset interaction mode
        if (this.interactionMode === 'pan' || this.interactionMode === 'camera') {
            this.interactionMode = 'select';
        }
        
        this.mouseButton = null;
        this.canvas.style.cursor = 'default';
    }
    
    /**
     * Handle mouse move events
     */
    handleMouseMove(e) {
        const deltaX = e.clientX - this.lastMousePos.x;
        const deltaY = e.clientY - this.lastMousePos.y;
        
        // Check if mouse has moved enough to be considered dragging
        if (Math.abs(deltaX) > this.mouseDragThreshold || Math.abs(deltaY) > this.mouseDragThreshold) {
            this.hasDragged = true;
        }
        
        if (this.isMouseDown) {
            if (this.isBoxSelecting) {
                this.updateBoxSelection(e);
            } else if (this.interactionMode === 'pan' || this.mouseButton === 1) {
                // Middle mouse button - always pan
                this.canvas.style.cursor = 'move';
                this.handleCameraPan(deltaX, deltaY);
            } else if (this.mouseButton === 2) {
                // Right mouse button - always orbit (unified camera)
                this.canvas.style.cursor = 'grab';
                this.handleCameraOrbit(deltaX, deltaY);
            } else if (this.mouseButton === 0 && this.isBoxSelecting) {
                // Update box selection when dragging
                this.updateBoxSelection(e);
            }
        } else {
            // Update hover effects
            this.updateHover(e);
        }
        
        this.lastMousePos.x = e.clientX;
        this.lastMousePos.y = e.clientY;
    }
    
    /**
     * Handle mouse wheel events
     */
    handleMouseWheel(e) {
        e.preventDefault();
        
        // Check for modifier keys
        if (e.ctrlKey) {
            // Ctrl + wheel = altitude adjustment in 2D view
            this.handleAltitudeAdjust(e.deltaY);
        } else {
            // Normal zoom
            this.cameraManager.handleZoom(e.deltaY);
        }
    }
    
    /**
     * Handle keyboard down events
     */
    handleKeyDown(e) {
        // Don't handle if user is typing in an input
        if (e.target.matches('input, textarea')) return;
        
        switch (e.code) {
            // Keys 1 and 2 removed - using natural mouse controls instead
            case 'KeyH':
                e.preventDefault();
                this.focusOnSelected();
                break;
            case 'KeyR':
                // Hold R for temporary 3D preview in top view
                if (this.cameraManager.currentView === 'top') {
                    this.startTemporary3DPreview();
                }
                break;
            case 'Space':
                e.preventDefault();
                // Reset camera to top-down orientation
                this.cameraManager.resetToTopDown();
                break;
            // Delete key handled by app.js instead
            // case 'Delete':
            // case 'Backspace':
            //     e.preventDefault();
            //     this.deleteSelectedEntities();
            //     break;
            case 'Escape':
                e.preventDefault();
                this.clearSelection();
                break;
            case 'KeyA':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.selectAllEntities();
                }
                break;
            case 'KeyL':
                // Let the main app handle the L key for view lock
                // This is already handled in app.js
                break;
        }
    }
    
    /**
     * Handle keyboard up events
     */
    handleKeyUp(e) {
        switch (e.code) {
            case 'KeyR':
                // End temporary 3D preview
                this.endTemporary3DPreview();
                break;
        }
    }
    
    /**
     * Convert mouse coordinates to normalized device coordinates
     */
    getMouseNDC(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        return this.mouse;
    }
    
    /**
     * Perform raycast hit testing for entity selection with larger hit zones
     */
    performRaycast(mousePos) {
        if (!this.renderer3D || !this.cameraManager.getCurrentCamera()) return null;
        
        this.raycaster.setFromCamera(mousePos, this.cameraManager.getCurrentCamera());
        
        // First try normal raycast on visual entities
        const entityMeshes = Array.from(this.renderer3D.entities.values());
        let intersects = this.raycaster.intersectObjects(entityMeshes, true);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const entityMesh = hit.object;
            const entityId = entityMesh.userData.entityId;
            
            return {
                entityId: entityId,
                point: hit.point,
                distance: hit.distance,
                mesh: entityMesh
            };
        }
        
        // If no direct hit, try larger hit zones using distance-based approach
        const camera = this.cameraManager.getCurrentCamera();
        const hitZoneRadius = 30; // Pixels on screen
        
        // Convert mouse position to screen coordinates
        const rect = this.canvas.getBoundingClientRect();
        const mouseScreenX = ((mousePos.x + 1) / 2) * rect.width;
        const mouseScreenY = ((-mousePos.y + 1) / 2) * rect.height;
        
        let closestEntity = null;
        let closestDistance = hitZoneRadius;
        
        this.renderer3D.entities.forEach((mesh, entityId) => {
            // Project entity position to screen
            const entityPos = mesh.position.clone();
            entityPos.project(camera);
            
            const screenX = ((entityPos.x + 1) / 2) * rect.width;
            const screenY = ((-entityPos.y + 1) / 2) * rect.height;
            
            // Calculate 2D screen distance
            const distance = Math.sqrt(
                Math.pow(screenX - mouseScreenX, 2) + 
                Math.pow(screenY - mouseScreenY, 2)
            );
            
            // Check if within hit zone and closer than previous candidates
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEntity = {
                    entityId: entityId,
                    point: mesh.position.clone(),
                    distance: camera.position.distanceTo(mesh.position),
                    mesh: mesh
                };
            }
        });
        
        return closestEntity;
    }
    
    /**
     * Handle entity selection with AoE3-style double-click cohort selection
     */
    handleEntitySelection(e) {
        const mouseNDC = this.getMouseNDC(e);
        const hit = this.performRaycast(mouseNDC);
        
        if (hit) {
            const currentTime = Date.now();
            const isDoubleClick = (
                currentTime - this.lastClickTime < this.doubleClickDelay &&
                this.lastClickEntity === hit.entityId
            );
            
            if (isDoubleClick) {
                // Double-click: Cohort selection
                this.handleCohortSelection(hit, e);
            } else {
                // Single click: Normal selection
                if (this.isMultiSelectMode) {
                    // Toggle selection
                    if (this.selectedEntities.has(hit.entityId)) {
                        this.deselectEntity(hit.entityId);
                    } else {
                        this.selectEntity(hit.entityId);
                    }
                } else {
                    // Single selection
                    this.clearSelection();
                    this.selectEntity(hit.entityId);
                }
            }
            
            // Update double-click tracking
            this.lastClickTime = currentTime;
            this.lastClickEntity = hit.entityId;
        } else {
            // Clicked on empty space
            if (!this.isMultiSelectMode) {
                this.clearSelection();
            }
            this.lastClickEntity = null;
        }
    }
    
    /**
     * Handle cohort selection (double-click to select all entities of same type in radius)
     */
    handleCohortSelection(hit, e) {
        if (!this.renderer3D || !this.cameraManager.getCurrentCamera()) return;
        
        const clickedEntity = window.bgcsEntityStateManager?.getEntity(hit.entityId);
        if (!clickedEntity) return;
        
        const camera = this.cameraManager.getCurrentCamera();
        const rect = this.canvas.getBoundingClientRect();
        
        // Get mouse screen position
        const mouseScreenX = e.clientX - rect.left;
        const mouseScreenY = e.clientY - rect.top;
        
        // Find all entities of the same type within radius
        const cohortEntities = [];
        
        this.renderer3D.entities.forEach((mesh, entityId) => {
            const entity = window.bgcsEntityStateManager?.getEntity(entityId);
            if (!entity || entity.type !== clickedEntity.type) return;
            
            // Project entity position to screen
            const entityPos = mesh.position.clone();
            entityPos.project(camera);
            
            const screenX = ((entityPos.x + 1) / 2) * rect.width;
            const screenY = ((-entityPos.y + 1) / 2) * rect.height;
            
            // Calculate 2D screen distance
            const distance = Math.sqrt(
                Math.pow(screenX - mouseScreenX, 2) + 
                Math.pow(screenY - mouseScreenY, 2)
            );
            
            // Include if within radius
            if (distance <= this.doubleClickSameTypeRadiusPx) {
                cohortEntities.push(entityId);
            }
        });
        
        // Apply selection
        if (cohortEntities.length > 0) {
            if (!this.isMultiSelectMode) {
                this.clearSelection();
            }
            
            cohortEntities.forEach(entityId => {
                this.selectEntity(entityId);
            });
            
            // Log cohort selection
            if (window.bgcsApp) {
                window.bgcsApp.log(`Cohort selected: ${cohortEntities.length} ${clickedEntity.type}s`, 'info');
            }
        }
    }
    
    /**
     * Start box selection
     */
    startBoxSelection(e) {
        this.isBoxSelecting = true;
        this.boxSelectStart.x = e.clientX;
        this.boxSelectStart.y = e.clientY;
        this.boxSelectEnd.x = e.clientX;
        this.boxSelectEnd.y = e.clientY;
        
        // Create visual selection rectangle if not exists
        if (!this.selectionRectangle) {
            this.createSelectionRectangle();
        }
        
        // Initialize rectangle at canvas-relative coordinates
        const canvasRect = this.canvas.getBoundingClientRect();
        const relativeX = e.clientX - canvasRect.left;
        const relativeY = e.clientY - canvasRect.top;
        
        this.selectionRectangle.style.left = relativeX + 'px';
        this.selectionRectangle.style.top = relativeY + 'px';
        this.selectionRectangle.style.width = '0px';
        this.selectionRectangle.style.height = '0px';
        this.selectionRectangle.style.display = 'block';
    }
    
    /**
     * Update box selection
     */
    updateBoxSelection(e) {
        // Update end position
        this.boxSelectEnd.x = e.clientX;
        this.boxSelectEnd.y = e.clientY;
        
        // Create or update visual selection rectangle
        if (!this.selectionRectangle) {
            this.createSelectionRectangle();
        }
        
        // Convert to canvas-relative coordinates
        const canvasRect = this.canvas.getBoundingClientRect();
        const startX = this.boxSelectStart.x - canvasRect.left;
        const startY = this.boxSelectStart.y - canvasRect.top;
        const endX = this.boxSelectEnd.x - canvasRect.left;
        const endY = this.boxSelectEnd.y - canvasRect.top;
        
        // Update rectangle dimensions and position
        const minX = Math.min(startX, endX);
        const minY = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        this.selectionRectangle.style.left = minX + 'px';
        this.selectionRectangle.style.top = minY + 'px';
        this.selectionRectangle.style.width = width + 'px';
        this.selectionRectangle.style.height = height + 'px';
        this.selectionRectangle.style.display = 'block';
    }
    
    /**
     * End box selection
     */
    endBoxSelection() {
        this.isBoxSelecting = false;
        
        // Hide visual indicator
        if (this.selectionRectangle) {
            this.selectionRectangle.style.display = 'none';
        }
        
        // Calculate selection bounds (use screen coordinates directly)
        const minX = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
        const maxX = Math.max(this.boxSelectStart.x, this.boxSelectEnd.x);
        const minY = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
        const maxY = Math.max(this.boxSelectStart.y, this.boxSelectEnd.y);
        
        // Only perform selection if box is large enough (minimum 10x10 pixels)
        if (Math.abs(maxX - minX) < 10 || Math.abs(maxY - minY) < 10) {
            return;
        }
        
        // Clear existing selection if not holding Ctrl/Shift
        if (!this.isMultiSelectMode) {
            this.clearSelection();
        }
        
        // Check all entities to see which ones fall within the selection box
        const selectedEntities = [];
        const rendererEntities = this.renderer3D?.entities || new Map();
        
        rendererEntities.forEach((mesh, entityId) => {
            // Get entity world position from mesh
            const worldPosition = {
                x: mesh.position.x,
                y: mesh.position.y,
                z: mesh.position.z
            };
            
            // Get entity screen position
            const screenPos = this.worldToScreen(worldPosition);
            if (screenPos && 
                screenPos.x >= minX && screenPos.x <= maxX &&
                screenPos.y >= minY && screenPos.y <= maxY) {
                selectedEntities.push(entityId);
            }
        });
        
        // Select found entities
        selectedEntities.forEach(entityId => {
            this.selectEntity(entityId);
        });
        
        // Log selection result
        if (window.bgcsApp && selectedEntities.length > 0) {
            window.bgcsApp.log(`Box selected ${selectedEntities.length} entities`, 'info');
        }
    }
    
    /**
     * Create visual selection rectangle element
     */
    createSelectionRectangle() {
        if (this.selectionRectangle) return;
        
        this.selectionRectangle = document.createElement('div');
        this.selectionRectangle.className = 'bgcs-selection-rectangle';
        this.selectionRectangle.style.cssText = `
            position: absolute;
            pointer-events: none;
            border: 1px solid #888888;
            border-style: solid;
            background-color: rgba(128, 128, 128, 0.15);
            z-index: 1000;
            display: none;
            box-sizing: border-box;
        `;
        
        // Add to canvas container or body
        const canvasContainer = this.canvas.parentElement || document.body;
        canvasContainer.appendChild(this.selectionRectangle);
    }
    
    /**
     * Convert world position to screen coordinates
     */
    worldToScreen(worldPosition) {
        if (!window.bgcsCameras || !this.renderer3D) return null;
        
        try {
            const camera = window.bgcsCameras.getCurrentCamera();
            if (!camera) return null;
            
            // Create vector from world position
            const vector = new THREE.Vector3(worldPosition.x, worldPosition.y, worldPosition.z);
            
            // Project to screen coordinates
            vector.project(camera);
            
            // Convert to screen pixels (use absolute coordinates like mouse events)
            const canvasRect = this.canvas.getBoundingClientRect();
            const screenX = (vector.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-vector.y + 1) * canvasRect.height / 2 + canvasRect.top;
            
            return { x: screenX, y: screenY };
        } catch (error) {
            console.warn('Error converting world to screen coordinates:', error);
            return null;
        }
    }
    
    /**
     * Select entity by ID
     */
    selectEntity(entityId) {
        this.selectedEntities.add(entityId);
        
        // Visual feedback
        const mesh = this.renderer3D.entities.get(entityId);
        if (mesh) {
            this.addSelectionGlow(mesh);
        }
        
        // Update UI
        this.updateSelectionUI();
        
        // Update control panel and sensor overlays
        this.notifySelectionChange(`Selected ${entityId}`);
    }
    
    /**
     * Deselect entity by ID
     */
    deselectEntity(entityId) {
        this.selectedEntities.delete(entityId);
        
        // Remove visual feedback
        const mesh = this.renderer3D.entities.get(entityId);
        if (mesh) {
            this.removeSelectionGlow(mesh);
        }
        
        // Update UI
        this.updateSelectionUI();
        
        // Update control panel and sensor overlays
        this.notifySelectionChange();
    }
    
    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedEntities.forEach(entityId => {
            const mesh = this.renderer3D.entities.get(entityId);
            if (mesh) {
                this.removeSelectionGlow(mesh);
            }
        });
        
        this.selectedEntities.clear();
        this.updateSelectionUI();
        
        // Update control panel and sensor overlays
        this.notifySelectionChange();
        
    }
    
    /**
     * Add selection glow effect to mesh
     */
    addSelectionGlow(mesh) {
        // Create glow outline or change material
        if (mesh.material.originalColor === undefined) {
            mesh.material.originalColor = mesh.material.color.clone();
        }
        mesh.material.color.setHex(0xFFFF00); // Yellow selection
    }
    
    /**
     * Remove selection glow effect from mesh
     */
    removeSelectionGlow(mesh) {
        // Restore original material
        if (mesh.material.originalColor) {
            mesh.material.color.copy(mesh.material.originalColor);
        }
    }
    
    /**
     * Update hover effects
     */
    updateHover(e) {
        const mouseNDC = this.getMouseNDC(e);
        const hit = this.performRaycast(mouseNDC);
        
        if (hit && hit.entityId !== this.hoveredEntity) {
            this.clearHover();
            this.hoveredEntity = hit.entityId;
            this.canvas.style.cursor = 'pointer';
            
            // Add hover effect
            const mesh = this.renderer3D.entities.get(hit.entityId);
            if (mesh && !this.selectedEntities.has(hit.entityId)) {
                this.addHoverEffect(mesh);
            }
        } else if (!hit) {
            this.clearHover();
        }
    }
    
    /**
     * Clear hover effects
     */
    clearHover() {
        if (this.hoveredEntity) {
            const mesh = this.renderer3D.entities.get(this.hoveredEntity);
            if (mesh && !this.selectedEntities.has(this.hoveredEntity)) {
                this.removeHoverEffect(mesh);
            }
        }
        this.hoveredEntity = null;
        this.canvas.style.cursor = 'default';
    }
    
    /**
     * Add hover effect to mesh
     */
    addHoverEffect(mesh) {
        // Subtle highlight for hover
        if (mesh.material.originalColor === undefined) {
            mesh.material.originalColor = mesh.material.color.clone();
        }
        mesh.material.color.lerp(new THREE.Color(0xFFFFFF), 0.3);
    }
    
    /**
     * Remove hover effect from mesh
     */
    removeHoverEffect(mesh) {
        if (mesh.material.originalColor) {
            mesh.material.color.copy(mesh.material.originalColor);
        }
    }
    
    /**
     * Update selection UI elements
     */
    updateSelectionUI() {
        // Sync with app's selectedEntities
        if (window.bgcsApp) {
            window.bgcsApp.selectedEntities = this.selectedEntities;
        }
        
        // Update selection counter in Assets header
        const selectedCounter = document.getElementById('selected-counter');
        if (selectedCounter) {
            if (this.selectedEntities.size > 0) {
                selectedCounter.textContent = this.selectedEntities.size.toString();
                selectedCounter.style.display = 'block';
            } else {
                selectedCounter.style.display = 'none';
            }
        }
        
        // Update visual selection highlighting in assets and groups menus
        if (window.bgcsApp && window.bgcsApp.updateAssetMenuSelection) {
            window.bgcsApp.updateAssetMenuSelection();
        }
        if (window.bgcsApp && window.bgcsApp.updateGroupMenuSelection) {
            window.bgcsApp.updateGroupMenuSelection();
        }
        
        // Show/hide Control Panel based on selection
        const controlsPanel = document.getElementById('controls-panel');
        if (controlsPanel) {
            if (this.selectedEntities.size > 0) {
                controlsPanel.classList.add('has-selection');
            } else {
                controlsPanel.classList.remove('has-selection');
            }
        }
    }
    
    
    /**
     * Focus camera on selected entities
     */
    focusOnSelected() {
        if (this.selectedEntities.size === 0) return;
        
        // Calculate center point of selected entities
        let center = new THREE.Vector3();
        let count = 0;
        
        this.selectedEntities.forEach(entityId => {
            const mesh = this.renderer3D.entities.get(entityId);
            if (mesh) {
                center.add(mesh.position);
                count++;
            }
        });
        
        if (count > 0) {
            center.divideScalar(count);
            this.cameraManager.focusOn(center);
            
            if (window.bgcsApp) {
                window.bgcsApp.log(`Focused on ${this.selectedEntities.size} selected entities`, 'info');
            }
        }
    }
    
    /**
     * Get currently selected entity IDs
     */
    getSelectedEntities() {
        return Array.from(this.selectedEntities);
    }
    
    /**
     * Set interaction mode
     */
    setInteractionMode(mode) {
        this.interactionMode = mode;
    }
    
    // Additional methods for waypoint placement, context menus, etc. would go here
    
    handleWaypointPlacement(e) {
        // TODO: Implement waypoint placement
    }
    
    handleRightClick(e) {
        // TODO: Implement context menu
    }
    
    handleCameraOrbit(deltaX, deltaY) {
        // Unified camera orbit - works from any orientation
        // The camera manager will handle 2D view lock restrictions internally
        this.cameraManager.handleOrbit(deltaX, deltaY);
    }
    
    handleCameraPan(deltaX, deltaY) {
        // Unified camera pan - adapts based on orientation
        this.cameraManager.handlePan(deltaX, deltaY);
    }
    
    handleAltitudeAdjust(deltaY) {
        // TODO: Implement altitude adjustment for 2D view
    }
    
    startTemporary3DPreview() {
        // TODO: Implement temporary 3D preview
    }
    
    endTemporary3DPreview() {
        // TODO: End temporary 3D preview
    }
    
    toggleSelectedEntityMode() {
        // TODO: Toggle mode for selected entities
    }
    
    deleteSelectedEntities() {
        this.selectedEntities.forEach(entityId => {
            this.renderer3D.removeEntity(entityId);
        });
        this.clearSelection();
        
        if (window.bgcsApp) {
            window.bgcsApp.log('Deleted selected entities', 'info');
        }
    }
    
    selectAllEntities() {
        this.clearSelection();
        this.renderer3D.entities.forEach((mesh, entityId) => {
            this.selectEntity(entityId);
        });
    }
    
    /**
     * Helper method to notify app of selection changes
     */
    notifySelectionChange(message = null) {
        if (window.bgcsApp) {
            window.bgcsApp.updateControlPanelModes();
            window.bgcsApp.updateSensorOverlaySelection();
            if (message) {
                window.bgcsApp.log(message, 'info');
            }
        }
    }
}

// Make available globally
window.BGCSUIControls = BGCSUIControls;