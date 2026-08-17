FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY packages/shared packages/shared
WORKDIR /app/packages/shared
RUN npm install && npm run build
WORKDIR /app/apps/api
RUN npm install && npx prisma generate

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app /app
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/prisma apps/api/prisma
COPY infra/sql /app/infra/sql
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
COPY --from=build /app/infra/sql /app/infra/sql
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
