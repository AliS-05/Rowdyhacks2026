#include <stdio.h>
#include <string.h>
#include "emu.h"

uint8_t memory[MEM_SIZE] = {0}; 


typedef struct { 
	Op op;
	int dest,a, b;
} Inst;


static Inst test_program[] = {
	{ ADDI, 1, 1, 100 },   /* r1 = 100 */
	{ ADD,  2, 1, 1   },   /* r2 = 200 */
	{ ADD,  2, 2, 1   },   /* r2 = 300 (too big for one byte) */
	{ SUB,  3, 2, 1   },   /* r3 = r2 - r1 = 200 */
	{ SW,   2, 4, 16  },   /* word at memory[16] = 300 (r4 is 0) */
	{ LW,   5, 4, 16  },   /* r5 = 300 */
	{ STB,  2, 4, 32  },   /* byte at memory[32] = low byte of 300 = 44 */
	{ LDB,  6, 4, 32  },   /* r6 = 44 */
	{ ADDI, 7, 7, 3   },   /* r7 = 3, the loop counter */
	{ ADDI, 8, 8, 5   },   /* r8 += 5          <- loop top */
	{ ADDI, 7, 7, -1  },   /* r7 -= 1 */
	{ BNE,  7, 4, -2  },   /* if r7 != 0, back two instructions */
	{ HALT, 0, 0, 0   },
};


static int make_test_file(const char *path, int cut_short) {
	FILE *f = fopen(path, "wb");          /* "wb" = write, binary */
	if (f == NULL) {
		printf("Could not create %s\n", path);
		return 1;
	}

	int n = sizeof test_program / sizeof test_program[0];
	unsigned char bytes[sizeof test_program / sizeof test_program[0] * 4];
	for (int i = 0; i < n; i++) {
		bytes[i * 4 + 0] = (unsigned char)test_program[i].op;
		bytes[i * 4 + 1] = (unsigned char)test_program[i].dest;
		bytes[i * 4 + 2] = (unsigned char)test_program[i].a;
		bytes[i * 4 + 3] = (unsigned char)test_program[i].b;    /* -2 is stored as 254 */
	}
	size_t size = n * 4;
	if (cut_short) size = size - 2;
	fwrite(bytes, 1, size, f);
	fclose(f);
	printf("Wrote %zu bytes to %s\n", size, path);
	return 0;
}

static int check_expected(void) {
	uint32_t expected[9] = { 0, 100, 300, 200, 0, 300, 44, 0, 15 };
	int fails = 0;
	for (int i = 0; i < 9; i++)
		if (r[i] != expected[i]) {
			printf("FAIL r%d: got %u, expected %u\n", i, (unsigned)r[i], (unsigned)expected[i]);
			fails++;
		}
	if (fails == 0) printf("PASS: all 9 registers match\n");
	return fails ? 1 : 0;
}



int main(int argc, char *argv[]) {
	int self_test = 0;
	if (argc != 2) {
		printf("Usage: %s <program_name>\n", argv[0]);
		return 1;
	}

	static unsigned char program[MAX_INSTR * 4];
	int count = load_program(argv[1], program, MAX_INSTR);
	if (count < 0) return 1;                     /* the loader already printed the error */

	/* 2. RUN it (emu_cpu.c) */
	FILE* jsonOutput = fopen("cpu_json_output.json", "w");
	initCurrentJSONInstruction();
	if (run_program(program, count, jsonOutput) != 0) return 1;
	fclose(jsonOutput);
	/* 3. Show the result */
	printf("Final registers:");
	for (int i = 0; i <= 8; i++)
		printf(" r%d=%u", i, (unsigned)r[i]);
	printf("\n");
	if (self_test) return check_expected();
	return 0;
}
