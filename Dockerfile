# Dockerfile

FROM node:18

# Install pg_dump, pg_restore, etc.
RUN apt-get update && apt-get install -y postgresql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Use ci for reproducible builds, skip dev dependencies
RUN npm ci --omit=dev

# Expose the port your app listens on
EXPOSE 3000

CMD ["node", "backend/app.js"]
