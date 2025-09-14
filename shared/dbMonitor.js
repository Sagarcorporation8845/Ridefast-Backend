// shared/dbMonitor.js - Database Connection Monitoring
const { getConnectionStatus } = require('./db');

// Monitor database connections and log statistics
class DatabaseMonitor {
  constructor() {
    this.services = new Map();
    this.startTime = new Date();
  }

  // Register a service for monitoring
  registerService(serviceName, dbService) {
    this.services.set(serviceName, dbService);
    console.log(`[db-monitor] Registered service: ${serviceName}`);
  }

  // Get comprehensive database statistics
  getStats() {
    const centralStatus = getConnectionStatus();
    const serviceStats = {};

    // Get stats from each registered service
    this.services.forEach((dbService, serviceName) => {
      try {
        serviceStats[serviceName] = dbService.getStats();
      } catch (error) {
        serviceStats[serviceName] = {
          serviceName,
          error: error.message,
          status: 'error'
        };
      }
    });

    return {
      central: centralStatus,
      services: serviceStats,
      uptime: Date.now() - this.startTime.getTime(),
      timestamp: new Date().toISOString()
    };
  }

  // Log database statistics
  logStats() {
    const stats = this.getStats();
    
    console.log('\n📊 Database Connection Statistics:');
    console.log(`   Central Pool: ${stats.central.isConnected ? '✅ Connected' : '❌ Disconnected'}`);
    
    if (stats.central.isConnected) {
      console.log(`   Active Connections: ${stats.central.totalConnections - stats.central.idleConnections}/${stats.central.totalConnections}`);
      console.log(`   Waiting Clients: ${stats.central.waitingClients}`);
    }

    console.log('\n   Service Status:');
    Object.entries(stats.services).forEach(([name, serviceStats]) => {
      const strategy = serviceStats.activeStrategy || 'none';
      const status = strategy === 'none' ? '❌' : '✅';
      console.log(`   ${name}: ${status} ${strategy}`);
    });
    
    console.log('');
  }

  // Start periodic monitoring
  startMonitoring(intervalMs = 60000) { // Default: 1 minute
    console.log(`[db-monitor] Starting database monitoring (interval: ${intervalMs}ms)`);
    
    setInterval(() => {
      this.logStats();
    }, intervalMs);

    // Log initial stats
    setTimeout(() => this.logStats(), 2000);
  }

  // Check if system is healthy
  isHealthy() {
    const stats = this.getStats();
    
    // Central pool should be connected
    if (!stats.central.isConnected) {
      return false;
    }

    // At least one service should be using central or have local connection
    const hasActiveService = Object.values(stats.services).some(
      service => service.activeStrategy !== 'none'
    );

    return hasActiveService;
  }

  // Get health check response
  getHealthCheck() {
    const stats = this.getStats();
    const healthy = this.isHealthy();

    return {
      status: healthy ? 'healthy' : 'unhealthy',
      database: {
        central: stats.central.isConnected ? 'connected' : 'disconnected',
        totalConnections: stats.central.totalConnections,
        activeConnections: stats.central.totalConnections - stats.central.idleConnections,
        waitingClients: stats.central.waitingClients
      },
      services: Object.keys(stats.services).reduce((acc, name) => {
        const service = stats.services[name];
        acc[name] = {
          strategy: service.activeStrategy || 'none',
          status: service.activeStrategy !== 'none' ? 'connected' : 'disconnected'
        };
        return acc;
      }, {}),
      uptime: stats.uptime,
      timestamp: stats.timestamp
    };
  }
}

// Create singleton instance
const monitor = new DatabaseMonitor();

module.exports = {
  DatabaseMonitor,
  monitor
};