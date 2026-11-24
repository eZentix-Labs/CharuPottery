// Test environment. Secrets here are throwaway values for the in-memory DB only.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret-not-for-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-for-production';
process.env.JWT_EXPIRE = '15m';
process.env.CLIENT_URL = 'http://localhost:3000';
delete process.env.PHONEPE_ENABLED;
delete process.env.MONGO_URI;
