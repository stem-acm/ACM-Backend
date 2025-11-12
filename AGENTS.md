# AGENTS.md - Project Information for AI Agents

## Project Overview

### Primary Goal

Build a complete Node.js/Express REST API for managing an ACM (Association/Club Management) system. The application provides member registration, activity management, check-in/check-out tracking, and dashboard analytics.

### Business Domain

The system is designed for organizations/clubs to:

- Manage member registrations and profiles
- Create and manage activities/events
- Track member attendance through check-in/check-out system
- Generate analytics and statistics for dashboard visualization

## Core Technologies and Stack

### Programming Languages

- **TypeScript** (v5.3+): Primary language for type safety
- **JavaScript/ES2022**: Runtime target

### Frameworks and Runtimes

- **Node.js** (v18+): Runtime environment
- **Express.js** (v4.18+): Web framework for REST API
- **Drizzle ORM** (v0.29+): Type-safe database ORM
- **PostgreSQL** (v14+): Relational database

### Key Libraries

- **Zod** (v3.22+): Schema validation and type inference
- **bcrypt** (v5.1+): Password hashing
- **jsonwebtoken** (v9.0+): JWT token generation and verification
- **express-rate-limit** (v7.1+): Rate limiting middleware
- **multer** (v1.4+): File upload handling
- **winston** (v3.11+): Logging utility
- **cors** (v2.8+): Cross-origin resource sharing
- **dotenv** (v16.3+): Environment variable management
- **swagger-jsdoc** (v6.2+): Swagger/OpenAPI documentation generation
- **swagger-ui-express** (v5.0+): Swagger UI for API documentation

### Development Tools

- **Biome** (v1.4+): Fast linter and formatter (replaces ESLint + Prettier)
- **Husky** (v8.0+): Git hooks management
- **tsx** (v4.7+): TypeScript execution for development
- **drizzle-kit** (v0.20+): Drizzle ORM migration and studio tools

### Package Manager

- **pnpm** (v9.0+): Fast, disk space efficient package manager

### Target Platforms

- **Development**: Local machine with Node.js
- **Production**: Docker containers or Node.js hosting platforms

## Architectural Patterns

### High-Level Architecture

```text
Client (Frontend) → Express.js Server → Drizzle ORM → PostgreSQL Database
```

**Request Flow:**

1. Client sends HTTP request to Express server
2. Middleware processes request (CORS, body parsing, authentication if required)
3. Route handler processes business logic
4. Service layer interacts with database via Drizzle ORM
5. Response sent back to client in JSON format

### Directory Structure Philosophy

The project follows a **layered architecture** pattern:

```text
src/
├── controllers/    # HTTP request/response handling (thin layer)
├── services/       # Business logic and data access
├── routes/         # Route definitions and middleware composition
├── middlewares/    # Reusable Express middleware
├── schemas/        # Zod validation schemas
├── db/             # Database configuration and schema
├── utils/          # Shared utility functions
├── config/         # Application configuration
├── swagger/        # Swagger/OpenAPI documentation configuration
├── app.ts          # Express app setup
└── server.ts       # Application entry point
```

### Module Organization

- **Separation of Concerns**: Controllers handle HTTP, services handle business logic
- **Dependency Injection**: Services are imported and used in controllers
- **Single Responsibility**: Each module has a clear, single purpose
- **Path Aliases**: Use `@/*` to import from `src/*` (configured in tsconfig.json)

## Coding Conventions and Style Guides

### Formatting Styles

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Trailing Commas**: Yes in multi-line objects/arrays
- **Line Length**: 100 characters (soft limit)
- **File Naming**: camelCase for files (e.g., `userService.ts`, `authMiddleware.ts`)

### Naming Conventions

