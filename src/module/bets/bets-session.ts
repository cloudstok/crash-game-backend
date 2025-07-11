import { Server, Socket } from 'socket.io';
import { reducePlayerCount } from '../players/player-event';
import { Bet, BetRejectionError, BetRoundStats, CleanedBet, CleanedBetBase, CleanedCashout, FinalUserData, FulfilledBetResult, LobbyData, Logger, PlayerDetails, RoundData, RoundStatsReduced, Settlement, UserData, WebhookPreparedData } from '../../interfaces';
import { BetMessageArgs, CancelBetMessageArgs, CashoutMessageArgs, CleanedData } from '../../types';
import { createLogger } from '../../utilities/logger';
import { appConfig } from '../../utilities/app-config';
import { insertRoundStats } from './bets-db';
import { getCache, deleteCache, setCache } from '../../utilities/redis-connection';
import { logEventAndEmitResponse } from '../../utilities/helper-function';
import { prepareDataForWebhook, postDataToSourceForBet } from '../../utilities/common-function';
import { insertBets, insertCashout, insertSettleBet } from './bets-db';
import { sendToQueue } from '../../utilities/amqp';

const logger: Logger = createLogger('Bets', 'jsonl');
const cashoutLogger: Logger = createLogger('Cashout', 'jsonl');
const settlBetLogger: Logger = createLogger('Settlement', 'jsonl');
const statsLogger: Logger = createLogger('RoundStats', 'jsonl');
const failedBetsLogger: Logger = createLogger('userFailedBets', 'plain');
const cancelBetsLogger: Logger = createLogger('cancelledBet', 'jsonl');
const failedCashoutLogger: Logger = createLogger('failedCashout', 'jsonl');
const failedcancelledBetLogger: Logger = createLogger('failedCancelledBets', 'jsonl');
const userLocks: Map<string, Promise<void>> = new Map();
let bets: Bet[] = [];
let settlements: Settlement[] = [];
let lobbyData: LobbyData = {} as LobbyData

export const initBet = async (io: Server, socket: Socket, data: string[]): Promise<void> => {
    const [message, ...restData] = data;
    switch (message) {
        case 'PB':
            return placeBet(io, socket, restData as unknown as BetMessageArgs);
        case 'CO':
            return cashOut(io, socket, restData as CashoutMessageArgs);
        case 'CB':
            return cancelBet(io, socket, restData as CancelBetMessageArgs);
    }
};

export const currentRoundBets = (socket: Socket): void => {
    const betData: { bets: CleanedBet[], settlement: CleanedCashout[] } = {
        bets: [],
        settlement: []
    };
    const filteredBets: CleanedBet[] = bets.map(e => cleanData(e, 'bet') as CleanedBet);
    const filteredSettlements: CleanedCashout[] = settlements.map(e => cleanData(e, 'cashout') as CleanedCashout);
    betData.bets = filteredBets;
    betData.settlement = filteredSettlements;
    socket.emit('game_status', JSON.stringify(betData));
};

export const setCurrentLobby = (data: LobbyData): void => {
    lobbyData = data;
};

const acquireLock = async (user_id: string): Promise<() => void> => {

    while (userLocks.has(user_id)) {
        await userLocks.get(user_id);
    }

    let resolveLock: () => void = () => { };
    const lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve;
    });

    userLocks.set(user_id, lockPromise);

    return () => {
        resolveLock();
        userLocks.delete(user_id);
    };
};


