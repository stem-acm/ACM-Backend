import cors from 'cors';
import type { Express } from 'express';
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from '@/config';
import { errorHandler, notFoundHandler } from '@/middlewares/errorHandler';
import { generalRateLimiter } from '@/middlewares/rateLimiter';
import activityRoutes from '@/routes/activityRoutes';
// Routes
import authRoutes from '@/routes/authRoutes';
import checkinRoutes from '@/routes/checkinRoutes';
import dashboardRoutes from '@/routes/dashboardRoutes';
import healthRoutes from '@/routes/healthRoutes';
import memberRoutes from '@/routes/memberRoutes';
import volunteerRoutes from "@/routes/volunteerRoutes";
import swaggerOptionsConfig from '@/swagger/options';
import logger from '@/utils/logger';

const app: Express = express();

// Trust proxy
app.set('trust proxy', 1);

// CORS configuration
app.use(
  cors({
    origin: config.nodeEnv === 'development' ? true : config.cors.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger options
const specs = swaggerJsdoc(swaggerOptionsConfig);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Request logging
app.use((req, _, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Rate limiting
app.use(generalRateLimiter);

// Static file serving
app.use('/uploads', express.static('uploads'));

// Health check
app.use('/health', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/volunteers', volunteerRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
