# Development Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Install pnpm (matching package.json packageManager version)
RUN npm install -g pnpm@10.20.0

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies)
# Note: bcrypt build scripts are ignored by default, so we install it separately with scripts
RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm install bcrypt@5.1.1 --ignore-scripts=false && \
    cd node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt && \
    npm run install

# Create uploads and logs directories
RUN mkdir -p uploads logs

# Copy entrypoint script
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE ${PORT:-5002}
EXPOSE ${DRIZZLE_STUDIO_PORT:-4983}

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application in development mode with hot reload
CMD ["pnpm", "dev"]
