import sys

D_MASK   = 0b00000010
MOD_MASK = 0b11000000
RM_MASK  = 0b00000111

REG_MEM_W_MASK   = 0b00000001
REG_MEM_REG_MASK = 0b00111000

REG_MEM_REG_BITSHIFT = 3

IMM_REG_W_MASK   = 0b0000001000
IMM_REG_REG_MASK = 0b0000000111

IMM_REG_W_BITSHIFT = 3

D_REG_DST = 0b00000010
D_REG_SRC = 0b00000000

MOD_MEM            = 0b00000000
MOD_MEM_DISP_BYTE  = 0b01000000
MOD_MEM_DISP_WORD  = 0b10000000
MOD_REG            = 0b11000000

REG_MEM_OPCODE_MASK = 0b11111100
IMM_REG_OPCODE_MASK = 0b11110000

REG_MEM_OPCODE = 0b10001000
IMM_REG_OPCODE = 0b10110000

W_BYTE = 0
W_WORD = 1

EFFECTIVE_ADDRESS_TAB = ['bx + si', 'bx + di', 'bp + si', 'bp + di', 'si', 'di', 'bp', 'bx']

REG_BYTE_NAMES = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh']
REG_WORD_NAMES = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di']
REG_NAMES_W_TAB = [REG_BYTE_NAMES, REG_WORD_NAMES]

def decompile_reg_mem(instr_bytes: bytes, i: int) -> int:
    fst = instr_bytes[i]
    snd = instr_bytes[i + 1]
    consumed = 2
    mod = snd & MOD_MASK
    reg = (snd & REG_MEM_REG_MASK) >> REG_MEM_REG_BITSHIFT
    rm = snd & RM_MASK
    reg_name_tab = REG_NAMES_W_TAB[fst & REG_MEM_W_MASK]
    reg_operand = reg_name_tab[reg]
    if mod == MOD_REG:
        variable_operand = reg_name_tab[rm]
    else:
        base = EFFECTIVE_ADDRESS_TAB[rm]
        if mod == MOD_MEM_DISP_BYTE:
            addr = f'{base} + {instr_bytes[i + 2]}'
            consumed += 1
        elif mod == MOD_MEM_DISP_WORD:
            addr = f'{base} + {instr_bytes[i + 2] + (instr_bytes[i + 3] << 8)}'
            consumed += 2
        else:
            addr = base
        variable_operand = f'[{addr}]'
    if fst & D_MASK == D_REG_SRC:
        src_operand, dst_operand = reg_operand, variable_operand
    else:
        src_operand, dst_operand = variable_operand, reg_operand
    print(f'mov {dst_operand}, {src_operand}')
    return consumed

def decompile_imm_reg(instr_bytes: bytes, i: int) -> int:
    fst = instr_bytes[i]
    consumed = 2
    w = (fst & IMM_REG_W_MASK) >> IMM_REG_W_BITSHIFT
    dst_operand = REG_NAMES_W_TAB[w][fst & IMM_REG_REG_MASK]
    if w == W_WORD:
        src_operand = f'{instr_bytes[i + 1] + (instr_bytes[i + 2] << 8)}'
        consumed += 1
    else:
        src_operand = f'{instr_bytes[i + 1]}'
    print(f'mov {dst_operand}, {src_operand}')
    return consumed

def main():
    instr_file = sys.argv[1]
    with open(instr_file, 'rb') as f:
        instr_bytes = f.read()

    print(f'; {instr_file} disassembly:')
    print('bits 16')

    i = 0
    while i < len(instr_bytes):
        fst = instr_bytes[i]
        if fst & REG_MEM_OPCODE_MASK == REG_MEM_OPCODE:
            i += decompile_reg_mem(instr_bytes, i)
        elif fst & IMM_REG_OPCODE_MASK == IMM_REG_OPCODE:
            i += decompile_imm_reg(instr_bytes, i)
        else:
            raise RuntimeError(f'Failed to parse opcode from {fst:#0x}')

if __name__ == '__main__':
    main()
