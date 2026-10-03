#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <helpers.h>


//num to s
//to use pass a buffer of max digits of new base
// uint32_t ipAddress -> base 10 number
//ntos(ipAddress, buf (len 4), 10);
char* ntos(uint32_t value, char* buf, uint32_t base)
{
	if (base < 2 || base > 16) {
		buf[0] = '\0';
		return NULL;
	}

	static const char digits[] = "0123456789ABCDEF";

	int i = 0;

	if (value == 0) {
		buf[i++] = '0';
		buf[i] = '\0';
		return NULL;
	}

	while (value > 0) {
		buf[i++] = digits[value % base];
		value /= base;
	}

	buf[i] = '\0';

	int left = 0;
	int right = i - 1;

	while (left < right) {
		char temp = buf[left];
		buf[left] = buf[right];
		buf[right] = temp;
		left++;
		right--;
	}
	return buf;
}


