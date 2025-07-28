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
exports.FREDProvider = void 0;
const cache_1 = require("../cache");
class FREDProvider {
    constructor(apiKey) {
        this.baseUrl = 'https://api.stlouisfed.org/fred/series/observations';
        this.apiKey = apiKey;
    }
    getEconomicIndicators() {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = 'economic_indicators';
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            const [cpi, fedRate, mortgageRate, creditCardAPR] = yield Promise.all([
                this.getDataPoint('CPIAUCSL'), // CPI
                this.getDataPoint('FEDFUNDS'), // Fed Funds Rate
                this.getDataPoint('MORTGAGE30US'), // 30-year mortgage rate
                this.getDataPoint('CCRSA') // Credit card rate
            ]);
            const indicators = {
                cpi,
                fedRate,
                mortgageRate,
                creditCardAPR
            };
            yield cache_1.cacheService.set(cacheKey, indicators, 24 * 60 * 60 * 1000); // 24 hours
            return indicators;
        });
    }
    getLiveMarketData() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('FRED does not provide live market data');
        });
    }
    getDataPoint(seriesId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = `fred_${seriesId}`;
            const cached = yield cache_1.cacheService.get(cacheKey);
            if (cached)
                return cached;
            const url = `${this.baseUrl}?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json&limit=1&sort_order=desc`;
            try {
                const response = yield fetch(url);
                if (!response.ok) {
                    throw new Error(`FRED API error: ${response.status}`);
                }
                const data = yield response.json();
                const observation = data.observations[0];
                const dataPoint = {
                    value: parseFloat(observation.value),
                    date: observation.date,
                    source: 'FRED',
                    lastUpdated: new Date().toISOString()
                };
                yield cache_1.cacheService.set(cacheKey, dataPoint, 24 * 60 * 60 * 1000); // 24 hours
                return dataPoint;
            }
            catch (error) {
                console.error(`Error fetching FRED data for ${seriesId}:`, error);
                throw error;
            }
        });
    }
}
exports.FREDProvider = FREDProvider;
