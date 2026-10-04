/* emu_cpu.c - EXECUTION: the registers, the instruction functions, and running a program
 *
 *   op   name  rd                  rs1     byte3     what it does
 *   1    add   rd                  rs1     rs2       r[rd] = r[rs1] + r[rs2]
 *   2    sub   rd                  rs1     rs2       r[rd] = r[rs1] - r[rs2]
 *   3    ldb   rd                  base    offset    r[rd] = 1 byte at r[base] + offset
 *   4    stb   register to store   base    offset    1 byte at r[base] + offset = r[rd]
 *   5    addi  rd                  rs1     number    r[rd] = r[rs1] + number
 *   6    lw    rd                  base    offset    r[rd] = 4 bytes at r[base] + offset
 *   7    sw    register to store   base    offset    4 bytes at r[base] + offset = r[rd]
 *   8    bne   first register      second  jump      if r[rd] != r[rs1], jump 'jump' instructions
 *   255  stop
 */
#include <stdio.h>
#include "emu.h"

uint32_t r[NUM_REGS] = {0};   // r[1] to r[16]; r[0] is unused
void add(int left, int right, int destination) {
    r[destination] = r[left] + r[right];
}

void addi(int left, int immediate, int destination) {
    r[destination] = r[left] + (uint32_t)immediate;
}

void lw(int base, int offset, int destination, unsigned char memory[MEM_SIZE]) {
    uint32_t address = r[base] + (uint32_t)offset;
    if (address > MEM_SIZE - 4) { printf("bad load at %u\n", (unsigned)address); return; }
    r[destination] = (uint32_t)memory[address]              
                   | (uint32_t)memory[address + 1] << 8
                   | (uint32_t)memory[address + 2] << 16
                   | (uint32_t)memory[address + 3] << 24;
}

