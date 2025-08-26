/**
 * WebSocket Client for BGCS Real-time Communication
 * Handles bidirectional communication with the backend simulation engine
 */

class BGCSWebSocketClient {
    constructor(url = null) {
        this.url = url || `ws://${window.location.hostname}:8000/ws`;
        this.websocket = null;
        this.clientId = null;
        this.connected = false;
        this.connecting = false;
        
        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start at 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.reconnectTimer = null;
        
        // Message handling
        this.messageHandlers = new Map();
        this.responseCallbacks = new Map();
        this.messageId = 0;
        
        // Connection state callbacks
        this.onConnectedCallbacks = [];
        this.onDisconnectedCallbacks = [];
        
        // Performance tracking
        this.lastPingTime = null;
        this.latency = 0;
        this.messageCount = 0;
        
        this.setupMessageHandlers();
    }
    
    /**
     * Setup default message handlers
     */
    setupMessageHandlers() {
        this.onMessage('connection_established', (data) => {
            console.log('🔌 WebSocket connection established');
            this.clientId = data.client_id;
        });
        
        this.onMessage('pong', (data) => {
            if (this.lastPingTime) {
                this.latency = Date.now() - this.lastPingTime;
                this.lastPingTime = null;
            }
        });
        
        this.onMessage('error', (data) => {
            console.error('WebSocket error from server:', data.message);
        });
        
        this.onMessage('command_success', (data) => {
            // Success responses handled by promise callbacks
        });
    }
    
    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.connected || this.connecting) {
            console.log('Already connected or connecting');
            return;
        }
        
        this.connecting = true;
        
        try {
            this.websocket = new WebSocket(this.url);
            
            this.websocket.onopen = () => {
                this.connected = true;
                this.connecting = false;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                
                // Clear any reconnect timer
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                
                // Notify connection callbacks
                this.onConnectedCallbacks.forEach(callback => {
                    try {
                        callback(this.clientId);
                    } catch (error) {
                        console.error('Error in connection callback:', error);
                    }
                });
                
                // Start ping interval
                this.startPingInterval();
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    // Handle JSON with potential Infinity and NaN values
                    let cleanedData = event.data
                        .replace(/:\s*Infinity/g, ': 1000000')
                        .replace(/:\s*-Infinity/g, ': -1000000')
                        .replace(/:\s*NaN/g, ': 0');
                    
                    const message = JSON.parse(cleanedData);
                    // Only log important messages to reduce console spam
                    if (message.type === 'connection_established' || message.type === 'error') {
                        console.log('📨 WebSocket message received:', message.type, message);
                    }
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error.message);
                    
                    // Try to extract message type for debugging
                    try {
                        const typeMatch = event.data.match(/"type":\s*"([^"]+)"/);
                        if (typeMatch && typeMatch[1] === 'state_update') {
                            // State update parsing failed - continue silently
                            return;
                        }
                    } catch (e) {
                        // Ignore secondary parsing errors
                    }
                    
                    // Emit error event for handling
                    if (this.messageHandlers.has('parse_error')) {
                        const handlers = this.messageHandlers.get('parse_error');
                        handlers.forEach(handler => handler({ 
                            error: error.message, 
                            rawData: event.data.substring(0, 200) 
                        }));
                    }
                }
            };
            
            this.websocket.onclose = (event) => {
                this.handleDisconnection();
            };
            
            this.websocket.onerror = (error) => {
                this.connecting = false;
                this.handleDisconnection();
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.connecting = false;
            this.handleDisconnection();
        }
    }
    
    /**
     * Handle WebSocket disconnection
     */
    handleDisconnection() {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.clientId = null;
        
        // Stop ping interval
        this.stopPingInterval();
        
        if (wasConnected) {
            // Notify disconnection callbacks
            this.onDisconnectedCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (error) {
                    console.error('Error in disconnection callback:', error);
                }
            });
        }
        
        // Attempt reconnection
        this.attemptReconnection();
    }
    
    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Giving up.');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }
    
    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.stopPingInterval();
        
        if (this.websocket) {
            this.websocket.close(1000, 'Client disconnect');
            this.websocket = null;
        }
        
        this.connected = false;
        this.connecting = false;
        this.clientId = null;
    }
    
    /**
     * Send message to server
     */
    send(messageType, data = {}, expectResponse = false) {
        if (!this.connected || !this.websocket) {
            console.warn('Cannot send message: WebSocket not connected');
            return Promise.reject(new Error('WebSocket not connected'));
        }
        
        const messageId = expectResponse ? ++this.messageId : null;
        const message = {
            type: messageType,
            data: data,
            message_id: messageId,
            client_id: this.clientId
        };
        
        try {
            this.websocket.send(JSON.stringify(message));
            this.messageCount++;
            
            if (expectResponse && messageId) {
                // Return promise that resolves when response is received
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.responseCallbacks.delete(messageId);
                        reject(new Error('Message timeout'));
                    }, 5000); // 5 second timeout
                    
                    this.responseCallbacks.set(messageId, {
                        resolve,
                        reject,
                        timeout
                    });
                });
            }
            
            return Promise.resolve();
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return Promise.reject(error);
        }
    }
    
    /**
     * Handle incoming message
     */
    handleMessage(message) {
        const messageType = message.type;
        const data = message.data;
        const messageId = message.message_id;
        
        // Handle response callbacks
        if (messageId && this.responseCallbacks.has(messageId)) {
            const callback = this.responseCallbacks.get(messageId);
            this.responseCallbacks.delete(messageId);
            clearTimeout(callback.timeout);
            callback.resolve(data);
            return;
        }
        
        // Handle message type handlers
        if (this.messageHandlers.has(messageType)) {
            const handlers = this.messageHandlers.get(messageType);
            handlers.forEach(handler => {
                try {
                    handler(data, message);
                } catch (error) {
                    console.error(`Error in ${messageType} handler:`, error);
                }
            });
        } else {
            // Silently ignore unhandled message types
        }
    }
    
    /**
     * Register message handler
     */
    onMessage(messageType, handler) {
        if (!this.messageHandlers.has(messageType)) {
            this.messageHandlers.set(messageType, []);
        }
        this.messageHandlers.get(messageType).push(handler);
    }
    
    /**
     * Remove message handler
     */
    offMessage(messageType, handler) {
        if (this.messageHandlers.has(messageType)) {
            const handlers = this.messageHandlers.get(messageType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * Register connection callback
     */
    onConnected(callback) {
        this.onConnectedCallbacks.push(callback);
    }
    
    /**
     * Register disconnection callback
     */
    onDisconnected(callback) {
        this.onDisconnectedCallbacks.push(callback);
    }
    
    /**
     * Start ping interval to maintain connection
     */
    startPingInterval() {
        this.stopPingInterval(); // Ensure no duplicate intervals
        
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.lastPingTime = Date.now();
                this.send('ping', { timestamp: this.lastPingTime });
            }
        }, 30000); // Ping every 30 seconds
    }
    
    /**
     * Stop ping interval
     */
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            clientId: this.clientId,
            latency: this.latency,
            messageCount: this.messageCount,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    // Command methods for common operations
    
    /**
     * Request current state from server
     */
    async requestState() {
        return this.send('get_state', {}, true);
    }
    
    /**
     * Spawn entity
     */
    async spawnEntity(type, id = null, position = { x: 0, y: 0, z: 0 }, properties = {}) {
        return this.send('spawn_entity', {
            type,
            id,
            position,
            properties
        }, true);
    }
    
    /**
     * Set entity mode
     */
    async setEntityMode(entityId, mode) {
        return this.send('set_entity_mode', {
            entity_id: entityId,
            mode
        }, true);
    }
    
    /**
     * Set entity path
     */
    async setEntityPath(entityId, path, replace = true) {
        return this.send('set_entity_path', {
            entity_id: entityId,
            path,
            replace
        }, true);
    }
    
    /**
     * Delete entity
     */
    async deleteEntity(entityId) {
        return this.send('delete_entity', {
            entity_id: entityId
        }, true);
    }
    
    /**
     * Select entity
     */
    async selectEntity(entityId, multiSelect = false) {
        return this.send('select_entity', {
            entity_id: entityId,
            multi_select: multiSelect
        }, true);
    }
    
    /**
     * Deselect entity
     */
    async deselectEntity(entityId) {
        return this.send('deselect_entity', {
            entity_id: entityId
        }, true);
    }
    
    /**
     * Clear selection
     */
    async clearSelection() {
        return this.send('clear_selection', {}, true);
    }
    
    /**
     * Control simulation
     */
    async controlSimulation(command, options = {}) {
        return this.send('simulation_control', {
            command,
            ...options
        }, true);
    }
    
    /**
     * Send chat message
     */
    async sendChatMessage(message, sender = null) {
        return this.send('chat_message', {
            message,
            sender: sender || this.clientId
        });
    }
}

// Export for use in other modules
window.BGCSWebSocketClient = BGCSWebSocketClient;