# ACM Backend

A Node.js/Express REST API service for managing an ACM (Association/Club Management) system. The application handles member registration, activity management, check-in/check-out tracking, and provides dashboard statistics.

## Features

- **Member Management**: Register and manage organization members with comprehensive profiles
- **Activity Management**: Create and manage activities/events
- **Check-in System**: Track member attendance at activities with check-in/check-out times
- **User Authentication**: Secure login and registration for administrators using JWT
- **Dashboard Analytics**: View statistics and daily check-ins
- **File Management**: Support for profile images and activity images

## Tech Stack

- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod
- **Authentication**: JWT with bcrypt
- **API Documentation**: Swagger/OpenAPI (swagger-jsdoc, swagger-ui-express)
- **Code Quality**: Biome (linting & formatting), Husky (Git hooks)
- **Package Manager**: pnpm

## Prerequisites

- Node.js (v18 or higher)
- pnpm (v9 or higher)
- PostgreSQL (v14 or higher)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd acm_backend_refonte
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and configure:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT token signing
- `PORT`: Server port (default: 3000)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Database Setup

1. Create a PostgreSQL database:

```bash
createdb acm_db
```

2. Run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

3. (Optional) Seed the database:

```bash
pnpm seed
```

## Running the Application

### Development Mode

```bash
pnpm dev
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

### Production Mode

1. Build the project:

```bash
pnpm build
```

2. Start the server:

```bash
pnpm start
```

## Docker Setup

### Using Docker Compose

```bash
docker-compose up -d
```

This will start:

- PostgreSQL database on port 5432
- Backend API on port 3000

### Building Docker Image

```bash
docker build -t acm-backend .
```

## API Documentation

Once the server is running, you can access:

- **Swagger UI**: `http://localhost:3000/api-docs` - Interactive API documentation with testing capabilities

## Project Structure

```text
src/
├── controllers/     # HTTP request handlers
├── middlewares/     # Express middlewares (auth, validation, errors)
├── routes/          # Route definitions
├── schemas/         # Zod validation schemas
├── services/        # Business logic layer
├── db/              # Database configuration and schema
│   ├── migrations/  # Database migration files
│   └── seed.ts      # Database seeding script
├── utils/           # Utility functions
├── config/          # Configuration files
├── swagger/         # Swagger/OpenAPI documentation configuration
├── app.ts           # Express app configuration
└── server.ts        # Server entry point
```

## Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run Biome linter
- `pnpm format` - Format code with Biome
- `pnpm check` - Run linting and formatting checks
- `pnpm db:generate` - Generate database migration files
- `pnpm db:migrate` - Run pending migrations
- `pnpm db:studio` - Open Drizzle Studio
- `pnpm seed` - Seed the database

## Environment Variables

See `.env.example` for all required environment variables.

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new user (protected)
- `GET /api/auth/token` - Verify JWT token

### Members

- `GET /api/members` - Get all members (with pagination, search, sorting)
- `GET /api/members/:id` - Get member by ID (protected)
- `GET /api/members/registration/:registrationNumber` - Get member by registration number
- `POST /api/members` - Create new member (protected)
- `PUT /api/members/:id` - Update member (protected)
- `DELETE /api/members/:id` - Delete member (protected)

### Activities

- `GET /api/activities` - Get all activities (with filtering)
- `GET /api/activities/:id` - Get activity by ID
- `POST /api/activities` - Create new activity (protected)
- `PUT /api/activities/:id` - Update activity (protected)
- `DELETE /api/activities/:id` - Delete activity (protected)

### Check-ins

- `GET /api/checkins` - Get all check-ins (with filtering)
- `GET /api/checkins/:registrationNumber` - Get check-ins by member registration number
- `POST /api/checkins` - Create new check-in
- `DELETE /api/checkins/:id` - Delete check-in (protected)

### Dashboard

- `GET /api/dashboard` - Get dashboard statistics (protected)

## Response Format

All API responses follow this structure:

```json
{
  "success": boolean,
  "message": string,
  "data": object | array | null
}
```

## Error Handling

Errors are returned in the same format with `success: false` and appropriate HTTP status codes:

- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `500` - Internal Server Error

## Contributing

1. Create a feature branch
2. Make your changes
3. Run linting and formatting: `pnpm check`
4. Commit your changes (Husky will run pre-commit hooks)
5. Push and create a pull request

## License

ISC
