#!/bin/sh

echo "Running database migrations..."

# Run drizzle-kit migrate to apply migration files
# Note: docker-compose depends_on with healthcheck ensures PostgreSQL is ready
if ! pnpm exec drizzle-kit migrate; then
  echo "Warning: Failed to run database migrations. Continuing anyway..."
fi

echo "Pushing schema to database..."
if ! pnpm exec drizzle-kit push; then
  echo "Warning: Failed to push schema. Continuing anyway..."
fi

echo "Starting Drizzle Studio in the background..."
# Start Drizzle Studio in the background
# Using --host=0.0.0.0 to make it accessible from outside the container
# Using nohup to ensure it continues running even after exec
nohup pnpm exec drizzle-kit studio --host=0.0.0.0 > /dev/null 2>&1 &

# Wait a moment for Drizzle Studio to start
sleep 2

echo "Drizzle Studio should be available at http://localhost:4983"
echo "Starting application..."
exec "$@"

