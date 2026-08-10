FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# npm ci usa o package-lock.json: build reproduzível.
# --omit=dev deixa devDependencies (nodemon) fora da imagem de produção.
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
