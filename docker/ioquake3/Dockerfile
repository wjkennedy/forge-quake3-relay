FROM debian:bookworm-slim

WORKDIR /opt/ioquake3

# Install runtime dependencies only (much smaller and faster)
RUN apt-get update && apt-get install -y \
    libsdl2-2.0-0 \
    libcurl4 \
    libgl1-mesa-glx \
    libopus0 \
    libopusfile0 \
    netcat-openbsd \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories first
RUN mkdir -p baseq3

# Download pre-compiled ioquake3 binary
RUN wget -q https://ioquake3.org/files/ioquake3-latest/ioquake3-latest-linux.tar.bz2 -O ioquake3.tar.bz2 && \
    tar xjf ioquake3.tar.bz2 && \
    rm ioquake3.tar.bz2 && \
    find . -type f \( -name "ioquake3*" -o -name "ioq3ded*" \) -exec chmod +x {} \;

# Copy server configuration if it exists (use optional flag)
COPY server.cfg ./baseq3/ 2>/dev/null || echo "No server.cfg found, using defaults"

# Expose game port
EXPOSE 27960/udp

# Health check - verify server port is listening
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD nc -zu localhost 27960 || exit 1

# Start server
ENTRYPOINT ["/bin/bash", "-c"]
CMD ["exec $(find . -maxdepth 2 -type f \\( -name 'ioquake3*' -o -name 'ioq3ded*' \\) | head -1) +set dedicated 2 +set net_port 27960 +exec baseq3/server.cfg"]
