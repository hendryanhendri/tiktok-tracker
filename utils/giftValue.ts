export const GIFT_VALUES: Record<string, number> = {
  "Rose": 1,
  "Heart": 5,
  "Ice Cream": 20,
  "Gift Box": 50,
  "Lion": 29999,
  "TikTok Universe": 34999,
  "Balloon": 100,
  "Star": 10,
  "Love": 10,
  "Galaxy": 1000,
  "Crown": 5000,
};

export const COIN_RATE_IDR = 184;

export function estimateGiftValue(giftName: string, count: number): number {
  const coins = GIFT_VALUES[giftName] || 1;
  return coins * count * COIN_RATE_IDR;
}
