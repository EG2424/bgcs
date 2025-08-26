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
        this.ground = null;
        
        // Animation frame tracking
        this.animationFrameId = null;
        this.isRendering = false;
        
        // Performance tracking
        this.fps = 0;
        this.lastFrameTime = 0;
        this.lastRenderTime = 0;
        this.frameCount = 0;
        
    }
    
    /**
     * Initialize Three.js scene, renderer, and basic setup
     */
    init() {
        try {
            this.createScene();
            this.createRenderer();
            this.createLighting();
            this.createGround();
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
        this.scene.fog = new THREE.Fog(0x1f1c18, 50, 500);
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
     * Create ground plane
     */
    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: 0x2a2a2a,
            transparent: true,
            opacity: 0.8
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.ground.position.y = 0;
        this.ground.receiveShadow = true;
        
        this.scene.add(this.ground);
        
        // Create custom grid with consistent line thickness
        this.createCustomGrid();
    }
    
    /**
     * Create custom grid with consistent line thickness
     */
    createCustomGrid() {
        const gridSize = 1000;
        const divisions = 100;
        const step = gridSize / divisions;
        
        // Create geometry for grid lines
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        
        // Main grid lines (every 10th line - more prominent)
        const mainGridColor = new THREE.Color(0x555555);
        // Sub grid lines (regular lines)
        const subGridColor = new THREE.Color(0x333333);
        
        // Create vertical and horizontal lines
        for (let i = 0; i <= divisions; i++) {
            const pos = -gridSize / 2 + i * step;
            
            // Vertical lines
            vertices.push(-gridSize / 2, 0.01, pos);
            vertices.push(gridSize / 2, 0.01, pos);
            
            // Horizontal lines
            vertices.push(pos, 0.01, -gridSize / 2);
            vertices.push(pos, 0.01, gridSize / 2);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        // Create material with consistent line width
        const material = new THREE.LineBasicMaterial({
            color: 0x444444,
            opacity: 0.6,
            transparent: true
        });
        
        // Create line segments
        const grid = new THREE.LineSegments(geometry, material);
        this.scene.add(grid);
        
        // Store reference for potential updates
        this.customGrid = grid;
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
        // Create a small cube for UAV (made smaller so 1.0 scale looks good)
        const geometry = new THREE.BoxGeometry(0.75, 0.75, 0.75);
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
        // Create a small cube for targets (made smaller so 1.0 scale looks good)
        const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
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
        
        // Set position with height adjustment to sit on ground properly
        let adjustedY = position.y;
        if (type === 'drone') {
            // Drone cube is 0.75 units tall, so raise by half height to sit on ground
            adjustedY = position.y + 0.375; 
        } else if (type === 'target') {
            // Target cube is 0.6 units tall, so raise by half height to sit on ground
            adjustedY = position.y + 0.3; 
        }
        mesh.position.set(position.x, adjustedY, position.z);
        
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
            // Apply same height adjustment as in addEntity
            let adjustedY = position.y;
            const entityType = mesh.userData.type;
            
            if (entityType === 'drone') {
                // Drone cube is 0.75 units tall, so raise by half height to sit on ground
                adjustedY = position.y + 0.375; 
            } else if (entityType === 'target') {
                // Target cube is 0.6 units tall, so raise by half height to sit on ground
                adjustedY = position.y + 0.3; 
            }
            
            mesh.position.set(position.x, adjustedY, position.z);
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
        
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        
        this.scene = null;
    }
}

// Make available globally
window.BGCS3DRenderer = BGCS3DRenderer;