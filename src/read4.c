/* read4.c - read a program file 4 bytes (one instruction) at a time, safely
 *
 * Build:   gcc -Wall -o read4 read4.c
 *
 * Make test files:
 *   ./read4 --make-good  good.bin    (a correct program: 5 instructions)
 *   ./read4 --make-bad   bad.bin     (same, but the file is cut short)
 *
 * Read a file:
 *   ./read4 good.bin
 *   ./read4 bad.bin
 *   ./read4 missing.bin              (file that doesn't exist)
 *
 * Instruction format (4 bytes):
 *   byte 0 = opcode   (1 = mov, 2 = add, 3 = sub, 255 = stop)
 *   byte 1 = box a    (0 = eax, 1 = ebx, 2 = ecx, 3 = edx)
 *   byte 2 = number or box b
 *   byte 3 = unused   (0)
 */
#include <stdio.h>
#include <string.h>

/* The test program: mov eax,5 / mov ebx,3 / add eax,ebx / sub eax,ebx / stop */
static unsigned char test_program[] = {
    1, 0, 5, 0,        /* mov eax, 5                          */
    1, 1, 3, 0,        /* mov ebx, 3                          */
    2, 0, 1, 0,        /* add eax, ebx    eax = 8             */
    5, 0, 10, 0,       /* stb eax, [10]   NEW: memory[10] = 8 */
    4, 2, 10, 0,       /* ldb ecx, [10]   NEW: ecx = 8        */
    3, 2, 1, 0,        /* sub ecx, ebx    ecx = 5             */
    255, 0, 0, 0       /* stop                                */
};

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
    }

    /* Danger 3: something went wrong while reading */
    if (ferror(f)) {
        printf("Error: problem while reading the file\n");
        fclose(f);
        return 1;
    }

    fclose(f);
    printf("Read %d instructions successfully.\n", count);
    return 0;
}
