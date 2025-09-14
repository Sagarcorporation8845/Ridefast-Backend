#!/usr/bin/env node

// scripts/test-db-connection-new.js
// Script to test the new centralized database architecture

const path = require('path');
const fs = require('fs');

// Test central database pool
async function testCentralPool() {
    console.log('🔍 Testing Central Database Pool...');
    
    try {
        const { connectCentralDb, getConnectionStatus } = require('../shared/db');
        await connectCentralDb();
        
        const status = getConnectionStatus();
        console.log('✅ Central Pool: Database connection successful');
        console.log(`   Connections: ${status.totalConnections}, Active: ${status.totalConnections - status.idleConnections}`);
        return true;
    } catch (error) {
        console.error('❌ Central Pool: Database connection failed');
        console.error('   Error:', error.message);
        return false;
    }
}

// Test support-service connection
async function testSupportService() {
    console.log('🔍 Testing Support Service Database Connection...');
    
    try {
        const { connectDb, getDbStats } = require('../packages/support-service/db');
        await connectDb();
        
        const stats = getDbStats();
        console.log(`✅ Support Service: Connected using ${stats.activeStrategy} strategy`);
        return true;
    } catch (error) {
        console.error('❌ Support Service: Database connection failed');
        console.error('   Error:', error.message);
        return false;
    }
}

// Test admin-service connection
async function testAdminService() {
    console.log('🔍 Testing Admin Service Database Connection...');
    
    try {
        const { connectDb, getDbStats } = require('../packages/admin-service/db');
        await connectDb();
        
        const stats = getDbStats();
        console.log(`✅ Admin Service: Connected using ${stats.activeStrategy} strategy`);
        return true;
    } catch (error) {
        console.error('❌ Admin Service: Database connection failed');
        console.error('   Error:', error.message);
        return false;
    }
}

// Check if ca.pem files exist
function checkCertificates() {
    console.log('🔍 Checking SSL Certificates...');
    
    const services = ['support-service', 'admin-service'];
    let allCertsExist = true;
    
    services.forEach(service => {
        const certPath = path.resolve(__dirname, `../packages/${service}/ca.pem`);
        if (fs.existsSync(certPath)) {
            console.log(`✅ ${service}: ca.pem certificate found`);
        } else {
            console.error(`❌ ${service}: ca.pem certificate missing`);
            allCertsExist = false;
        }
    });
    
    return allCertsExist;
}

// Test connection pool limits
async function testConnectionLimits() {
    console.log('🔍 Testing Connection Pool Limits...');
    
    try {
        const { monitor } = require('../shared/dbMonitor');
        const stats = monitor.getStats();
        
        console.log('📊 Connection Statistics:');
        console.log(`   Central Pool: ${stats.central.totalConnections} max connections`);
        console.log(`   Active Services: ${Object.keys(stats.services).length}`);
        
        // Check if we're within safe limits (10 total DB connections max)
        const totalPossibleConnections = stats.central.totalConnections + 
            (Object.keys(stats.services).length * 2); // 2 fallback connections per service
            
        if (totalPossibleConnections <= 10) {
            console.log(`✅ Connection limits OK (${totalPossibleConnections}/10 max possible)`);
            return true;
        } else {
            console.log(`⚠️  Connection limits may exceed database maximum (${totalPossibleConnections}/10)`);
            return false;
        }
    } catch (error) {
        console.error('❌ Connection limit test failed:', error.message);
        return false;
    }
}

// Main test function
async function runTests() {
    console.log('🚀 RideFast Centralized Database Architecture Test\n');
    
    // Check certificates first
    const certsOk = checkCertificates();
    console.log('');
    
    if (!certsOk) {
        console.log('⚠️  Some SSL certificates are missing. Database connections may fail.\n');
    }
    
    // Test central pool first
    const centralOk = await testCentralPool();
    console.log('');
    
    // Test database connections
    const supportOk = await testSupportService();
    const adminOk = await testAdminService();
    console.log('');
    
    // Test connection limits
    const limitsOk = await testConnectionLimits();
    
    console.log('\n📊 Test Results:');
    console.log(`   Central Pool: ${centralOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Support Service: ${supportOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Admin Service: ${adminOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   SSL Certificates: ${certsOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Connection Limits: ${limitsOk ? '✅ PASS' : '⚠️  WARNING'}`);
    
    if (centralOk && supportOk && adminOk && certsOk) {
        console.log('\n🎉 All database connections are working correctly!');
        console.log('💡 Architecture Benefits:');
        console.log('   - Central pool manages 5 connections efficiently');
        console.log('   - Services fallback to local connections if needed');
        console.log('   - Total database connections stay within limits');
        process.exit(0);
    } else {
        console.log('\n💡 Troubleshooting Tips:');
        if (!certsOk) {
            console.log('   - Copy ca.pem from support-service to admin-service');
        }
        if (!centralOk) {
            console.log('   - Check root .env file has correct database credentials');
        }
        if (!supportOk || !adminOk) {
            console.log('   - Services will fallback to local connections');
            console.log('   - Check individual service .env files');
        }
        if (!limitsOk) {
            console.log('   - Consider reducing connection pool sizes');
        }
        process.exit(1);
    }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
});

// Run the tests
runTests();