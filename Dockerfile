FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache git
RUN chown node:node /app
COPY --chown=node:node --from=builder /app ./
# 실행 이미지에서 패키지 관리자를 걷어낸다 (2026-09-02).
#
# 왜: npm·yarn·corepack 은 빌드 단계에서만 쓰는데 node 베이스 이미지에 딸려 와 그대로 남아 있었다.
# 그 안의 npm 번들 `tar` 때문에 월간 이미지 취약점 검사에 CRITICAL 이 계속 잡혔다(압축을 푸는 통로가
# 없어 실제 위험은 아니지만, 잡음이 진짜 볼 것을 가린다). 없는 것은 매달 다시 판단할 일이 없다.
#
# ⚠️ 지우기 전에 실행 명령을 먼저 바꿨다 — 예전 `npm run start` 그대로 두고 npm 을 지우면
#    컨테이너가 시작조차 못 한다. `next start` 를 node 로 직접 부르므로 동작은 같다.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
