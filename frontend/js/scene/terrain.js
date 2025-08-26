/**
 * BGCS Terrain System - Heightmap-based 3D terrain generation
 * Loads grayscale heightmaps and creates 3D terrain meshes
 * Designed for easy integration with satellite/LIDAR data
 */

class BGCSTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.terrainSize = 500; // 500x500 meters
        this.terrainSegments = 128; // Increase mesh density
        this.heightScale = 50; // Reduce height scale for more visible terrain
        this.heightmapUrl = '/static/assets/maps/heightmap.png';
        
        // Terrain bounds for height sampling
        this.minX = -this.terrainSize / 2;
        this.maxX = this.terrainSize / 2;
        this.minZ = -this.terrainSize / 2;
        this.maxZ = this.terrainSize / 2;
        
        // Height data for sampling
        this.heightData = null;
        this.heightmapSize = 1024;
        
    }
    
    /**
     * Load heightmap and generate terrain
     */
    async loadTerrain() {
        try {
            // Load heightmap image
            const heightmapImage = await this.loadHeightmapImage();
            
            // Extract height data
            this.heightData = this.extractHeightData(heightmapImage);
            
            // Generate terrain mesh
            this.generateTerrainMesh();
            
            return true;
            
        } catch (error) {
            console.error('Failed to load terrain:', error);
            return false;
        }
    }
    
    /**
     * Load heightmap image
     */
    loadHeightmapImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                resolve(img);
            };
            
            img.onerror = (error) => {
                console.error('Failed to load heightmap image:', error);
                reject(new Error('Could not load heightmap image'));
            };
            
            img.src = this.heightmapUrl;
        });
    }
    
    /**
     * Extract height data from image
     */
    extractHeightData(image) {
        // Create canvas to read pixel data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        
        // Draw image and get pixel data
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        
        // Convert to height array (using red channel for grayscale)
        const heights = new Float32Array(canvas.width * canvas.height);
        for (let i = 0; i < heights.length; i++) {
            const pixelIndex = i * 4;
            const gray = pixels[pixelIndex]; // Red channel (grayscale)
            heights[i] = (gray / 255.0) * this.heightScale; // Convert to height
        }
        
        return { data: heights, width: canvas.width, height: canvas.height };
    }
    
    /**
     * Generate 3D terrain mesh from height data
     */
    generateTerrainMesh() {
        const geometry = new THREE.PlaneGeometry(
            this.terrainSize, 
            this.terrainSize, 
            this.terrainSegments - 1, 
            this.terrainSegments - 1
        );
        
        // Get vertex positions
        const vertices = geometry.attributes.position;
        
        // Apply heights to vertices
        // Debug: Log first few vertices to understand coordinate system
        for (let i = 0; i < Math.min(5, vertices.count); i++) {
            const x = vertices.getX(i);
            const y = vertices.getY(i);
            const z = vertices.getZ(i);
            console.log(`Vertex ${i}: plane coords (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
        }
        
        // COORDINATE SYSTEM FIX:
        // PlaneGeometry creates vertices in XY plane: (x, y, 0)  
        // After rotation by -90° around X-axis: (x, 0, -y) in world coordinates
        // This means: planeY becomes -worldZ after rotation
        for (let i = 0; i < vertices.count; i++) {
            const planeX = vertices.getX(i);
            const planeY = vertices.getY(i);
            
            // Correct coordinate mapping after rotation:
            const worldX = planeX;
            const worldZ = -planeY;  // CRITICAL FIX: planeY becomes -worldZ after rotation
            
            // Sample height at world coordinates
            const height = this.sampleHeight(worldX, worldZ);
            
            // Set the height as Z coordinate in plane space (becomes Y in world after rotation)
            vertices.setZ(i, height);
            
            // Debug first few vertices
            if (i < 3) {
                console.log(`  Plane(${planeX.toFixed(2)}, ${planeY.toFixed(2)}) -> World(${worldX.toFixed(2)}, ?, ${worldZ.toFixed(2)}) -> height: ${height.toFixed(2)}`);
            }
        }
        
        
        // Recalculate normals for proper lighting
        geometry.computeVertexNormals();
        
        // Create terrain material - can switch between solid and wireframe
        this.solidMaterial = new THREE.MeshBasicMaterial({
            color: 0x2a2a2a, // Same dark gray as existing ground
            transparent: true,
            opacity: 0.8,
            wireframe: false
        });
        
        // Create separate wireframe material with subtle color
        this.wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x666666, // Light gray for wireframe
            transparent: true,
            opacity: 0.4, // More transparent
            wireframe: true
        });
        
        const material = this.solidMaterial;
        
        
        // Create mesh
        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.terrainMesh.position.set(0, 0, 0); // Position at origin
        this.terrainMesh.receiveShadow = false; // Disable shadows for debugging
        this.terrainMesh.castShadow = false;
        
        // Add to scene
        this.scene.add(this.terrainMesh);
        
        // Debug terrain coordinate system
        console.log(`Terrain coordinate system:
          Size: ${this.terrainSize}m x ${this.terrainSize}m
          Bounds: X(${this.minX} to ${this.maxX}), Z(${this.minZ} to ${this.maxZ})
          Heightmap: ${this.heightData.width}x${this.heightData.height}
          Mesh rotation: ${this.terrainMesh.rotation.x} radians around X-axis`);
        
        // Create square grid overlay
        this.createSquareGrid();
    }
    
    /**
     * Create square grid that follows terrain contours
     */
    createSquareGrid() {
        const terrainSize = this.terrainSize; // 500m
        const gridSpacing = 10; // 10m spacing for smaller squares
        const divisions = terrainSize / gridSpacing; // 20 divisions
        const heightOffset = 0.2; // Small offset above terrain
        
        const vertices = [];
        
        // Create grid lines in terrain coordinate system (X-Y plane, then rotate)
        // Use same coordinate mapping as terrain mesh generation
        for (let i = 0; i <= divisions; i++) {
            const coord = -terrainSize / 2 + i * gridSpacing;
            
            // Vertical lines (in plane space, becomes lines parallel to X after rotation)
            for (let j = 0; j < divisions; j++) {
                const planeY1 = -terrainSize / 2 + j * gridSpacing;
                const planeY2 = -terrainSize / 2 + (j + 1) * gridSpacing;
                
                // Convert to world coordinates (same as terrain mesh)
                const worldZ1 = -planeY1;  // Apply same coordinate fix
                const worldZ2 = -planeY2;
                
                const height1 = this.sampleHeight(coord, worldZ1) + heightOffset;
                const height2 = this.sampleHeight(coord, worldZ2) + heightOffset;
                
                vertices.push(coord, planeY1, height1);
                vertices.push(coord, planeY2, height2);
            }
            
            // Horizontal lines (in plane space, becomes lines parallel to Z after rotation)
            for (let j = 0; j < divisions; j++) {
                const x1 = -terrainSize / 2 + j * gridSpacing;
                const x2 = -terrainSize / 2 + (j + 1) * gridSpacing;
                
                // Convert plane Y to world Z
                const worldZ = -coord;
                
                const height1 = this.sampleHeight(x1, worldZ) + heightOffset;
                const height2 = this.sampleHeight(x2, worldZ) + heightOffset;
                
                vertices.push(x1, coord, height1);
                vertices.push(x2, coord, height2);
            }
        }
        
        // Create line geometry
        const gridGeometry = new THREE.BufferGeometry();
        gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        // Create subtle grid material that always renders on top
        const gridMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.3,
            depthTest: false // Always render on top of terrain
        });
        
        // Create grid lines
        this.squareGrid = new THREE.LineSegments(gridGeometry, gridMaterial);
        this.squareGrid.rotation.x = -Math.PI / 2; // Same rotation as terrain
        this.squareGrid.position.set(0, 0, 0);
        this.squareGrid.visible = true; // Start visible by default
        this.scene.add(this.squareGrid);
    }
    
    /**
     * Toggle wireframe mode for terrain
     */
    setWireframeMode(enabled) {
        if (this.squareGrid) {
            this.squareGrid.visible = enabled;
        }
        // Keep terrain in solid mode always
    }
    
    /**
     * Check if wireframe mode is enabled
     */
    isWireframeMode() {
        return this.squareGrid && this.squareGrid.visible;
    }
    
    /**
     * Get terrain height at world position (accounts for coordinate system)
     */
    getTerrainHeightAtWorldPos(worldX, worldZ) {
        if (!this.heightData) return 0;
        
        // Convert world coordinates to heightmap coordinates
        const normalizedX = (worldX + this.terrainSize / 2) / this.terrainSize; // 0 to 1
        const normalizedZ = (worldZ + this.terrainSize / 2) / this.terrainSize; // 0 to 1
        
        // Clamp to valid range
        const clampedX = Math.max(0, Math.min(1, normalizedX));
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        
        // Convert to heightmap pixel coordinates
        const pixelX = Math.floor(clampedX * (this.heightData.width - 1));
        const pixelZ = Math.floor(clampedZ * (this.heightData.height - 1));
        
        // Sample height
        const index = pixelZ * this.heightData.width + pixelX;
        return this.heightData.data[index] || 0;
    }
    
    /**
     * Add vertex colors based on height (green valleys, brown hills)
     */
    addVertexColors(geometry) {
        const vertices = geometry.attributes.position;
        const colors = new Float32Array(vertices.count * 3);
        
        // Find height range for color mapping
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        for (let i = 0; i < vertices.count; i++) {
            const height = vertices.getY(i);
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
        }
        
        const heightRange = maxHeight - minHeight;
        
        for (let i = 0; i < vertices.count; i++) {
            const height = vertices.getY(i);
            const normalizedHeight = (height - minHeight) / heightRange;
            
            // Color gradient from green (low) to brown/gray (high)
            let r, g, b;
            
            if (normalizedHeight < 0.3) {
                // Low areas - bright green (valleys, flat areas)
                r = 0.4 + normalizedHeight * 0.4;
                g = 0.7 + normalizedHeight * 0.3;
                b = 0.3 + normalizedHeight * 0.3;
            } else if (normalizedHeight < 0.7) {
                // Mid areas - bright brown/green mix
                const t = (normalizedHeight - 0.3) / 0.4;
                r = 0.6 + t * 0.3;
                g = 0.6 + t * 0.2;
                b = 0.4 + t * 0.2;
            } else {
                // High areas - light gray/brown (peaks)
                const t = (normalizedHeight - 0.7) / 0.3;
                r = 0.7 + t * 0.2;
                g = 0.6 + t * 0.2;
                b = 0.5 + t * 0.2;
            }
            
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    
    /**
     * Sample height at world coordinates (for entity positioning)
     */
    sampleHeight(worldX, worldZ) {
        if (!this.heightData) {
            return 0;
        }
        
        // Debug coordinate mapping
        console.log(`sampleHeight input: worldX=${worldX.toFixed(2)}, worldZ=${worldZ.toFixed(2)}`);
        
        // Convert world coordinates to heightmap coordinates
        const normalizedX = (worldX - this.minX) / (this.maxX - this.minX);
        const normalizedZ = (worldZ - this.minZ) / (this.maxZ - this.minZ);
        
        console.log(`  normalized: X=${normalizedX.toFixed(3)}, Z=${normalizedZ.toFixed(3)}`);
        
        // Clamp to valid range
        const clampedX = Math.max(0, Math.min(1, normalizedX));
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        
        // Convert to heightmap pixel coordinates
        const pixelX = Math.floor(clampedX * (this.heightData.width - 1));
        const pixelZ = Math.floor(clampedZ * (this.heightData.height - 1));
        
        console.log(`  pixel coords: X=${pixelX}, Z=${pixelZ}`);
        
        // Sample height
        const index = pixelZ * this.heightData.width + pixelX;
        const height = this.heightData.data[index] || 0;
        
        console.log(`  sampled height: ${height.toFixed(2)}`);
        
        return height;
    }
    
    /**
     * Get terrain height at specific world position (public API)
     */
    getHeightAt(x, z) {
        return this.sampleHeight(x, z);
    }
    
    /**
     * Check if position is within terrain bounds
     */
    isInBounds(x, z) {
        return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
    }
    
    /**
     * Get terrain bounds
     */
    getBounds() {
        return {
            minX: this.minX,
            maxX: this.maxX,
            minZ: this.minZ,
            maxZ: this.maxZ,
            size: this.terrainSize
        };
    }
    
    /**
     * Dispose terrain resources
     */
    dispose() {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh.geometry.dispose();
            this.terrainMesh = null;
        }
        
        if (this.squareGrid) {
            this.scene.remove(this.squareGrid);
            this.squareGrid.geometry.dispose();
            this.squareGrid.material.dispose();
            this.squareGrid = null;
        }
        
        // Dispose both materials
        if (this.solidMaterial) {
            this.solidMaterial.dispose();
            this.solidMaterial = null;
        }
        
        if (this.wireframeMaterial) {
            this.wireframeMaterial.dispose();
            this.wireframeMaterial = null;
        }
        
        this.heightData = null;
    }
    
    /**
     * Update heightmap URL for easy swapping
     */
    setHeightmapUrl(url) {
        this.heightmapUrl = url;
    }
}