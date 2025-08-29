/**
 * BGCS 3D Renderer - Chunk 5: 3D Scene Foundation
 * Three.js scene setup and basic 3D rendering
 */

class BGCS3DRenderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = null;
        this.renderer = null;
        this.entities = new Map(); // Map<entityId, mesh>
        
        // Terrain system
        this.terrain = null;
        
        // Animation frame tracking
        this.animationFrameId = null;
        this.isRendering = false;
        
        // Selection visual system
        this.selectionVisuals = null;
        
        // Performance tracking
        this.fps = 0;
        this.lastFrameTime = 0;
        this.lastRenderTime = 0;
        this.frameCount = 0;
        
    }
    
    /**
     * Initialize Three.js scene, renderer, and basic setup
     */
    async init() {
        try {
            this.createScene();
            this.createRenderer();
            this.createLighting();
            await this.loadTerrain(); // Only load 3D terrain
            this.setupSelectionVisuals();
            this.setupEventListeners();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize 3D scene:', error);
            console.error('Error details:', error.message);
            return false;
        }
    }
    
    /**
     * Create Three.js scene with map-like gradient background
     */
    createScene() {
        this.scene = new THREE.Scene();
        
        // Create gradient background (dark blue to gray like a tactical map)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 512;
        
        // Create radial gradient with satellite map colors
        const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, '#3d4a2f'); // Muted olive green center (vegetation)
        gradient.addColorStop(0.3, '#4a3d2f'); // Brown-green (mixed terrain)
        gradient.addColorStop(0.6, '#3d352a'); // Earth brown (soil/fields)
        gradient.addColorStop(0.8, '#2a2621'); // Dark brown (shadows)
        gradient.addColorStop(1, '#1f1c18'); // Very dark earth edge
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 512);
        
        // Set as scene background
        const texture = new THREE.CanvasTexture(canvas);
        this.scene.background = texture;
        
        // Add subtle fog for depth perception with matching satellite map colors
        // Increase fog distances to prevent terrain darkening at normal zoom levels
        this.scene.fog = new THREE.Fog(0x1f1c18, 200, 1000);
    }
    
    /**
     * Create Three.js renderer
     */
    createRenderer() {
        // Check if WebGL is available without creating a context
        const tempCanvas = document.createElement('canvas');
        const webglSupported = !!(tempCanvas.getContext('webgl') || tempCanvas.getContext('experimental-webgl'));
        
        if (!webglSupported) {
            throw new Error('WebGL is not supported in this browser');
        }
        
        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: false,
                premultipliedAlpha: false,
                powerPreference: 'high-performance',
                failIfMajorPerformanceCaveat: false
            });
        } catch (error) {
            console.error('Failed to create WebGL renderer:', error);
            throw new Error(`WebGL renderer creation failed: ${error.message}`);
        }
        
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enable tone mapping for better lighting
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
    }
    
    /**
     * Create basic lighting setup
     */
    createLighting() {
        // Ambient light for general illumination
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light (sun) with shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        
        // Shadow camera settings
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        
        this.scene.add(directionalLight);
        
        // Add a helper for the directional light (optional, for debugging)
        // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
        // this.scene.add(lightHelper);
    }
    
    /**
     * Setup selection visual system
     */
    setupSelectionVisuals() {
        // Wait for camera manager to be available
        if (window.bgcsCameras && window.SelectionVisuals) {
            const camera = window.bgcsCameras.getCurrentCamera();
            if (camera) {
                this.selectionVisuals = new SelectionVisuals(this, this.scene, camera);
            }
        }
        
        // If not ready, retry in 100ms
        if (!this.selectionVisuals) {
            setTimeout(() => this.setupSelectionVisuals(), 100);
        }
    }
    
    /**
     * Setup event listeners for canvas resize
     */
    setupEventListeners() {
        window.addEventListener('resize', () => this.handleResize());
    }
    
    /**
     * Handle canvas resize
     */
    handleResize() {
        if (!this.renderer) return;
        
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.renderer.setSize(width, height);
        
        // Update camera aspect ratio if cameras are available
        if (window.bgcsCameras) {
            window.bgcsCameras.handleResize(width, height);
        }
    }
    
    /**
     * Start rendering loop
     */
    startRendering() {
        if (this.isRendering) return;
        
        this.isRendering = true;
        this.lastFrameTime = performance.now();
        this.renderLoop();
        
    }
    
    /**
     * Stop rendering loop
     */
    stopRendering() {
        if (!this.isRendering) return;
        
        this.isRendering = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
    }
    
    /**
     * Main rendering loop
     */
    renderLoop() {
        if (!this.isRendering) return;
        
        const currentTime = performance.now();
        
        // Cap to 60 FPS for smooth movement
        if (!this.lastRenderTime) this.lastRenderTime = currentTime;
        const deltaTime = currentTime - this.lastRenderTime;
        const targetFPS = 60;
        const frameInterval = 1000 / targetFPS; // 16.67ms
        
        if (deltaTime >= frameInterval) {
            // Calculate FPS
            this.frameCount++;
            if (currentTime - this.lastFrameTime >= 1000) {
                this.fps = Math.round(this.frameCount * 1000 / (currentTime - this.lastFrameTime));
                this.frameCount = 0;
                this.lastFrameTime = currentTime;
            }
            
            // Update entities (if any)
            this.updateEntities();
            
            // Render the scene
            this.render();
            
            this.lastRenderTime = currentTime;
        }
        
        // Continue loop
        this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }
    
    /**
     * Render the scene with current camera
     */
    render() {
        if (!this.renderer || !this.scene) return;
        
        // Get current camera from camera manager
        const currentCamera = window.bgcsCameras ? window.bgcsCameras.getCurrentCamera() : null;
        
        if (currentCamera) {
            this.renderer.render(this.scene, currentCamera);
        }
    }
    
    /**
     * Update all entities in the scene
     */
    updateEntities() {
        // Update entity animations, positions, etc.
        // Will be expanded when entity data comes from backend
        this.entities.forEach((mesh, entityId) => {
            // Placeholder for entity updates
        });
    }
    
    /**
     * Create a drone mesh - small cube
     */
    createDroneMesh() {
        // Create drone cube (sized for 1.0 scale slider = 2x original size)
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00FF00, // Bright green
            transparent: false,
            opacity: 1.0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        return mesh;
    }
    
    /**
     * Create a target mesh - small cube
     */
    createTargetMesh() {
        // Create target cube (sized for 1.0 scale slider = 2x original size)
        const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFF0000, // Bright red
            transparent: false,
            opacity: 1.0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        return mesh;
    }
    
    /**
     * Add entity to the scene
     */
    addEntity(entityId, type, position = { x: 0, y: 3, z: 0 }) {
        // Remove existing entity if it exists
        this.removeEntity(entityId);
        
        
        // Create appropriate mesh based on type
        let mesh;
        if (type === 'drone') {
            mesh = this.createDroneMesh();
        } else if (type === 'target') {
            mesh = this.createTargetMesh();
        } else {
            console.warn(`Unknown entity type: ${type}`);
            return;
        }
        
        // Constrain position to terrain bounds
        const bounds = this.terrain ? this.terrain.getBounds() : { minX: -250, maxX: 250, minZ: -250, maxZ: 250 };
        const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
        const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
        
        // Get terrain height at the spawn position
        const terrainHeight = this.getTerrainHeight(clampedX, clampedZ);
        
        // Validate terrain height
        if (terrainHeight < 0) {
            console.warn(`Negative terrain height detected: ${terrainHeight} at (${clampedX}, ${clampedZ})`);
        }
        
        // Set position based on entity type - use backend Y position for drones, terrain for targets
        let adjustedY;
        if (type === 'drone') {
            // Use the Y position from backend for drones but enforce minimum altitude
            adjustedY = Math.max(position.y, terrainHeight + 4.0);
        } else if (type === 'target') {
            // Targets sit on terrain surface  
            adjustedY = terrainHeight + 0.6; // sit on terrain with half mesh height offset
        }
        
        
        // Get terrain normal for orientation (for targets)
        let terrainNormal = null;
        if (type === 'target') {
            terrainNormal = this.getTerrainNormal(clampedX, clampedZ);
        }
        
        mesh.position.set(clampedX, adjustedY, clampedZ);
        
        // Apply terrain orientation for ground vehicles
        if (type === 'target' && terrainNormal) {
            this.alignMeshToTerrain(mesh, terrainNormal);
        }
        
        // Store entity data
        mesh.userData = {
            entityId: entityId,
            type: type
        };
        
        // Apply current entity scale if available
        const currentScale = window.bgcsApp ? window.bgcsApp.entityScale : 1.0;
        mesh.scale.set(currentScale, currentScale, currentScale);
        
        // Add to scene and tracking
        this.scene.add(mesh);
        this.entities.set(entityId, mesh);
        
    }
    
    /**
     * Remove entity from scene
     */
    removeEntity(entityId) {
        const mesh = this.entities.get(entityId);
        if (mesh) {
            this.scene.remove(mesh);
            
            // Clean up selection visuals for this entity
            if (this.selectionVisuals) {
                this.selectionVisuals.cleanupEntity(entityId);
            }
            
            // Dispose of geometry and material to prevent memory leaks
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(material => material.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
            
            this.entities.delete(entityId);
        }
    }
    
    /**
     * Update entity position
     */
    updateEntityPosition(entityId, position) {
        const mesh = this.entities.get(entityId);
        if (mesh) {
            const entityType = mesh.userData.type;
            
            // Constrain position to terrain bounds
            const bounds = this.terrain ? this.terrain.getBounds() : { minX: -250, maxX: 250, minZ: -250, maxZ: 250 };
            const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
            const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
            
            // Get terrain height at the new position
            const terrainHeight = this.getTerrainHeight(clampedX, clampedZ);
            
            // Apply positioning based on entity type
            let adjustedY;
            if (entityType === 'drone') {
                // Use backend Y position for drones but enforce minimum altitude
                adjustedY = Math.max(position.y, terrainHeight + 4.0);
            } else if (entityType === 'target') {
                // Targets sit on terrain surface
                adjustedY = terrainHeight + 0.6; // sit on terrain with half mesh height offset
            }
            
            // Get terrain normal for orientation (for targets)
            let terrainNormal = null;
            if (entityType === 'target') {
                terrainNormal = this.getTerrainNormal(clampedX, clampedZ);
            }
            
            mesh.position.set(clampedX, adjustedY, clampedZ);
            
            // Apply terrain orientation for ground vehicles
            if (entityType === 'target' && terrainNormal) {
                this.alignMeshToTerrain(mesh, terrainNormal);
            }
        }
    }
    
    /**
     * Update entity rotation
     */
    updateEntityRotation(entityId, rotation) {
        const mesh = this.entities.get(entityId);
        if (mesh) {
            mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        }
    }
    
    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }
    
    /**
     * Set scale for all entities
     */
    setEntityScale(scale) {
        this.entities.forEach((mesh, entityId) => {
            mesh.scale.set(scale, scale, scale);
        });
    }
    
    /**
     * Load terrain system
     */
    async loadTerrain() {
        try {
            
            // Create terrain system
            this.terrain = new BGCSTerrain(this.scene);
            
            // Load terrain heightmap
            const success = await this.terrain.loadTerrain();
            
            if (!success) {
                this.terrain = null;
            }
            
        } catch (error) {
            this.terrain = null;
        }
    }
    
    /**
     * Get terrain height at world position
     */
    getTerrainHeight(x, z) {
        if (this.terrain && this.terrain.isInBounds(x, z)) {
            return this.terrain.getHeightAt(x, z);
        }
        return 0; // Default ground level
    }
    
    /**
     * Check if position is within terrain bounds
     */
    isInTerrainBounds(x, z) {
        return this.terrain ? this.terrain.isInBounds(x, z) : false;
    }
    
    /**
     * Get terrain normal vector at position for surface alignment
     */
    getTerrainNormal(x, z) {
        if (!this.terrain || !this.terrain.isInBounds(x, z)) {
            return new THREE.Vector3(0, 1, 0); // Default up vector
        }
        
        // Sample nearby heights to calculate normal
        const offset = 1.0; // 1m sampling distance
        const heightC = this.getTerrainHeight(x, z);
        const heightL = this.getTerrainHeight(x - offset, z);
        const heightR = this.getTerrainHeight(x + offset, z);
        const heightB = this.getTerrainHeight(x, z - offset);
        const heightT = this.getTerrainHeight(x, z + offset);
        
        // Calculate surface normal using cross product
        const dx = heightR - heightL;
        const dz = heightT - heightB;
        
        const normal = new THREE.Vector3(-dx / (2 * offset), 1, -dz / (2 * offset));
        normal.normalize();
        
        return normal;
    }
    
    /**
     * Align mesh to terrain surface normal
     */
    alignMeshToTerrain(mesh, normal) {
        // Calculate rotation to align mesh with terrain normal
        const up = new THREE.Vector3(0, 1, 0);
        
        // Create a quaternion rotation from up vector to terrain normal
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, normal);
        
        mesh.setRotationFromQuaternion(quaternion);
    }
    
    /**
     * Get selection visuals system
     */
    getSelectionVisuals() {
        return this.selectionVisuals;
    }
    
    /**
     * Clear all entities from scene
     */
    clear() {
        const entityIds = Array.from(this.entities.keys());
        entityIds.forEach(entityId => this.removeEntity(entityId));
    }
    
    /**
     * Dispose of renderer and clean up resources
     */
    dispose() {
        this.stopRendering();
        this.clear();
        
        // Dispose selection visuals
        if (this.selectionVisuals) {
            this.selectionVisuals.dispose();
            this.selectionVisuals = null;
        }
        
        // Dispose terrain
        if (this.terrain) {
            this.terrain.dispose();
            this.terrain = null;
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        
        this.scene = null;
    }
}

// Make available globally
window.BGCS3DRenderer = BGCS3DRenderer;