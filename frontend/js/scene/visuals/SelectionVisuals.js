/**
 * BGCS Selection Visuals System - Military Tactical Console
 * 
 * Implements military-grade selection cues for 3D battlespace:
 * - Screen-space outlines (constant pixel width)
 * - Vertical beacons (minimalist pylons)
 * - Tactical HUD tags
 * - Distance-based LOD rules
 * - Off-screen pointers for occluded entities
 */

class SelectionVisuals {
    constructor(renderer3D, scene, camera) {
        this.renderer3D = renderer3D;
        this.scene = scene;
        this.camera = camera;
        
        // Visual state tracking
        this.selectedVisuals = new Map(); // entityId -> visual objects
        this.hoveredVisuals = new Map();  // entityId -> visual objects
        this.hudOverlay = null;
        
        // Selection visual components
        this.outlinePass = null;
        this.beacons = new Map(); // entityId -> beacon mesh
        this.hudTags = new Map();  // entityId -> HUD element
        this.offScreenPointers = new Map(); // entityId -> pointer element
        
        // Performance settings
        this.maxDistance = 1000; // Far LOD threshold (increased for better visibility)
        this.nearDistance = 100; // Near LOD threshold
        this.updateInterval = 16; // 60fps updates for responsiveness
        this.lastUpdate = 0;
        
        // Position smoothing for jitter reduction
        this.lastTagPositions = new Map(); // entityId -> {x, y}
        this.positionSmoothingFactor = 0.6; // Balanced smoothing
        
        // Visual styling - Match enhanced entity colors
        this.colors = {
            ally: 0x44FFAA,      // Cyan-green for beacon lines (different but complementary to drone color)
            hostile: 0xFF4488,   // Pink-red for beacon lines (different but complementary to target color)
            neutral: 0xFFCC44,   // Golden amber
            selected: 0xcccccc,  // Light gray outline
            hover: 0x888888      // Gray outline
        };
        
        this.init();
    }
    
    init() {
        this.setupOutlineSystem();
        this.setupHUDOverlay();
        this.setupBeaconMaterials();
        this.startUpdateLoop();
    }
    
    /**
     * Setup screen-space outline system using post-processing
     */
    setupOutlineSystem() {
        // Create outline materials for different states
        this.outlineMaterials = {
            selected: new THREE.MeshBasicMaterial({
                color: this.colors.selected,
                side: THREE.BackSide,
                transparent: true,
                opacity: 0.8
            }),
            hover: new THREE.MeshBasicMaterial({
                color: this.colors.hover,
                side: THREE.BackSide,
                transparent: true,
                opacity: 0.4
            })
        };
    }
    
    /**
     * Setup HUD overlay for tactical tags
     */
    setupHUDOverlay() {
        this.hudOverlay = document.createElement('div');
        this.hudOverlay.className = 'bgcs-hud-overlay';
        this.hudOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
            font-weight: bold;
            color: #ffffff;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        
        const canvasContainer = document.querySelector('.canvas-container') || document.body;
        canvasContainer.appendChild(this.hudOverlay);
    }
    
    /**
     * Setup beacon material cache
     */
    setupBeaconMaterials() {
        this.beaconMaterials = {
            ally: this.createBeaconMaterial(this.colors.ally),
            hostile: this.createBeaconMaterial(this.colors.hostile),
            neutral: this.createBeaconMaterial(this.colors.neutral)
        };
    }
    
