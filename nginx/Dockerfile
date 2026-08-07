# Multi-stage: Node builds the React app, nginx serves the build output.
# Build context is the repo root; paths are prefixed with `frontend/` and `nginx/`.

# ---------- Stage 1: build the React app ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps (layer cached unless lockfile changes)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# CRA bakes these into the JS bundle at build time
ARG REACT_APP_API_BASE_URL=/api
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

RUN npm run build

# ---------- Stage 2: nginx serves the build + proxies /api ----------
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
# Rendered to /etc/nginx/conf.d/default.conf at boot by the base image's
# 20-envsubst-on-templates.sh entrypoint, substituting ${BACKEND_UPSTREAM}.
COPY nginx/prod.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
