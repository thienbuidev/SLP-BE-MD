FROM node:20

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --production

COPY . .

EXPOSE 3010

CMD ["node", "server.js"]
