import { test, expect } from '@playwright/test';
const API_URL = 'http://localhost:3000';
test.describe('Data Visualization - API Tests', () => {
    test('health check passes', async ({ request }) => {
        const response = await request.get(`${API_URL}/api/health`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('ok');
    });
    test('datasources API returns array', async ({ request }) => {
        const response = await request.get(`${API_URL}/api/datasources`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body)).toBe(true);
    });
    test('query history API returns array', async ({ request }) => {
        const response = await request.get(`${API_URL}/api/query-history`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body)).toBe(true);
    });
});
//# sourceMappingURL=data-visualization.spec.js.map