export const placeBet = async (
    io: Server,
    socket: Socket,
    [lobby_id, atCo, btAmt, btn]: BetMessageArgs
): Promise<void> => {

    [lobby_id, atCo, btAmt, btn] = [lobby_id, atCo, btAmt, btn].map(Number);
    const rawData = { lobby_id, atCo, bet_amount: btAmt, btn, socket_id: socket.id };

    if (lobbyData.lobbyId !== lobby_id) {
        return logEventAndEmitResponse(socket, rawData, `Invalid Lobby Id ${lobbyData.lobbyId} ${lobby_id}`, 'bet');
    }

    const timeDifference = (Date.now() - lobby_id) / 1000;
    if (timeDifference > 6) {
        return logEventAndEmitResponse(socket, rawData, 'Bets has been closed for this Round', 'bet');
    }

    const releaseLock = await acquireLock(socket.id);
    try {

        const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
        if (!cachedPlayerDetails) {
            return logEventAndEmitResponse(socket, rawData, 'Invalid Player Details', 'bet');
        }
        const parsedPlayerDetails: FinalUserData = JSON.parse(cachedPlayerDetails);
        const bet_amount: number = btAmt;
        if (bet_amount < appConfig.minBetAmount || bet_amount > appConfig.maxBetAmount) {
            return logEventAndEmitResponse(socket, rawData, 'Invalid Bet', 'bet');
        }
        const { userId, operatorId, game_id, token, balance, image, name } = parsedPlayerDetails
        const bet_id = `b:${lobby_id}:${bet_amount}:${userId}:${operatorId}:${btn}`;

        const betObj: Bet = {
            bet_id,
            name,
            balance,
            user_id: userId,
            operator_id: operatorId,
            image,
            token,
            atCo,
            socket_id: socket.id,
            game_id
        };

        if (bet_amount > Number(balance)) {
            return logEventAndEmitResponse(socket, rawData, `Insufficient Balance ${bet_id}`, 'bet');
        }

        const webhookData = await prepareDataForWebhook({ ...betObj, bet_amount, lobby_id, user_id: userId, operator_id: operatorId }, "DEBIT", socket);
        if (!webhookData) {
            return logEventAndEmitResponse(socket, rawData, `Something went wrong ${bet_id}`, 'bet');
        }

        betObj.webhookData = webhookData;

        let userExistingBet = bets.find(e => e.token === betObj.token && Number(e.bet_id.split(':')[1]) == lobby_id);
        let currentBalance: number;

        if (userExistingBet) {
            currentBalance = userExistingBet.balance;
            if (bet_id === userExistingBet.bet_id) {
                return logEventAndEmitResponse(socket, rawData, 'duplicate bet', 'bet');
            }
        } else {
            currentBalance = balance;
        }

        const newBalance = currentBalance - bet_amount;
        await setCache(`PL:${socket.id}`, JSON.stringify({ ...parsedPlayerDetails, balance: newBalance }));

        betObj.balance = newBalance;
        betObj.bet_amount = bet_amount;
        bets.push(betObj);

        const playerDetails: PlayerDetails = { id: userId, name, balance: newBalance, image, operator_id: operatorId };
        logger.info(JSON.stringify({ req: rawData, res: betObj }));
        socket.emit("info", playerDetails);

        const cleanBetObj = cleanData(betObj, 'bet');
        io.emit("bet", cleanBetObj);

    } catch (error) {
        console.error('Place bet error:', error);
        return logEventAndEmitResponse(socket, rawData, 'Something went wrong, while placing bet', 'bet');
    } finally {
        releaseLock();
    }
};

function cleanData(betObj: Bet | Settlement, event: 'bet' | 'cashout'): CleanedData {
    const clearBetObj: CleanedBetBase = {
        bet_id: betObj.bet_id,
        maxAutoCashout: betObj.atCo
    };

    if (event === 'bet') {
        const cleanedBet: CleanedBet = {
            ...clearBetObj,
            name: betObj.name,
            image: betObj.image,
        };
        return cleanedBet;
    }

    const castedBetObj = betObj as Settlement;
    const cleanedCashout: CleanedCashout = {
        ...clearBetObj,
        max_mult: castedBetObj.max_mult,
        plane_status: castedBetObj.plane_status,
        final_amount: castedBetObj.final_amount
    };
    return cleanedCashout;
};

