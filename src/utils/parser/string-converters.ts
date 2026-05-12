export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const strToCur = (num: string): number =>
  Math.round((Number(num.replaceAll(',', '')) + Number.EPSILON) * 100) / 100

export const strToPrice = (num: string): number =>
  Math.round((Number(num.replaceAll(',', '')) + Number.EPSILON) * 10000) / 10000

export const strToUnits = (num: string): number =>
  Math.round((Number(num.replaceAll(',', '')) + Number.EPSILON) * 1000) / 1000
