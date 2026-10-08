FROM node:22-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build && test -f .output/server/index.mjs

FROM node:22-alpine3.24 AS runtime
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl ca-certificates libstdc++
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN node -e "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();if(!db.base)throw new Error('Prisma Base model missing');console.log('Aurora Prisma musl client ready');db.\$disconnect()"
EXPOSE 3000
CMD ["node",".output/server/index.mjs"]
