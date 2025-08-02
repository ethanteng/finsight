#!/usr/bin/env ts-node

/**
 * Test Runner for Dual-Data System
 * 
 * This script runs comprehensive tests for the dual-data system:
 * - Unit tests for tokenization and conversion functions
 * - Integration tests for the complete data flow
 * - Privacy verification tests
 */

import { execSync } from 'child_process';
import path from 'path';

console.log('🧪 Running Dual-Data System Tests...\n');

const testFiles = [
  'src/__tests__/unit/dual-data-system.test.ts',
  'src/__tests__/integration/dual-data-integration.test.ts'
];

let allTestsPassed = true;

for (const testFile of testFiles) {
  console.log(`📋 Running tests in: ${testFile}`);
  
  try {
    const result = execSync(`npx jest ${testFile} --verbose --silent`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log('✅ All tests passed\n');
    console.log(result);
  } catch (error: any) {
    console.log('❌ Some tests failed\n');
    console.log(error.stdout || error.message);
    allTestsPassed = false;
  }
}

if (allTestsPassed) {
  console.log('🎉 All Dual-Data System tests passed!');
  console.log('\n📊 Test Summary:');
  console.log('- ✅ Tokenization functions');
  console.log('- ✅ Real data retrieval');
  console.log('- ✅ Response conversion');
  console.log('- ✅ Demo mode (no tokenization)');
  console.log('- ✅ Production mode (with tokenization)');
  console.log('- ✅ Error handling');
  console.log('- ✅ Privacy verification');
} else {
  console.log('💥 Some tests failed. Please check the output above.');
  process.exit(1);
} 