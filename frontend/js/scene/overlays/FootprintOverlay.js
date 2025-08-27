/**
 * BGCS Footprint Overlay Renderer
 * Projects sensor field-of-view shapes onto the ground plane with gimbal support
 */

class BGCSFootprintOverlay {
    constructor(scene, terrain) {
        this.scene = scene;
        this.terrain = terrain;
        
        // Rendering settings
        this.groundLevel = 0; // Default ground level, will be updated from terrain
        this.footprintGroup = new THREE.Group();
        this.footprintGroup.name = 'sensor_footprints';
        
        // Material cache for performance
        this.materials = new Map();
        
        this.initialized = false;
    }
    
    /**
     * Initialize footprint renderer
     */
    async init() {
        if (this.initialized) return true;
        
        try {
            // Add footprint group to scene
            this.scene.add(this.footprintGroup);
            
            // Get ground level from terrain if available
            if (this.terrain && this.terrain.getGroundLevel) {
                this.groundLevel = this.terrain.getGroundLevel(0, 0);
            }
            
            this.initialized = true;
            console.log('FootprintOverlay initialized');
            return true;
            
        } catch (error) {
            console.warn('FootprintOverlay initialization failed:', error);
            return false;
        }
    }
    
    /**
     * Create footprint overlay for sensor
     */
    createFootprint(entityId, sensorId, sensor, entityPosition, entityRotation) {
        if (!this.initialized) return null;
        
        try {
            // Calculate sensor world position and orientation
            const sensorTransform = this.calculateSensorTransform(
                sensor, entityPosition, entityRotation
            );
            
            // Create footprint geometry based on sensor type
            let geometry;
            if (sensor.type === 'camera') {
                geometry = this.createCameraFootprintGeometry(sensor, sensorTransform);
            } else if (sensor.type === 'radar') {
                geometry = this.createRadarFootprintGeometry(sensor, sensorTransform);
            } else {
                // Default to camera-like footprint
                geometry = this.createCameraFootprintGeometry(sensor, sensorTransform);
            }
            
            if (!geometry) return null;
            
            // Get or create material
            const material = this.getFootprintMaterial(sensor);
            
            // Create mesh
            const footprintMesh = new THREE.Mesh(geometry, material);
            footprintMesh.name = `footprint_${entityId}_${sensorId}`;
            footprintMesh.userData = {
                entityId: entityId,
                sensorId: sensorId,
                sensorType: sensor.type
            };
            
            // Position above ground level to be visible from all camera angles
            footprintMesh.position.y = this.groundLevel + 1.0;
            
            // Set high render order to ensure it renders on top
            footprintMesh.renderOrder = 1000;
            
            // Disable frustum culling to ensure visibility
            footprintMesh.frustumCulled = false;
            
            this.footprintGroup.add(footprintMesh);
            return footprintMesh;
            
        } catch (error) {
            console.warn(`Failed to create footprint for ${entityId}:${sensorId}:`, error);
            return null;
        }
    }
    
    /**
     * Update existing footprint with new sensor data
     */
    updateFootprint(footprintMesh, sensor, entityPosition, entityRotation) {
        if (!footprintMesh || !this.initialized) return;
        
        try {
            // Calculate new sensor transform
            const sensorTransform = this.calculateSensorTransform(
                sensor, entityPosition, entityRotation
            );
            
            // Update geometry based on sensor type
            let newGeometry;
            if (sensor.type === 'camera') {
                newGeometry = this.createCameraFootprintGeometry(sensor, sensorTransform);
            } else if (sensor.type === 'radar') {
                newGeometry = this.createRadarFootprintGeometry(sensor, sensorTransform);
            } else {
                newGeometry = this.createCameraFootprintGeometry(sensor, sensorTransform);
            }
            
            if (newGeometry) {
                // Dispose old geometry
                if (footprintMesh.geometry) {
                    footprintMesh.geometry.dispose();
                }
                
                // Apply new geometry
                footprintMesh.geometry = newGeometry;
                
                // Force geometry update
                footprintMesh.geometry.attributes.position.needsUpdate = true;
                if (footprintMesh.geometry.index) {
                    footprintMesh.geometry.index.needsUpdate = true;
                }
                
                // Footprint updated successfully
            }
            
        } catch (error) {
            console.warn('Failed to update footprint:', error);
        }
    }
    
