# Multi-stage build for both Go binaries. The same image carries:
#   /app/app        — cmd/app        (API + in-process River workers)
#   /app/hls-worker — cmd/hls-worker (external ffmpeg worker, no DB access)
# The compose `api` service uses the default entrypoint; the `worker` service
# overrides ENTRYPOINT to /app/hls-worker.
FROM golang:1.26-alpine AS build

WORKDIR /src

# Cache module download separately from source.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/app && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hls-worker ./cmd/hls-worker

# ffmpeg/ffprobe are needed by the hls-worker for HLS encoding and thumbnail
# extraction; the API node doesn't strictly need them but bundling keeps
# images symmetric.
FROM alpine:3.20

# libheif-tools provides heif-convert, used by the robot-image upload path
# to transcode HEIC photos from iOS into browser-renderable JPEG.
RUN apk add --no-cache ffmpeg libheif-tools ca-certificates tzdata

WORKDIR /app
COPY --from=build /out/app /app/app
COPY --from=build /out/hls-worker /app/hls-worker

ENV HTTP_ADDR=:8080
EXPOSE 8080

ENTRYPOINT ["/app/app"]
