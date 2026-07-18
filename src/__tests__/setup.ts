// Runs before every test file. Sets env vars before any module is imported
// so that config.ts reads the correct values on first load.
process.env.X402_RECIPIENT = "0x" + "a".repeat(40);
process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
process.env.X402_FACILITATOR_KEY = "0x" + "a".repeat(64);
process.env.USE_MOCK_DATA = "true";
process.env.DEMO_MODE = "true";
process.env.ANTHROPIC_API_KEY = ""; // no real key — predict() falls back to mockPredict
process.env.FOOTBALL_DATA_API_KEY = "test";
process.env.API_PORT = "3099"; // avoid port conflict with a running dev server
