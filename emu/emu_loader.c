/* emu_loader.c - READING: loads a program file, 4 bytes (one instruction) at a time, safely */
#include <stdio.h>
#include <string.h>
#include "emu.h"

int load_program(const char *path, unsigned char *program, int max_instr) {

    /* Danger 1: the file might not exist */
    FILE *f = fopen(path, "rb");          /* "rb" = read, binary */
    if (f == NULL) {
        printf("Error: could not open %s\n", path);
        return -1;
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
            return -1;
        }

        /* The program must fit in the program array */
        if (count >= max_instr) {
            printf("Error: program has more than %d instructions\n", max_instr);
            fclose(f);
            return -1;
        }

        /* We have a full instruction: split it into its slots */
        int op = buf[0];
        int op_code = op << 1; // 7 bit opcode
        (void)op_code;         /* not used yet - this line just silences the warning */
        int rd  = buf[1];
        int rs1 = buf[2];

        printf("instruction %d:  bytes %3d %3d %3d %3d   ->  op=%d rd=%d rs1=%d\n",
               count, buf[0], buf[1], buf[2], buf[3], op, rd, rs1);
        memcpy(&program[count * 4], buf, 4);  /* save it; it runs after everything is read */
        count++;
    }

    /* Danger 3: something went wrong while reading */
    if (ferror(f)) {
        printf("Error: problem while reading the file\n");
        fclose(f);
        return -1;
    }

    fclose(f);
    printf("Read %d instructions successfully.\n", count);
    return count;
}

