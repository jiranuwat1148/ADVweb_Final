export const BOX_PRICE_BAHT = 65;
export const FOOD_COST_BAHT = 40;
export const RIDER_BASE_FEE_BAHT = 15;
export const DISTANCE_FEE_PER_BOX_KM_BAHT = 2;

/** Round once per job, then sum integer satang rather than floating-point baht. */
export function calculateDeliveryFeeSatang(totalBoxes: number, distanceMeters: number): number {
  if (!Number.isSafeInteger(totalBoxes) || totalBoxes < 1
    || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error('จำนวนกล่องหรือระยะทางสำหรับคำนวณค่าส่งไม่ถูกต้อง');
  }
  const satang = Math.round(RIDER_BASE_FEE_BAHT * 100
    + DISTANCE_FEE_PER_BOX_KM_BAHT * 100 * totalBoxes * distanceMeters / 1000);
  if (!Number.isSafeInteger(satang)) throw new Error('ค่าส่งเกินช่วงตัวเลขที่คำนวณได้');
  return satang;
}

export function satangToBaht(satang: number): number {
  if (!Number.isSafeInteger(satang)) throw new Error('จำนวนเงินต้องเป็นจำนวนเต็มสตางค์');
  return satang / 100;
}

export function calculateDeliveryFee(totalBoxes: number, distanceMeters: number): number {
  return satangToBaht(calculateDeliveryFeeSatang(totalBoxes, distanceMeters));
}
