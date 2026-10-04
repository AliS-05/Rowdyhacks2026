CC = gcc
CFLAGS = -Wall -Wextra -Iinclude -O2

SRC = $(wildcard src/*.c)
TARGET = assemblr

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(TARGET)

clean:
	rm -f $(TARGET)

.PHONY: all clean
