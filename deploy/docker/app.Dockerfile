# Multi-stage build for the Go binary. The same image is used for both the
# API node and dedicated worker nodes — they differ only in environment
# variables (WORKER_QUEUES, etc).
FROM golang:1.26-alpine AS build

WORKDIR /src

# Cache module download separately from source.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/app

# ffmpeg/ffprobe are needed by the worker for HLS encoding and thumbnail
# extraction; the API node doesn't strictly need them but bundling keeps
# images symmetric and lets the API also handle small jobs in dev.
FROM alpine:3.20

RUN apk add --no-cache ffmpeg ca-certificates tzdata

WORKDIR /app
COPY --from=build /out/app /app/app

ENV HTTP_ADDR=:8080
EXPOSE 8080

ENTRYPOINT ["/app/app"]