    /**
     * Create beacon material with opacity pulse shader
     */
    createBeaconMaterial(color) {
        return new THREE.MeshLambertMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(color).multiplyScalar(0.2) // Add slight glow
        });
    }
    
    /**
     * Start visual update loop
     */
    startUpdateLoop() {
        const update = (timestamp) => {
            if (timestamp - this.lastUpdate >= this.updateInterval) {
                this.updateVisuals();
                this.lastUpdate = timestamp;
            }
            requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }
    
    /**
     * Update all visual elements based on camera and distance
     */
    updateVisuals() {
        this.updateBeaconPulse();
        this.updateHUDTags();
        this.updateOffScreenPointers();
        this.updateLOD();
    }
    
    /**
     * Add selection visuals for entity
     */
    addSelection(entityId, entityType = 'ally') {
        const mesh = this.renderer3D.entities.get(entityId);
        if (!mesh) return;
        
        const distance = this.camera.position.distanceTo(mesh.position);
        
        // Create visual package
        const visuals = {
            outline: this.createOutline(mesh, 'selected', distance),
            beacon: this.createBeacon(mesh, entityType, distance),
            hudTag: this.createHUDTag(entityId, mesh, distance),
            offScreenPointer: null // Created when needed
        };
        
        this.selectedVisuals.set(entityId, visuals);
        this.updateEntityVisuals(entityId);
    }
    
    /**
     * Remove selection visuals for entity
     */
    removeSelection(entityId) {
        const visuals = this.selectedVisuals.get(entityId);
        if (visuals) {
            this.disposeVisuals(visuals);
            this.selectedVisuals.delete(entityId);
        }
        
        // Clean up stored position data
        this.lastTagPositions.delete(entityId);
        
    }
    
    /**
     * Add hover visuals for entity
     */
    addHover(entityId) {
        const mesh = this.renderer3D.entities.get(entityId);
        if (!mesh || this.selectedVisuals.has(entityId)) return; // Don't hover selected
        
        const distance = this.camera.position.distanceTo(mesh.position);
        
        const visuals = {
            outline: this.createOutline(mesh, 'hover', distance)
        };
        
        this.hoveredVisuals.set(entityId, visuals);
    }
    
    /**
     * Remove hover visuals for entity
     */
    removeHover(entityId) {
        const visuals = this.hoveredVisuals.get(entityId);
        if (visuals) {
            this.disposeVisuals(visuals);
            this.hoveredVisuals.delete(entityId);
        }
    }
    
    /**
     * Create screen-space outline for mesh
     */
    createOutline(mesh, type, distance) {
        // Calculate outline thickness based on distance
        let scale = 1.02; // Near distance scale
        if (distance > this.nearDistance) {
            scale = 1.01; // Far distance scale
        }
        
        // Clone geometry and create outline mesh
        const outlineGeometry = mesh.geometry.clone();
        const outlineMaterial = this.outlineMaterials[type].clone();
        
        const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outlineMesh.position.copy(mesh.position);
        outlineMesh.rotation.copy(mesh.rotation);
        outlineMesh.scale.copy(mesh.scale).multiplyScalar(scale);
        
        this.scene.add(outlineMesh);
        return outlineMesh;
    }
    
    /**
     * Create vertical beacon (simple line)
     */
    createBeacon(mesh, entityType, distance) {
        if (distance > this.maxDistance) return null; // Too far for beacon
        
        // Calculate beacon height based on entity bounding box
        const bbox = new THREE.Box3().setFromObject(mesh);
        const entityHeight = bbox.max.y - bbox.min.y;
        let beaconHeight = Math.max(3, entityHeight * 1.2); // Even shorter height
        beaconHeight = Math.max(3, Math.min(6, beaconHeight)); // Clamp 3-6m for shorter visibility
        
        // Create simple line geometry - thicker and shorter for better visibility
        const lineRadius = 0.3; // Even thicker line (30cm diameter)
        const lineGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, beaconHeight, 8);
        
        // Create line material with bright color
        const lineMaterial = this.beaconMaterials[entityType].clone();
        lineMaterial.opacity = 0.9;
        lineMaterial.emissive.multiplyScalar(0.6); // Strong glow for visibility
        
        const lineMesh = new THREE.Mesh(lineGeometry, lineMaterial);
        
        // Create beacon group
        const beaconGroup = new THREE.Group();
        
        // Position line - center it vertically so it extends upward from entity
        lineMesh.position.set(0, beaconHeight / 2, 0);
        beaconGroup.add(lineMesh);
        
        // Position entire beacon above entity
        beaconGroup.position.copy(mesh.position);
        beaconGroup.position.y += entityHeight / 2; // Start from top of entity
        
        // Store beacon data for updates
        beaconGroup.userData = {
            lineMesh: lineMesh,
            beaconHeight: beaconHeight,
            entityId: mesh.userData.entityId
        };
        
        this.scene.add(beaconGroup);
        this.beacons.set(mesh.userData.entityId, beaconGroup);
        
        return beaconGroup;
    }
    
    /**
     * Create tactical HUD tag
     */
    createHUDTag(entityId, mesh, distance) {
        const hudElement = document.createElement('div');
        hudElement.className = 'bgcs-hud-tag';
        hudElement.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.7);
            border: 1px solid #555;
            padding: 2px 4px;
            border-radius: 2px;
            white-space: nowrap;
            transform: translate(-50%, -100%);
        `;
        
        // Get entity data for tag content
        const entity = window.bgcsEntityStateManager?.getEntity(entityId);
        const altitude = Math.round(mesh.position.y);
        
        // Always show entity ID and altitude when selected
        let content = `${entityId} | ALT ${altitude}m`;
        
        hudElement.innerHTML = content;
        hudElement.dataset.entityId = entityId; // Store entity ID for cleanup
        this.hudOverlay.appendChild(hudElement);
        this.hudTags.set(entityId, hudElement);
        
        return hudElement;
    }
    
    /**
     * Update beacon opacity pulse animation
     */
    updateBeaconPulse() {
        const time = Date.now() * 0.001; // Convert to seconds
        const pulseOpacity = 0.7 + 0.2 * Math.sin(time * 2); // Sine wave pulse
        
        this.beacons.forEach(beacon => {
            if (beacon.userData.lineMesh) {
                beacon.userData.lineMesh.material.opacity = pulseOpacity;
            }
        });
    }
    
    /**
     * Update HUD tag positions - positioned to the right side of entities
     */
    updateHUDTags() {
        this.hudTags.forEach((element, entityId) => {
            const mesh = this.renderer3D.entities.get(entityId);
            if (!mesh) return;
            
            const screenPos = this.worldToScreen(mesh.position);
            if (screenPos) {
                if (this.isOnScreen(screenPos)) {
                    // Position tag to the right side of the entity at center height
                    const rightOffset = 70; // 70px to the right
                    const verticalOffset = 0; // Center aligned vertically
                    
                    let targetX = screenPos.x + rightOffset;
                    let targetY = screenPos.y + verticalOffset;
                    
                    // Apply distance-adaptive smoothing
                    const lastPos = this.lastTagPositions.get(entityId);
                    if (lastPos) {
                        // Calculate distance from camera to entity
                        const distance = this.camera.position.distanceTo(mesh.position);
                        // Simple distance-based smoothing
                        let adaptiveSmoothingFactor = this.positionSmoothingFactor;
                        if (distance > this.nearDistance * 2) {
                            // High smoothing for far distances (simple approach)
                            adaptiveSmoothingFactor = 0.8;
                        } else if (distance > this.nearDistance) {
                            // Medium smoothing for medium distances
                            adaptiveSmoothingFactor = 0.7;
                        }
                        
                        targetX = lastPos.x + (targetX - lastPos.x) * adaptiveSmoothingFactor;
                        targetY = lastPos.y + (targetY - lastPos.y) * adaptiveSmoothingFactor;
                    }
                    
                    // Store the smoothed position
                    this.lastTagPositions.set(entityId, { x: targetX, y: targetY });
                    
                    element.style.left = Math.round(targetX) + 'px';
                    element.style.top = Math.round(targetY) + 'px';
                    element.style.display = 'block';
                } else {
                    element.style.display = 'none';
                    // Create off-screen pointer if needed
                    this.createOffScreenPointer(entityId, mesh, screenPos);
                }
            }
        });
    }
    
    /**
     * Update off-screen pointers
     */
    updateOffScreenPointers() {
        this.offScreenPointers.forEach((pointer, entityId) => {
            const mesh = this.renderer3D.entities.get(entityId);
            if (!mesh) return;
            
            const screenPos = this.worldToScreen(mesh.position);
            if (screenPos && !this.isOnScreen(screenPos)) {
                const clampedPos = this.clampToScreen(screenPos);
                pointer.style.left = clampedPos.x + 'px';
                pointer.style.top = clampedPos.y + 'px';
                
                // Update distance and bearing
                const distance = this.camera.position.distanceTo(mesh.position);
                const bearing = this.calculateBearing(mesh.position);
                pointer.innerHTML = `${entityId}<br>${Math.round(distance)}m<br>${Math.round(bearing)}°`;
                pointer.style.display = 'block';
            } else {
                pointer.style.display = 'none';
            }
        });
    }
    
    /**
     * Create off-screen pointer for occluded entity
     */
    createOffScreenPointer(entityId, mesh, screenPos) {
        if (this.offScreenPointers.has(entityId)) return;
        
        const pointer = document.createElement('div');
        pointer.className = 'bgcs-offscreen-pointer';
        
        // Add connecting line indicator (clean line instead of arrow)
        const line = document.createElement('div');
        line.style.cssText = `
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            height: 6px;
            background: #666666;
            box-shadow: none;
        `;
        pointer.appendChild(line);
        
        this.hudOverlay.appendChild(pointer);
        this.offScreenPointers.set(entityId, pointer);
    }
    
    /**
     * Update LOD based on distance
     */
    updateLOD() {
        [...this.selectedVisuals.keys()].forEach(entityId => {
            this.updateEntityVisuals(entityId);
        });
    }
    
    /**
     * Update visuals for specific entity based on distance
     */
    updateEntityVisuals(entityId) {
        const mesh = this.renderer3D.entities.get(entityId);
        const visuals = this.selectedVisuals.get(entityId);
        if (!mesh || !visuals) return;
        
        const distance = this.camera.position.distanceTo(mesh.position);
        
        // Update outline thickness
        if (visuals.outline) {
            let scale = distance > this.nearDistance ? 1.01 : 1.02;
            visuals.outline.scale.copy(mesh.scale).multiplyScalar(scale);
            visuals.outline.position.copy(mesh.position);
            visuals.outline.rotation.copy(mesh.rotation);
        }
        
        // Update beacon position and visibility
        if (visuals.beacon && visuals.beacon.userData) {
            if (distance > this.maxDistance) {
                visuals.beacon.visible = false;
            } else {
                visuals.beacon.visible = true;
                
                // Update beacon position to follow entity
                const bbox = new THREE.Box3().setFromObject(mesh);
                const entityHeight = bbox.max.y - bbox.min.y;
                
                // Position beacon directly above entity
                visuals.beacon.position.copy(mesh.position);
                visuals.beacon.position.y += entityHeight / 2; // Start from top of entity
                
                // Get stored beacon data
                const beaconData = visuals.beacon.userData;
                
                // Ensure line mesh is visible
                if (beaconData.lineMesh) {
                    beaconData.lineMesh.visible = true;
                }
                
                // Scale beacon based on distance to maintain visibility when zoomed out
                let scaleMultiplier = 1.0;
                if (distance > this.nearDistance) {
                    // Increase size at far distances to maintain visibility
                    scaleMultiplier = Math.min(3.0, distance / this.nearDistance);
                }
                visuals.beacon.scale.setScalar(scaleMultiplier);
            }
        }
        
        // Update HUD tag content - always show full info when selected
        if (visuals.hudTag) {
            const altitude = Math.round(mesh.position.y);
            let content = `${entityId} | ALT ${altitude}m`;
            visuals.hudTag.innerHTML = content;
        }
    }
    
    /**
     * Calculate screen height for target pixel height at distance
     */
    calculateScreenHeight(distance, targetPixels) {
        const fov = this.camera.fov * Math.PI / 180;
        const canvasHeight = this.renderer3D.canvas.clientHeight;
        return (targetPixels / canvasHeight) * 2 * Math.tan(fov / 2) * distance;
    }
    
    /**
     * Convert screen height to world height
     */
    screenToWorldHeight(screenHeight, distance) {
        return screenHeight;
    }
    
    /**
     * Convert world position to screen coordinates
     */
    worldToScreen(worldPosition) {
        const vector = new THREE.Vector3(worldPosition.x, worldPosition.y, worldPosition.z);
        vector.project(this.camera);
        
        const canvas = this.renderer3D.canvas;
        const x = (vector.x + 1) * canvas.clientWidth / 2;
        const y = (-vector.y + 1) * canvas.clientHeight / 2;
        
        return { x, y };
    }
    
    /**
     * Check if screen position is visible on screen
     */
    isOnScreen(screenPos) {
        const canvas = this.renderer3D.canvas;
        return screenPos.x >= 0 && screenPos.x <= canvas.clientWidth &&
               screenPos.y >= 0 && screenPos.y <= canvas.clientHeight;
    }
    
    /**
     * Clamp screen position to viewport edges
     */
    clampToScreen(screenPos) {
        const canvas = this.renderer3D.canvas;
        const margin = 20; // Keep pointers 20px from edge
        
        return {
            x: Math.max(margin, Math.min(canvas.clientWidth - margin, screenPos.x)),
            y: Math.max(margin, Math.min(canvas.clientHeight - margin, screenPos.y))
        };
    }
    
    /**
     * Calculate bearing from camera to entity
     */
    calculateBearing(worldPosition) {
        const cameraPos = this.camera.position;
        const dx = worldPosition.x - cameraPos.x;
        const dz = worldPosition.z - cameraPos.z;
        
        let bearing = Math.atan2(dx, dz) * 180 / Math.PI;
        if (bearing < 0) bearing += 360;
        
        return bearing;
    }
    
    /**
     * Dispose of visual resources
     */
    disposeVisuals(visuals) {
        if (visuals.outline) {
            this.scene.remove(visuals.outline);
            visuals.outline.geometry?.dispose();
            visuals.outline.material?.dispose();
        }
        
        if (visuals.beacon) {
            this.scene.remove(visuals.beacon);
            visuals.beacon.children.forEach(child => {
                child.geometry?.dispose();
                // Don't dispose shared materials
            });
        }
        
        if (visuals.hudTag) {
            this.hudOverlay.removeChild(visuals.hudTag);
        }
        
        if (visuals.offScreenPointer) {
            this.hudOverlay.removeChild(visuals.offScreenPointer);
        }
    }
    
    /**
     * Clean up visuals for a specific entity (called when entity is deleted)
     */
    cleanupEntity(entityId) {
        // Remove from all visual systems
        this.removeSelection(entityId);
        this.removeHover(entityId);
        
        // Clean up any remaining references
        this.lastTagPositions.delete(entityId);
        this.beacons.delete(entityId);
        this.hudTags.delete(entityId);
        this.offScreenPointers.delete(entityId);
        
        // Clean up orphaned DOM elements
        const orphanedTag = this.hudOverlay.querySelector(`[data-entity-id="${entityId}"]`);
        if (orphanedTag) {
            orphanedTag.remove();
        }
    }
    
    /**
     * Clear all visuals
     */
    clearAll() {
        [...this.selectedVisuals.keys()].forEach(entityId => {
            this.removeSelection(entityId);
        });
        
        [...this.hoveredVisuals.keys()].forEach(entityId => {
            this.removeHover(entityId);
        });
        
        // Clear all maps completely
        this.lastTagPositions.clear();
        this.beacons.clear();
        this.hudTags.clear();
        this.offScreenPointers.clear();
    }
    
    /**
     * Dispose of the system
     */
    dispose() {
        this.clearAll();
        
        if (this.hudOverlay) {
            this.hudOverlay.remove();
        }
        
        // Dispose materials
        Object.values(this.outlineMaterials).forEach(material => material.dispose());
        Object.values(this.beaconMaterials).forEach(material => material.dispose());
    }
}

// Make available globally
window.SelectionVisuals = SelectionVisuals;