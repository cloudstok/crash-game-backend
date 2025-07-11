import { BetRequest } from '../interfaces';
import { BetResponse, EventType } from '../types';
import { createLogger } from './logger';
import { Socket, Server as SocketIOServer } from 'socket.io';

const failedBetLogger = createLogger('failedBets', 'jsonl');
const failedCashoutLogger = createLogger('failedCashout', 'jsonl');
const failedSettlementLogger = createLogger('failedCashout', 'jsonl');
const cancelledBetLogger = createLogger('failedCancelledBets', 'jsonl');

export function logEventAndEmitResponse(
    socket: Socket,
    req: BetRequest,
    res: BetResponse,
    event: EventType,
    io?: SocketIOServer
): void {
    const logData = JSON.stringify({ req, res });

    switch (event) {
        case 'bet':
            failedBetLogger.error(logData);
            break;
        case 'cancelledBet':
            cancelledBetLogger.error(logData);
            break;
        case 'cashout':
            failedCashoutLogger.error(logData);
            break;
        case 'settlement':
            failedSettlementLogger.error(logData);
            if (Object.keys(req).length === 0) return;
            socket.to(req.socket_id).emit('logout', 'user_logout');
            return;
    }

    if (res === 'Session Timed Out') {
        if(io) io.to(socket.id).emit('logout', 'user_logout');
        return;
    }

    socket.emit('betError', res);
}