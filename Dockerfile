# EdorasCRM — Türkiye kopyası (Coolify, app-1). Vercel bu dosyayı KULLANMAZ.
#
# Derleme değişkenleri (GitHub Actions tr-crm-imaj.yml → build-arg): NEXT_PUBLIC_* derlemede istemci koduna
# gömülür (lib/env.ts). NEXT_PUBLIC_EDORAS_STORAGE_URL yalnız next.config.ts images.remotePatterns içindir.
# Çalışma zamanı sırları (SUPABASE_SERVICE_ROLE_KEY, EDORAS_SUPABASE_URL, EDORAS_SUPABASE_SERVICE_ROLE_KEY,
# CRON_SECRET, RESEND_*, PARASUT_*, KCA_*) BURAYA GİRMEZ — yalnız Coolify ortamında.
# Telemetri kapalı: Next'in derleme telemetrisi Vercel'e (yurt dışı) gider.
#
# Taban imajlar SABİT (etiket + digest), panel Dockerfile'ı ile aynı (Desktop/YKS):
#   deps/build : node:22.23.3-bookworm-slim (glibc; sharp/lightningcss/tailwind-oxide prebuilt'leri)
#   run        : gcr.io/distroless/nodejs22-debian12:nonroot — kabuk/paket yöneticisi yok, UID 65532,
#                PATH'te `node` yok → mutlak yol /nodejs/bin/node.
# Kod root'a ait, salt okunur; yalnız .next/cache nonroot'a yazılabilir (next/image logo önbelleği).

FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_EDORAS_PANEL_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_EDORAS_STORAGE_URL
ARG NEXT_DEPLOYMENT_ID
ARG EDORAS_NOINDEX=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_EDORAS_PANEL_URL=$NEXT_PUBLIC_EDORAS_PANEL_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_EDORAS_STORAGE_URL=$NEXT_PUBLIC_EDORAS_STORAGE_URL \
    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID \
    EDORAS_NOINDEX=$EDORAS_NOINDEX \
    EDORAS_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Boş önbellek dizini: çalışma aşamasında nonroot'a verilir (distroless'ta mkdir yok).
RUN npm run build && mkdir -p /app/.next-cache-bos

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e AS run
# :nonroot imajının varsayılan kullanıcısı 65532 → WORKDIR dizini onun adına açılırdı (nonroot /app'e
# dosya ekleyip server.js'i silebilirdi). Dizin root'a ait olsun; en sonda tekrar nonroot'a dönülür.
USER 0
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build --chown=65532:65532 /app/.next-cache-bos ./.next/cache
USER 65532:65532
EXPOSE 3000
# /login: oturumsuz 200 (lib/permissions.ts PUBLIC_PATHS; proxy.ts çerez yoksa ağa çıkmadan geçirir).
# Sağlık ucu yok; /api/* oturumsuz 401. Kabuk yok → exec biçimi, mutlak yol.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["server.js"]
