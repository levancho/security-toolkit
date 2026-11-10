FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir data && chown node:node data
USER node
ENV NODE_ENV=production
VOLUME /app/data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
