FROM eclipse-temurin:26-jdk

RUN apt-get update && \
    apt-get install -y gcc && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Build assembler
RUN gcc -Wall -Wextra -O2 -Iinclude -Iemu \
    -o assemblr \
    $(find src -name "*.c" | sort)

# Build CPU emulator
RUN gcc -Wall -Wextra -Iinclude -Iemu \
    -o emulator \
    $(find emu -name "*.c" | sort)

# Compile Java bridge
RUN javac Bridge.java

ENV BRIDGE_NO_BROWSER=1

EXPOSE 8080

CMD ["java", "Bridge"]