const removeBetObjAndEmit = async (bet_id: string, bet_amount_str: string, socket_id: string | undefined, io: Server): Promise<void> => {
    if (!socket_id) {
        console.error(`[ERR] socket_id is undefined for bet_id: ${bet_id}`);
        failedBetsLogger.error(JSON.stringify({ req: bet_id, res: 'bets cancelled by upstream - no socket_id' }));
        return;
    }
    const releaseLock = await acquireLock(socket_id);
    try {
        bets = bets.filter(e => e.bet_id !== bet_id);
        const cachedPlayerDetails = await getCache(`PL:${socket_id}`);
        if (cachedPlayerDetails) {
            const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
            parsedPlayerDetails.balance += parseFloat(bet_amount_str);
            await setCache(`PL:${socket_id}`, JSON.stringify(parsedPlayerDetails));
            const playerDetails: PlayerDetails = { id: parsedPlayerDetails.userId, name: parsedPlayerDetails.name, balance: parsedPlayerDetails.balance, image: parsedPlayerDetails.image, operator_id: parsedPlayerDetails.operatorId };
            io.to(socket_id).emit('info', playerDetails);
        }
        failedBetsLogger.error(JSON.stringify({ req: bet_id, res: 'bets cancelled by upstream' }));
    } catch (err) {
        console.error(`[ERR] while removing bet from betObj is::`, err);
    } finally {
        releaseLock();
    }
};

export const settleCallBacks = async (io: Server): Promise<void> => {
    try {
        if (bets.length === 0) return;
        console.log(`Settling webhook callbacks`);

        const results = await Promise.allSettled(bets.map(bet => postDataToSourceForBet(bet)));

        const processResultsPromises = results.map(result => {
            if (result.status === 'fulfilled') {
                return handleFulfilledResult(result.value as FulfilledBetResult, io);
            } else {
                console.error(`Error processing bet: ${JSON.stringify(result.reason)}`);
                return handleRejectedResult(result.reason as BetRejectionError, io);
            }
        });

        await Promise.allSettled(processResultsPromises);

    } catch (err) {
        console.error('Error in settleCallBacks:', err);
    }
};


const handleFulfilledResult = async (value: FulfilledBetResult, io: Server): Promise<void> => {
    try {
        if (!value || !io) return;
        const { socket_id, status, bet_id } = value;

        if (!socket_id || !bet_id) {
            console.error('Fulfilled result missing socket_id or bet_id', value);
            return;
        }

        const betParts = bet_id.split(":");
        if (betParts.length < 6) {
            console.error('Invalid bet_id format in handleFulfilledResult:', bet_id);
            return;
        }


        const originalBet = bets.find(b => b.bet_id === bet_id);
        if (!originalBet) {
            console.warn(`Original bet not found for ${bet_id} in handleFulfilledResult`);
            return;
        }

        if (status === 200) {
            await insertBets(value);
        } else {
            io.to(socket_id).emit("bet", { bet_id: bet_id, action: "cancel" });
            io.to(socket_id).emit("betError", `Bet Cancelled By Upstream ${bet_id}`);
            await removeBetObjAndEmit(bet_id, betParts[2], socket_id, io);
        }
    } catch (err) {
        console.error('Error in handleFulfilledResult:', err, value);
    }
};

const handleRejectedResult = async (reason: BetRejectionError, io: Server): Promise<void> => {
    try {
        if (!reason || !io) return;
        const { response, socket_id, bet_id } = reason;

        if (!socket_id || !bet_id) {
            console.error('Rejected reason missing socket_id or bet_id', reason);
            return;
        }

        const betParts = bet_id.split(":");
        if (betParts.length < 6) {
            console.error('Invalid bet_id format in handleRejectedResult:', bet_id);
            return;
        }


        const originalBet = bets.find(b => b.bet_id === bet_id);
        if (!originalBet) {
            console.warn(`Original bet not found for ${bet_id} in handleRejectedResult`);
            return;
        }


        if (response?.data?.msg === "Invalid Token or session timed out") {
            await removeBetObjAndEmit(bet_id, betParts[2], socket_id, io);
            await deleteCache(`PL${socket_id}`);
            io.to(socket_id).emit("logout", "user logout");
        } else {
            io.to(socket_id).emit("betError", `Bet ${bet_id} failed: ${response?.data?.msg || 'Unknown upstream error'}`);
            await removeBetObjAndEmit(bet_id, betParts[2], socket_id, io);
        }
    } catch (er) {
        console.error('Error in handleRejectedResult:', er, reason);
    }
};


