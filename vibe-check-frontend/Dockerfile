FROM node:20 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json /temp/prod/
RUN cd /temp/prod && npm install --legacy-peer-deps

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/prod/node_modules node_modules
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=8192 npx vite build
#bun run build

FROM nginx:latest

EXPOSE 8000
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=prerelease /usr/src/app/dist /var/www/sltech/
