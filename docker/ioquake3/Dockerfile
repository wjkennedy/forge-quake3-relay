FROM debian:bookworm-slim

WORKDIR /opt/ioquake3

# Install runtime dependencies only (much smaller and faster)
RUN apt-get update && apt-get install -y \
    libsdl2-2.0-0 \
    libcurl4 \
    libgl1-mesa-glx \
    libopus0 \
    libopusfile0 \
    ca-certificates \
    netcat-openbsd \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories first
RUN mkdir -p baseq3

# Optionally include a prebuilt binary from the build context
COPY docker/ioquake3/bin/ /opt/ioquake3/.localbin/

# Ensure we have ioq3ded at build time either by vendoring or download
RUN set -eux; \
    echo "Preparing ioquake3 dedicated server binary..."; \
    if [ -s /opt/ioquake3/.localbin/ioq3ded.x86_64 ]; then \
      mv /opt/ioquake3/.localbin/ioq3ded.x86_64 /opt/ioquake3/ioq3ded.x86_64; \
      chmod +x /opt/ioquake3/ioq3ded.x86_64; \
      echo "Using vendored ioq3ded from build context"; \
    else \
      ok=0; \
      for url in \
        "https://github.com/ioquake/ioq3/releases/download/last-good-build/ioq3ded.x86_64" \
        "https://github.com/ioquake/ioq3/releases/latest/download/ioq3ded.x86_64" \
      ; do \
        tmp="$(mktemp)"; \
        if wget -qO "$tmp" "$url" && [ -s "$tmp" ]; then \
          mv "$tmp" /opt/ioquake3/ioq3ded.x86_64; \
          chmod +x /opt/ioquake3/ioq3ded.x86_64; \
          ok=1; \
          echo "Downloaded ioq3ded from $url"; \
          break; \
        else \
          rm -f "$tmp"; \
        fi; \
      done; \
      if [ "$ok" -ne 1 ]; then \
        echo "Falling back to legacy archive..."; \
        if wget -q https://ioquake3.org/files/ioquake3-latest/ioquake3-latest-linux.tar.bz2 -O ioquake3.tar.bz2 && [ -s ioquake3.tar.bz2 ]; then \
          tar xjf ioquake3.tar.bz2; \
          rm ioquake3.tar.bz2; \
        else \
          echo "Warning: Could not download any ioquake3 binary."; \
        fi; \
      fi; \
    fi; \
    # Verify we have a valid binary and make executables
    if [ ! -s ./ioq3ded.x86_64 ] && ! find . -maxdepth 2 -type f -name 'ioq3ded*' | grep -q .; then \
      echo "ERROR: ioq3ded binary not found"; \
      exit 1; \
    fi; \
    find . -type f \( -name "ioquake3*" -o -name "ioq3ded*" \) -exec chmod +x {} \;

# Copy server configuration into image
COPY server.cfg ./baseq3/

# Add a simple entrypoint that waits if game data is missing
COPY docker/ioquake3/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose game port
EXPOSE 27960/udp

# Health check - verify server port is listening
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD nc -zu localhost 27960 || exit 1

# Start server (wrapper handles missing pak files gracefully)
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
