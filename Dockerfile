# --- Dev stage (for docker compose up in dev)
FROM node:22 AS dev
WORKDIR /code
COPY package*.json ./
RUN npm ci
COPY ./docker-entrypoint.sh /sbin/
RUN chmod 755 /sbin/docker-entrypoint.sh
ENTRYPOINT ["/sbin/docker-entrypoint.sh"]
CMD ["watch"]

# --- Build stage
FROM node:22 AS build
WORKDIR /code
COPY package*.json openapi-nodegen-api-file.yml ./
RUN npm ci
COPY . .
RUN npm run build

# multi stage build
# runtime - only install prod deps, use the already built code from the build stage
FROM node:22-alpine as runtime
WORKDIR /code
COPY --from=build /code/package*.json ./
COPY --from=build /code/node_modules ./node_modules
COPY --from=build /code/openapi-nodegen-api-file.yml ./
COPY --from=build /code/build ./build
COPY --from=build /code/src ./src
COPY ./docker-entrypoint.sh /sbin/
RUN chmod 755 /sbin/docker-entrypoint.sh
ENTRYPOINT [ "/sbin/docker-entrypoint.sh" ]
CMD ["prod"]

