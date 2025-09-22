import { Server, Socket } from 'socket.io';
import { getUserDataFromSource, reducePlayerCount } from './module/players/player-event';
import { eventRouter } from './router/event-router';
import { messageRouter } from './router/message-router';
import { setCache, getCache } from './utilities/redis-connection';
import { getLobbiesMult, matchCountStats } from './module/lobbies/lobby-event';
import { currentRoundBets, getCurrentLobby } from './module/bets/bets-session';
import { lobbyData } from './module/bets/bets-session';

export const initSocket = (io: Server): void => {
  eventRouter(io);

  io.on('connection', async (socket: Socket) => {

    const { token, game_id } = socket.handshake.query as { token?: string; game_id?: string };

    if (!token || !game_id) {
      socket.disconnect(true);
      console.log('Mandatory params missing', token);
      return;
    }

    const userData = await getUserDataFromSource(token, game_id);

    if (!userData) {
      console.log('Invalid token', token);
      socket.disconnect(true);
      return;
    }
    
    // check if user already connected
    const existingSocketId = await getCache(userData.id);
    if (existingSocketId) {
        console.log("User already connected, disconnecting older session...");
        const socket = io.sockets.sockets.get(existingSocketId);
        if (socket) {
            socket.emit("betError", "User connected from another source");
            socket.disconnect(true);
        }
    }

    socket.emit('info',
      {
        id: userData.userId,
        operator_id: userData.operatorId,
        balance: userData.balance,
      },
    );

    await setCache(`PL:${socket.id}`, JSON.stringify({ ...userData, socketId: socket.id }), 3600);
    await setCache(userData.id, socket.id);

    messageRouter(io, socket );
    io.emit("betStats", { betCount: matchCountStats.betCount, totalBetAmount: matchCountStats.totalBetAmount, totalCashout: lobbyData.status == 1 ? matchCountStats.totalCashout : 0 });
    socket.emit('maxOdds', getLobbiesMult());
    currentRoundBets(socket);

    socket.on('error', (error: Error) => {
      console.error(`Socket error: ${socket.id}. Error: ${error.message}`);
    });
  });
};