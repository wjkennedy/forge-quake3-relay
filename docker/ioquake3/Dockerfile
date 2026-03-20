FROM debian:bookworm-slim

WORKDIR /opt/ioquake3

# Install dependencies and build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    netcat-traditional \
    netstat-deprecated \
    && rm -rf /var/lib/apt/lists/*

# Clone and build ioquake3
RUN git clone https://github.com/ioquake/ioq3 . && \
    make -j$(nproc) PLATFORM=linux ARCH=x86_64 SKIP_RENDERER=1

# Copy server configuration
COPY server.cfg ./baseq3/

# Create necessary directories
RUN mkdir -p baseq3 && \
    chmod +x ./build/release-linux-x86_64/ioquake3.x86_64

# Download demo maps if they don't exist
RUN if [ ! -f baseq3/pak0.pk3 ]; then \
    echo "Note: pak0.pk3 (base game data) not included. You need to provide this file." \
    && echo "Download from: https://www.quake3world.com/files/Q3%20demos%20and%20utils/" \
    && echo "Or use shareware demo files."; \
    fi

# Expose game port
EXPOSE 27960/udp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD netstat -an | grep 27960 || exit 1

# Start server
ENTRYPOINT ["./build/release-linux-x86_64/ioquake3.x86_64", "+set", "dedicated", "2"]
CMD ["+set", "net_port", "27960", "+exec", "baseq3/server.cfg"]
