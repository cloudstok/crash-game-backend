import axios from 'axios';
import { FinalUserData, RawUserData } from '../../interfaces';
import { Server } from 'socket.io';

let playerCount = 0;

function getImageValue(id: string): number {
  let sum = 0;
  for (const char of id) {
    sum += char.charCodeAt(0);
  }
  return sum % 10;
}

export const getUserDataFromSource = async (
  token: string,
  game_id: string
): Promise<FinalUserData | false | undefined> => {
  try {
    const response = await axios.get(`${process.env.service_base_url}/service/user/detail`, {
      headers: {
        token: token,
      },
    });

    const userData: RawUserData | undefined = response?.data?.user;

    if (userData) {
      const userId = encodeURIComponent(userData.user_id);
      const { operatorId } = userData;
      const id = `${operatorId}:${userId}`;
      const image = getImageValue(id);
      playerCount++;
      const finalData: FinalUserData = {
        ...userData,
        userId,
        id,
        game_id,
        token,
        image,
      };

      return finalData;
    }

    return;
  } catch (err: any) {
    console.error(err);
    return false;
  }
};

export const getPlayerCount = async (): Promise<number> => {
    return playerCount;
};

export const reducePlayerCount = () =>  playerCount--;

export const initPlayerBase = async (io: Server): Promise<void> => {
    try {
        io.emit("playerCount", `${playerCount}`);
        setTimeout(() => initPlayerBase(io), 1000);
    } catch (err) {
        console.error(err);
    }
};