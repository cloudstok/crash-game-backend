import { CleanedBet, CleanedCashout } from "../interfaces";

export type LobbyData = {
    lobbyId: number;
    status: number;
    isWebhook?: number;
    max_mult?: number;
    ongoingMaxMult?: string;
};

export type OddsData = {
    lobbyId?: number;
    start_time?: number;
    total_players?: number;
    max_mult?: number;
};

export type LobbyHistory = {
    time: Date;
    lobbyId: number;
    start_delay: number;
    end_delay: number;
    max_mult: number;
};

export type TransactionType = 'DEBIT' | 'CREDIT';
export type EventType = 'bet' | 'cancelledBet' | 'cashout' | 'settlement';
export type BetResponse = string | Record<string, unknown>;
export type CleanedData = CleanedBet | CleanedCashout;
export type BetMessageArgs = [...number[]];
export type CashoutMessageArgs = [number, number, number, ...string[]];
export type CancelBetMessageArgs = [...string[]];
export type GeneratedOdds = {
    win_per: number;
    mult: number;
};