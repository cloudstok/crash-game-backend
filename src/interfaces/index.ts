export interface GameResult {
  jkr: string;
  andr: string[];
  bahar: string[];
  winner: null | 1 | 2;
}

export type BetResult = {
    chip: number;
    betAmount: number;
    winAmount: number;
    mult: number;
    status: 'win' | 'loss';
};

export interface RawUserData {
    user_id: string;
    operatorId: string;
    balance: number;
    [key: string]: any;
};

export interface FinalUserData extends RawUserData {
    userId: string;
    id: string;
    game_id: string;
    token: string;
    image: number;
};

export interface UserBet {
    betAmount: number;
    chip: number;
}


export interface BetData {
    bet_id: string;
    totalBetAmount: number;
    userBets: UserBet[];
};

export interface SingleBetData {
    betAmount: number;
    chip: number;
};

export interface BetObject {
    bet_id: string;
    token: string;
    socket_id: string;
    game_id: string;
    bet_amount?: number;
    userBets?: SingleBetData[];
    lobby_id: number;
    txn_id?: string;
    ip?: string
};

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
    time: number;
    level: LogLevel;
    name: string;
    msg: string;
};

export type WebhookKey = 'CREDIT' | 'DEBIT';

export interface BetsData {
    id: number;
    bet_amount?: number | string;
    winning_amount?: number | string;
    game_id?: string;
    user_id: string;
    bet_id?: string;
    txn_id?: string;
    ip?: string;
};

export interface AccountsResult {
    txn_id?: string;
    status: boolean;
    type: WebhookKey
};

export interface WebhookData {
    txn_id: string;
    ip?: string;
    game_id: string | undefined;
    user_id: string;
    amount?: string | number;
    description?: string;
    bet_id?: string;
    txn_type?: number;
    txn_ref_id?: string;
};

export interface LobbiesData {
    lobbyId: number;
    status: number;
};

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Value = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  value: Value;
  suit: Suit;
}


//==========New Interfaces

export interface CashoutData {
  name: string;
  image: number;
  max_mult?: string;
  bet_id: string;
  atCo: number;
  final_amount?: string;
};

export interface SettlementData {
  bet_id: string;
  name: string;
  image: number;
  max_mult?: string;
  atCo: number;
};

export interface RoundStats {
  lobbyId?: number;
  start_time?: number;
  total_players?: number;
  max_mult?: number;
  end_time?: number;
  total_bets: number;
  total_bet_amount: number;
  total_cashout_amount: number;
  biggest_winner?: number;
  biggest_looser?: number;
  total_round_settled: number;
};

export interface InsertBetData {
  bet_id: string;
  name: string;
  image: number;
  atCo?: number;
};

export interface UserData {
    id: string;
    name: string;
    balance: string | number;
    avatar: string;
    session_token: string;
    game_id: string;
    operator_id?: string;
}

export interface Bet {
    bet_id: string;
    balance: number;
    name: string;
    image: number;
    token: string; 
    atCo: number;
    socket_id: string;
    game_id: string;
    webhookData?: WebhookPreparedData;
    bet_amount?: string | number; 
    lobby_id?: number; 
    user_id: string;
    operator_id: string; 
    max_mult?: string; 
    plane_status?: 'cashout' | 'crashed' | string; 
    final_amount?: string;
    amount?: string;
}

export interface Settlement extends Bet {
    max_mult: string;
    plane_status: 'cashout' | 'crashed';
    final_amount: string;
};

export interface LobbyData {
    lobbyId: number;
    status: number;
    isWebhook?: number;
    ongoingMaxMult?: string | number;
    max_mult?: string | number;
}

export interface AppConfig {
    minBetAmount: number;
    maxBetAmount: number;
    maxCashoutAmount: number;
}

export interface WebhookPreparedData {
    [key: string]: any;
}

export interface PlayerDetails {
    id: string;
    name: string;
    balance: number;
    image: number;
    operator_id: string;
}

export interface CleanedBetBase {
    bet_id: string;
    maxAutoCashout: number;
};

export interface CleanedBet extends CleanedBetBase {
    name: string;
    image: number;
};

export interface CleanedCashout extends CleanedBetBase {
    max_mult: string;
    plane_status: string;
    final_amount: string;
};

export interface RoundData { 
    lobbyId?: number | undefined;
    max_mult?: number;
}

export interface RoundStatsReduced {
    total_bet_amount: number;
    total_cashout_amount: number;
    biggest_winner: number;
    biggest_looser: number;
}

export interface BetRoundStats extends RoundData, RoundStatsReduced {
    lobby_id?: number;
    start_time?: number;
    total_players?: number;
    end_time: number;
    total_bets: number;
    total_round_settled: number;
}

export interface FulfilledBetResult {
    socket_id: string;
    status: number; 
    bet_id: string;
    name: string;
    image: number;
    [key: string]: any;
};

export interface BetRejectionError extends Error {
    response?: {
        data?: {
            msg?: string;
        };
    };
    socket_id: string;
    bet_id: string;
};

export interface Logger {
    info: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
};

export interface LobbyInsertData {
    time?: Date;
    lobbyId: number;
    start_delay: number;
    end_delay: number;
    max_mult: number;
};

export interface DBConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
}

export interface DBProps {
    retries: number;
    interval: number;
}

export interface RedisConfig {
    host: string;
    port: number;
    retry: number;
    interval: number;
}

export interface AppConfigData {
    minBetAmount: number;
    maxBetAmount: number;
    maxCashoutAmount: number;
    dbConfig: DBConfig;
    dbProps: DBProps;
    dbReadConfig: DBConfig;
    redis: RedisConfig;
};

export interface PostDataInput {
    webhookData?: any;
    token: string;
    socket_id: string;
    bet_id: string;
    atCo?: number;
    name: string,
    image: number;
};

export interface WebhookOutput {
    amount: string | number | undefined;
    txn_id: string;
    ip: string;
    game_id: string;
    user_id: string;
    description?: string;
    bet_id?: string;
    socket_id?: string;
    txn_type?: 0 | 1;
    txn_ref_id?: string;
};

export interface WebhookBetObj {
    webhookData?: any;
    lobby_id?: number;
    bet_amount?: number | string;
    game_id: string;
    bet_id: string;
    final_amount?: string;
    socket_id: string;
    user_id: string;
    operator_id: string;
};

export interface BetRequest {
    socket_id: string;
    [key: string]: any;
};