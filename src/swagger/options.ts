import type { Options } from 'swagger-jsdoc';

const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ACM Backend API',
      version: '1.0.0',
      description: 'REST API for managing ACM system. Built with Express and TypeScript.',
    },
    servers: [
      {
        url: 'http://localhost:5002',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
      schemas: {
        Member: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            registrationNumber: {
              type: 'string',
              example: 'MEM-001',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            birthDate: {
              type: 'string',
              format: 'date',
              nullable: true,
              example: '1990-01-01',
            },
            birthPlace: {
              type: 'string',
              nullable: true,
              example: 'New York',
            },
            address: {
              type: 'string',
              nullable: true,
              example: '123 Main St',
            },
            occupation: {
              type: 'string',
              enum: ['student', 'unemployed', 'employee', 'entrepreneur'],
              nullable: true,
              example: 'student',
            },
            phoneNumber: {
              type: 'string',
              nullable: true,
              example: '+1234567890',
            },
            studyOrWorkPlace: {
              type: 'string',
              nullable: true,
              example: 'University',
            },
            joinDate: {
              type: 'string',
              format: 'date',
              nullable: true,
              example: '2024-01-01',
            },
            profileImage: {
              type: 'string',
              nullable: true,
              example: '/uploads/profile.jpg',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            name: {
              type: 'string',
              example: 'Workshop',
            },
            description: {
              type: 'string',
              nullable: true,
              example: 'A workshop about web development',
            },
            image: {
              type: 'string',
              nullable: true,
              example: '/uploads/activity.jpg',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            createdBy: {
              type: 'integer',
              example: 1,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
        },
        Checkin: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            memberId: {
              type: 'integer',
              example: 1,
            },
            activityId: {
              type: 'integer',
              example: 1,
            },
            checkInTime: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2024-01-01T10:00:00.000Z',
            },
            checkOutTime: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2024-01-01T12:00:00.000Z',
            },
            visitReason: {
              type: 'string',
              nullable: true,
              example: 'Attending workshop',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            member: {
              $ref: '#/components/schemas/Member',
            },
            activity: {
              $ref: '#/components/schemas/Activity',
            },
          },
        },
        Volunteer: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            memberId: {
              type: 'integer',
              example: 1,
            },
            joinDate: {
              type: 'string',
              format: 'date',
              example: '2024-01-01',
            },
            expirationDate: {
              type: 'string',
              format: 'date',
              example: '2024-01-01',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            createdBy: {
              type: 'integer',
              example: 1,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
            data: {
              type: 'null',
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'], // Path to your route files where you add JSDoc comments
};

export default swaggerOptions;
