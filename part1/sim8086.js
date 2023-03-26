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

const JUMPS_TABLE = [
    'jo',
    'jno',
    'jb',
    'jnb',
    'je',
    'jne',
    'jbe',
    'jnbe',
    'js',
    'jns',
    'jp',
    'jnp',
    'jl',
    'jnl',
    'jle',
    'jnle',
];

const LOOPS_TABLE = ['loopnz', 'loopz', 'loop', 'jcxz'];

class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParseError';
    }
}

function asSignAndMagnitude(n) {
    return [n >= 0 ? '+' : '-', Math.abs(n)];
}

function parseVariableOperand(buffer, offset) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const rm = secondByte & 0b00000111;
    const mod = secondByte >> 6;
    let variableOperand, consumed;
    if (mod === 3) {
        const w = firstByte & 0b00000001;
        const registerName = REGISTER_NAMES_TABLE_LOOKUP[w][rm];
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
    return [consumed, variableOperand];
}

function parseRegisterOrMemoryToOrFromRegister(buffer, offset, op) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const w = firstByte & 0b00000001;
    const reg = (secondByte & 0b00111000) >> 3;
    const registerName = REGISTER_NAMES_TABLE_LOOKUP[w][reg];
    const [consumed, variableOperand] = parseVariableOperand(buffer, offset);
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

function parseImmediate(buffer, offset, wide) {
    let value, size;
    if (wide) {
        value = buffer.readIntLE(offset, 2);
        size = 2;
    } else {
        value = buffer.readInt8(offset);
        size = 1;
    }
    return [size, value];
}

function parseImmediateToRegister(buffer, offset, op) {
    const firstByte = buffer[offset];
    const w = (firstByte & 0b00001000) >> 3;
    const reg = firstByte & 0b00000111;
    const registerName = REGISTER_NAMES_TABLE_LOOKUP[w][reg];
    let consumed = 1;
    const [size, value] = parseImmediate(buffer, offset + 1, Boolean(w));
    consumed += size;
    const instruction = {
        type: 'binaryOp',
        op,
        destination: { type: 'register', registerName },
        source: { type: 'immediate', value },
    };
    return [consumed, instruction];
}

function parseImmediateToRegisterOrMemory(buffer, offset, op) {
    let [consumed, variableOperand] = parseVariableOperand(buffer, offset);
    const firstByte = buffer[offset];
    const sw = firstByte & 0b00000011;
    const [size, value] = parseImmediate(buffer, offset + consumed, sw === 1);
    consumed += size;
    const instruction = {
        type: 'binaryOp',
        op,
        destination: variableOperand,
        source: { type: 'immediate', value },
    };
    if (variableOperand.type !== 'register') {
        const w = firstByte & 0b00000001;
        instruction.width = w ? 'word' : 'byte';
    }
    return [consumed, instruction];
}

function parseImmediateToAccumulator(buffer, offset, op) {
    const w = buffer[offset] & 0b00000001;
    const [size, value] = parseImmediate(buffer, offset + 1, Boolean(w));
    const registerName = w ? 'ax' : 'al';
    const instruction = {
        type: 'binaryOp',
        op,
        destination: { type: 'register', registerName },
        source: { type: 'immediate', value },
    };
    return [size + 1, instruction];
}

function parseJump(buffer, offset, op) {
    const increment = buffer.readInt8(offset + 1);
    const instruction = {
        type: 'jump',
        op,
        increment,
    };
    return [2, instruction];
}

function parseGenericBinaryOp(targetByte) {
    switch (targetByte & 0b00111000) {
        case 0b00000000:
            return 'add';
        case 0b00101000:
            return 'sub';
        case 0b00111000:
            return 'cmp';
    }
}

function parseInstruction(buffer, offset) {
    const firstByte = buffer[offset];
    if ((firstByte & 0b11111100) === 0b10001000) {
        return parseRegisterOrMemoryToOrFromRegister(buffer, offset, 'mov');
    }
    if ((firstByte & 0b11110000) === 0b10110000) {
        return parseImmediateToRegister(buffer, offset, 'mov');
    }
    if ((firstByte & 0b11000100) === 0b00000000) {
        const op = parseGenericBinaryOp(firstByte);
        return parseRegisterOrMemoryToOrFromRegister(buffer, offset, op);
    }
    if ((firstByte & 0b11111100) === 0b10000000) {
        const secondByte = buffer[offset + 1];
        const op = parseGenericBinaryOp(secondByte);
        return parseImmediateToRegisterOrMemory(buffer, offset, op);
    }
    if ((firstByte & 0b11000100) === 0b00000100) {
        const op = parseGenericBinaryOp(firstByte);
        return parseImmediateToAccumulator(buffer, offset, op);
    }
    if ((firstByte & 0b11110000) === 0b01110000) {
        const op = JUMPS_TABLE[firstByte & 0b00001111];
        return parseJump(buffer, offset, op);
    }
    if ((firstByte & 0b11111100) === 0b11100000) {
        const op = LOOPS_TABLE[firstByte & 0b00000011];
        return parseJump(buffer, offset, op);
    }
    const firstByteAsBinary = firstByte.toString(2);
    throw new ParseError(`Failed to parse opcode from 0b${firstByteAsBinary}`);
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
                const [sign, magnitude] = asSignAndMagnitude(displacement);
                return `[${base} ${sign} ${magnitude}]`;
            }
            return `[${base}]`;
    }
}

function printBinaryOp(instruction) {
    const { op, destination, source, width } = instruction;
    const destinationString = operandToString(destination);
    const sourceString = operandToString(source);
    if (width) {
        console.log(`${op} ${width} ${destinationString}, ${sourceString}`);
    } else {
        console.log(`${op} ${destinationString}, ${sourceString}`);
    }
}

function generateLabelsMap(instructions) {
    const labelsMap = new Map();
    let labelCount = 0;
    for (let i = 0; i < instructions.length; i++) {
        const { offset, size, instruction } = instructions[i];
        if (instruction.type === 'jump') {
            const { increment } = instruction;
            const target = offset + size + increment;
            if (!labelsMap.has(target)) {
                labelsMap.set(target, `label${labelCount++}`);
            }
        }
    }
    return labelsMap;
}

function printAssembly(inFile, instructions) {
    console.log(`; ${inFile} disassembly:`);
    console.log('bits 16');

    const labelsMap = generateLabelsMap(instructions);
    for (const { offset, size, instruction } of instructions) {
        if (labelsMap.has(offset)) {
            console.log(`${labelsMap.get(offset)}:`);
        }
        switch (instruction.type) {
            case 'binaryOp':
                printBinaryOp(instruction);
                break;
            case 'jump':
                const { increment, op } = instruction;
                const target = offset + size + increment;
                const label = labelsMap.get(target);
                console.log(`${op} ${label}`);
                break;
            default:
                break;
        }
    }
}

function main() {
    const inFile = process.argv[2];
    const buffer = readFileSync(inFile);

    let offset = 0,
        parseError = null;
    const instructions = [];
    while (offset < buffer.length) {
        try {
            const [consumed, instruction] = parseInstruction(buffer, offset);
            instructions.push({ offset, size: consumed, instruction });
            offset += consumed;
        } catch (e) {
            if (e instanceof ParseError) {
                parseError = e;
                break;
            } else {
                throw e;
            }
        }
    }

    printAssembly(inFile, instructions);

    if (parseError) {
        console.error(parseError.message);
        process.exitCode = 1;
    }
}

main();