export const cancelBet = async (io: Server, socket: Socket, [...betIdParts]: CancelBetMessageArgs): Promise<void> => {
    const bet_id = betIdParts.join(':');
    const canObj = { bet_id, socket_id: socket.id };

    try {

        if (lobbyData.lobbyId !== Number(betIdParts[1]) && lobbyData.status !== 0) {
            failedcancelledBetLogger.error(JSON.stringify({ req: canObj, res: "Round has been closed or invalid lobby for cancel bet event" }));
            return;
        };

        const cachedPlayerDetails = await getCache(`PL:${socket.id}`);

        if (!cachedPlayerDetails) {
            return logEventAndEmitResponse(socket, canObj, 'Invalid Player Details', 'bet');
        }

        const parsedPlayerDetails: FinalUserData = JSON.parse(cachedPlayerDetails);

        const betObjIndex = bets.findIndex(e => e.bet_id === bet_id);
        if (betObjIndex === -1) {
            return logEventAndEmitResponse(socket, canObj, 'No active bets for given bet id', 'cancelledBet');
        }
        const betObj = bets[betObjIndex];

        const [, , bet_amount_str, user_id, operator_id] = bet_id.split(":");
        const bet_amount = parseFloat(bet_amount_str);


        const newBalance = parsedPlayerDetails.balance + bet_amount;
        parsedPlayerDetails.balance = newBalance;
        await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));

        const playerDetails: PlayerDetails = { id: user_id, name: betObj.name, balance: newBalance, image: betObj.image, operator_id };
        socket.emit("info", playerDetails);

        cancelBetsLogger.info(JSON.stringify({ req: canObj, res: betObj }));
        bets = bets.filter(e => e.bet_id !== bet_id);
        io.emit("bet", { bet_id: bet_id, action: "cancel" });

    } catch (error) {
        console.error('Cancel bet error:', error);
        logEventAndEmitResponse(socket, canObj, 'Something went wrong while cancelling the bet', 'cancelledBet');
    }
};


let cashOutBetsThisRound: Set<string> = new Set();

