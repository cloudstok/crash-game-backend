import { Server } from "socket.io";
import { settleBet, settleCallBacks, setCurrentLobby, getCurrentLobby } from "../bets/bets-session";
import { getPlayerCount } from "../players/player-event";
import { insertLobbies } from "./lobbies-db";
import { createLogger } from "../../utilities/logger";
import { read } from "../../utilities/db-connection";
import { GeneratedOdds, LobbyData, LobbyHistory, OddsData } from "../../types";
const logger = createLogger('Plane', 'jsonl');
const planeErrorLogger = createLogger('PlaneError', 'plain');

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
let lobbiesMult: string[] | undefined = [];
let betCount: number = 0;

export function getLobbiesMult() { return lobbiesMult };
export function getBetCount() { return betCount };
function getRandomBetCount() {
    betCount = Math.floor(Math.random() * (3000 - 600 + 1)) + 600;
    return betCount
}

const checkPlaneHealth = (): NodeJS.Timeout => setInterval(() => {
    const { lobbyId, status } = getCurrentLobby() as LobbyData;
    if (isNaN(Number(lobbyId))) {
        planeErrorLogger.error(`Invalid Lobby id got ${lobbyId}. Exiting.. LobbyData is ${JSON.stringify(getCurrentLobby())}`);
        process.exit(1);
    }
    const timeDiff = (Date.now() - Number(lobbyId)) / 1000;
    if (status === 0 && timeDiff > 60) {
        planeErrorLogger.error(`Lobby Timed Out ${lobbyId}. Exiting.. LobbyData is ${JSON.stringify(getCurrentLobby())}`);
        process.exit(1);
    }
    if (timeDiff > 240) {
        planeErrorLogger.error(`Lobby Taking too much time ${lobbyId}. LobbyData is ${JSON.stringify(getCurrentLobby())}`);
    }
    if (timeDiff > 600) {
        planeErrorLogger.error(`Exiting Lobby as it took more than 5 minutes ${lobbyId}. LobbyData is ${JSON.stringify(getCurrentLobby())}`);
        process.exit(1);
    }
}, 1000);

export const initPlane = async (io: Server): Promise<void> => {
    logger.info("lobby started");
    initLobby(io);
    checkPlaneHealth();
    lobbiesMult = await getMaxMultOdds();
};

let odds: OddsData = {};

const initLobby = async (io: Server): Promise<void> => {
    const lobbyId = Date.now();
    let recurLobbyData: LobbyData = { lobbyId, status: 0, isWebhook: 0 };
    setCurrentLobby(recurLobbyData);

    io.emit('betCount', getRandomBetCount());
    io.emit('maxOdds', lobbiesMult);
    odds.lobbyId = lobbyId;
    odds.start_time = Date.now();

    const start_delay = 7;
    let inc = 1;
    const end_delay = 6;

    odds.total_players = await getPlayerCount();
    const max_mult = generateOdds().mult;

    for (let x = 0; x < start_delay; x++) {
        io.emit("plane", `${lobbyId}:${inc}:0`);
        inc++;
        await sleep(1000);
    }

    io.emit("plane", `${lobbyId}:PROCESSING:0`);
    recurLobbyData.max_mult = max_mult;
    recurLobbyData.isWebhook = 1;
    setCurrentLobby(recurLobbyData);

    await settleCallBacks(io);
    await sleep(3000);

    let init_val = 1;
    recurLobbyData.status = 1;
    setCurrentLobby(recurLobbyData);

    do {
        io.emit("plane", `${lobbyId}:${init_val.toFixed(2)}:1`);
        init_val += 0.01;

        if (init_val < 2) {
            init_val += 0.01;
        } else if (init_val < 10) {
            init_val *= 1.003;
        } else if (init_val < 50) {
            init_val *= 1.004;
        } else {
            init_val *= 1.005;
        }

        recurLobbyData.ongoingMaxMult = init_val.toFixed(2);
        setCurrentLobby(recurLobbyData);
        await sleep(100);
    } while (init_val < max_mult);

    odds.max_mult = max_mult;

    recurLobbyData.status = 2;
    setCurrentLobby(recurLobbyData);

    for (let y = 0; y < end_delay; y++) {
        if (y === 3) {
            await settleBet(io, odds);
        }
        io.emit("plane", `${lobbyId}:${max_mult.toFixed(2)}:2`);
        await sleep(1000);
    }

    odds = {};

    const history: LobbyHistory = {
        time: new Date(),
        lobbyId,
        start_delay,
        end_delay,
        max_mult
    };

    io.emit("history", JSON.stringify(history));
    if (lobbiesMult && lobbiesMult?.length >= 30) lobbiesMult?.pop();
    if (lobbiesMult) lobbiesMult = [Number(history.max_mult).toFixed(2), ...lobbiesMult];
    logger.info(JSON.stringify(history));
    await insertLobbies(history);

    return initLobby(io);
};

export const getMaxMultOdds = async (): Promise<string[] | undefined> => {
    try {
        const odds = await read('SELECT max_mult from lobbies order by created_at desc limit 30');
        const oddsData = odds.map(e => e.max_mult);
        return oddsData;
    } catch (err) {
        console.error(err);
    }
};

const RTP = 9700;

function generateOdds(): GeneratedOdds {
    const win_per = Math.random() * 99.00;
    let mult = RTP / (win_per * 100);

    if (mult < 1.01) {
        mult = 1.00;
    } else if (mult > 20) {
        const highMultRng = Math.random();
        if (highMultRng < 0.5) mult = generateOdds().mult;
    } else if (mult > 100000) {
        mult = 100000;
    }

    return { win_per, mult };
}