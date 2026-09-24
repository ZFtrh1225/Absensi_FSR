FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY schedule.js server.js ./
ENV PORT=8787 PUSH_DATA_FILE=/data/subscriptions.json
VOLUME /data
EXPOSE 8787
CMD ["node", "server.js"]
