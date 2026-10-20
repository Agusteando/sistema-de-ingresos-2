FROM node:22-alpine3.24 AS build
RUN apk add --no-cache openssl libstdc++
WORKDIR /app
COPY . .
RUN node -e "const fs=require('node:fs');const p=require('./package.json');const l=require('./package-lock.json').packages;const n=l['node_modules/nuxt']?.version;if(!n)throw Error('Nuxt missing from lock');p.dependencies={...p.dependencies,nuxt:n,vue:'3.5.42',mysql2:'3.24.4'};p.overrides={...(p.overrides||{}),'@vue/server-renderer':'3.5.42',devalue:'5.9.3','source-map-js':'1.2.2','brace-expansion@^1':'1.1.20','brace-expansion@^2':'2.1.6','brace-expansion@^5':'5.0.11','picomatch@^4':'4.0.5',vue:'3.5.42'};fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n')" \
  && npm install --package-lock-only --legacy-peer-deps --ignore-scripts --no-audit --no-fund \
  && npm ci --legacy-peer-deps --no-audit --no-fund \
  && node -e "const fs=require('node:fs');const exact={vue:'3.5.42','@vue/server-renderer':'3.5.42',mysql2:'3.24.4',devalue:'5.9.3','source-map-js':'1.2.2'};for(const [name,want] of Object.entries(exact)){const got=JSON.parse(fs.readFileSync('node_modules/'+name+'/package.json','utf8')).version;if(got!==want)throw Error(name+' '+got+' != '+want)};console.log('Aurora security overlay verified')"
RUN npx prisma generate && npm run build && test -f .output/server/index.mjs

FROM node:22-alpine3.24 AS runtime
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl ca-certificates libstdc++ \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && ! command -v npm
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN node -e "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();if(!db.base)throw new Error('Prisma Base model missing');console.log('Aurora Prisma musl client ready');db.\$disconnect()"
EXPOSE 3000
CMD ["node",".output/server/index.mjs"]
