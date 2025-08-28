// BGCS Configuration
window.BGCS_CONFIG = {
    // Feature flags
    LOG_STUBS: true,
    CAM_DEMO_FEED: false,
    
    // UI Configuration
    DOCK_AUTO_HIDE_DELAY: 0, // Same as current system
    DEFAULT_DOCK_TAB: 'actions',
    
    // Telemetry stub configuration
    STUB_MAVLINK_FREQUENCY: {
        HEARTBEAT: 1000,        // every 1s
        SYS_STATUS: 1000,       // every 1s
        GLOBAL_POSITION_INT: 100, // every 100ms
        MISSION_ITEM_REACHED: 0   // event-driven
    },
    
    // Log retention
    MAX_LOG_ENTRIES: 5000,
    LOG_EXPORT_FORMATS: ['csv', 'ndjson']
};