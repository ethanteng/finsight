"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataOrchestrator = exports.DataOrchestrator = void 0;
const types_1 = require("./types");
const fred_1 = require("./providers/fred");
const alpha_vantage_1 = require("./providers/alpha-vantage");
const cache_1 = require("./cache");
class DataOrchestrator {
    constructor() {
        const fredApiKey = process.env.FRED_API_KEY;
        const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
        if (!fredApiKey) {
            console.warn('FRED_API_KEY not set, economic indicators will be unavailable');
        }
        if (!alphaVantageApiKey) {
            console.warn('ALPHA_VANTAGE_API_KEY not set, live market data will be unavailable');
        }
        this.fredProvider = new fred_1.FREDProvider(fredApiKey || '');
        this.alphaVantageProvider = new alpha_vantage_1.AlphaVantageProvider(alphaVantageApiKey || '');
    }
    getTierAccess(tier) {
        switch (tier) {
            case types_1.UserTier.STARTER:
                return {
                    tier: types_1.UserTier.STARTER,
                    hasEconomicContext: false,
                    hasLiveData: false,
                    hasScenarioPlanning: false
                };
            case types_1.UserTier.STANDARD:
                return {
                    tier: types_1.UserTier.STANDARD,
                    hasEconomicContext: true,
                    hasLiveData: false,
                    hasScenarioPlanning: false
                };
            case types_1.UserTier.PREMIUM:
                return {
                    tier: types_1.UserTier.PREMIUM,
                    hasEconomicContext: true,
                    hasLiveData: true,
                    hasScenarioPlanning: true
                };
            default:
                return {
                    tier: types_1.UserTier.STARTER,
                    hasEconomicContext: false,
                    hasLiveData: false,
                    hasScenarioPlanning: false
                };
        }
    }
    getMarketContext(tier) {
        return __awaiter(this, void 0, void 0, function* () {
            const access = this.getTierAccess(tier);
            const context = {};
            try {
                if (access.hasEconomicContext) {
                    context.economicIndicators = yield this.getEconomicIndicators();
                }
                if (access.hasLiveData) {
                    context.liveMarketData = yield this.getLiveMarketData();
                }
            }
            catch (error) {
                console.error('Error fetching market context:', error);
                // Return empty context on error, don't fail the entire request
            }
            return context;
        });
    }
    getEconomicIndicators() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = 'economic_indicators';
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            try {
                const indicators = yield this.fredProvider.getEconomicIndicators();
                yield cache_1.cacheService.set(cacheKey, indicators, 24 * 60 * 60 * 1000); // 24 hours
                return indicators;
            }
            catch (error) {
                console.error('Error fetching economic indicators:', error);
                // Return mock data as fallback
                return {
                    cpi: { value: 3.1, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
                    fedRate: { value: 5.25, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
                    mortgageRate: { value: 6.85, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
                    creditCardAPR: { value: 24.59, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() }
                };
            }
        });
    }
    getLiveMarketData() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = 'live_market_data';
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            try {
                const liveData = yield this.alphaVantageProvider.getLiveMarketData();
                yield cache_1.cacheService.set(cacheKey, liveData, 5 * 60 * 1000); // 5 minutes
                return liveData;
            }
            catch (error) {
                console.error('Error fetching live market data:', error);
                throw error; // Live data is critical for Premium tier
            }
        });
    }
    // Helper method for debugging
    getCacheStats() {
        return __awaiter(this, void 0, void 0, function* () {
            return cache_1.cacheService.getStats();
        });
    }
    // Method to invalidate cache (useful for testing)
    invalidateCache(pattern) {
        return __awaiter(this, void 0, void 0, function* () {
            yield cache_1.cacheService.invalidate(pattern);
        });
    }
}
exports.DataOrchestrator = DataOrchestrator;
exports.dataOrchestrator = new DataOrchestrator();
