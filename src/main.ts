import express from 'express';

console.log('🔷 Iniciando aplicación...');
console.log('🔷 NODE_ENV:', process.env.NODE_ENV);
console.log('🔷 PORT:', process.env.PORT);

// Capturar errores no manejados al inicio
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

import env from './config/env';
import logger from './utils/logger';
import webhookRoutes from './routes/webhook';
import prisma from './config/database';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', webhookRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Error no manejado', { error: err, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(env.PORT) || 3000;

// Start server
async function bootstrap() {
  console.log('🔷 Ejecutando bootstrap...');
  try {
    console.log('🔷 Conectando a base de datos...');
    // Verificar conexión a la base de datos
    await prisma.$connect();
    logger.info('✅ Conectado a la base de datos');
    console.log('✅ Conectado a la base de datos');

    console.log(`🔷 Iniciando servidor en puerto ${PORT}...`);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      logger.info(`📱 Webhook URL: http://localhost:${PORT}/webhook`);
      console.log(`📱 Webhook URL: http://localhost:${PORT}/webhook`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('❌ Error al iniciar servidor', { error });
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});
