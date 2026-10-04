#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include "helpers.h"
const char* returnRegisterString(uint8_t reg) {
	switch (reg) {
		case 1:  return "r1";
		case 2:  return "r2";
		case 3:  return "r3";
		case 4:  return "r4";
		case 5:  return "r5";
		case 6:  return "r6";
		case 7:  return "r7";
		case 8:  return "r8";
		case 9:  return "r9";
		case 10: return "r10";
		case 11: return "r11";
		case 12: return "r12";
		case 13: return "r13";
		case 14: return "r14";
		case 15: return "r15";
		case 16: return "r16";
		default: return "invalid";
	}
}

