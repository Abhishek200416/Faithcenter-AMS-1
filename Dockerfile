FROM node:18

RUN apt-get update \
 && apt-get install -y wget gnupg2 lsb-release \
 && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
 && apt-get update \
 && apt-get install -y postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "backend/app.js"]
