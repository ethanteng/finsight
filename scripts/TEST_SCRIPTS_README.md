# Test Scripts for RAG & Intelligent Profile Systems

## Overview

This directory contains test scripts for validating the RAG (Retrieval-Augmented Generation) system and Intelligent Profile system. These scripts were created during the comprehensive testing and validation of the systems described in `docs/RAG_AND_INTELLIGENT_PROFILE_SYSTEM.md`.

## Test Scripts

### 🧪 `test-rag-and-profiles-comprehensive.js`
**Purpose**: Main comprehensive test suite for both RAG and Intelligent Profile systems
**Usage**: `node scripts/test-rag-and-profiles-comprehensive.js`
**What it tests**:
- RAG system functionality for all tiers (Starter, Standard, Premium)
- Intelligent Profile system for all tiers
- PlaidProfileEnhancer implementation
- System integration between RAG and Profiles
- Tier-appropriate access control and limitations

**When to use**: Primary validation script for the entire system

### 🏦 `test-plaid-profile-enhancement.js`
**Purpose**: Specific testing of the PlaidProfileEnhancer functionality
**Usage**: `node scripts/test-plaid-profile-enhancement.js`
**What it tests**:
- PlaidProfileEnhancer with demo data
- Profile building over multiple interactions
- Account and transaction analysis
- Personalized advice generation
- Real-time profile enhancement

**When to use**: When testing Plaid integration or profile enhancement features

### 🔍 `verify-rag-system.js`
**Purpose**: Quick verification of RAG system functionality
**Usage**: `node scripts/verify-rag-system.js`
**What it tests**:
- RAG access for different tiers
- Tier limitations and upgrade suggestions
- Real-time data retrieval
- Response quality validation

**When to use**: Quick validation of RAG system changes

## Implementation Files

### 📁 `src/profile/plaid-enhancer.ts`
**Purpose**: PlaidProfileEnhancer class implementation
**Features**:
- Real-time account analysis
- Transaction pattern analysis
- Financial insights generation
- AI-powered profile integration
- Privacy-first design (no raw data persistence)

## Usage Examples

### Run Comprehensive Tests
```bash
node scripts/test-rag-and-profiles-comprehensive.js
```

### Test Plaid Integration
```bash
node scripts/test-plaid-profile-enhancement.js
```

### Quick RAG Verification
```bash
node scripts/verify-rag-system.js
```

## Test Results

All scripts should return:
- ✅ RAG system working correctly for all tiers
- ✅ Intelligent Profile system working for all tiers
- ✅ PlaidProfileEnhancer implemented and integrated
- ✅ System integration working seamlessly

## Notes

- These scripts use demo data for testing
- Real Plaid integration testing requires actual account connections
- All tests are designed to work with the local development server
- Scripts include comprehensive logging for debugging

## Cleanup

The following debug scripts were removed during cleanup:
- `debug-starter-tier.js`
- `test-direct-search.js`
- `test-env-vars.js`
- `test-intelligent-profile-features.js`
- `test-rag-comprehensive.js`
- `test-rag-detailed.js`
- `test-rag-fix.js`
- `test-rag-system.js`
- `test-search-inclusion.js`
- `test-search-provider.js`

These were temporary debug scripts created during development and testing. 