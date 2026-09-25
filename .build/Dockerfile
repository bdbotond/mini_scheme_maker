FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests and project files
COPY package.json ./
COPY src/ ./src/
COPY dep/ ./dep/
COPY index.html ./
COPY surface_classifier.js ./

# Serve static web interface on port 3000
EXPOSE 3000
CMD ["npx", "serve", "-l", "3000", "."]
