# Multi-stage build for efficient container size
FROM node:26-alpine AS builder

# Build arguments
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"
ARG NODE_AUTH_TOKEN

# Set working directory
WORKDIR /app

# git is required to fetch the node-inforcer SDK from its public git tag
RUN apk add --no-cache git

# Copy package files and .npmrc (retained for any future GitHub Packages deps)
COPY package*.json .npmrc ./

# Copy source before install. The SDK is a git dependency whose own 'prepare'
# script builds it from source, so install scripts must run -- and the root
# 'prepare' needs the source tree already present when they do.
COPY . .

# Install dependencies (this also builds the SDK) and then the application
RUN npm ci

# Build the application
RUN npm run build

# Prune dev dependencies in builder stage (while .npmrc auth is still available)
RUN npm prune --omit=dev

# Remove .npmrc so auth token is not leaked into production image
RUN rm -f .npmrc

# Production stage
FROM node:26-alpine AS production

# Create a non-root user for security
RUN addgroup -g 1001 -S inforcer && \
    adduser -S inforcer -u 1001 -G inforcer

# Set working directory
WORKDIR /app

# Copy package files and built application from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create logs directory
RUN mkdir -p /app/logs && chown -R inforcer:inforcer /app

# Switch to non-root user
USER inforcer

# Expose port
EXPOSE 8080

# Health check against the actual HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
ENV AUTH_MODE=env

# Define volume for logs
VOLUME ["/app/logs"]

# Start the application
CMD ["node", "dist/http.js"]

# Build arguments for runtime
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# Labels for metadata
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/inforcer-mcp"
LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="Inforcer MCP Server - Model Context Protocol server for the Inforcer M365 baseline governance platform"
LABEL org.opencontainers.image.title="inforcer-mcp"
LABEL org.opencontainers.image.description="Model Context Protocol server for Inforcer M365 baseline governance integration"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/inforcer-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/wyre-technology/inforcer-mcp/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/wyre-technology/inforcer-mcp/pkgs/container/inforcer-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"
