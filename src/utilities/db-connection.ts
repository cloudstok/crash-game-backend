import { createPool, Pool, format } from 'mysql2/promise';
import { RowDataPacket, ResultSetHeader, FieldPacket } from 'mysql2';
import dotenv from 'dotenv';
import { createLogger } from '../utilities/logger';
import { appConfig } from './app-config';
import { bets, lobbies, roundStats, settlement, user_messages } from '../db/tables';

dotenv.config();

const logger = createLogger('Database');

const {
    dbConfig,
    dbReadConfig,
    dbProps: { retries, interval }
} = appConfig;

const maxRetries = Number(retries);
const retryInterval = Number(interval);

let pool: Pool | null = null;
let readpool: Pool | null = null;

export const createDatabasePool = async (): Promise<void> => {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            pool = createPool(dbConfig);
            readpool = createPool(dbReadConfig);
            logger.info('DATABASE POOLS CREATED AND EXPORTED');
            return;
        } catch (err: any) {
            attempts += 1;
            logger.error(`DATABASE CONNECTION FAILED. Retry ${attempts}/${maxRetries}. Error: ${err.message}`);

            if (attempts >= maxRetries) {
                logger.error('Maximum retries reached. Could not connect to the database.');
                process.exit(1);
            }

            await new Promise((res) => setTimeout(res, retryInterval));
        }
    }
};

export const read = async <T extends RowDataPacket[] | RowDataPacket[][] = RowDataPacket[]>(
    query: string,
    params: any[] = [],
    attempts = 0
): Promise<T> => {
    if (!readpool) throw new Error('Read Database pool is not initialized');

    const connection = await readpool.getConnection();
    try {
        const finalQuery = format(query, params);
        const [results] = await connection.query<T>(finalQuery);
        connection.release();
        return results;
    } catch (err: any) {
        connection.destroy();
        logger.warn(`Read Query failed. Retry ${attempts}/${maxRetries}. Error: ${err.message}`);
        if (attempts > maxRetries) throw err;
        await new Promise((res) => setTimeout(res, 100));
        return await read<T>(query, params, attempts + 1);
    }
};

export const write = async <T extends ResultSetHeader = ResultSetHeader>(
    query: string,
    params: any[] = [],
    attempts = 0
): Promise<T> => {
    if (!pool) throw new Error('Write Database pool is not initialized');

    const connection = await pool.getConnection();
    try {
        const undefinedIndex = params.findIndex((e) => e === undefined);
        if (undefinedIndex !== -1) {
            logger.error(
                JSON.stringify({ err: 'Undefined params in SQL', query, params })
            );
        }

        const finalQuery = format(query, params);
        const [results] = await connection.query<T>(finalQuery);
        connection.release();
        return results;
    } catch (err: any) {
        connection.destroy();
        logger.warn(`Write Query failed. Retry ${attempts}/${maxRetries}. Error: ${err.message}`);
        if (attempts > maxRetries) throw err;
        await new Promise((res) => setTimeout(res, 200));
        return await write<T>(query, params, attempts + 1);
    }
};

export const createTables = async () => {
    try {
        if (!pool) throw new Error('Database pool is not initialized');
        const connection = await pool.getConnection();
        await Promise.allSettled([connection.execute(lobbies), connection.execute(bets), connection.execute(settlement),  connection.execute(roundStats),  connection.execute(user_messages)]);
        logger.info(`Tables creation queries executed`)
    } catch (error) {
        console.error("Error creating tables", error);
    }
};

export const checkDatabaseConnection = async (): Promise<void> => {
    if (!pool || !readpool) {
        await createDatabasePool();
    }
    logger.info('DATABASE CONNECTION CHECK PASSED');
};