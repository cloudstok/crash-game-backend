import { LobbyInsertData } from '../../interfaces';
import { write } from '../../utilities/db-connection';

const SQL_INSERT_LOBBIES = 'INSERT INTO lobbies (lobby_id, start_delay, end_delay, max_mult) values(?,?,?,?)';

export const insertLobbies = async (data: LobbyInsertData): Promise<void> => {
    try {
        if (data.time) delete data.time;

        const insertData = {
            ...data,
            max_mult: Number(data.max_mult.toFixed(2))
        };

        await write(SQL_INSERT_LOBBIES, [
            insertData.lobbyId,
            insertData.start_delay,
            insertData.end_delay,
            insertData.max_mult
        ]);
    } catch (err) {
        console.error(err);
    }
};