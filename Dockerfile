# FROM alpine:3.12.1 AS build

# RUN apk add npm
# RUN apk add nodejs=12.22.12-r0 --no-cache

# WORKDIR /usr/app

# COPY package*.json ./
# RUN npm ci
# COPY tsconfig.json ./
# COPY src src
# COPY *.properties ./
# # nest build
# RUN npm install -g typescript
# RUN npm run-script build
# RUN npm ci --production

# FROM alpine:3.12.1 

# RUN apk add tzdata \
#     && cp /usr/share/zoneinfo/Asia/Singapore /etc/localtime \
#     && echo "Asia/Singapore" > /etc/timezone \
#     && apk del tzdata \
#     && rm -rf /var/cache/apk/*

# RUN apk add nodejs=12.22.12-r0 --no-cache
# WORKDIR /usr/app
# COPY --from=build /usr/app/node_modules node_modules
# COPY --from=build /usr/app/dist dist
# COPY --from=build /usr/app/*.properties .

# EXPOSE 4200
# CMD [ "node", "./dist/main"]

# Stage 1: Build the application
FROM node:20-alpine AS build

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the application
RUN npm run build

# Stage 2: Create a production image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the built application from the previous stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Expose the port the application runs on
EXPOSE 8080

# Command to run the application
CMD [ "node", "dist/main" ]
