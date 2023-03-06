import sys

D_MASK   = 0b00000010
W_MASK   = 0b00000001
MOD_MASK = 0b11000000
REG_MASK = 0b00111000
RM_MASK  = 0b00000111

D_RIGHT_TO_LEFT = 0b00000010
D_LEFT_TO_RIGHT = 0b00000000

REG_NARROW_NAMES = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh']
REG_WIDE_NAMES = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di']

def main():
    instr_file = sys.argv[1]
    with open(instr_file, 'rb') as f:
        instr_bytes = f.read()

    print(f'; {instr_file} disassembly:')
    print('bits 16')

    i = 0
    while i < len(instr_bytes):
        dest = (instr_bytes[i + 1] & REG_MASK) >> 3
        src = instr_bytes[i + 1] & RM_MASK
        if instr_bytes[i] & D_MASK == D_LEFT_TO_RIGHT:
            (src, dest) = dest, src
        w = instr_bytes[i] & W_MASK
        name_tab = REG_NARROW_NAMES if w == 0 else REG_WIDE_NAMES
        print(f'mov {name_tab[dest]}, {name_tab[src]}')
        i += 2

if __name__ == '__main__':
    main()
