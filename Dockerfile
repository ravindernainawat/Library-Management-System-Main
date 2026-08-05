# Use an optimized, light Node.js base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy root package.json
COPY package.json ./

# Disable downloading of MongoDB binaries by mongodb-memory-server during install
ENV MONGOMS_DISABLE_POSTINSTALL=1

# Install dependencies (excluding devDependencies to make builds fast and light)
# This will also prevent heavy mongodb-memory-server downloads during production build if env is set
RUN npm install --omit=dev

# Copy backend and frontend source directories
COPY backend ./backend
COPY frontend ./frontend

# Expose port 5000 (standard port for the monolith)
EXPOSE 5000

# Set production environment variable
ENV NODE_ENV=production
ENV PORT=5000

# Start the Node.js Express application
CMD ["npm", "start"]