- **Files**: camelCase (e.g., `userController.ts`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions/Variables**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Interfaces/Types**: PascalCase (e.g., `UserResponse`)

### API Design Principles

- **RESTful**: Use standard HTTP methods (GET, POST, PUT, DELETE)
- **Consistent Response Format**: All responses use `{ success, message, data }`
- **Error Handling**: Return appropriate HTTP status codes (400, 401, 404, 500)
- **Pagination**: Offset-based pagination with `offset` and `limit` query parameters
- **Filtering**: Use query parameters for filtering (e.g., `?isActive=true`)
- **Sorting**: Use `sortBy` and `order` query parameters
- **Versioning**: All routes prefixed with `/api`

### Design Patterns

- **Repository Pattern**: Services abstract database access
- **Middleware Pattern**: Express middleware for cross-cutting concerns
- **Validation Pattern**: Zod schemas for request validation
- **Error Handling Pattern**: Centralized error handler middleware

### Metaprogramming

- **Type Inference**: Leverage TypeScript's type inference from Zod schemas
- **Drizzle ORM**: Type-safe database queries with automatic type inference

### Concurrency Model

- **Single-threaded Event Loop**: Node.js event-driven, non-blocking I/O
- **Async/Await**: Use async/await for asynchronous operations
- **Promise-based**: All async operations return Promises

### Error Handling Strategies

- **Centralized Error Handler**: Global error middleware catches all errors
- **Custom Error Classes**: Create specific error types when needed
- **HTTP Status Codes**: Use appropriate status codes (400, 401, 404, 409, 422, 500)
- **Error Response Format**: Consistent error response structure
- **Validation Errors**: Return 422 with detailed field-level errors

## Key Files and Entry Points

### Main Application Entry

- **`src/server.ts`**: Application entry point that starts the Express server
  - Imports and starts the Express app
  - Handles graceful shutdown
  - Sets up error listeners

### Application Configuration

- **`src/app.ts`**: Express application setup
  - Configures middleware (CORS, body parser, static files)
  - Registers all routes
  - Sets up error handling middleware

### Configuration Files

- **`src/config/index.ts`**: Environment variables and app configuration
- **`src/swagger/options.ts`**: Swagger/OpenAPI documentation configuration
- **`.env`**: Environment variables (not committed to git)
- **`.env.example`**: Template for environment variables
- **`tsconfig.json`**: TypeScript compiler configuration
- **`biome.json`**: Biome linter and formatter configuration
- **`drizzle.config.ts`**: Drizzle ORM configuration

### Database Files

- **`src/db/drizzle.ts`**: Database connection setup
- **`src/db/schema.ts`**: Drizzle schema definitions (tables, relations)
- **`src/db/migrations/`**: Database migration files
- **`src/db/seed.ts`**: Database seeding script

### CI/CD Pipeline Files

- **`.husky/pre-commit`**: Pre-commit Git hook (runs Biome)
- **`Dockerfile`**: Docker image build configuration
- **`docker-compose.yml`**: Docker Compose configuration for local development

## Development and Testing Workflow

### Setup Instructions

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and configure
3. Create PostgreSQL database
4. Run migrations: `pnpm db:migrate`
5. (Optional) Seed database: `pnpm seed`

### Build Commands

- **Development**: `pnpm dev` - Start with hot reload (tsx watch)
- **Build**: `pnpm build` - Compile TypeScript to JavaScript
- **Production**: `pnpm start` - Run compiled JavaScript

### Code Quality Commands

- **Lint**: `pnpm lint` - Check code with Biome
- **Format**: `pnpm format` - Format code with Biome
- **Check**: `pnpm check` - Run linting and formatting checks

### Database Commands

- **Generate Migration**: `pnpm db:generate` - Generate migration from schema changes
- **Run Migration**: `pnpm db:migrate` - Apply pending migrations
- **Drizzle Studio**: `pnpm db:studio` - Open database GUI

### Testing Commands

- **Test**: `pnpm test` - Run tests (when implemented)
- **Test Watch**: `pnpm test:watch` - Run tests in watch mode
- **Test Coverage**: `pnpm test:coverage` - Generate coverage report

### Contribution Guidelines

1. Create a feature branch from `main`
2. Make changes following coding conventions
3. Run `pnpm check` before committing
4. Commit changes (Husky will run pre-commit hooks automatically)
5. Push and create a pull request

### Task Guidelines

- **Small, Focused Commits**: One logical change per commit
- **Descriptive Messages**: Clear commit messages explaining what and why
- **Type Safety**: Leverage TypeScript for type safety
- **Error Handling**: Always handle errors appropriately
- **Validation**: Validate all user inputs using Zod schemas

## Context7 MCP Usage

When implementing features or troubleshooting, use the **Context7 MCP server** to fetch up-to-date documentation and code examples for libraries.

### How to Use Context7 MCP

1. **Resolve Library ID**: First, resolve the library name to get the Context7-compatible library ID:

   ```text
   resolve-library-id: "express"
   resolve-library-id: "drizzle-orm"
   resolve-library-id: "zod"
   ```

2. **Fetch Documentation**: Use the library ID to get documentation:

   ```text
   get-library-docs: {
     context7CompatibleLibraryID: "/expressjs/express",
     topic: "middleware" (optional),
     tokens: 5000 (optional, default)
   }
   ```

### When to Use Context7 MCP

- **Implementing New Features**: Get latest API documentation and examples
- **Troubleshooting**: Find solutions to common issues
- **Best Practices**: Learn recommended patterns and approaches
- **Migration**: Check for breaking changes when updating dependencies
- **Type Definitions**: Understand TypeScript types and interfaces

### Example Libraries to Query

- **Express**: `/expressjs/express` - Middleware, routing, error handling
- **Drizzle ORM**: `/drizzle-team/drizzle-orm` - Schema definitions, queries, migrations
- **Zod**: `/colinhacks/zod` - Schema validation, type inference
- **PostgreSQL**: `/postgres/postgres` - Database queries and connection handling

### Best Practices

- **Be Specific**: Use the `topic` parameter to focus on relevant documentation
- **Token Management**: Use appropriate token limits (default 5000 is usually sufficient)
- **Verify Versions**: Ensure documentation matches the version in package.json
- **Combine with Codebase**: Use Context7 docs alongside existing codebase patterns
