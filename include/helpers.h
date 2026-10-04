#pragma once
#include <stdint.h>
//num to s
//to use pass a buffer of max digits of new base
// uint32_t ipAddress -> base 10 number
//ntos(ipAddress, buf (len 4), 10);
char* ntos(int value, char* buf, uint32_t base);
