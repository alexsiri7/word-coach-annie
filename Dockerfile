FROM node:20-slim

# Install system deps for Prisma (SQLite) and general tooling
RUN apt-get update && apt-get install -y \
    openssl \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the app
COPY . .

# Generate Prisma client
RUN npx prisma generate 2>/dev/null || true

EXPOSE 3000

# Dev mode with hot reload
CMD ["npm", "run", "dev"]