export const cashOut = async (
    io: Server,
    socket: Socket,
    [max_mult, atCo, isAutoCashout, ...betIdParts]: CashoutMessageArgs
): Promise<void> => {

    max_mult = Number(max_mult); atCo = Number(atCo), isAutoCashout = Number(isAutoCashout);
    const betId = betIdParts.join(':');
    const CashObj = { max_mult, atCo, betId, isAutoCashout, socket_id: socket.id };

    const releaseLock = await acquireLock(`PL:${socket.id}`);
    try {

        const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
        if (!cachedPlayerDetails) {
            return logEventAndEmitResponse(socket, CashObj, 'Invalid Player Details', 'bet');
        }
        const parsedPlayerDetails: FinalUserData = JSON.parse(cachedPlayerDetails);

        if (cashOutBetsThisRound.has(betId)) {
            return;
        }

        if (lobbyData.status !== 1 && isAutoCashout) {
            return logEventAndEmitResponse(socket, CashObj, 'Round has been closed for cashout event', 'cashout');
        }

        const [, lobby_id, bet_amount, user_id, operator_id, btn] = betId.split(":");

        const betObjIndex = bets.findIndex(e => e.bet_id === betId && !e.plane_status);

        if (betObjIndex === -1) {
            return logEventAndEmitResponse(socket, CashObj, 'No active bet for the event or already cashed out', 'cashout');
        }

        const betObj: Bet = { ...bets[betObjIndex] };
        betObj.atCo = Number(betObj.atCo);
        Object.assign(betObj, { lobby_id, bet_amount, user_id, operator_id });


        let effective_max_mult: number;
        if ((betObj.atCo) && atCo && betObj.atCo === atCo && atCo <= Number(lobbyData.ongoingMaxMult)) {
            effective_max_mult = betObj.atCo;
        } else {
            effective_max_mult = max_mult;
        }

        betObj.atCo = !atCo ? 0 : atCo;


        if (effective_max_mult > Number(lobbyData.ongoingMaxMult) || isNaN(Number(lobbyData.ongoingMaxMult))) {
            if (isAutoCashout) {
                return logEventAndEmitResponse(socket, CashObj, `Cheat: Invalid Cashout Multiplier. Current: ${lobbyData.ongoingMaxMult}, Received: ${effective_max_mult}`, 'cashout');
            }
        }


        betObj.max_mult = Number(effective_max_mult).toFixed(2);
        betObj.plane_status = "cashout";
        const potentialWinnings = Number(bet_amount) * parseFloat(betObj.max_mult);
        betObj.final_amount = Math.min(potentialWinnings, appConfig.maxCashoutAmount).toFixed(2);
        betObj.amount = (parseFloat(betObj.final_amount) - Number(bet_amount)).toFixed(2);
        betObj.balance = (parsedPlayerDetails.balance + parseFloat(betObj.final_amount));


        await insertCashout(betObj);

        const webhookData = await prepareDataForWebhook(betObj, "CREDIT", socket);
        const key = `PL:${socket.id}`;
        try {
            await sendToQueue('', 'games_cashout', JSON.stringify({ ...webhookData, token: betObj.token, operatorId: operator_id }));
            parsedPlayerDetails.balance = betObj.balance;
            await setCache(key, JSON.stringify(parsedPlayerDetails));

        } catch (err) {
            failedCashoutLogger.error(JSON.stringify({ req: CashObj, res: `Error sending to queue or updating cache: ${err}` }));
        }

        bets[betObjIndex] = { ...betObj };

        const playerDetails: PlayerDetails = { id: user_id, name: betObj.name, balance: betObj.balance, image: betObj.image, operator_id };
        socket.emit("info", playerDetails);

        settlements.push(betObj as Settlement);
        cashoutLogger.info(JSON.stringify({ req: CashObj, res: betObj }));

        const user_settlements_for_event = settlements
            .filter(s => s.token === betObj.token && s.plane_status === 'cashout' && Number(s.lobby_id) === Number(lobby_id))
            .map(e => cleanData(e, 'cashout'));

        cashOutBetsThisRound.add(betId);
        io.to(betObj.socket_id).emit('singleCashout', user_settlements_for_event);

        const cleanSettlementObj = cleanData(betObj as Settlement, "cashout");
        io.emit("cashout", cleanSettlementObj);

    } catch (error) {
        console.error('Cashout error:', error);
        logEventAndEmitResponse(socket, CashObj, 'Something went wrong, while trying to Cashout', 'cashout');
    } finally {
        releaseLock();
    }
};


export const settleBet = async (io: Server, data: RoundData): Promise<void> => {
    try {
        const activeBetsToSettle = bets.filter(betObj => !betObj.plane_status);

        if (activeBetsToSettle.length > 0) {
            const settledBetUpdates: Bet[] = [];

            await Promise.all(activeBetsToSettle.map(async betObj => {
                const [b_prefix, lobby_id_from_bet, bet_amount_str, user_id, operator_id, identifier] = betObj.bet_id.split(":");

                if (betObj.atCo &&
                    betObj.atCo <= Number(data.max_mult)) {

                    const socketForBet = io.sockets.sockets.get(betObj.socket_id);
                    if (socketForBet) {
                        await cashOut(io, socketForBet, [betObj.atCo, betObj.atCo, 0, b_prefix, lobby_id_from_bet, bet_amount_str, user_id, operator_id, identifier]);
                        return;
                    } else {
                        settlBetLogger.warn(JSON.stringify({ req: betObj, res: `Socket not found for auto-cashout during settleBet: ${betObj.socket_id}` }));
                    }
                }

                const updatedBetObj: Bet = {
                    ...betObj,
                    lobby_id: Number(lobby_id_from_bet),
                    bet_amount: parseFloat(bet_amount_str),
                    user_id,
                    operator_id,
                    max_mult: Number(data.max_mult).toFixed(2),
                    plane_status: "crashed",
                    final_amount: "0.00",
                    amount: bet_amount_str
                };
                settlBetLogger.info(JSON.stringify(updatedBetObj));
                settlements.push(updatedBetObj as Settlement);
                settledBetUpdates.push(updatedBetObj);
            }));

            if (settledBetUpdates.length > 0) {
                await insertSettleBet(settledBetUpdates);
            }
        }

        const roundStats = createRoundStats(data, settlements);
        statsLogger.info(JSON.stringify(roundStats));
        await insertRoundStats(roundStats);

        bets.length = 0;
        settlements.length = 0;
        cashOutBetsThisRound.clear();

    } catch (error) {
        console.error('Error settling bets:', error);
    }
};

