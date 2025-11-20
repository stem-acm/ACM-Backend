import type { NextFunction, Request, Response } from 'express';
import type { ZodRawShape, ZodSchema } from 'zod';
import { z } from 'zod';

export function validateRequest(schema: ZodSchema | z.ZodObject<ZodRawShape>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const hasBodyKey = 'body' in shape;
        const hasQueryKey = 'query' in shape;
        const hasParamsKey = 'params' in shape;

        if (hasBodyKey || hasQueryKey || hasParamsKey) {
          const parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
          });

          if (parsed.body) req.body = parsed.body;
          if (parsed.query) req.query = parsed.query;
          if (parsed.params) req.params = parsed.params;
        } else {
          const parsed = schema.parse(req.body);
          req.body = parsed;
        }
      } else {
        const parsed = schema.parse(req.body);
        req.body = parsed;
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        res.status(422).json({
          success: false,
          message: 'Validation failed',
          data: { errors },
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: 'Invalid request data',
        data: null,
      });
    }
  };
}
