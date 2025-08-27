/**
 * BGCS Unified Camera Manager 
 * Single perspective camera system with top-down orientation capability
 */

class BGCSCameraManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.aspect = canvas.clientWidth / canvas.clientHeight;
        
        // Single camera system
        this.camera = null;
        
        // Camera controls state
        this.cameraTarget = { x: 0, y: 0, z: 0 };
        this.zoom = 1.0;
        
        // Mouse interaction state
        this.isMouseDown = false;
        this.mouseButton = null;
        this.lastMousePos = { x: 0, y: 0 };
        this.mouseSensitivity = 0.005;
        this.zoomSensitivity = 0.1; // Much smoother zooming
        
        // Unified camera spherical coordinates
        this.spherical = {
            radius: 200, // Start much further out to see full 500x500 terrain
            phi: 0.01, // Start at top-down (nearly 0 degrees = looking down)
            theta: 0 // Horizontal angle
        };
        
        // Top-down reference (for Space key reset)
        this.topDownPhi = 0.01; // Small value instead of 0 to avoid singularity
        
        // 2D View Lock State
        this.is2DViewLocked = false;
        
    }
    
    /**
     * Initialize the unified camera system
     */
    init() {
        try {
            this.createCamera();
            this.updateCameraPosition();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize camera system:', error);
            return false;
        }
    }
    
    /**
     * Create single perspective camera
     */
    createCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75, // Field of view
            this.aspect, // Aspect ratio
            0.1, // Near clipping plane
            3000 // Far clipping plane
        );
        
        // Set initial position (top-down view)
        this.updateCameraPosition();
        
    }
    
    /**
     * Update camera position from spherical coordinates
     */
    updateCameraPosition() {
        if (!this.camera) return;
        
        const x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
        const y = this.spherical.radius * Math.cos(this.spherical.phi);
        const z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
        
        // Position camera relative to target
        this.camera.position.set(
            this.cameraTarget.x + x, 
            this.cameraTarget.y + y, 
            this.cameraTarget.z + z
        );
        
        this.camera.lookAt(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
        
        // Update UI to reflect current orientation
        this.updateViewUI();
    }
    
    /**
     * Handle orbit/tilt action (right mouse drag)
     */
    handleOrbit(deltaX, deltaY) {
        // Check if 2D view is locked and camera is in top-down orientation
        const isTopDown = this.spherical.phi < 0.3; // Within 17 degrees of straight down
        
        if (this.is2DViewLocked && isTopDown) {
            // When locked in 2D view, only allow horizontal rotation (theta), no tilt (phi)
            this.spherical.theta += deltaX * this.mouseSensitivity; // Drag right = orbit right
            // Don't modify phi when locked in 2D view
        } else {
            // Normal orbit behavior
            // Invert directions for natural orbiting
            this.spherical.theta += deltaX * this.mouseSensitivity; // Drag right = orbit right
            this.spherical.phi -= deltaY * this.mouseSensitivity;   // Drag up = tilt up
            
            // Clamp phi to prevent camera flipping
            this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
        }
        
        this.updateCameraPosition();
    }
    
    /**
     * Handle pan action (left mouse drag or middle mouse)
     */
    handlePan(deltaX, deltaY) {
        const isTopDown = this.spherical.phi < 0.3; // Within 17 degrees of straight down
        const panSpeed = this.spherical.radius * 0.002;
        
        if (isTopDown) {
            // Top-down panning - use camera's actual right and forward vectors
            // This ensures consistent screen-relative movement regardless of theta rotation
            const camera = this.camera;
            
            // Get camera's right vector (screen X direction)
            const right = new THREE.Vector3();
            right.setFromMatrixColumn(camera.matrix, 0); // Camera's local X axis
            right.y = 0; // Project to ground plane
            right.normalize();
            
            // Get camera's forward vector (screen Y direction) 
            const forward = new THREE.Vector3();
            forward.setFromMatrixColumn(camera.matrix, 2); // Camera's local Z axis (forward)
            forward.y = 0; // Project to ground plane  
            forward.normalize();
            forward.negate(); // Negate because camera looks down -Z
            
            // Apply movement - invert directions for natural feel
            const rightMovement = right.clone().multiplyScalar(-deltaX * panSpeed); // Invert X
            const forwardMovement = forward.clone().multiplyScalar(deltaY * panSpeed); // Invert Y
            
            
            // Apply movement to plain JS object (not Vector3)
            this.cameraTarget.x += rightMovement.x + forwardMovement.x;
            this.cameraTarget.y += rightMovement.y + forwardMovement.y;
            this.cameraTarget.z += rightMovement.z + forwardMovement.z;
        } else {
            // 3D panning - move target based on camera's right and up vectors
            const camera = this.camera;
            
            // Calculate camera's local right and up vectors
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            
            const right = new THREE.Vector3();
            const worldUp = new THREE.Vector3(0, 1, 0);
            right.crossVectors(cameraDirection, worldUp).normalize();
            
            const up = new THREE.Vector3();
            up.crossVectors(right, cameraDirection).normalize();
            
            // Apply pan movement - invert directions for natural feel
            const rightMovement = right.clone().multiplyScalar(-deltaX * panSpeed); // Invert X for natural panning
            const upMovement = up.clone().multiplyScalar(deltaY * panSpeed); // Invert Y for natural panning
            
            // Apply movement to plain JS object (not Vector3)
            this.cameraTarget.x += rightMovement.x + upMovement.x;
            this.cameraTarget.y += rightMovement.y + upMovement.y;
            this.cameraTarget.z += rightMovement.z + upMovement.z;
        }
        
        this.updateCameraPosition();
    }
    
    /**
     * Handle zoom action (mouse wheel) - direct and immediate like pan/orbit
     */
    handleZoom(delta) {
        // Direct zoom change - no animation, just like pan and orbit
        this.spherical.radius += delta * this.zoomSensitivity;
        this.spherical.radius = Math.max(5, Math.min(1000, this.spherical.radius));
        this.updateCameraPosition();
    }
    
    /**
     * Reset to top-down orientation (Space key)
     */
    resetToTopDown() {
        // Smoothly animate to top-down view
        this.animateToOrientation(this.spherical.radius, this.topDownPhi, this.spherical.theta);
    }
    
    /**
     * Animate camera to specific orientation
     */
    animateToOrientation(targetRadius, targetPhi, targetTheta, duration = 500) {
        const startTime = performance.now();
        const startRadius = this.spherical.radius;
        const startPhi = this.spherical.phi;
        const startTheta = this.spherical.theta;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing
            const eased = 1 - Math.pow(1 - progress, 3);
            
            this.spherical.radius = startRadius + (targetRadius - startRadius) * eased;
            this.spherical.phi = startPhi + (targetPhi - startPhi) * eased;
            this.spherical.theta = startTheta + (targetTheta - startTheta) * eased;
            
            this.updateCameraPosition();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Get current active camera (for renderer compatibility)
     */
    getCurrentCamera() {
        return this.camera;
    }
    
    /**
     * Get current view type for UI (legacy compatibility)
     */
    getCurrentView() {
        // Determine if we're in "top-down" based on phi angle (close to 0 = looking down)
        const isTopDown = this.spherical.phi < 0.3; // Within 17 degrees of straight down
        return isTopDown ? 'top' : '3d';
    }
    
    /**
     * Set view (legacy compatibility) - now just animates to orientation
     */
    setView(viewType) {
        // Check if trying to switch away from top view while locked
        if (this.is2DViewLocked && viewType === '3d') {
            // Prevent switching to 3D view when locked
            if (window.bgcsApp) {
                window.bgcsApp.log('Cannot switch to 3D view: 2D view is locked (Press L to unlock)', 'warning');
            }
            return false;
        }
        
        if (viewType === 'top') {
            this.resetToTopDown();
        } else if (viewType === '3d') {
            // Animate to 3D perspective view
            this.animateToOrientation(50, Math.PI / 4, Math.PI / 4);
        }
        
        // Update UI buttons to reflect current orientation
        this.updateViewUI();
        
        return true;
    }
    
    /**
     * Update UI to reflect current camera orientation
     */
    updateViewUI() {
        // UI buttons removed - camera orientation is now controlled naturally via mouse
        // Optional: Log camera state for debugging
        const isTopDown = this.spherical.phi < 0.3;
        if (window.bgcsApp && Math.random() < 0.01) { // Log occasionally to avoid spam
            const viewName = isTopDown ? 'Top-Down Orientation' : 'Perspective Orientation';
            window.bgcsApp.log(`Camera: ${viewName}`, 'info');
        }
    }
    
    /**
     * Handle canvas resize
     */
    handleResize(width, height) {
        this.aspect = width / height;
        
        if (this.camera) {
            this.camera.aspect = this.aspect;
            this.camera.updateProjectionMatrix();
        }
        
    }
    
    /**
     * Focus camera on specific position
     */
    focusOn(position, smooth = true) {
        if (!position) return;
        
        if (smooth) {
            // Animate to new target
            const startTarget = { ...this.cameraTarget };
            const targetPos = { ...position };
            const duration = 800;
            const startTime = performance.now();
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                
                this.cameraTarget.x = startTarget.x + (targetPos.x - startTarget.x) * eased;
                this.cameraTarget.y = startTarget.y + (targetPos.y - startTarget.y) * eased;
                this.cameraTarget.z = startTarget.z + (targetPos.z - startTarget.z) * eased;
                
                this.updateCameraPosition();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            this.cameraTarget = { ...position };
            this.updateCameraPosition();
        }
        
    }
    
    /**
     * Reset camera to default position
     */
    resetCameras() {
        this.cameraTarget = { x: 0, y: 0, z: 0 };
        this.spherical.radius = 200; // Same as initial default
        this.spherical.phi = this.topDownPhi;
        this.spherical.theta = 0;
        this.updateCameraPosition();
        
    }
    
    /**
     * Set 2D view lock state
     */
    set2DViewLock(locked) {
        this.is2DViewLocked = locked;
        
        if (locked) {
            // When locking, ensure we're in top-down view
            const isTopDown = this.spherical.phi < 0.3;
            if (!isTopDown) {
                this.resetToTopDown();
            }
        }
    }
    
    /**
     * Get 2D view lock state
     */
    is2DViewLocked() {
        return this.is2DViewLocked;
    }
    
    /**
     * Get camera information for debugging
     */
    getCameraInfo() {
        const isTopDown = Math.abs(this.spherical.phi - this.topDownPhi) < 0.2;
        
        return {
            currentView: isTopDown ? 'top' : '3d',
            position: {
                x: this.camera.position.x,
                y: this.camera.position.y,
                z: this.camera.position.z
            },
            target: { ...this.cameraTarget },
            spherical: { ...this.spherical },
            isTopDown: isTopDown,
            is2DViewLocked: this.is2DViewLocked
        };
    }
}

// Make available globally
window.BGCSCameraManager = BGCSCameraManager;