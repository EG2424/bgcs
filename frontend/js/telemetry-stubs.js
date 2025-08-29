class TelemetryStubs {
    constructor() {
        this.isEnabled = false;
        this.isPaused = false;
        this.logEntries = [];
        this.maxEntries = 5000;
        this.intervals = new Map();
        this.missionTime = 0;
        this.entities = ['DRONE_001', 'DRONE_002', 'TARGET_001'];
        
        this.init();
    }
    
    init() {
        // Check if stubs are enabled
        if (window.BGCS_CONFIG && window.BGCS_CONFIG.LOG_STUBS) {
            this.isEnabled = true;
            this.maxEntries = window.BGCS_CONFIG.MAX_LOG_ENTRIES || 5000;
            this.startStubGeneration();
            console.log('Telemetry stubs enabled');
        }
    }
    
    startStubGeneration() {
        if (!this.isEnabled) return;
        
        // Mission time counter (increments every second)
        this.intervals.set('mission_time', setInterval(() => {
            this.missionTime++;
        }, 1000));
        
        // MAVLink-style messages
        this.startMAVLinkStubs();
        
        // ROS2-style messages  
        this.startROS2Stubs();
        
        // Random events
        this.startEventStubs();
    }
    
    startMAVLinkStubs() {
        const config = window.BGCS_CONFIG?.STUB_MAVLINK_FREQUENCY || {};
        
        // HEARTBEAT messages
        if (config.HEARTBEAT) {
            this.intervals.set('heartbeat', setInterval(() => {
                this.entities.forEach(entity => {
                    this.addLogEntry({
                        timestamp: Date.now(),
                        missionTime: this.missionTime,
                        level: 'SYS',
                        entity: entity,
                        message: `HEARTBEAT type=2 autopilot=3 base_mode=81 custom_mode=0 system_status=4`
                    });
                });
            }, config.HEARTBEAT));
        }
        
        // GLOBAL_POSITION_INT messages
        if (config.GLOBAL_POSITION_INT) {
            this.intervals.set('position', setInterval(() => {
                this.entities.forEach(entity => {
                    if (entity.startsWith('DRONE')) {
                        const lat = (40.7128 + (Math.random() - 0.5) * 0.01) * 1e7; // NYC area
                        const lon = (-74.0060 + (Math.random() - 0.5) * 0.01) * 1e7;
                        const alt = Math.floor(100 + Math.random() * 200) * 1000; // mm
                        const vx = Math.floor((Math.random() - 0.5) * 1000); // cm/s
                        const vy = Math.floor((Math.random() - 0.5) * 1000);
                        const vz = Math.floor((Math.random() - 0.5) * 200);
                        const hdg = Math.floor(Math.random() * 36000); // centidegrees
                        
                        this.addLogEntry({
                            timestamp: Date.now(),
                            missionTime: this.missionTime,
                            level: 'FCU',
                            entity: entity,
                            message: `GLOBAL_POSITION_INT lat=${lat} lon=${lon} alt=${alt} relative_alt=${alt-50000} vx=${vx} vy=${vy} vz=${vz} hdg=${hdg}`
                        });
                    }
                });
            }, config.GLOBAL_POSITION_INT));
        }
        
        // SYS_STATUS messages
        if (config.SYS_STATUS) {
            this.intervals.set('sys_status', setInterval(() => {
                this.entities.forEach(entity => {
                    if (entity.startsWith('DRONE')) {
                        const voltage = 11800 + Math.floor(Math.random() * 400); // mV
                        const current = Math.floor(Math.random() * 5000); // mA
                        const battery = Math.floor(50 + Math.random() * 50); // %
                        
                        this.addLogEntry({
                            timestamp: Date.now(),
                            missionTime: this.missionTime,
                            level: 'SYS',
                            entity: entity,
                            message: `SYS_STATUS voltage_battery=${voltage} current_battery=${current} battery_remaining=${battery}`
                        });
                    }
                });
            }, config.SYS_STATUS));
        }
    }
    
    startROS2Stubs() {
        // Simulate ROS2 topics
        setInterval(() => {
            this.entities.forEach(entity => {
                if (entity.startsWith('DRONE')) {
                    // /mavros/state topic
                    this.addLogEntry({
                        timestamp: Date.now(),
                        missionTime: this.missionTime,
                        level: 'LINK',
                        entity: entity,
                        message: `[/mavros/state] connected=true armed=${Math.random() > 0.5} guided=true system_status=4`
                    });
                }
            });
        }, 2000);
        
        // Diagnostics
        setInterval(() => {
            this.entities.forEach(entity => {
                const level = Math.random();
                let diagLevel = 'SYS';
                let message = 'All systems nominal';
                
                if (level < 0.1) {
                    diagLevel = 'ERR';
                    message = 'GPS signal lost';
                } else if (level < 0.2) {
                    diagLevel = 'WARN';
                    message = 'Low battery warning';
                }
                
                this.addLogEntry({
                    timestamp: Date.now(),
                    missionTime: this.missionTime,
                    level: diagLevel,
                    entity: entity,
                    message: `[/diagnostics] ${message}`
                });
            });
        }, 3000);
    }
    
    startEventStubs() {
        // Random mission events
        setInterval(() => {
            if (Math.random() < 0.1) { // 10% chance every 5 seconds
                const entity = this.entities[Math.floor(Math.random() * this.entities.length)];
                const events = [
                    'Waypoint reached',
                    'Target acquired',
                    'RTH initiated',
                    'Mode changed to AUTO',
                    'Geofence breach warning',
                    'Mission completed'
                ];
                
                const event = events[Math.floor(Math.random() * events.length)];
                
                this.addLogEntry({
                    timestamp: Date.now(),
                    missionTime: this.missionTime,
                    level: 'MISSION',
                    entity: entity,
                    message: event
                });
            }
        }, 5000);
    }
    
    addLogEntry(entry) {
        if (this.isPaused) return;
        
        // Add STUB indicator
        entry.isStub = true;
        
        this.logEntries.unshift(entry); // Add to beginning
        
        // Limit entries
        if (this.logEntries.length > this.maxEntries) {
            this.logEntries = this.logEntries.slice(0, this.maxEntries);
        }
        
        // Update UI
        this.renderLogEntry(entry);
    }
    
    renderLogEntry(entry) {
        const logsContent = document.getElementById('logs-content');
        if (!logsContent) return;
        
        // Check if we should show logs based on selection
        if (window.dockSystem) {
            const isLogsVisible = (
                // Show if logs tab is open in dock
                (window.dockSystem.currentTab === 'logs' && window.dockSystem.isExpanded) ||
                // OR if logs panel is floating
                window.dockSystem.floatingPanels.has('logs')
            );
            
            // Only show logs if logs is visible AND entities are selected
            if (isLogsVisible && window.dockSystem.selectedEntities.size > 0) {
                
                // Only show logs for selected entities
                const selectedEntityNames = Array.from(window.dockSystem.selectedEntities)
                    .map(entity => entity.name || entity.id || entity.callsign)
                    .filter(Boolean);
                
                if (!selectedEntityNames.includes(entry.entity)) {
                    return;
                }
            } else {
                // Don't render if no entities selected or logs panel isn't visible
                return;
            }
        } else {
            // Don't render if dock system isn't available yet
            return;
        }
        
        // Check active filters
        const activeFilters = Array.from(document.querySelectorAll('.filter-chip.active'))
            .map(chip => chip.getAttribute('data-filter'));
        
        // Skip if filtered out
        if (!activeFilters.includes('all') && !activeFilters.includes(entry.level.toLowerCase())) {
            return;
        }
        
        const logElement = document.createElement('div');
        logElement.className = 'log-entry';
        
        const missionTimeStr = this.formatMissionTime(entry.missionTime);
        const wallTimeStr = this.formatWallTime(entry.timestamp);
        
        logElement.innerHTML = `
            <span class="log-level ${entry.level.toLowerCase()}">${entry.level}</span>
            <span class="log-entity">${entry.entity.replace('drone_', '').replace(/^\d+_/, '').substring(0, 8)}</span>
            <span class="log-message">${entry.message}${entry.isStub ? ' <em style="opacity: 0.5; font-size: 7px;">[STUB]</em>' : ''}</span>
        `;
        
        // Insert at top
        logsContent.insertBefore(logElement, logsContent.firstChild);
        
        // Remove old entries from DOM (keep only visible ones + buffer)
        const entries = logsContent.querySelectorAll('.log-entry');
        if (entries.length > 200) { // Keep 200 in DOM
            for (let i = 200; i < entries.length; i++) {
                entries[i].remove();
            }
        }
    }
    
    formatMissionTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    
    formatWallTime(timestamp) {
        const date = new Date(timestamp);
        return date.toTimeString().split(' ')[0];
    }
    
    pause() {
        this.isPaused = true;
        console.log('Telemetry stubs paused');
    }
    
    resume() {
        this.isPaused = false;
        console.log('Telemetry stubs resumed');
    }
    
    clear() {
        this.logEntries = [];
        const logsContent = document.getElementById('logs-content');
        if (logsContent) {
            logsContent.innerHTML = '';
        }
        console.log('Telemetry logs cleared');
    }
    
    stop() {
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals.clear();
        console.log('Telemetry stubs stopped');
    }
    
    exportLogs(format = 'csv') {
        if (this.logEntries.length === 0) return;
        
        let content = '';
        let filename = `bgcs_telemetry_${Date.now()}`;
        
        if (format === 'csv') {
            content = 'Mission Time,Wall Time,Level,Entity,Message\n';
            content += this.logEntries.map(entry => {
                const missionTime = this.formatMissionTime(entry.missionTime);
                const wallTime = this.formatWallTime(entry.timestamp);
                const message = entry.message.replace(/"/g, '""'); // Escape quotes
                return `"${missionTime}","${wallTime}","${entry.level}","${entry.entity}","${message}"`;
            }).join('\n');
            filename += '.csv';
        } else if (format === 'ndjson') {
            content = this.logEntries.map(entry => JSON.stringify(entry)).join('\n');
            filename += '.ndjson';
        }
        
        // Download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`Exported ${this.logEntries.length} log entries as ${format}`);
    }
}

// Initialize telemetry stubs when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.telemetryStubs = new TelemetryStubs();
});