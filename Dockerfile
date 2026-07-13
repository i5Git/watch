FROM node:24-alpine

ARG VITE_SERVER_HOST
ARG VITE_OAUTH_REDIRECT_HOSTNAME
ARG VITE_TURN_SERVERS
ARG VITE_TURN_USERNAME
ARG VITE_TURN_CREDENTIAL

ENV NODE_ENV=production \
    VITE_SERVER_HOST=$VITE_SERVER_HOST \
    VITE_OAUTH_REDIRECT_HOSTNAME=$VITE_OAUTH_REDIRECT_HOSTNAME \
    VITE_TURN_SERVERS=$VITE_TURN_SERVERS \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

COPY . /usr/src

WORKDIR /usr/src

# FFmpeg and FFprobe power the background HLS transcoding pipeline.
RUN apk add --no-cache ffmpeg

# NODE_ENV=production is needed at runtime, but Vite and TypeScript are
# development dependencies required to build the client inside this image.
RUN npm ci --include=dev --no-audit --no-fund

RUN npm run build

ENTRYPOINT ["/bin/sh", "-c" , "npm start"]
