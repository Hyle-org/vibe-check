FROM oven/bun 
WORKDIR /usr/src/app

COPY  ./src/* /usr/src/app/src/
COPY ./bun.lockb /usr/src/app/
COPY ./package.json /usr/src/app/

RUN bun install
CMD [ "bun", "run", "./src/index.js" ]
