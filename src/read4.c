/* read4.c - read a program file 4 bytes (one instruction) at a time, safely
 *
 * This file lives in src/ next to the assembler.
 *
 * The repo's Makefile builds every file in src/ into the assembler, which
 * already has its own main() in src/main.c. So this file's main() (and the
 * test helpers) are only included when READ4_MAIN is defined. That way:
 *   - the team's normal build ("make") works, and can call execute_instruction()
 *   - you can still build the emulator on its own:
 *
 * Build on its own (from the repo's top folder):
 *   gcc -Wall -DREAD4_MAIN -o read4 src/read4.c
 *
 * Make test files:
 *   ./read4 --make-good  good.bin    (a correct program: 5 instructions)
 *   ./read4 --make-bad   bad.bin     (same, but the file is cut short)
 *
 * Read a file:
 *   ./read4 good.bin
 *   ./read4 bad.bin
 *   ./read4 missing.bin              (file that doesn't exist)
 */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#ifdef READ4_MAIN   /* ---- test helpers: only in the standalone build ---- */

/* The test program */

typedef enum { ADDI, ADD, SUB, LW, SW, BNE, LDB, STB, HALT } Op;
typedef struct { Op op; int dest, a, b; } Inst;
static Inst test_program[] = {
    { ADDI, 1, 0, 100 },   /* r0 = 100 */
    { ADD,  2, 0, 0   },   /* r1 = 200 */
    { ADD,  2, 1, 0   },   /* r1 = 300 (too big for one byte) */
    { SUB,  3, 1, 0   },   /* r2 = r1 - r0 = 200 (wrong order gives a huge number) */
    { SW,   2, 3, 16  },   /* word at memory[16] = 300 (r3 is 0) */
    { LW,   3, 3, 16  },   /* r4 = 300 (44 if only one byte is moved) */
    { STB,  2, 3, 32  },   /* byte at memory[32] = low byte of 300 = 44 */
    { LDB,  6, 3, 32  },   /* r5 = 44 */
    { ADDI, 7, 6, 3   },   /* r6 = 3, the loop counter */
    { ADDI, 8, 7, 5   },   /* r7 += 5          <- loop top */
    { ADDI, 7, 6, -1  },   /* r6 -= 1 */
    { BNE,  7, 3, -2  },   /* if r6 != 0, back two instructions */
    { HALT, 0, 0, 0   },
};

uint32_t expected[9] = { 0, 100, 300, 200, 0, 300, 44, 0, 15 };
for (int i = 0; i < 9; i++)
    if (r[i] != expected[i])
        printf("FAIL r%d: got %u, expected %u\n", i, (unsigned)r[i], (unsigned)expected[i]);

/* Writes the test program to a file. If cut_short is 1, the last 2 bytes are left off. */
static int make_test_file(const char *path, int cut_short) {
    FILE *f = fopen(path, "wb");          /* "wb" = write, binary */
    if (f == NULL) {
        printf("Could not create %s\n", path);
        return 1;
    }
    size_t size = sizeof test_program;
    if (cut_short) size = size - 2;
    fwrite(test_program, 1, size, f);
    fclose(f);
    printf("Wrote %zu bytes to %s\n", size, path);
    return 0;
}

#endif /* READ4_MAIN */

/* NEW: runs ONE instruction on the registers and memory.
 *
 *   op, a, b   = the instruction's slots
 *   reg        = the 4 registers (eax, ebx, ecx, edx)
 *   memory     = the 256 bytes of data memory
 *   instr_num  = which instruction this is (only used in error messages)
 *
 * Returns:  0 = done, keep going
 *           1 = this was the stop instruction
 *          -1 = error (bad register or unknown opcode)
 */

uint32_t r[17] = {0};   // r[1] to r[16]; r[0] is unused
void add(int left, int right, int destination) {
    r[destination] = r[left] + r[right];
}

void addi(int left, int immediate, int destination) {
    r[destination] = r[left] + (uint32_t)immediate;
}

void lw(int base, int offset, int destination, unsigned char memory[256]) {
    uint32_t address = r[base] + (uint32_t)offset;
    if (address > 256 - 4) { printf("bad load at %u\n", (unsigned)address); return; }
    r[destination] = (uint32_t)memory[address]              
                   | (uint32_t)memory[address + 1] << 8
                   | (uint32_t)memory[address + 2] << 16
                   | (uint32_t)memory[address + 3] << 24;
}

void sw(int base, int offset, int source, unsigned char memory[256]) {
    uint32_t address = r[base] + (uint32_t)offset;          
    if (address > 256 - 4) { printf("bad store at %u\n", (unsigned)address); return; }
    memory[address]     = (unsigned char)(r[source]);       
    memory[address + 1] = (unsigned char)(r[source] >> 8);
    memory[address + 2] = (unsigned char)(r[source] >> 16);
    memory[address + 3] = (unsigned char)(r[source] >> 24);
}

