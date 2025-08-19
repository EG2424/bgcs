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
        this.frameCount = 0;
        
        console.log('BGCS3DRenderer initialized');
    }
    
    /**
     * Initialize Three.js scene, renderer, and basic setup
     */
    init() {
        try {
            console.log('Initializing 3D scene...');
            
            console.log('Creating scene...');
            this.createScene();
            
            console.log('Creating renderer...');
            this.createRenderer();
            
            console.log('Creating lighting...');
            this.createLighting();
            
            console.log('Creating ground...');
            this.createGround();
            
            console.log('Setting up event listeners...');
            this.setupEventListeners();
            
            console.log('3D Scene initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize 3D scene:', error);
            console.error('Error details:', error.message);
            return false;
        }
    }
    
    /**
     * Create Three.js scene
     */
    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a); // Match frontend dark theme
        
        // Add fog for depth perception
        this.scene.fog = new THREE.Fog(0x1a1a1a, 50, 500);
    }
    
    /**
     * Create Three.js renderer
     */
    createRenderer() {
        // Check if WebGL is available
        if (!this.canvas.getContext('webgl') && !this.canvas.getContext('experimental-webgl')) {
            throw new Error('WebGL is not supported in this browser');
        }
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            premultipliedAlpha: false
        });
        
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enable tone mapping for better lighting
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        console.log('WebGL renderer created successfully');
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
        
        // Add grid helper for better spatial reference
        const gridHelper = new THREE.GridHelper(1000, 100, 0x555555, 0x333333);
        gridHelper.position.y = 0.01; // Slightly above ground to prevent z-fighting
        this.scene.add(gridHelper);
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
        
        console.log('3D rendering started');
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
        
        console.log('3D rendering stopped');
    }
    
    /**
     * Main rendering loop
     */
    renderLoop() {
        if (!this.isRendering) return;
        
        const currentTime = performance.now();
        
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
     * Create a drone mesh (placeholder)
     */
    createDroneMesh() {
        // Cone geometry for drone (pointing upward) - made larger for visibility
        const geometry = new THREE.ConeGeometry(2, 4, 8);
        const material = new THREE.MeshPhongMaterial({
            color: 0x007AFF, // System blue
            transparent: false,
            opacity: 1.0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        console.log('Created drone mesh with geometry:', geometry);
        return mesh;
    }
    
    /**
     * Create a target mesh (placeholder)
     */
    createTargetMesh() {
        // Box geometry for target - made larger for visibility
        const geometry = new THREE.BoxGeometry(3, 3, 3);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFF3B30, // System red
            transparent: false,
            opacity: 1.0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        console.log('Created target mesh with geometry:', geometry);
        return mesh;
    }
    
    /**
     * Add entity to the scene
     */
    addEntity(entityId, type, position = { x: 0, y: 5, z: 0 }) {
        // Remove existing entity if it exists
        this.removeEntity(entityId);
        
        console.log(`Creating ${type} entity ${entityId} at position:`, position);
        
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
        
        // Set position
        mesh.position.set(position.x, position.y, position.z);
        console.log(`Positioned mesh at:`, mesh.position);
        
        // Store entity data
        mesh.userData = {
            entityId: entityId,
            type: type
        };
        
        // Add to scene and tracking
        this.scene.add(mesh);
        this.entities.set(entityId, mesh);
        
        console.log(`Added ${type} entity ${entityId} to scene. Total entities:`, this.entities.size);
        console.log('Scene children count:', this.scene.children.length);
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
            console.log(`Removed entity ${entityId} from scene`);
        }
    }
    
    /**
     * Update entity position
     */
    updateEntityPosition(entityId, position) {
        const mesh = this.entities.get(entityId);
        if (mesh) {
            mesh.position.set(position.x, position.y, position.z);
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
        console.log('3D Renderer disposed');
    }
}

// Make available globally
window.BGCS3DRenderer = BGCS3DRenderer;