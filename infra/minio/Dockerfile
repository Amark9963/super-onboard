# Official upstream source pinned because upstream registry images are unavailable.
FROM golang:1.25-bookworm AS server-build
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@7aac2a2c5b7c882e68c1ce017d8256be2feea27f
FROM golang:1.25-bookworm AS client-build
ENV CGO_ENABLED=0
RUN go install github.com/minio/mc@77f82e18b5401a65958f1619df6ebb994634bd88
FROM debian:bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
FROM base AS server
COPY --from=server-build /go/bin/minio /usr/local/bin/minio
ENTRYPOINT ["minio"]
FROM base AS client
COPY --from=client-build /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
