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
        }
        
        
        // Recalculate normals for proper lighting
        geometry.computeVertexNormals();
        
        // Add vertex colors to geometry for heightmap colormap
        this.addVertexColors(geometry);
        
        // Create terrain material with vertex colors disabled by default
        this.solidMaterial = new THREE.MeshLambertMaterial({
            color: 0x2a2a2a, // Same dark gray as existing ground
            transparent: true,
            opacity: 0.8,
            wireframe: false,
            vertexColors: false // Start with colormap disabled
        });
        
        // Create colormap material - military tactical appearance
        this.colormapMaterial = new THREE.MeshLambertMaterial({
            transparent: false, // Solid military appearance
            wireframe: false,
            vertexColors: true, // Use vertex colors for heightmap
            side: THREE.FrontSide // Optimize for performance
        });
        
        // Create separate wireframe material with subtle color
        this.wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x666666, // Light gray for wireframe
            transparent: true,
            opacity: 0.4, // More transparent
            wireframe: true
        });
        
        // State tracking
        this.colormapEnabled = false;
        this.contourLinesEnabled = false;
        
        const material = this.solidMaterial;
        
        
        // Create mesh
        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.terrainMesh.position.set(0, 0, 0); // Position at origin
        this.terrainMesh.receiveShadow = false; // Disable shadows for debugging
        this.terrainMesh.castShadow = false;
        
        // Add to scene
        this.scene.add(this.terrainMesh);
        
        // Create square grid overlay
        this.createSquareGrid();
        
        // Initialize contour lines placeholder (generate on demand)
        this.contourLines = null;
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
     * Create contour lines for elevation visualization
     */
    createContourLines() {
        if (!this.heightData) return;
        
        // Calculate height range and contour intervals
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        for (let i = 0; i < this.heightData.data.length; i++) {
            const height = this.heightData.data[i];
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
        }
        
        const heightRange = maxHeight - minHeight;
        const baseInterval = Math.max(2, heightRange / 8); // Reduce to 8 contour lines max
        
        // Generate fewer contour elevations for performance
        const contourElevations = [];
        for (let elevation = Math.ceil(minHeight / baseInterval) * baseInterval; 
             elevation <= maxHeight; 
             elevation += baseInterval) {
            contourElevations.push(elevation);
        }
        
        // Reduce logging for performance
        
        // Generate contour line vertices with lower resolution
        const vertices = [];
        const resolution = 32; // Reduce resolution from 64 to 32 for performance
        const stepX = this.terrainSize / resolution;
        const stepZ = this.terrainSize / resolution;
        
        // For each contour elevation, trace the iso-curves
        contourElevations.forEach(targetElevation => {
            const contourPoints = this.traceContourLevel(targetElevation, resolution, stepX, stepZ);
            
            // Add points to vertices array
            contourPoints.forEach(segment => {
                if (segment.length >= 2) {
                    for (let i = 0; i < segment.length - 1; i++) {
                        const p1 = segment[i];
                        const p2 = segment[i + 1];
                        
                        // Convert world coordinates to plane coordinates (reverse the rotation transform)
                        vertices.push(p1.x, -p1.z, p1.y); // Convert back to plane space
                        vertices.push(p2.x, -p2.z, p2.y);
                    }
                }
            });
        });
        
        // Create contour lines geometry
        const contourGeometry = new THREE.BufferGeometry();
        contourGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        // Create material with military styling
        const contourMaterial = new THREE.LineBasicMaterial({
            color: 0xcccccc, // Light gray
            transparent: true,
            opacity: 0.4, // Semi-transparent
            linewidth: 1,
            depthTest: true,
            depthWrite: false // Don't write to depth buffer for proper blending
        });
        
        // Create contour lines object
        this.contourLines = new THREE.LineSegments(contourGeometry, contourMaterial);
        this.contourLines.rotation.x = -Math.PI / 2; // Same rotation as terrain
        this.contourLines.position.set(0, 0.1, 0); // Slightly above terrain
        this.contourLines.visible = false; // Start hidden
        this.scene.add(this.contourLines);
        
        // Contour generation complete
    }
    
    /**
     * Trace contour lines at a specific elevation using marching squares algorithm
     */
    traceContourLevel(targetElevation, resolution, stepX, stepZ) {
        const contourSegments = [];
        
        // Sample grid for marching squares
        for (let i = 0; i < resolution - 1; i++) {
            for (let j = 0; j < resolution - 1; j++) {
                const x1 = this.minX + i * stepX;
                const z1 = this.minZ + j * stepZ;
                const x2 = x1 + stepX;
                const z2 = z1 + stepZ;
                
                // Sample heights at grid corners
                const h00 = this.sampleHeight(x1, z1); // Bottom-left
                const h10 = this.sampleHeight(x2, z1); // Bottom-right  
                const h01 = this.sampleHeight(x1, z2); // Top-left
                const h11 = this.sampleHeight(x2, z2); // Top-right
                
                // Check if contour passes through this cell
                const minH = Math.min(h00, h10, h01, h11);
                const maxH = Math.max(h00, h10, h01, h11);
                
                if (targetElevation >= minH && targetElevation <= maxH) {
                    // Generate contour segment for this cell
                    const segment = this.generateContourSegment(
                        targetElevation,
                        { x: x1, z: z1, h: h00 },
                        { x: x2, z: z1, h: h10 },
                        { x: x1, z: z2, h: h01 },
                        { x: x2, z: z2, h: h11 }
                    );
                    
                    if (segment.length > 0) {
                        contourSegments.push(segment);
                    }
                }
            }
        }
        
        return contourSegments;
    }
    
    /**
     * Generate contour segment within a grid cell using linear interpolation
     */
    generateContourSegment(targetElevation, p00, p10, p01, p11) {
        const points = [];
        
        // Check each edge of the cell for intersections
        const edges = [
            { p1: p00, p2: p10 }, // Bottom edge
            { p1: p10, p2: p11 }, // Right edge
            { p1: p11, p2: p01 }, // Top edge
            { p1: p01, p2: p00 }  // Left edge
        ];
        
        edges.forEach(edge => {
            const { p1, p2 } = edge;
            
            // Check if contour crosses this edge
            if ((p1.h <= targetElevation && p2.h >= targetElevation) ||
                (p1.h >= targetElevation && p2.h <= targetElevation)) {
                
                // Linear interpolation to find intersection point
                const t = (targetElevation - p1.h) / (p2.h - p1.h);
                const intersectionX = p1.x + t * (p2.x - p1.x);
                const intersectionZ = p1.z + t * (p2.z - p1.z);
                
                points.push({
                    x: intersectionX,
                    z: intersectionZ,
                    y: targetElevation + 0.2 // Slight elevation above terrain
                });
            }
        });
        
        return points;
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
     * Toggle heightmap colormap on/off
     */
    setColormapMode(enabled) {
        if (!this.terrainMesh) return;
        
        this.colormapEnabled = enabled;
        
        if (enabled) {
            this.terrainMesh.material = this.colormapMaterial;
        } else {
            this.terrainMesh.material = this.solidMaterial;
        }
    }
    
    /**
     * Check if colormap mode is enabled
     */
    isColormapMode() {
        return this.colormapEnabled;
    }
    
    /**
     * Toggle contour lines on/off
     */
    setContourLinesMode(enabled) {
        this.contourLinesEnabled = enabled;
        
        if (enabled) {
            // Generate contour lines on first enable (lazy loading)
            if (!this.contourLines) {
                this.createContourLines();
            }
            if (this.contourLines) {
                this.contourLines.visible = true;
            }
        } else {
            if (this.contourLines) {
                this.contourLines.visible = false;
            }
        }
    }
    
    /**
     * Check if contour lines mode is enabled
     */
    isContourLinesMode() {
        return this.contourLinesEnabled;
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
     * Add vertex colors based on height using military tactical color scheme
     * Navy Blue (water) -> Olive Green (lowlands) -> Military Green (terrain) -> Desert Tan (hills) -> Light Tan (peaks)
     */
    addVertexColors(geometry) {
        const vertices = geometry.attributes.position;
        const colors = new Float32Array(vertices.count * 3);
        
        // Find height range for color mapping
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        for (let i = 0; i < vertices.count; i++) {
            const height = vertices.getZ(i); // Use Z coordinate (height after rotation)
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
        }
        
        const heightRange = maxHeight - minHeight;
        
        for (let i = 0; i < vertices.count; i++) {
            const height = vertices.getZ(i); // Use Z coordinate (height after rotation)
            const normalizedHeight = heightRange > 0 ? (height - minHeight) / heightRange : 0;
            
            // Military tactical color gradient: NATO/Defense mapping standard
            let r, g, b;
            
            if (normalizedHeight < 0.2) {
                // Very low areas - Deep Navy Blue (water bodies, marshes)
                const t = normalizedHeight / 0.2;
                r = 0.05 + t * 0.1;  // 0.05 to 0.15 (very dark red)
                g = 0.1 + t * 0.15;  // 0.1 to 0.25 (dark green)
                b = 0.3 + t * 0.2;   // 0.3 to 0.5 (navy blue)
            } else if (normalizedHeight < 0.4) {
                // Low areas - Dark Olive Green (lowlands, valleys)
                const t = (normalizedHeight - 0.2) / 0.2;
                r = 0.15 + t * 0.2;  // 0.15 to 0.35 (olive)
                g = 0.25 + t * 0.25; // 0.25 to 0.5 (military green)
                b = 0.5 - t * 0.35;  // 0.5 to 0.15 (reduce blue)
            } else if (normalizedHeight < 0.6) {
                // Mid areas - Military Green (standard terrain)
                const t = (normalizedHeight - 0.4) / 0.2;
                r = 0.35 + t * 0.1;  // 0.35 to 0.45 (muted brown-green)
                g = 0.5 + t * 0.1;   // 0.5 to 0.6 (forest green)
                b = 0.15 + t * 0.05; // 0.15 to 0.2 (minimal blue)
            } else if (normalizedHeight < 0.8) {
                // High areas - Desert Tan/Brown (hills, ridges)
                const t = (normalizedHeight - 0.6) / 0.2;
                r = 0.45 + t * 0.3;  // 0.45 to 0.75 (tan/brown)
                g = 0.6 - t * 0.2;   // 0.6 to 0.4 (reduce green)
                b = 0.2 - t * 0.1;   // 0.2 to 0.1 (minimal blue)
            } else {
                // Very high areas - Light Desert/Gray (peaks, exposed rock)
                const t = (normalizedHeight - 0.8) / 0.2;
                r = 0.75 + t * 0.15; // 0.75 to 0.9 (light tan)
                g = 0.4 + t * 0.3;   // 0.4 to 0.7 (add lightness)
                b = 0.1 + t * 0.2;   // 0.1 to 0.3 (slight blue for rock)
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
        
        // Convert world coordinates to heightmap coordinates
        const normalizedX = (worldX - this.minX) / (this.maxX - this.minX);
        const normalizedZ = (worldZ - this.minZ) / (this.maxZ - this.minZ);
        
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
        
        if (this.contourLines) {
            this.scene.remove(this.contourLines);
            this.contourLines.geometry.dispose();
            this.contourLines.material.dispose();
            this.contourLines = null;
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