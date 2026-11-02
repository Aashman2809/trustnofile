import { createApp } from './app.js';
import { config } from './config/env.js';
const app = await createApp();
const server = app.listen(config.port,/* Handles the server listening event. */ () => console.log(`TrustNoFile API on :${config.port}`));
server.requestTimeout = 5 * 60_000;
server.headersTimeout = 30_000;
process.once('SIGTERM', () => server.close(() => process.exit(0)));
process.once('SIGINT', () => server.close(() => process.exit(0)));
