CC = gcc
CFLAGS = -Wall -Wextra -Iinclude -O2

SRC = $(wildcard src/*.c)
OBJ = $(SRC:.c=.o)

TARGET = assemblr

all: $(TARGET)

$(TARGET): $(OBJ)
	$(CC) -o $@ $(OBJ)

src/%.o: src/%.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f src/*.o $(TARGET)

.PHONY: all clean
