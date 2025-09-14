// shared/dbService.js - Database Service Factory with Fallback
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class DatabaseService {
  constructor(serviceName, serviceDir) {
    this.serviceName = serviceName;
    this.serviceDir = serviceDir;
    this.localPool = null;
    this.centralDb = null;
    this.isLocalConnected = false;
    
    // Try to load central db
    try {
      this.centralDb = require('./db');
    } catch (error) {
      console.warn(`[${serviceName}] Central DB not available, will use local connection only`);
    }
  }

  // Initialize local connection pool (fallback)
  async initializeLocalPool() {
    try {
      // Load service-specific environment
      const envPath = path.join(this.serviceDir, '.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
      }

      // Load CA certificate from root directory
      const caPath = path.join(__dirname, '../ca.pem');
      if (!fs.existsSync(caPath)) {
        throw new Error(`CA certificate not found at ${caPath}`);
      }
      const caCert = fs.readFileSync(caPath).toString();

      // Create local pool with minimal connections
      this.localPool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE || process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        ssl: {
          rejectUnauthorized: true,
          ca: caCert,
        },
        max: 2, // Minimal connections for fallback
        min: 1,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test local connection
      const client = await this.localPool.connect();
      console.log(`✅ [${this.serviceName}] Local database pool connected (fallback mode)`);
      client.release();
      this.isLocalConnected = true;
      return true;

    } catch (error) {
      console.error(`❌ [${this.serviceName}] Local database connection failed:`, error.message);
      this.isLocalConnected = false;
      return false;
    }
  }

  // Smart query function with fallback logic
  async query(text, params) {
    // Strategy 1: Try central pool first (if available)
    if (this.centralDb) {
      try {
        const status = this.centralDb.getConnectionStatus();
        if (status.isConnected) {
          return await this.centralDb.query(text, params);
        }
      } catch (error) {
        console.warn(`[${this.serviceName}] Central pool failed, falling back to local: ${error.message}`);
      }
    }

    // Strategy 2: Fallback to local pool
    if (this.localPool && this.isLocalConnected) {
      try {
        return await this.localPool.query(text, params);
      } catch (error) {
        console.error(`[${this.serviceName}] Local pool also failed:`, error.message);
        throw error;
      }
    }

    // Strategy 3: Try to initialize local pool if not done yet
    if (!this.localPool) {
      console.log(`[${this.serviceName}] Attempting to initialize local pool...`);
      const initialized = await this.initializeLocalPool();
      if (initialized) {
        return await this.localPool.query(text, params);
      }
    }

    throw new Error(`[${this.serviceName}] No database connection available`);
  }

  // Connection test and setup
  async connect() {
    console.log(`[${this.serviceName}] Initializing database connection...`);

    // Try central connection first
    if (this.centralDb) {
      try {
        const status = this.centralDb.getConnectionStatus();
        if (status.isConnected) {
          console.log(`✅ [${this.serviceName}] Using central database pool`);
          return true;
        } else {
          // Try to connect central pool
          const connected = await this.centralDb.connectCentralDb();
          if (connected) {
            console.log(`✅ [${this.serviceName}] Connected to central database pool`);
            return true;
          }
        }
      } catch (error) {
        console.warn(`[${this.serviceName}] Central pool unavailable: ${error.message}`);
      }
    }

    // Fallback to local connection
    console.log(`[${this.serviceName}] Falling back to local database connection...`);
    return await this.initializeLocalPool();
  }

  // Get connection statistics
  getStats() {
    const stats = {
      serviceName: this.serviceName,
      centralAvailable: !!this.centralDb,
      localConnected: this.isLocalConnected,
      activeStrategy: 'none'
    };

    if (this.centralDb) {
      const centralStatus = this.centralDb.getConnectionStatus();
      if (centralStatus.isConnected) {
        stats.activeStrategy = 'central';
        stats.centralStats = centralStatus;
      }
    }

    if (this.isLocalConnected && stats.activeStrategy === 'none') {
      stats.activeStrategy = 'local';
      stats.localStats = {
        totalConnections: this.localPool?.totalCount || 0,
        idleConnections: this.localPool?.idleCount || 0
      };
    }

    return stats;
  }

  // Graceful shutdown
  async close() {
    if (this.localPool) {
      try {
        await this.localPool.end();
        console.log(`[${this.serviceName}] Local database pool closed`);
      } catch (error) {
        console.error(`[${this.serviceName}] Error closing local pool:`, error.message);
      }
    }
  }
}

// Factory function to create database service for each microservice
function createDatabaseService(serviceName) {
  const serviceDir = path.join(__dirname, `../packages/${serviceName}`);
  return new DatabaseService(serviceName, serviceDir);
}

module.exports = {
  DatabaseService,
  createDatabaseService
};