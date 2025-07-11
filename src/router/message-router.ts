import { Server, Socket } from 'socket.io';
import { initBet, disConnect, currentRoundBets } from '../module/bets/bets-session';
import {createLogger} from '../utilities/logger';

const logger = createLogger('Event');

export const messageRouter = async (io: Server, socket: Socket): Promise<void> => {
    socket.on('message', (data: string) => {
        logger.info(data);
        
        const event = data.split(':');
        const eventType = event[0];
        const eventData = event.slice(1);

        switch (eventType) {
            case 'BT':
                initBet(io, socket, eventData);
                break;
            case 'RC':
                currentRoundBets(socket);
                break;
            default:
                logger.warn(`Unhandled message type: ${eventType}`);
        }
    });

    socket.on('disconnect', async () => {
        await disConnect(io, socket);
    });
};
