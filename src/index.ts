import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';
import { cache } from './services/cache.service.js';

async function main() {
  const app = await buildApp();

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await cache.quit();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Unified Scraper API ready on http://${config.host}:${config.port}`);
    app.log.info(`Swagger docs: http://${config.host}:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
