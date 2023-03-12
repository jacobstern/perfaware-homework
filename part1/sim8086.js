#!/usr/bin/env node

const process = require('process');
const fs = require('fs');

const EFFECTIVE_ADDRESS_TABLE = ['bx + si', 'bx + di', 'bp + si', 'bp + di', 'si', 'di', 'bp', 'bx'];

const REGISTER_BYTE_NAMES_TABLE = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh'];
const REGISTER_WORD_NAMES_TABLE = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'];

const REGISTER_NAMES_TABLE_LOOKUP = [REGISTER_BYTE_NAMES_TABLE, REGISTER_WORD_NAMES_TABLE];

function parseRegisterOrMemoryToOrFromRegister(buffer, offset) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const w = firstByte & 0x01;
    const registerNames = REGISTER_NAMES_TABLE_LOOKUP[w];
    const reg = (secondByte & 0x38) >> 3;
    const registerName = registerNames[reg];
    const rm = secondByte & 0x07;
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
    const d = (firstByte & 0x02) >> 1;
    const direction = d ? 'variableToRegister' : 'registerToVariable';
    const instruction = {
        type: 'registerOrMemoryToOrFromRegister',
        registerName,
        variableOperand,
        direction,
    };
    return [consumed, instruction];
}

function parseImmediateToRegisterOrMemory(buffer, offset) {
    const firstByte = buffer[offset];
    const w = (firstByte & 0x08) >> 3;
    const reg = firstByte & 0x07;
    const registerName = REGISTER_NAMES_TABLE_LOOKUP[w][reg];
    let consumed, immediate;
    if (w) {
        consumed = 3;
        immediate = buffer.readIntLE(offset + 1, 2);
    } else {
        consumed = 2;
        immediate = buffer.readInt8(offset + 1);
    }
    const instruction = {
        type: 'immediateToRegisterOrMemory',
        registerName,
        immediate,
    };
    return [consumed, instruction];
}

function parseInstruction(buffer, offset) {
    const firstByte = buffer[offset];
    if ((firstByte & 0xFC) === 0x88) {
        return parseRegisterOrMemoryToOrFromRegister(buffer, offset);
    }
    if ((firstByte & 0xF0) === 0xB0) {
        return parseImmediateToRegisterOrMemory(buffer, offset);
    }
    console.error('Failed to parse opcode from 0x%s', firstByte.toString(16));
    process.exit(1);
}

function printImmediateToRegisterOrMemory(instruction) {
    const { registerName, immediate } = instruction;
    console.log('mov %s, %i', registerName, immediate);
}

function printRegisterOrMemoryToOrFromRegister(instruction) {
    const { registerName, variableOperand, direction } = instruction;
    let variableOperandString;
    switch (variableOperand.type) {
        case 'register': {
            const { registerName } = variableOperand;
            variableOperandString = registerName;
            break;
        }
        case 'effectiveAddress': {
            const { base, displacement } = variableOperand;
            if (displacement) {
                const sign = displacement > 0 ? '+' : '-';
                const magnitude = Math.abs(displacement);
                variableOperandString = `[${base} ${sign} ${magnitude}]`;
            } else {
                variableOperandString = `[${base}]`;
            }
            break;
        }
        case 'directAddress': {
            const { address } = variableOperand;
            variableOperandString `[${address}]`;
            break;
        }
        default:
            break;
    }
    if (direction === 'variableToRegister') {
        console.log('mov %s, %s', registerName, variableOperandString);
    } else {
        console.log('mov %s, %s', variableOperandString, registerName);
    }
}

function printAssembly(inFile, instructions) {
    console.log('; %s disassembly:', inFile);
    console.log('bits 16');
    for (const instruction of instructions) {
        switch (instruction.type) {
            case 'immediateToRegisterOrMemory':
                printImmediateToRegisterOrMemory(instruction);
                break;
            case 'registerOrMemoryToOrFromRegister':
                printRegisterOrMemoryToOrFromRegister(instruction);
                break;
            default:
                break;
        }
    }
}

function main() {
    const inFile = process.argv[2];

    fs.readFile(inFile, (err, buffer) => {
        if (err) {
            console.error(err.message);
            process.exit(1);
        }
    
        let offset = 0;
        const instructions = [];
        while (offset < buffer.length) {
            const [consumed, instruction] = parseInstruction(buffer, offset);
            offset += consumed;
            instructions.push(instruction);
        }
    
        printAssembly(inFile, instructions);
    });    
}

main();
