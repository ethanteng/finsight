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
// Basic test to verify testing setup
describe('Basic Test Suite', () => {
    it('should pass a simple test', () => {
        expect(1 + 1).toBe(2);
    });
    it('should handle async operations', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield Promise.resolve('test');
        expect(result).toBe('test');
    }));
    it('should work with environment variables', () => {
        expect(process.env.NODE_ENV).toBe('test');
    });
});
