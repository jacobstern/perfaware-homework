#!/usr/bin/env node

const { readFileSync } = require('node:fs');

const EFFECTIVE_ADDRESS_TABLE = [
    'bx + si',
    'bx + di',
    'bp + si',
    'bp + di',
    'si',
    'di',
    'bp',
    'bx',
];

const REGISTER_BYTE_NAMES_TABLE = [
    'al',
    'cl',
    'dl',
    'bl',
    'ah',
    'ch',
    'dh',
    'bh',
];
const REGISTER_WORD_NAMES_TABLE = [
    'ax',
    'cx',
    'dx',
    'bx',
    'sp',
    'bp',
    'si',
    'di',
];

const REGISTER_NAMES_TABLE_LOOKUP = [
    REGISTER_BYTE_NAMES_TABLE,
    REGISTER_WORD_NAMES_TABLE,
];

function parseRegisterOrMemoryToOrFromRegister(buffer, offset, op) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const w = firstByte & 0b00000001;
    const registerNames = REGISTER_NAMES_TABLE_LOOKUP[w];
    const reg = (secondByte & 0b00111000) >> 3;
    const registerName = registerNames[reg];
    const rm = secondByte & 0b00000111;
    const mod = secondByte >> 6;
    let variableOperand, consumed;
    if (mod === 3) {
        const registerName = registerNames[rm];
        consumed = 2;
        variableOperand = { type: 'register', registerName };
    } else {
        const base = EFFECTIVE_ADDRESS_TABLE[rm];
        if (mod === 1) {
            const displacement = buffer.readInt8(offset + 2);
            variableOperand = { type: 'effectiveAddress', base, displacement };
            consumed = 3;
        } else if (mod === 2) {
            const displacement = buffer.readIntLE(offset + 2, 2);
            variableOperand = { type: 'effectiveAddress', base, displacement };
            consumed = 4;
        } else if (rm === 6) {
            const address = buffer.readUInt16LE(offset + 2, 2);
            variableOperand = { type: 'directAddress', address };
            consumed = 4;
        } else {
            variableOperand = { type: 'effectiveAddress', base };
            consumed = 2;
        }
    }
    const d = (firstByte & 0b00000010) >> 1;
    const registerOperand = { type: 'register', registerName };
    const instruction = {
        type: 'binaryOp',
        op,
        source: d ? variableOperand : registerOperand,
        destination: d ? registerOperand : variableOperand,
    };
    return [consumed, instruction];
}

function parseImmediateToRegister(buffer, offset, op) {
    const firstByte = buffer[offset];
    const w = (firstByte & 0b00001000) >> 3;
    const reg = firstByte & 0b00000111;
    const registerName = REGISTER_NAMES_TABLE_LOOKUP[w][reg];
    let consumed, value;
    if (w) {
        value = buffer.readIntLE(offset + 1, 2);
        consumed = 3;
    } else {
        value = buffer.readInt8(offset + 1);
        consumed = 2;
    }
    const instruction = {
        type: 'binaryOp',
        op,
        destination: { type: 'register', registerName },
        source: { type: 'immediate', value },
    };
    return [consumed, instruction];
}

function parseInstruction(buffer, offset) {
    const firstByte = buffer[offset];
    if ((firstByte & 0b11111100) === 0b10001000) {
        return parseRegisterOrMemoryToOrFromRegister(buffer, offset, 'mov');
    }
    if ((firstByte & 0b11110000) === 0b10110000) {
        return parseImmediateToRegister(buffer, offset, 'mov');
    }
    console.error(`Failed to parse opcode from ${firstByte.toString(2)}`);
    process.exit(1);
}

function operandToString(operand) {
    switch (operand.type) {
        case 'register':
            return operand.registerName;
        case 'immediate':
            return operand.value.toString();
        case 'directAddress':
            return `[${operand.address}]`;
        case 'effectiveAddress':
            const { base, displacement } = operand;
            if (displacement) {
                const sign = displacement > 0 ? '+' : '-';
                return `[${base} ${sign} ${Math.abs(displacement)}]`;
            }
            return `[${base}]`;
        default:
            return operand.toString();
    }
}

function printBinaryOp(instruction) {
    const { op, destination, source } = instruction;
    const destinationString = operandToString(destination);
    const sourceString = operandToString(source);
    console.log(`${op} ${destinationString}, ${sourceString}`);
}

function printAssembly(inFile, instructions) {
    console.log(`; ${inFile} disassembly:`);
    console.log('bits 16');
    for (const instruction of instructions) {
        switch (instruction.type) {
            case 'binaryOp':
                printBinaryOp(instruction);
                break;
            default:
                break;
        }
    }
}

function main() {
    const inFile = process.argv[2];
    const buffer = readFileSync(inFile);

    let offset = 0;
    const instructions = [];
    while (offset < buffer.length) {
        const [consumed, instruction] = parseInstruction(buffer, offset);
        offset += consumed;
        instructions.push(instruction);
    }

    printAssembly(inFile, instructions);
}

main();
