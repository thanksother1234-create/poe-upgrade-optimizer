FROM ghcr.io/pathofbuildingcommunity/pathofbuilding-tests:latest

ARG POB_VERSION=v2.65.0
ENV POB_VERSION=${POB_VERSION} \
    POB_SOURCE_PATH=/opt/pathofbuilding/src \
    POB_WORKER_PATH=/opt/pathofbuilding/src/OptimizerWorker.lua \
    PORT=7860

RUN apk add --no-cache git nodejs npm \
    && git clone --depth 1 --branch "${POB_VERSION}" https://github.com/PathOfBuildingCommunity/PathOfBuilding.git /opt/pathofbuilding

COPY OptimizerWorker.lua /opt/pathofbuilding/src/OptimizerWorker.lua
WORKDIR /app
COPY package.json server.mjs ./

RUN addgroup -g 1000 -S optimizer \
    && adduser -u 1000 -S optimizer -G optimizer \
    && chown -R optimizer:optimizer /app /opt/pathofbuilding

USER optimizer
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-7860}/health" || exit 1
CMD ["node", "server.mjs"]
