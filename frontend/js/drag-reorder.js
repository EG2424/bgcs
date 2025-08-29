/**
 * Simple Drag-and-Drop Reordering for BGCS
 * Requirements: No cursor changes, 120ms threshold, insertion line, undo
 */

class DragReorder {
    constructor(app) {
        this.app = app;
        this.isDragging = false;
        this.dragItem = null;
        this.startTime = 0;
        this.startPos = { x: 0, y: 0 };
        this.dragThreshold = { time: 120, distance: 4 };
        this.init();
    }
    
    init() {
        // Event listeners for both entity and group lists
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // Prevent default drag behavior
        document.addEventListener('dragstart', (e) => {
            if (e.target.closest('.entity-item, .group-item')) {
                e.preventDefault();
            }
        });
    }
    
    onMouseDown(e) {
        const item = e.target.closest('.entity-item, .group-item');
        if (!item || e.ctrlKey || e.shiftKey) return;
        
        this.dragItem = item;
        this.startTime = Date.now();
        this.startPos = { x: e.clientX, y: e.clientY };
    }
    
    onMouseMove(e) {
        if (!this.dragItem) return;
        
        const deltaTime = Date.now() - this.startTime;
        const deltaDistance = Math.sqrt(
            Math.pow(e.clientX - this.startPos.x, 2) + 
            Math.pow(e.clientY - this.startPos.y, 2)
        );
        
        if (!this.isDragging && (deltaTime >= this.dragThreshold.time || deltaDistance >= this.dragThreshold.distance)) {
            this.startDrag();
        }
        
        if (this.isDragging) {
            this.updateDrag(e);
        }
    }
    
    onMouseUp(e) {
        if (this.isDragging) {
            this.endDrag();
        }
        this.cleanup();
    }
    
    startDrag() {
        this.isDragging = true;
        this.dragItem.style.opacity = '0.5';
        this.createInsertionLine();
    }
    
    updateDrag(e) {
        const container = this.getContainer();
        if (!container) return;
        
        const items = Array.from(container.children).filter(item => 
            item !== this.dragItem && item.classList.contains(this.dragItem.classList[0])
        );
        
        let insertBefore = null;
        let minDistance = Infinity;
        
        for (const item of items) {
            const rect = item.getBoundingClientRect();
            const itemCenter = rect.top + rect.height / 2;
            const distance = Math.abs(e.clientY - itemCenter);
            
            if (distance < minDistance) {
                minDistance = distance;
                insertBefore = e.clientY < itemCenter ? item : item.nextSibling;
            }
        }
        
        this.showInsertionLine(insertBefore);
    }
    
    endDrag() {
        const container = this.getContainer();
        const insertLine = document.querySelector('.drag-insertion-line');
        
        if (insertLine && insertLine.dataset.insertBefore) {
            const targetElement = container.querySelector(`[data-entity-id="${insertLine.dataset.insertBefore}"], [data-group-id="${insertLine.dataset.insertBefore}"]`);
            if (targetElement) {
                container.insertBefore(this.dragItem, targetElement);
            } else {
                container.appendChild(this.dragItem);
            }
            
            this.sendOrderUpdate();
        }
    }
    
    getContainer() {
        if (this.dragItem.classList.contains('entity-item')) {
            return document.getElementById('entity-list');
        } else if (this.dragItem.classList.contains('group-item')) {
            return document.getElementById('groups-list');
        }
        return null;
    }
    
    createInsertionLine() {
        let line = document.querySelector('.drag-insertion-line');
        if (!line) {
            line = document.createElement('div');
            line.className = 'drag-insertion-line';
            line.style.cssText = `
                position: fixed;
                height: 2px;
                background: #007AFF;
                display: none;
                z-index: 9999;
                pointer-events: none;
            `;
            document.body.appendChild(line);
        }
    }
    
    showInsertionLine(beforeElement) {
        const line = document.querySelector('.drag-insertion-line');
        const container = this.getContainer();
        if (!line || !container) return;
        
        const containerRect = container.getBoundingClientRect();
        line.style.left = containerRect.left + 'px';
        line.style.width = containerRect.width + 'px';
        line.style.display = 'block';
        
        if (beforeElement && beforeElement.parentNode === container) {
            const rect = beforeElement.getBoundingClientRect();
            line.style.top = (rect.top - 1) + 'px';
            line.dataset.insertBefore = beforeElement.dataset.entityId || beforeElement.dataset.groupId;
        } else {
            const rect = container.getBoundingClientRect();
            line.style.top = (rect.bottom - 1) + 'px';
            line.dataset.insertBefore = '';
        }
    }
    
    sendOrderUpdate() {
        const container = this.getContainer();
        if (!container) return;
        
        const items = Array.from(container.children)
            .filter(item => item.classList.contains(this.dragItem.classList[0]));
        
        const orderedIds = items.map(item => item.dataset.entityId || item.dataset.groupId);
        
        // Update sort_index data attributes
        items.forEach((item, index) => {
            item.dataset.sortIndex = index;
        });
        
        const endpoint = this.dragItem.classList.contains('entity-item') ? 
            '/api/assets/order' : '/api/groups/order';
        
        fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordered_ids: orderedIds })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .catch(error => {
            console.error('Order update failed:', error);
        });
    }
    
    cleanup() {
        if (this.dragItem) {
            this.dragItem.style.opacity = '';
        }
        
        const line = document.querySelector('.drag-insertion-line');
        if (line) line.style.display = 'none';
        
        this.isDragging = false;
        this.dragItem = null;
    }
}

// Initialize when app is ready
function initializeDragReorder(attempts = 0) {
    const maxAttempts = 100; // 5 seconds max (50ms * 100)
    
    if (window.bgcsApp) {
        window.dragReorder = new DragReorder(window.bgcsApp);
        console.log('Drag reorder system initialized');
    } else if (attempts < maxAttempts) {
        // App not ready yet, try again in 50ms
        setTimeout(() => initializeDragReorder(attempts + 1), 50);
    } else {
        console.error('Failed to initialize drag reorder system: app not found after 5 seconds');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Start checking for app initialization
    initializeDragReorder();
});