void sw(int base, int offset, int source, unsigned char memory[MEM_SIZE]) {
    uint32_t address = r[base] + (uint32_t)offset;          
    if (address > MEM_SIZE - 4) { printf("bad store at %u\n", (unsigned)address); return; }
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

void stb(int source, int address, unsigned char memory[MEM_SIZE]) {
    if (address < 0 || address >= MEM_SIZE) { printf("bad store at %d\n", address); return; }
    memory[address] = (unsigned char)(r[source]);
}

void ldb(int address, int destination, unsigned char memory[MEM_SIZE]) {
    if (address < 0 || address >= MEM_SIZE) { printf("bad load at %d\n", address); return; }
    r[destination] = (uint32_t)memory[address];
}

/* prints registers r0..r8 */
static void print_registers(void) {
    printf("   ");
    for (int i = 0; i <= 8; i++) printf(" r%d=%u", i, (unsigned)r[i]);
    printf("\n");
}

/* Runs ONE instruction on the registers r[] and the memory.
 *
 *   op      = byte 0: which instruction (1 = add, 2 = sub, ... 255 = stop)
 *   rd      = byte 1: "register destination" - where the result goes
 *             (for sw, stb and bne: the register being stored or compared)
 *   rs1     = byte 2: "register source 1" - the first input register,
 *             or the base register for memory instructions
 *   byte3   = byte 3: a register (rs2) for add / sub, otherwise a number (imm)
 *   memory  = the data memory
 *   pc      = which instruction we're on; this function moves it on
 *
 * Returns:  0 = done, keep going
 *           1 = this was the stop instruction
 *          -1 = error (bad register or unknown opcode)
 */
int execute_instruction(int op, int rd, int rs1, int byte3, unsigned char memory[MEM_SIZE], int *pc) {
    int instr_num = *pc;                  /* which instruction this is */

    int rs2 = byte3;                      /* byte 3 as a register (add, sub) */
    int imm = (int8_t)byte3;              /* byte 3 as a number, -128 to 127 (everything else) */
    int stopped = 0;

    /* check the register numbers before using them:
       a destination must be r1..r16 (r0 is unused), a source can be r0..r16 */
    int dest_bad = (rd < 1 || rd >= NUM_REGS);
    int src_bad  = (rd >= NUM_REGS);
    int rs1_bad  = (rs1 >= NUM_REGS);
    int rs2_bad  = (rs2 >= NUM_REGS);
    int bad = 0;

    switch (op) {
        case 1: case 2:          bad = dest_bad || rs1_bad || rs2_bad; break;  /* add, sub: rd, rs1, rs2 */
        case 3:                  bad = dest_bad || rs1_bad;            break;  /* ldb: rd, base          */
        case 4:                  bad = src_bad  || rs1_bad;            break;  /* stb: rs, base          */
        case 5: case 6:          bad = dest_bad || rs1_bad;            break;  /* addi, lw: rd, rs1/base */
        case 7:                  bad = src_bad  || rs1_bad;            break;  /* sw: rs, base           */
        case 8:                  bad = src_bad  || rs1_bad;            break;  /* bne: rs1, rs2          */
    }
    if (bad) {
        printf("Error: bad register number in instruction %d\n", instr_num);
        return -1;
    }

    int next_pc = *pc + 1;                /* normally go to the next instruction */

    /* execute the instruction */
    switch (op) {
        case 1:                               /* add rd, rs1, rs2 : r[rd] = r[rs1] + r[rs2] */
            add(rs1, rs2, rd);
            break;
        case 2:                               /* sub rd, rs1, rs2 : r[rd] = r[rs1] - r[rs2] */
            r[rd] = r[rs1] - r[rs2];
            break;
        case 3:                               /* ldb rd, rs1, imm : r[rd] = 1 byte at r[rs1] + imm */
            ldb((int)(r[rs1] + imm), rd, memory);
            break;
        case 4:                               /* stb rd, rs1, imm : 1 byte at r[rs1] + imm = r[rd] */
            stb(rd, (int)(r[rs1] + imm), memory);
            break;
        case 5:                               /* addi rd, rs1, imm : r[rd] = r[rs1] + imm */
            addi(rs1, imm, rd);
            break;
        case 6:                               /* lw rd, rs1, imm : r[rd] = 4 bytes at r[rs1] + imm */
            lw(rs1, imm, rd, memory);
            break;
        case 7:                               /* sw rd, rs1, imm : 4 bytes at r[rs1] + imm = r[rd] */
            sw(rs1, imm, rd, memory);
            break;
        case 8: {                             /* bne rd, rs1, imm : if r[rd] != r[rs1], jump imm instructions */
            int target = *pc;
            bne(rd, rs1, &target, imm);
            if (target != *pc) next_pc = target;  /* branch taken: go to the target */
            break;
        }
        case 255:                             /* stop */
            stopped = 1;
            break;
        default:                              /* a number we don't know */
            printf("Error: unknown opcode %d in instruction %d\n", op, instr_num);
            return -1;
    }

    /* show the registers after each instruction */
    print_registers();

    *pc = next_pc;                            /* move to the next instruction (or the BNE target) */
    return stopped;                           /* 1 if stop, otherwise 0 */
}

/* Runs a whole loaded program, starting at instruction 0, until stop.
   pc = which instruction we're on; BNE can move it back.
   Returns 0 if it reached stop, 1 on any error. */
int run_program(const unsigned char *program, int count, unsigned char memory[MEM_SIZE]) {
    int pc = 0;
    for (int steps = 0; ; steps++) {
        if (steps >= MAX_STEPS) {                 /* a loop that never ends */
            printf("Error: stopped after %d steps (infinite loop?)\n", MAX_STEPS);
            return 1;
        }
        if (pc < 0 || pc >= count) {              /* no stop, or a jump outside the program */
            printf("Error: pc=%d is outside the program (0..%d)\n", pc, count - 1);
            return 1;
        }
        const unsigned char *ins = &program[pc * 4];
        int result = execute_instruction(ins[0], ins[1], ins[2], ins[3], memory, &pc);
        if (result == -1) return 1;               /* error: stop safely */
        if (result == 1)  return 0;               /* stop */
    }
}
