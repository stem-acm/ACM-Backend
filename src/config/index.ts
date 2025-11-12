import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z
    .string()
    .default('3000')
    .transform((val) => Number.parseInt(val, 10))
    .pipe(z.number().int().positive()),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  database: z.object({
    url: z.string().url('DATABASE_URL must be a valid URL'),
  }),
  jwt: z.object({
    secret: z.string().min(1, 'JWT_SECRET is required'),
    expiresIn: z.string().default('1d'),
  }),
  cors: z.object({
    allowedOrigins: z
      .string()
      .default('http://localhost:3000')
      .transform((val) => val.split(',').map((origin) => origin.trim())),
  }),
  upload: z.object({
    maxSize: z
      .string()
      .default('5242880')
      .transform((val) => Number.parseInt(val, 10))
      .pipe(z.number().int().positive()),
  }),
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().int().positive().default(100),
  }),
});

type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const env = process.env;

  const rawConfig = {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    database: {
      url: env.DATABASE_URL,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN || '1d',
    },
    cors: {
      allowedOrigins: env.ALLOWED_ORIGINS,
    },
    upload: {
      maxSize: env.UPLOAD_MAX_SIZE,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}

export const config = loadConfig();

export type { Config };
export { config as default };
