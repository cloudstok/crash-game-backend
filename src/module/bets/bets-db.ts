import { CashoutData, InsertBetData, RoundStats, SettlementData } from '../../interfaces';
import { write } from '../../utilities/db-connection';

const SQL_CASHOUT =
  "INSERT INTO settlement(bet_id, lobby_id, name, user_id, operator_id, bet_amount, auto_cashout, avatar, max_mult, win_amount, status) VALUES(?,?,?,?,?,?,?,?,?,?,?)";

const SQL_ROUND_STATS =
  "INSERT INTO round_stats (lobby_id, start_time, total_players , max_mult, end_time, total_bets, total_bet_amount, total_cashout_amount, biggest_winner, biggest_looser, total_round_settled) VALUES (?,?,?,?,?,?,?,?,?,?,?)";

const SQL_INSERT_BETS =
  'INSERT INTO bets (bet_id, lobby_id, name, user_id, operator_id, bet_amount, auto_cashout, avatar) VALUES(?,?,?,?,?,?,?,?)';


export const insertCashout = async (data: CashoutData): Promise<void> => {
  try {
    const {
      name,
      image,
      max_mult,
      bet_id,
      atCo,
      final_amount,
    } = data;

    const [b, lobby_id, bet_amount, user_id, operator_id, btn] = bet_id.split(':');

    await write(SQL_CASHOUT, [
      bet_id,
      Number(lobby_id),
      name,
      decodeURIComponent(user_id),
      operator_id,
      parseFloat(bet_amount),
      atCo || 0.00,
      image,
      max_mult,
      final_amount,
      'cashout'
    ]);

    console.info('Cashout Data Inserted Successfully');
  } catch (er) {
    console.error(er);
  }
};

export const insertSettleBet = async (data: SettlementData[]): Promise<void> => {
  try {
    if (!data || data.length === 0) {
      console.info('No data for Settlement.');
      return;
    }

    const batchSize = 50;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const finalData: any[][] = batch.map((x) => {
        const {
          bet_id,
          name,
          max_mult,
          image,
          atCo,
        } = x;

        const [b, lobby_id, bet_amount, user_id, operator_id, btn] = bet_id.split(':');

        return [
          bet_id,
          Number(lobby_id),
          name,
          decodeURIComponent(user_id),
          operator_id,
          parseFloat(bet_amount),
          atCo || 0.00,
          image,
          max_mult,
          0.00,
          'crashed',
        ];
      });

      const placeholders = finalData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const SQL_SETTLEMENT = `INSERT INTO settlement (bet_id, lobby_id, name, user_id, operator_id, bet_amount, auto_cashout, avatar, max_mult, win_amount, status) VALUES ${placeholders}`;
      const flattenedData = finalData.flat();

      await write(SQL_SETTLEMENT, flattenedData);
    }

    console.info('Settlement Data Inserted Successfully');
  } catch (er) {
    console.error(er);
  }
};

export const insertRoundStats = async (data: RoundStats): Promise<void> => {
  try {
    const {
      lobbyId,
      start_time,
      total_players,
      max_mult,
      end_time,
      total_bets,
      total_bet_amount,
      total_cashout_amount,
      biggest_winner,
      biggest_looser,
      total_round_settled,
    } = data;

    await write(SQL_ROUND_STATS, [
      lobbyId,
      start_time,
      total_players,
      max_mult,
      end_time,
      total_bets,
      total_bet_amount,
      total_cashout_amount,
      biggest_winner,
      biggest_looser,
      total_round_settled,
    ]);

    console.info('Round stats data inserted successfully');
  } catch (er) {
    console.error(er);
  }
};

export const insertBets = async (betData: InsertBetData): Promise<void> => {
  try {
    let { bet_id, name, image, atCo } = betData;


    const [b, lobby_id, bet_amount, user_id, operator_id, btn] = bet_id.split(':');
    if (!bet_id || !lobby_id || !bet_amount || !user_id || !operator_id) {
      throw new Error('Invalid bet_id format.');
    }

    await write(SQL_INSERT_BETS, [
      bet_id,
      lobby_id,
      name,
      decodeURIComponent(user_id),
      operator_id,
      parseFloat(bet_amount),
      atCo || 0.00,
      image
    ]);

    console.info(`Bet placed successfully for user`, user_id);
  } catch (err) {
    console.error(err);
  }
};