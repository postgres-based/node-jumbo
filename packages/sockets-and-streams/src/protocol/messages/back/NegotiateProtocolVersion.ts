/* done
NegotiateProtocolVersion (B) 
Byte1('v')
Identifies the message as a protocol version negotiation message.

Int32
Length of message contents in bytes, including self.

Int32
Newest minor protocol version supported by the server for the major protocol version requested by the client.

Int32
Number of protocol options not recognized by the server.

Then, for protocol option not recognized by the server, there is the following:

String
The option name.
*/
import { MSG_UNDECIDED, NEGOTIATE_PROTOCOL } from './constants';
import { i32, messageLength, match } from './helper';
import ReadableStream from '../../../io/ReadableByteStream';

export type NegotiateProtocolResult = {
    minor: number;
    options: string[];
};

export function parse(ctx: ReadableStream, txtDecoder: TextDecoder): null | undefined | NegotiateProtocolResult {
    const { buffer, cursor } = ctx;
    const matched = match(buffer, cursor);
    if (matched === MSG_UNDECIDED) {
        return undefined;
    }
    const len = messageLength(buffer, cursor);

    const minor = i32(buffer, cursor + 5);
    let numOptionsNotRecognized = i32(buffer, cursor + 9);
    const options = new Array(numOptionsNotRecognized);
    for (let pos = cursor + 13; numOptionsNotRecognized > 0; ) {
        const idx = buffer.indexOf(0, pos);
        if (idx < 0) {
            return null;
        }
        options[pos - 13].push(txtDecoder.decode(buffer.slice(pos, idx)));
        pos = idx + 1;
        numOptionsNotRecognized--;
    }
    if (numOptionsNotRecognized === 0) {
        ctx.advanceCursor(len);
        return { minor, options };
    }
    return null;
}
