FROM node:22-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build && test -f .output/server/index.mjs

FROM node:22-alpine3.24 AS runtime
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl ca-certificates libstdc++
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node",".output/server/index.mjs"]
