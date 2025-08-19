/**
 * BGCS Camera Manager - Chunk 5: 3D Scene Foundation
 * Dual camera system: Perspective (3D View) and Orthographic (Top View)
 */

class BGCSCameraManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.aspect = canvas.clientWidth / canvas.clientHeight;
        
        // Cameras
        this.perspectiveCamera = null;
        this.orthographicCamera = null;
        this.currentCamera = null;
        this.currentView = 'top'; // 'top' or '3d'
        
        // Camera controls state
        this.cameraPosition = { x: 0, y: 50, z: 50 };
        this.cameraTarget = { x: 0, y: 0, z: 0 };
        this.zoom = 1.0;
        
        // Orthographic camera parameters
        this.orthoSize = 100; // How much of the scene is visible
        this.orthoCenter = { x: 0, z: 0 };
        
        // Mouse interaction state
        this.isMouseDown = false;
        this.mouseButton = null;
        this.lastMousePos = { x: 0, y: 0 };
        this.mouseSensitivity = 0.005;
        this.zoomSensitivity = 0.1;
        
        // 3D camera spherical coordinates for orbit controls
        this.spherical = {
            radius: 70,
            phi: Math.PI / 4, // Vertical angle
            theta: Math.PI / 4 // Horizontal angle
        };
        
        console.log('BGCSCameraManager initialized');
    }
    
    /**
     * Initialize both cameras
     */
    init() {
        try {
            this.createPerspectiveCamera();
            this.createOrthographicCamera();
            // Note: Mouse controls will be handled by UI controls system
            this.setView('top'); // Start with top view
            
            console.log('Camera system initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize camera system:', error);
            return false;
        }
    }
    
    /**
     * Setup mouse event listeners for camera controls
     */
    setupMouseControls() {
        // Mouse down
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.mouseButton = e.button;
            this.lastMousePos.x = e.clientX;
            this.lastMousePos.y = e.clientY;
            e.preventDefault();
        });

        // Mouse up
        this.canvas.addEventListener('mouseup', (e) => {
            this.isMouseDown = false;
            this.mouseButton = null;
        });

        // Mouse move
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isMouseDown) return;

            const deltaX = e.clientX - this.lastMousePos.x;
            const deltaY = e.clientY - this.lastMousePos.y;

            if (this.currentView === '3d') {
                // 3D orbit controls
                if (this.mouseButton === 0) { // Left mouse button - orbit
                    this.spherical.theta -= deltaX * this.mouseSensitivity;
                    this.spherical.phi += deltaY * this.mouseSensitivity;
                    
                    // Clamp phi to prevent camera flipping
                    this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
                    
                    this.updatePerspectiveFromSpherical();
                }
            } else {
                // Top view pan controls
                if (this.mouseButton === 0) { // Left mouse button - pan
                    const panSpeed = this.orthoSize * 0.001;
                    this.orthoCenter.x -= deltaX * panSpeed;
                    this.orthoCenter.z += deltaY * panSpeed;
                    this.setOrthographicCenter(this.orthoCenter.x, this.orthoCenter.z);
                }
            }

            this.lastMousePos.x = e.clientX;
            this.lastMousePos.y = e.clientY;
        });

        // Mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            if (this.currentView === '3d') {
                // 3D zoom by changing radius
                this.spherical.radius += e.deltaY * this.zoomSensitivity;
                this.spherical.radius = Math.max(5, Math.min(200, this.spherical.radius));
                this.updatePerspectiveFromSpherical();
            } else {
                // Orthographic zoom
                const newZoom = this.zoom + (e.deltaY > 0 ? -0.1 : 0.1);
                this.setOrthographicZoom(newZoom);
            }
        });

        console.log('Mouse controls setup complete');
    }

    /**
     * Update perspective camera position from spherical coordinates
     */
    updatePerspectiveFromSpherical() {
        if (!this.perspectiveCamera) return;
        
        const x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
        const y = this.spherical.radius * Math.cos(this.spherical.phi);
        const z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
        
        // Position camera relative to target
        this.perspectiveCamera.position.set(
            this.cameraTarget.x + x, 
            this.cameraTarget.y + y, 
            this.cameraTarget.z + z
        );
        
        this.perspectiveCamera.lookAt(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
    }

    /**
     * Create perspective camera for 3D view
     */
    createPerspectiveCamera() {
        this.perspectiveCamera = new THREE.PerspectiveCamera(
            75, // Field of view
            this.aspect, // Aspect ratio
            0.1, // Near clipping plane
            1000 // Far clipping plane
        );
        
        // Set initial position from spherical coordinates
        this.updatePerspectiveFromSpherical();
        
        console.log('Perspective camera created');
    }
    
    /**
     * Create orthographic camera for top view
     */
    createOrthographicCamera() {
        const width = this.orthoSize * this.aspect;
        const height = this.orthoSize;
        
        this.orthographicCamera = new THREE.OrthographicCamera(
            -width / 2, // Left
            width / 2,  // Right
            height / 2, // Top
            -height / 2, // Bottom
            0.1, // Near
            1000 // Far
        );
        
        // Position camera directly above the scene looking down
        this.orthographicCamera.position.set(0, 50, 0);
        this.orthographicCamera.lookAt(0, 0, 0);
        
        console.log('Orthographic camera created at position:', this.orthographicCamera.position);
    }
    
    /**
     * Switch between camera views
     */
    setView(viewType) {
        if (viewType === 'top') {
            this.currentCamera = this.orthographicCamera;
            this.currentView = 'top';
            console.log('Switched to Top View (Orthographic)');
        } else if (viewType === '3d') {
            this.currentCamera = this.perspectiveCamera;
            this.currentView = '3d';
            console.log('Switched to 3D View (Perspective)');
        } else {
            console.warn(`Unknown view type: ${viewType}`);
            return false;
        }
        
        // Update UI to reflect current view
        this.updateViewUI();
        
        return true;
    }
    
    /**
     * Get current active camera
     */
    getCurrentCamera() {
        return this.currentCamera;
    }
    
    /**
     * Get current view type
     */
    getCurrentView() {
        return this.currentView;
    }
    
    /**
     * Handle canvas resize
     */
    handleResize(width, height) {
        this.aspect = width / height;
        
        // Update perspective camera
        if (this.perspectiveCamera) {
            this.perspectiveCamera.aspect = this.aspect;
            this.perspectiveCamera.updateProjectionMatrix();
        }
        
        // Update orthographic camera
        if (this.orthographicCamera) {
            const orthoWidth = this.orthoSize * this.aspect;
            const orthoHeight = this.orthoSize;
            
            this.orthographicCamera.left = -orthoWidth / 2;
            this.orthographicCamera.right = orthoWidth / 2;
            this.orthographicCamera.top = orthoHeight / 2;
            this.orthographicCamera.bottom = -orthoHeight / 2;
            this.orthographicCamera.updateProjectionMatrix();
        }
        
        console.log(`Cameras updated for resize: ${width}x${height}`);
    }
    
    /**
     * Set 3D camera position and target
     */
    setPerspectiveCamera(position, target) {
        if (!this.perspectiveCamera) return;
        
        if (position) {
            this.cameraPosition = { ...position };
            this.perspectiveCamera.position.set(position.x, position.y, position.z);
        }
        
        if (target) {
            this.cameraTarget = { ...target };
            this.perspectiveCamera.lookAt(target.x, target.y, target.z);
        }
    }
    
    /**
     * Set orthographic camera zoom level
     */
    setOrthographicZoom(zoom) {
        if (!this.orthographicCamera) return;
        
        this.zoom = Math.max(0.1, Math.min(5.0, zoom)); // Clamp between 0.1 and 5.0
        
        const baseSize = 100;
        this.orthoSize = baseSize / this.zoom;
        
        const orthoWidth = this.orthoSize * this.aspect;
        const orthoHeight = this.orthoSize;
        
        this.orthographicCamera.left = -orthoWidth / 2;
        this.orthographicCamera.right = orthoWidth / 2;
        this.orthographicCamera.top = orthoHeight / 2;
        this.orthographicCamera.bottom = -orthoHeight / 2;
        this.orthographicCamera.updateProjectionMatrix();
        
        console.log(`Orthographic zoom set to: ${this.zoom}x`);
    }
    
    /**
     * Move orthographic camera center point
     */
    setOrthographicCenter(x, z) {
        if (!this.orthographicCamera) return;
        
        this.orthographicCamera.position.set(x, 100, z);
        this.orthographicCamera.lookAt(x, 0, z);
        
        console.log(`Orthographic camera centered at (${x}, ${z})`);
    }
    
    /**
     * Focus camera on specific position
     */
    focusOn(position, smooth = false) {
        if (!position) return;
        
        if (this.currentView === '3d') {
            // For 3D view, move camera to look at the position
            const newCameraPos = {
                x: position.x + 30,
                y: position.y + 20,
                z: position.z + 30
            };
            
            this.setPerspectiveCamera(newCameraPos, position);
        } else {
            // For top view, center the orthographic camera
            this.setOrthographicCenter(position.x, position.z);
        }
        
        console.log(`Camera focused on position:`, position);
    }
    
    /**
     * Reset cameras to default positions
     */
    resetCameras() {
        // Reset 3D camera
        this.setPerspectiveCamera(
            { x: 0, y: 50, z: 50 },
            { x: 0, y: 0, z: 0 }
        );
        
        // Reset top view camera
        this.setOrthographicCenter(0, 0);
        this.setOrthographicZoom(1.0);
        
        console.log('Cameras reset to default positions');
    }
    
    /**
     * Update UI to reflect current camera view
     */
    updateViewUI() {
        // Update view buttons if they exist
        const viewTopButton = document.getElementById('view-top');
        const view3DButton = document.getElementById('view-3d');
        
        if (viewTopButton && view3DButton) {
            viewTopButton.classList.toggle('active', this.currentView === 'top');
            view3DButton.classList.toggle('active', this.currentView === '3d');
        }
        
        // Log to console/app if available
        if (window.bgcsApp) {
            const viewName = this.currentView === 'top' ? 'Top View' : '3D View';
            window.bgcsApp.log(`Switched to ${viewName}`, 'info');
        }
    }
    
    /**
     * Handle camera orbit (for 3D view)
     */
    handleOrbit(deltaX, deltaY) {
        if (this.currentView !== '3d') return;
        
        this.spherical.theta += deltaX * this.mouseSensitivity; // Drag right = theta increases = camera goes right
        this.spherical.phi -= deltaY * this.mouseSensitivity; // Drag up = phi decreases = camera goes higher
        
        // Clamp phi to prevent camera flipping
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
        
        this.updatePerspectiveFromSpherical();
    }
    
    /**
     * Handle camera pan (for top view and 3D middle-mouse)
     */
    handlePan(deltaX, deltaY) {
        if (this.currentView === 'top') {
            // Pan orthographic camera (invert Y for natural top-down movement)
            const panSpeed = this.orthoSize * 0.001;
            this.orthoCenter.x -= deltaX * panSpeed;
            this.orthoCenter.z -= deltaY * panSpeed; // Inverted for natural top-down control
            this.setOrthographicCenter(this.orthoCenter.x, this.orthoCenter.z);
        } else {
            // Pan 3D camera target (for middle mouse button)
            const panSpeed = this.spherical.radius * 0.001;
            
            // Calculate right and up vectors based on current camera orientation
            const camera = this.perspectiveCamera;
            const right = new THREE.Vector3();
            const up = new THREE.Vector3();
            
            right.setFromMatrixColumn(camera.matrix, 0); // Right vector
            up.setFromMatrixColumn(camera.matrix, 1);    // Up vector
            
            // Move the target point (inverted Y for natural pan control)
            this.cameraTarget.x -= right.x * deltaX * panSpeed;
            this.cameraTarget.z -= right.z * deltaX * panSpeed;
            
            this.cameraTarget.x += up.x * deltaY * panSpeed; // Inverted Y
            this.cameraTarget.y += up.y * deltaY * panSpeed; // Inverted Y  
            this.cameraTarget.z += up.z * deltaY * panSpeed; // Inverted Y
            
            // Update camera to look at new target
            this.updatePerspectiveFromSpherical();
        }
    }
    
    /**
     * Handle camera zoom
     */
    handleZoom(delta) {
        if (this.currentView === '3d') {
            // 3D zoom by changing radius
            this.spherical.radius += delta * this.zoomSensitivity;
            this.spherical.radius = Math.max(5, Math.min(200, this.spherical.radius));
            this.updatePerspectiveFromSpherical();
        } else {
            // Orthographic zoom
            const newZoom = this.zoom + (delta > 0 ? -0.1 : 0.1);
            this.setOrthographicZoom(newZoom);
        }
    }
    
    /**
     * Get camera information for debugging
     */
    getCameraInfo() {
        const info = {
            currentView: this.currentView,
            zoom: this.zoom,
            orthoSize: this.orthoSize
        };
        
        if (this.perspectiveCamera) {
            info.perspectivePosition = {
                x: this.perspectiveCamera.position.x,
                y: this.perspectiveCamera.position.y,
                z: this.perspectiveCamera.position.z
            };
        }
        
        if (this.orthographicCamera) {
            info.orthographicPosition = {
                x: this.orthographicCamera.position.x,
                y: this.orthographicCamera.position.y,
                z: this.orthographicCamera.position.z
            };
        }
        
        return info;
    }
}

// Make available globally
window.BGCSCameraManager = BGCSCameraManager;