// If the Main Loop auto incriments the PC, then the offset should be -1 to go back to the same instruction.
// If the Main Loop does not auto increment the PC, then the offset should be 0 to go to the next instruction.
void bne(int left, int right, int *pc, int offset) {
    if (r[left] != r[right]) {
        *pc += offset;
    }
}

void stb(int source, int address, unsigned char memory[256]) {
    if (address < 0 || address >= 256) { printf("bad store at %d\n", address); return; }
    memory[address] = (unsigned char)(r[source]);
}

void ldb(int address, int destination, unsigned char memory[256]) {
    if (address < 0 || address >= 256) { printf("bad load at %d\n", address); return; }
    r[destination] = (uint32_t)memory[address];
}

// test
int execute_instruction(int op, int a, int b, int reg[4], unsigned char memory[256], int instr_num) {

    /* check the register numbers (only 0..3 exist) */
    if (a > 3 || ((op == 2 || op == 3) && b > 3)) {
        printf("Error: register number too big in instruction %d\n", instr_num);
        return -1;
    }

    int stopped = 0;

    /* execute the instruction */
    switch (op) {
        case 1:                               /* mov a, number */
            reg[a] = b;
            break;
        case 2:                               /* add a, b */
            reg[a] = reg[a] + reg[b];
            break;
        case 3:                               /* sub a, b */
            reg[a] = reg[a] - reg[b];
            break;
        case 4:                               /* ldb a, address : memory -> register */
            reg[a] = memory[b];
            break;
        case 5:                               /* stb a, address : register -> memory */
            memory[b] = (unsigned char)reg[a];
            break;
        case 255:                             /* stop */
            stopped = 1;
            break;
        default:                              /* a number we don't know */
            printf("Error: unknown opcode %d in instruction %d\n", op, instr_num);
            return -1;
    }

    /* show the registers after each instruction */
    printf("    eax=%d ebx=%d ecx=%d edx=%d\n", reg[0], reg[1], reg[2], reg[3]);

    return stopped;                           /* 1 if stop, otherwise 0 */
}

#ifdef READ4_MAIN   /* ---- main: only in the standalone build ---- */

int main(int argc, char *argv[]) {
    if (argc == 3 && strcmp(argv[1], "--make-good") == 0) return make_test_file(argv[2], 0);
    if (argc == 3 && strcmp(argv[1], "--make-bad")  == 0) return make_test_file(argv[2], 1);
    if (argc != 2) {
        printf("Usage: %s program.bin\n", argv[0]);
        return 1;
    }

    /* Danger 1: the file might not exist */
    FILE *f = fopen(argv[1], "rb");       /* "rb" = read, binary */
    if (f == NULL) {
        printf("Error: could not open %s\n", argv[1]);
        return 1;
    }

    unsigned char buf[4];                 /* room for exactly one instruction */
    int count = 0;

    /* NEW: the CPU's registers and memory */
    int reg[4] = {0};                     /* reg[0]=eax, reg[1]=ebx, reg[2]=ecx, reg[3]=edx */
    unsigned char memory[256] = {0};      /* data memory for ldb / stb: addresses 0..255 */

    while (1) {
        size_t n = fread(buf, 1, 4, f);   /* ask for 4 bytes; n = how many we really got */

        if (n == 0) {                     /* nothing left: normal end of file */
            break;
        }

        /* Danger 2: the file ended in the middle of an instruction */
        if (n < 4) {
            printf("Error: instruction %d is incomplete (only %zu of 4 bytes)\n", count, n);
            fclose(f);
            return 1;
        }

        /* We have a full instruction: split it into its slots */
        int op = buf[0];
        int op_code = op << 1; // 7 bit opcode
        int a  = buf[1];
        int b  = buf[2];

        printf("instruction %d:  bytes %3d %3d %3d %3d   ->  op=%d a=%d b=%d\n",
               count, buf[0], buf[1], buf[2], buf[3], op, a, b);
        count++;

        /* NEW: run the instruction (see execute_instruction above main) */
        int result = execute_instruction(op, a, b, reg, memory, count - 1);
        if (result == -1) {                   /* error: stop safely */
            fclose(f);
            return 1;
        }
        if (result == 1) {                    /* stop instruction: stop reading */
            break;
        }
    }

    /* Danger 3: something went wrong while reading */
    if (ferror(f)) {
        printf("Error: problem while reading the file\n");
        fclose(f);
        return 1;
    }

    fclose(f);
    printf("Read %d instructions successfully.\n", count);
    printf("Final registers: eax=%d ebx=%d ecx=%d edx=%d\n", reg[0], reg[1], reg[2], reg[3]);   /* NEW */
    return 0;
}

#endif /* READ4_MAIN */
