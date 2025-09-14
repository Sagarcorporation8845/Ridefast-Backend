// shared/db.js - Centralized Database Connection Pool
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load CA certificate from root directory
const caPath = path.join(__dirname, '../ca.pem');
const caCert = fs.readFileSync(caPath).toString();

// Load environment variables from root .env or use defaults
require('dotenv').config();

// Centralized connection pool with limited connections
const centralPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE || process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: {
    rejectUnauthorized: true,
    ca: caCert,
  },
  max: 5, // Use 5 connections for the central pool
  min: 2, // Keep 2 connections always active
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  acquireTimeoutMillis: 10000,
});

// Connection status tracking
let isConnected = false;
let connectionError = null;

// Test and establish connection
const connectCentralDb = async () => {
  try {
    const client = await centralPool.connect();
    console.log('✅ [shared-db] Central database pool connected successfully!');
    console.log(`[shared-db] Pool size: ${centralPool.totalCount}, Active: ${centralPool.idleCount}`);
    client.release();
    isConnected = true;
    connectionError = null;
    return true;
  } catch (err) {
    console.error('❌ [shared-db] Central database pool connection failed:', err.message);
    isConnected = false;
    connectionError = err;
    return false;
  }
};

// Enhanced query function with connection fallback
const query = async (text, params) => {
  try {
    // Try central pool first
    if (isConnected) {
      return await centralPool.query(text, params);
    } else {
      throw new Error('Central pool not available');
    }
  } catch (error) {
    console.warn(`[shared-db] Central pool query failed: ${error.message}`);
    throw error; // Let individual services handle fallback
  }
};

// Get connection status
const getConnectionStatus = () => ({
  isConnected,
  error: connectionError,
  totalConnections: centralPool.totalCount,
  idleConnections: centralPool.idleCount,
  waitingClients: centralPool.waitingCount
});

// Graceful shutdown
const closeCentralDb = async () => {
  try {
    await centralPool.end();
    console.log('[shared-db] Central database pool closed');
  } catch (error) {
    console.error('[shared-db] Error closing central pool:', error.message);
  }
};

// Handle process termination
process.on('SIGTERM', closeCentralDb);
process.on('SIGINT', closeCentralDb);

module.exports = {
  query,
  connectCentralDb,
  closeCentralDb,
  getConnectionStatus,
  centralPool
};