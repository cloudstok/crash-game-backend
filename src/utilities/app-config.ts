import dotenv from 'dotenv';
import { AppConfigData } from '../interfaces';
dotenv.config();

function getEnvVar(name: string, required = true): string {
    const value = process.env[name];
    if (!value && required) {
        throw new Error(`Environment variable ${name} is required but not set.`);
    }
    return value!;
}

function toNumber(value: string, name: string): number {
    const num = Number(value);
    if (isNaN(num)) throw new Error(`Environment variable ${name} should be a number`);
    return num;
}

const appConfig: AppConfigData = {
    minBetAmount: toNumber(getEnvVar('MIN_BET_AMOUNT'), 'MIN_BET_AMOUNT'),
    maxBetAmount: toNumber(getEnvVar('MAX_BET_AMOUNT'), 'MAX_BET_AMOUNT'),
    maxCashoutAmount: toNumber(getEnvVar('MAX_CASHOUT'), 'MAX_CASHOUT'),

    dbConfig: {
        host: getEnvVar('DB_HOST'),
        user: getEnvVar('DB_USER'),
        password: getEnvVar('DB_PASSWORD'),
        database: getEnvVar('DB_NAME'),
        port: toNumber(getEnvVar('DB_PORT'), 'DB_PORT'),
        waitForConnections: true,
        connectionLimit: 50,
        queueLimit: 0
    },

    dbProps: {
        retries: toNumber(getEnvVar('DB_MAX_RETRIES'), 'DB_MAX_RETRIES'),
        interval: toNumber(getEnvVar('DB_RETRY_INTERVAL'), 'DB_RETRY_INTERVAL'),
    },

    dbReadConfig: {
        host: getEnvVar('DB_HOST_READ'),
        user: getEnvVar('DB_USER'),
        password: getEnvVar('DB_PASSWORD'),
        database: getEnvVar('DB_NAME'),
        port: toNumber(getEnvVar('DB_PORT'), 'DB_PORT'),
        waitForConnections: true,
        connectionLimit: 50,
        queueLimit: 0
    },

    redis: {
        host: getEnvVar('REDIS_HOST'),
        port: toNumber(getEnvVar('REDIS_PORT'), 'REDIS_PORT'),
        retry: toNumber(getEnvVar('REDIS_RETRY'), 'REDIS_RETRY'),
        interval: toNumber(getEnvVar('REDIS_RETRY_INTERVAL'), 'REDIS_RETRY_INTERVAL'),
    }
};

export { appConfig }