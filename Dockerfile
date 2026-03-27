# ─── Stage 1: Build React frontend ───
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Build Rust backend ───
FROM rust:1.92-slim AS backend-build
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
# Cache dependencies by building with dummy main
COPY backend/Cargo.toml backend/Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release 2>/dev/null || true && rm -rf src
# Build actual app
COPY backend/src/ ./src/
RUN touch src/main.rs && cargo build --release

# ─── Stage 3: Final minimal image ───
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled binary
COPY --from=backend-build /app/backend/target/release/preschool-backend ./preschool-backend

# Copy the built frontend into /app/static
COPY --from=frontend-build /app/frontend/dist ./static

# Create data and uploads directories
RUN mkdir -p data uploads

# Environment
ENV PRODUCTION=1
ENV PORT=8080
ENV DATABASE_PATH=/data/preschool.db
ENV UPLOADS_DIR=/data/uploads
ENV STATIC_DIR=./static

EXPOSE 8080

CMD ["./preschool-backend"]
