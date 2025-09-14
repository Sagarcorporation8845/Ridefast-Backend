#!/usr/bin/env node

// scripts/validate-swagger.js
// Script to validate Swagger documentation

const { specs } = require('../swagger');
const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Swagger Documentation...\n');

// Basic validation
try {
    // Check if specs object is valid
    if (!specs || typeof specs !== 'object') {
        throw new Error('Invalid Swagger specs object');
    }

    // Check required OpenAPI fields
    const requiredFields = ['openapi', 'info', 'paths'];
    for (const field of requiredFields) {
        if (!specs[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    console.log('✅ Basic structure validation passed');

    // Count endpoints
    const paths = specs.paths || {};
    const endpointCount = Object.keys(paths).length;
    console.log(`📊 Total endpoints documented: ${endpointCount}`);

    // Count by service
    const serviceStats = {};
    Object.keys(paths).forEach(path => {
        const service = path.split('/')[1]; // Extract service name
        if (service) {
            serviceStats[service] = (serviceStats[service] || 0) + 1;
        }
    });

    console.log('\n📈 Endpoints by service:');
    Object.entries(serviceStats).forEach(([service, count]) => {
        console.log(`   ${service}: ${count} endpoints`);
    });

    // Check for common issues
    console.log('\n🔍 Checking for common issues...');
    
    let issues = [];
    
    // Check if all endpoints have descriptions
    Object.entries(paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, spec]) => {
            if (!spec.summary) {
                issues.push(`Missing summary for ${method.toUpperCase()} ${path}`);
            }
            if (!spec.responses) {
                issues.push(`Missing responses for ${method.toUpperCase()} ${path}`);
            }
        });
    });

    if (issues.length > 0) {
        console.log('⚠️  Found issues:');
        issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
        console.log('✅ No common issues found');
    }

    // Generate JSON file for external tools
    const outputPath = path.join(__dirname, '../swagger-spec.json');
    fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2));
    console.log(`\n📄 Swagger spec exported to: ${outputPath}`);

    console.log('\n🎉 Swagger documentation validation completed successfully!');
    console.log('🌐 Start the server and visit http://localhost/api-docs to view the documentation');

} catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
}