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
exports.AlphaVantageProvider = void 0;
const cache_1 = require("../cache");
class AlphaVantageProvider {
    constructor(apiKey) {
        this.baseUrl = 'https://www.alphavantage.co/query';
        this.apiKey = apiKey;
    }
    getEconomicIndicators() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('Alpha Vantage does not provide economic indicators');
        });
    }
    getLiveMarketData() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = 'live_market_data';
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            // For now, return mock data since Alpha Vantage requires paid plans for real-time data
            // In production, you'd integrate with their real-time APIs
            const liveData = {
                cdRates: [
                    { term: '3-month', rate: 5.25, institution: 'National Average', lastUpdated: new Date().toISOString() },
                    { term: '6-month', rate: 5.35, institution: 'National Average', lastUpdated: new Date().toISOString() },
                    { term: '1-year', rate: 5.45, institution: 'National Average', lastUpdated: new Date().toISOString() },
                    { term: '2-year', rate: 5.55, institution: 'National Average', lastUpdated: new Date().toISOString() }
                ],
                treasuryYields: [
                    { term: '1-month', yield: 5.12, lastUpdated: new Date().toISOString() },
                    { term: '3-month', yield: 5.18, lastUpdated: new Date().toISOString() },
                    { term: '6-month', yield: 5.25, lastUpdated: new Date().toISOString() },
                    { term: '1-year', yield: 5.32, lastUpdated: new Date().toISOString() },
                    { term: '2-year', yield: 5.45, lastUpdated: new Date().toISOString() },
                    { term: '5-year', yield: 5.58, lastUpdated: new Date().toISOString() },
                    { term: '10-year', yield: 5.65, lastUpdated: new Date().toISOString() },
                    { term: '30-year', yield: 5.75, lastUpdated: new Date().toISOString() }
                ],
                mortgageRates: [
                    { type: '30-year-fixed', rate: 6.85, lastUpdated: new Date().toISOString() },
                    { type: '15-year-fixed', rate: 6.25, lastUpdated: new Date().toISOString() },
                    { type: '5/1-arm', rate: 6.45, lastUpdated: new Date().toISOString() }
                ]
            };
            yield cache_1.cacheService.set(cacheKey, liveData, 5 * 60 * 1000); // 5 minutes for live data
            return liveData;
        });
    }
    getDataPoint(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = `alpha_vantage_${key}`;
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            const url = `${this.baseUrl}?function=TIME_SERIES_DAILY&symbol=${key}&apikey=${this.apiKey}`;
            try {
                const response = yield fetch(url);
                if (!response.ok) {
                    throw new Error(`Alpha Vantage API error: ${response.status}`);
                }
                const data = yield response.json();
                if (data['Note']) {
                    throw new Error(`Alpha Vantage API limit reached: ${data['Note']}`);
                }
                yield cache_1.cacheService.set(cacheKey, data, 5 * 60 * 1000); // 5 minutes
                return data;
            }
            catch (error) {
                console.error(`Error fetching Alpha Vantage data for ${key}:`, error);
                throw error;
            }
        });
    }
}
exports.AlphaVantageProvider = AlphaVantageProvider;