    /**
     * Calculate sensor world transform including gimbal orientation
     */
    calculateSensorTransform(sensor, entityPosition, entityRotation) {
        // Start with entity position and rotation
        const transform = {
            position: { ...entityPosition },
            rotation: { ...entityRotation }
        };
        
        // Apply mount offset
        if (sensor.mount_offset) {
            // Rotate mount offset by entity orientation
            const offsetVec = new THREE.Vector3(
                sensor.mount_offset.x || 0,
                sensor.mount_offset.y || 0,
                sensor.mount_offset.z || 0
            );
            
            // Apply entity rotation to offset
            const entityQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    entityRotation.x || 0,
                    entityRotation.y || 0,
                    entityRotation.z || 0
                )
            );
            offsetVec.applyQuaternion(entityQuat);
            
            transform.position.x += offsetVec.x;
            transform.position.y += offsetVec.y;
            transform.position.z += offsetVec.z;
        }
        
        // Apply gimbal rotation
        if (sensor.gimbal) {
            // Convert gimbal angles to world space
            const gimbalPan = (sensor.gimbal.pan || 0) * Math.PI / 180;
            const gimbalTilt = (sensor.gimbal.tilt || 0) * Math.PI / 180;
            
            // Add gimbal rotation to entity rotation
            transform.rotation.y = (transform.rotation.y || 0) + gimbalPan;
            transform.rotation.x = (transform.rotation.x || 0) + gimbalTilt;
        }
        
        return transform;
    }
    
    /**
     * Create camera footprint geometry by sampling the frustum and projecting onto 3D terrain
     */
    createCameraFootprintGeometry(sensor, sensorTransform) {
        const hFov = (sensor.fov_horizontal_deg || 70) * Math.PI / 180;
        const vFov = (sensor.fov_vertical_deg || 52.5) * Math.PI / 180;
        const range = sensor.far || 200;
        const sensorYaw = sensorTransform.rotation.y || 0;
        const sensorTilt = sensorTransform.rotation.x || 0;
        
        const vertices = [];
        const indices = [];
        
        // Sensor position
        const sensorPos = new THREE.Vector3(
            sensorTransform.position.x,
            sensorTransform.position.y,
            sensorTransform.position.z
        );
        
        // Create camera transformation matrix
        const sensorMatrix = new THREE.Matrix4();
        sensorMatrix.makeRotationFromEuler(new THREE.Euler(sensorTilt, sensorYaw, 0));
        sensorMatrix.setPosition(sensorPos);
        
        // Sample the frustum with a grid to properly follow terrain contours
        const hSteps = 15; // Horizontal steps
        const vSteps = 10; // Vertical steps
        
        const halfHFov = hFov / 2;
        const halfVFov = vFov / 2;
        
        // Create a grid of points representing the camera frustum
        for (let v = 0; v <= vSteps; v++) {
            for (let h = 0; h <= hSteps; h++) {
                // Normalize to -1 to 1 range
                const hNorm = (h / hSteps) * 2 - 1; // -1 to 1
                const vNorm = (v / vSteps) * 2 - 1; // -1 to 1
                
                // Convert to angles within FOV
                const hAngle = hNorm * halfHFov;
                const vAngle = vNorm * halfVFov;
                
                // Create ray direction in camera space
                const rayDir = new THREE.Vector3(
                    Math.sin(hAngle),
                    Math.sin(vAngle),
                    -Math.cos(hAngle) * Math.cos(vAngle)
                );
                
                // Transform ray direction to world space
                rayDir.transformDirection(sensorMatrix);
                rayDir.normalize();
                
                // Cast ray to find terrain intersection
                const raycaster = new THREE.Raycaster(sensorPos, rayDir, 1, range);
                
                let hitPoint = null;
                
                // Try to intersect with terrain mesh if available
                if (this.terrain && this.terrain.mesh) {
                    const intersects = raycaster.intersectObject(this.terrain.mesh, true);
                    if (intersects.length > 0) {
                        hitPoint = intersects[0].point.clone();
                        hitPoint.y += 2.0; // Elevate for visibility
                    }
                } 
                
                // Fallback: step along ray and check terrain height
                if (!hitPoint) {
                    for (let distance = 5; distance <= range; distance += 10) {
                        const testPoint = sensorPos.clone().add(rayDir.clone().multiplyScalar(distance));
                        const terrainHeight = this.getTerrainHeight(testPoint.x, testPoint.z);
                        
                        if (testPoint.y <= terrainHeight) {
                            hitPoint = new THREE.Vector3(testPoint.x, terrainHeight + 2.0, testPoint.z);
                            break;
                        }
                    }
                }
                
                // Final fallback: max range
                if (!hitPoint) {
                    const maxPoint = sensorPos.clone().add(rayDir.clone().multiplyScalar(range));
                    const terrainHeight = this.getTerrainHeight(maxPoint.x, maxPoint.z);
                    hitPoint = new THREE.Vector3(maxPoint.x, terrainHeight + 2.0, maxPoint.z);
                }
                
                vertices.push(hitPoint.x, hitPoint.y, hitPoint.z);
            }
        }
        
        // Create triangular mesh from the grid
        for (let v = 0; v < vSteps; v++) {
            for (let h = 0; h < hSteps; h++) {
                const i = v * (hSteps + 1) + h;
                const i1 = i + 1;
                const i2 = i + (hSteps + 1);
                const i3 = i2 + 1;
                
                // Create two triangles per grid cell
                indices.push(i, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        return geometry;
    }
    
    /**
     * Get terrain height at specific world coordinates
     */
    getTerrainHeight(x, z) {
        if (this.terrain && this.terrain.getHeightAt) {
            try {
                return this.terrain.getHeightAt(x, z);
            } catch (error) {
                // Fallback to ground level if terrain query fails
                return this.groundLevel;
            }
        }
        return this.groundLevel;
    }
    
    /**
     * Create radar footprint geometry (sector or full circle)
     */
    createRadarFootprintGeometry(sensor, sensorTransform) {
        const hFov = (sensor.fov_horizontal_deg || 360) * Math.PI / 180;
        const range = sensor.far || 500;
        
        // Create sector geometry
        const geometry = new THREE.RingGeometry(
            sensor.near || 0,    // Inner radius
            range,               // Outer radius
            0,                   // Start angle
            hFov,                // Sweep angle
            32                   // Segments
        );
        
        // Rotate geometry to match sensor orientation
        geometry.rotateY(sensorTransform.rotation.y || 0);
        geometry.translate(
            sensorTransform.position.x,
            0,
            sensorTransform.position.z
        );
        
        return geometry;
    }
    
    /**
     * Create simple circular footprint (fallback)
     */
    createCircularFootprint(radius, position) {
        const geometry = new THREE.CircleGeometry(radius, 32);
        geometry.rotateX(-Math.PI / 2); // Make it horizontal
        geometry.translate(position.x, 0, position.z);
        return geometry;
    }
    
    /**
     * Get or create material for footprint rendering
     */
    getFootprintMaterial(sensor) {
        const color = sensor.color || 0x00ff00;
        const opacity = sensor.opacity || 0.3;
        const materialKey = `${color}_${opacity}`;
        
        if (!this.materials.has(materialKey)) {
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false,
                fog: false,
                alphaTest: 0.01,  // Small alpha test to prevent complete transparency
                blending: THREE.CustomBlending,  // Use custom blending
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            });
            this.materials.set(materialKey, material);
        }
        
        return this.materials.get(materialKey);
    }
    
    /**
     * Update ground level from terrain
     */
    updateGroundLevel(x, z) {
        if (this.terrain && this.terrain.getGroundLevel) {
            this.groundLevel = this.terrain.getGroundLevel(x, z);
        }
        
        // Update all footprint positions
        this.footprintGroup.children.forEach(footprint => {
            footprint.position.y = this.groundLevel + 1.0;
        });
    }
    
    /**
     * Remove footprint from scene
     */
    removeFootprint(footprintMesh) {
        if (footprintMesh && footprintMesh.parent) {
            footprintMesh.parent.remove(footprintMesh);
            
            // Dispose geometry
            if (footprintMesh.geometry) {
                footprintMesh.geometry.dispose();
            }
        }
    }
    
    /**
     * Clear all footprints
     */
    clearAll() {
        while (this.footprintGroup.children.length > 0) {
            const footprint = this.footprintGroup.children[0];
            this.removeFootprint(footprint);
        }
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
        
        // Dispose materials
        for (const material of this.materials.values()) {
            material.dispose();
        }
        this.materials.clear();
        
        // Remove from scene
        if (this.footprintGroup.parent) {
            this.footprintGroup.parent.remove(this.footprintGroup);
        }
        
        this.initialized = false;
    }
}

// Make globally accessible
window.BGCSFootprintOverlay = BGCSFootprintOverlay;