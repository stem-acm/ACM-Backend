import app from '@/app';
import { config } from '@/config';
import logger from '@/utils/logger';

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Promise Rejection:', {
    reason,
    promise,
  });

  if (config.nodeEnv === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });
  console.error('❌ Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

let server: ReturnType<typeof app.listen> | null = null;

try {
  const PORT = config.port;
  const HOST = '0.0.0.0'; // Bind to all interfaces to accept connections from outside

  server = app.listen(PORT, HOST, () => {
    logger.info(`Server is running on http://${HOST}:${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    console.log(`✅ Server is running on http://localhost:${PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use`);
      console.error(`❌ Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      logger.error('Server error:', error);
      console.error('❌ Server error:', error.message);
      process.exit(1);
    }
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    }
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    }
  });
} catch (error) {
  if (error instanceof Error) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack,
    });
    console.error('❌ Failed to start server:', error.message);
    if (error.message.includes('Configuration validation failed')) {
      console.error('\n💡 Make sure you have a .env file with required variables:');
      console.error('   - DATABASE_URL');
      console.error('   - JWT_SECRET');
    }
  }
  process.exit(1);
}
