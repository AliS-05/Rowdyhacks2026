/* emu.h - shared by the three emulator files
 *
 *   src/emu_loader.c  - READING:   loads a program file, 4 bytes per instruction
 *   src/emu_cpu.c     - EXECUTION: registers, memory, and running instructions
 *   src/emu_main.c    - MAIN:      command line, test program, and results
 *
 * Build the emulator on its own (from the repo's top folder):
 *   gcc -Wall -Iinclude -DEMU_MAIN -o emu src/emu_main.c src/emu_loader.c src/emu_cpu.c
 *
 * Instruction format (4 bytes):
 *   byte 0 = op     which instruction (see emu_cpu.c)
 *   byte 1 = rd     register destination (or the register stored / compared)
 *   byte 2 = rs1    first source register, or the base register for memory
 *   byte 3 = byte3  a register (rs2) for add / sub, otherwise a number (imm)
 */
#pragma once
#include <stdint.h>

#define NUM_REGS  17          /* r[0]..r[16] (r[0] is unused) */
#define MEM_SIZE  256         /* data memory: addresses 0..255 */
#define MAX_INSTR 1024        /* biggest program we accept */
#define MAX_STEPS 100000      /* stops a program that loops forever */

/* ---- emu_loader.c (reading) ---------------------------------------- */

/* Reads a program file into 'program'.
   Returns the number of instructions loaded, or -1 if something went wrong. */
int load_program(const char *path, unsigned char *program, int max_instr);

/* ---- emu_cpu.c (execution) ----------------------------------------- */

extern uint32_t r[NUM_REGS];   /* the registers */

void add(int left, int right, int destination);
void addi(int left, int immediate, int destination);
void lw(int base, int offset, int destination, unsigned char memory[MEM_SIZE]);
void sw(int base, int offset, int source, unsigned char memory[MEM_SIZE]);
void bne(int left, int right, int *pc, int offset);
void stb(int source, int address, unsigned char memory[MEM_SIZE]);
void ldb(int address, int destination, unsigned char memory[MEM_SIZE]);

/* Runs ONE instruction. Returns 0 = keep going, 1 = stop, -1 = error */
int execute_instruction(int op, int rd, int rs1, int byte3, unsigned char memory[MEM_SIZE], int *pc);

/* Runs a whole loaded program until stop. Returns 0 = finished, 1 = error */
int run_program(const unsigned char *program, int count, unsigned char memory[MEM_SIZE]);
