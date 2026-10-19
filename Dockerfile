# Multi-stage so the shipped image contains no build tooling and no source.
# Node 22 matches what the project is developed against.

FROM node:22-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client must be generated before the Next build imports it.
# prisma.config.ts reads DATABASE_URL, but generate does not connect - the
# placeholder simply satisfies the config loader.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
# Belt and braces with public/.gitkeep: a COPY whose source does not exist
# fails the build, and an empty directory is easily lost in a fresh clone.
RUN mkdir -p public && npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. The uploads directory is owned by it so the app can
# write CVs without the container running privileged.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/storage \
 && chown -R nextjs:nodejs /app/storage

# The standalone output carries its own traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma's schema and generated client are needed at runtime, and are not
# always picked up by Next's dependency tracing.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

# Fails the container health check if the app stops serving, so Docker can
# restart it rather than leaving a dead process behind a working proxy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
