let multArr: any[] = [];
function getMultipliers() {
    while (multArr.length < 100) {
        const len = multArr.length;
        if (len < 15) multArr.push(1);
        else if (len < 37) multArr.push(1 + Math.random() * 0.5);
        else if (len < 52) multArr.push(1.5 + Math.random() * 0.5);
        else if (len < 60) multArr.push(2 + Math.random() * 0.5);
        else if (len < 70) multArr.push(2.5 + Math.random() * 0.5);
        else if (len < 80) multArr.push(3 + Math.random() * 1);
        else if (len < 88) multArr.push(4 + Math.random() * 2);
        else if (len < 94) multArr.push(6 + Math.random() * 4);
        else if (len < 98) multArr.push(10 + Math.random() * 10);
        else if (len < 99) multArr.push(20 + Math.random() * 30);
        else multArr.push(getBigMult());
    }
    multArr = multArr.map(e => Number(e).toFixed(2));
    return multArr;
};

function shuffleArray(array: string[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getBigMult() {
    const RTP = 9700;
    const win_per = (Math.random() * 99.00);
    let mult = (RTP) / (win_per * 100)
    if (mult <= 10) {
        return getBigMult();
    };
    if (mult > 100000) mult = 100000
    return mult;
};


export function getMult() {
    if (multArr.length <= 0) shuffleArray(getMultipliers());
    const rndInx = Math.floor(Math.random() * multArr.length);
    const mult = multArr[rndInx];
    multArr.splice(rndInx, 1);
    return Number(mult);
};
