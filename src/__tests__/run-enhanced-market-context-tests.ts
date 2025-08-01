#!/usr/bin/env node

/**
 * Test runner for Enhanced Market Context System
 * 
 * This script runs all tests related to the enhanced market context system:
 * - Unit tests for DataOrchestrator
 * - Integration tests for API endpoints
 * - Scheduled updates tests
 */

import { execSync } from 'child_process';
import path from 'path';

const testFiles = [
  'src/__tests__/unit/enhanced-market-context.test.ts',
  'src/__tests__/integration/enhanced-market-context-api.test.ts',
  'src/__tests__/unit/scheduled-updates.test.ts'
];

console.log('🧪 Running Enhanced Market Context System Tests');
console.log('================================================');

let passedTests = 0;
let failedTests = 0;
const results: Array<{ file: string; success: boolean; error?: string }> = [];

for (const testFile of testFiles) {
  console.log(`\n📋 Running: ${testFile}`);
  
  try {
    // Run the test file with Jest
    execSync(`npx jest ${testFile} --verbose --no-coverage`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log(`✅ ${testFile} - PASSED`);
    passedTests++;
    results.push({ file: testFile, success: true });
    
  } catch (error) {
    console.log(`❌ ${testFile} - FAILED`);
    failedTests++;
    results.push({ 
      file: testFile, 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log('\n📊 Test Results Summary');
console.log('=======================');
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total: ${passedTests + failedTests}`);

if (failedTests > 0) {
  console.log('\n❌ Failed Tests:');
  results
    .filter(result => !result.success)
    .forEach(result => {
      console.log(`  - ${result.file}: ${result.error}`);
    });
}

if (passedTests === testFiles.length) {
  console.log('\n🎉 All Enhanced Market Context tests passed!');
  console.log('\n✅ Features Tested:');
  console.log('  - Market context caching and retrieval');
  console.log('  - Tier-specific context generation');
  console.log('  - Market insights generation');
  console.log('  - Cache management and invalidation');
  console.log('  - API endpoint functionality');
  console.log('  - Scheduled updates and cron jobs');
  console.log('  - Error handling and recovery');
  console.log('  - Performance monitoring');
  
  console.log('\n🚀 Enhanced Market Context System is ready for production!');
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
} 