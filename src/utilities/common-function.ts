import axios, { AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { createLogger } from '../utilities/logger';
import { Socket } from 'socket.io';
import { PostDataInput, WebhookBetObj, WebhookOutput } from '../interfaces';
import { TransactionType } from '../types';

const failedLogger = createLogger('FailedThirdPartyAPICalls', 'jsonl');

export function generateUUIDv7(): string {
    const timestamp = Date.now();
    const timeHex = timestamp.toString(16).padStart(12, '0');
    const randomBits = crypto.randomBytes(8).toString('hex').slice(2);

    const uuid = [
        timeHex.slice(0, 8),
        timeHex.slice(8) + randomBits.slice(0, 4),
        '7' + randomBits.slice(4, 7),
        (parseInt(randomBits.slice(7, 8), 16) & 0x3f | 0x80).toString(16) + randomBits.slice(8, 12),
        randomBits.slice(12)
    ];

    return uuid.join('-');
}

export const postDataToSourceForBet = async (data: PostDataInput): Promise<any> => {
    const { webhookData, token, socket_id, bet_id } = data;

    try {
        const url = process.env.service_base_url;
        if (!url) throw new Error('service_base_url is undefined');

        const clientServerOptions: AxiosRequestConfig = {
            method: 'POST',
            url: `${url}/service/operator/user/balance/v2`,
            headers: { token },
            data: webhookData,
            timeout: 5000
        };

        try {
            const result = await axios(clientServerOptions);
            return { status: result.status, ...data };
        } catch (err: any) {
            console.log(`[ERR] received from upstream server`, err?.response?.status);
            const response = err.response ? err.response.data : err?.response?.status;
            failedLogger.error(JSON.stringify({ req: { webhookData, token, socket_id, bet_id }, res: response }));
            return { response, token, socket_id, bet_id };
        }

    } catch (err) {
        console.error(`[ERR] while posting data to source is:::`, err);
        failedLogger.error(JSON.stringify({ req: data, res: `Something went wrong` }));
        return { response: {}, token, socket_id, bet_id };
    }
};

export const prepareDataForWebhook = async (
    betObj: WebhookBetObj,
    key: TransactionType,
    socket: Socket
): Promise<WebhookOutput | false> => {
    try {
        const {
            webhookData, lobby_id, bet_amount, game_id, bet_id,
            final_amount, socket_id, user_id
        } = betObj;

        let userIP = socket.handshake.address;
        if (socket.handshake.headers['x-forwarded-for']) {
            const forwarded = socket.handshake.headers['x-forwarded-for'];
            if (typeof forwarded === 'string') {
                userIP = forwarded.split(',')[0].trim();
            }
        }

        const obj: WebhookOutput = {
            amount: Number(bet_amount).toFixed(2),
            txn_id: generateUUIDv7(),
            ip: userIP,
            game_id,
            user_id: decodeURIComponent(user_id)
        };

        switch (key) {
            case 'DEBIT':
                obj.description = `${obj.amount} debited for Crash game for Round ${lobby_id}`;
                obj.bet_id = bet_id;
                obj.socket_id = socket_id;
                obj.txn_type = 0;
                break;

            case 'CREDIT':
                obj.amount = final_amount;
                obj.txn_ref_id = webhookData.txn_id;
                obj.description = `${final_amount} credited for Crash game for Round ${lobby_id}`;
                obj.txn_type = 1;
                break;
        }

        return obj;
    } catch (err) {
        console.error(`[ERR] while trying to prepare data for webhook is::`, err);
        return false;
    }
};


export default {
    postDataToSourceForBet,
    prepareDataForWebhook,
    generateUUIDv7
};