const createRoundStats = (roundData: RoundData, currentRoundSettlements: Settlement[]): BetRoundStats => {
    const stats = currentRoundSettlements.reduce<RoundStatsReduced>((acc, e) => {
        acc.total_bet_amount += Number(e.bet_amount);
        if (e.plane_status === "cashout") {
            acc.total_cashout_amount += Number(e.final_amount);
            acc.biggest_winner = Math.max(acc.biggest_winner, Number(e.final_amount));
        }
        if (e.plane_status === "crashed") {
            acc.biggest_looser = Math.max(acc.biggest_looser, Number(e.bet_amount));
        }
        return acc;
    }, { total_bet_amount: 0, total_cashout_amount: 0, biggest_winner: 0, biggest_looser: 0 });

    const end_time = Date.now();
    const total_round_profit_or_loss = stats.total_bet_amount - stats.total_cashout_amount;

    return {
        ...roundData,
        end_time,
        total_bets: currentRoundSettlements.length,
        total_bet_amount: stats.total_bet_amount,
        total_cashout_amount: stats.total_cashout_amount,
        biggest_winner: stats.biggest_winner,
        biggest_looser: stats.biggest_looser,
        total_round_settled: total_round_profit_or_loss
    };
};

export const disConnect = async (io: Server, socket: Socket): Promise<void> => {

    const userActiveBets = bets.filter(bet => bet.socket_id === socket.id && !bet.plane_status);

    if (userActiveBets.length > 0) {
        if (lobbyData.status === 1 && lobbyData.ongoingMaxMult) {
            await Promise.all(userActiveBets.map(async bet => {
                let cashoutMultiplier = Number(lobbyData.ongoingMaxMult);
                if (bet.atCo && bet.atCo < Number(lobbyData.ongoingMaxMult)) {
                    cashoutMultiplier = bet.atCo;
                };
                const [b_prefix, lobby_id_from_bet, bet_amount_str, user_id, operator_id, identifier] = bet.bet_id.split(":");
                await cashOut(io, socket, [cashoutMultiplier, bet.atCo, 1, b_prefix, lobby_id_from_bet, bet_amount_str, user_id, operator_id, identifier]);
            }));
        } else if (lobbyData.status === 0 && !lobbyData.isWebhook) {
            const betsToCancelOnDisconnect = userActiveBets.map(b => b.bet_id);
            bets = bets.filter(bet => bet.socket_id !== socket.id);
            logger.info(`Bets cancelled due to disconnect during betting phase for socket ${socket.id}: ${betsToCancelOnDisconnect.join(', ')}`);
        } else if (lobbyData.status == 0 && lobbyData.isWebhook) {
            await Promise.all(userActiveBets.map(async bet => {
                setTimeout(async() => await cashOut(io, socket, [1.00, bet.atCo, 0, ...bet.bet_id.split(':')]), 100);
            }));
        }
    };
    reducePlayerCount();
    setTimeout(async() => await deleteCache(`PL:${socket.id}`), 200);
};

export const getCurrentLobby = (): LobbyData => lobbyData;