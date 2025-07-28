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
exports.cacheService = exports.InMemoryCacheService = void 0;
class InMemoryCacheService {
    constructor() {
        this.cache = new Map();
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = this.cache.get(key);
            if (!entry)
                return null;
            if (Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                return null;
            }
            return entry.data;
        });
    }
    set(key_1, data_1) {
        return __awaiter(this, arguments, void 0, function* (key, data, ttl = 24 * 60 * 60 * 1000) {
            const entry = {
                data,
                timestamp: Date.now(),
                expiresAt: Date.now() + ttl
            };
            this.cache.set(key, entry);
        });
    }
    invalidate(pattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.includes(pattern)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
        });
    }
    // Helper method for debugging
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
exports.InMemoryCacheService = InMemoryCacheService;
exports.cacheService = new InMemoryCacheService();
