/*
Parse (F) 
Byte1('P') // 80
Identifies the message as a Parse command.

Int32
Length of message contents in bytes, including self.

String
The name of the destination prepared statement (an empty string selects the unnamed prepared statement).

String
The query string to be parsed.

Int16
The number of parameter data types specified (can be zero). Note that this is not an indication of the number of parameters that might appear in the query string, only the number that the frontend wants to prespecify types for.

Then, for each parameter, there is the following:

Int32
Specifies the object ID of the parameter data type. Placing a zero here is equivalent to leaving the type unspecified.
*/
import Encoder from '../../../utils/Encoder';
import { MAX_MEM_BLOCK_SIZE, MIN_MEM_BLOCK_SIZE, MemoryCategories } from '../../../utils/MemoryManager';

export default function createParseMessage(
    encoder: Encoder,
    sql: string,
    /*
    name cannnot be longer then 64 chars (so 63+ zero termination)
    https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
    */
    name = '',
    ...iods: number[]
): Uint8Array | null {
    const memSize = Math.max(1 << Math.ceil(Math.log2(sql.length)), MIN_MEM_BLOCK_SIZE);
    if (memSize > MAX_MEM_BLOCK_SIZE) {
        return null;
    }
    encoder
        .init(memSize as MemoryCategories)
        .nextMessage(80) // parse
        ?.cstr(name)
        ?.cstr(sql)
        ?.i16(iods.length);
    if (iods.length) {
        iods.forEach((v) => encoder.i32(v));
    }
    return encoder.setLength().getMessage();
}
