import { byDateAsc, byTotalCostDesc, stringToColour } from "@/utils/functions";
import { navHistoryDB } from "@/utils/db";
import { Transaction, Portfolio } from "@/types/investments";
import { TaxRules } from "@/utils/tax/TaxRules";
import { TransactionEnricher } from "@/utils/enricher/TransactionEnricher";

const getLatestPrice = async (schemeCode: string) => {
  const data = await navHistoryDB.get(schemeCode);

  if (data) {
    return Number(data.data.data[0].nav);
  }

  return null;
};

export interface RealisedProfitEntry {
  profit: number;
  date: string;
  mfName: string;
  purchaseDate: string;
}

const getPortfolio = async (
  transactions: Transaction[],
): Promise<{
  portfolio: Portfolio;
  realisedProfitByDate: RealisedProfitEntry[];
}> => {
  const enriched = TransactionEnricher.enrich(transactions);
  const ts = enriched.slice();
  ts.sort(byDateAsc);
  const out: Portfolio = [];
  const realisedProfitByDate: RealisedProfitEntry[] = [];

  ts.forEach((transaction) => {
    const i = out.findIndex((o) => o.mfName === transaction.mfName);
    if (i >= 0) {
      out[i].allTransactions.push(transaction);
      if (transaction.type === "Investment") {
        out[i].existingFunds.push({
          price: transaction.price * 10000,
          units: transaction.units * 1000,
          date: new Date(transaction.date),
          // placeholder values — computed in the second pass below
          invested: 0,
          currentValue: 0,
          profit: 0,
          gain: 0,
          capitalGainType: 'STCG' as const,
          daysHeld: 0,
        });
      } else {
        let units = Math.round(transaction.units * 1000);

        while (units > 0) {
          if (out[i].existingFunds[0].units <= units) {
            units -= out[i].existingFunds[0].units;
            const newProfit =
              (transaction.price - out[i].existingFunds[0].price / 10000) *
              (out[i].existingFunds[0].units / 1000);
            out[i].realisedProfit += newProfit;
            realisedProfitByDate.push({
              profit: newProfit,
              date: transaction.date,
              mfName: transaction.mfName,
              purchaseDate: out[i].existingFunds[0].date.toISOString(),
            });
            out[i].existingFunds[0].units = 0;
          } else {
            out[i].existingFunds[0].units -= units;
            const newProfit =
              (transaction.price - out[i].existingFunds[0].price / 10000) *
              (units / 1000);
            out[i].realisedProfit += newProfit;
            realisedProfitByDate.push({
              profit: newProfit,
              date: transaction.date,
              mfName: transaction.mfName,
              purchaseDate: out[i].existingFunds[0].date.toISOString(),
            });
            units = 0;
          }
          if (out[i].existingFunds[0].units === 0) {
            out[i].existingFunds.shift();
          }
        }
      }
    } else {
      out.push({
        mfName: transaction.mfName,
        schemeCode: transaction.matchingScheme.schemeCode,
        allTransactions: [transaction],
        existingFunds: [
          {
            price: transaction.price * 10000,
            units: transaction.units * 1000,
            date: new Date(transaction.date),
            // placeholder values — computed in the second pass below
            invested: 0,
            currentValue: 0,
            profit: 0,
            gain: 0,
            capitalGainType: 'STCG' as const,
            daysHeld: 0,
          },
        ],
        realisedProfit: 0,
        // Enriched — computed in the second pass
        isin: [],
        folio: [],
        fundType: transaction.fundType,
        isDirectPlan: transaction.isDirectPlan,
        ltcgGain: 0,
        stcgGain: 0,
        ltValue: 0,
        stValue: 0,
      });
    }
  });

  const today = new Date();

  for (const o of out) {
    let invested = 0;
    let units = 0;
    o.latestPrice = await getLatestPrice(o.schemeCode);

    // Derived set fields
    o.isin = [...new Set(o.allTransactions.filter(t => t.type === 'Investment').map(t => t.isin))];
    o.folio = [...new Set(o.allTransactions.map(t => t.folio))];

    for (const ef of o.existingFunds) {
      invested += ef.units * ef.price;
      units += ef.units;
      ef.units /= 1000;
      ef.price /= 10000;
      ef.invested = ef.units * ef.price;
      ef.currentValue = o.latestPrice ? ef.units * o.latestPrice : 0;
      ef.profit = ef.currentValue - ef.invested;
      ef.gain = (ef.profit / ef.invested) * 100;
      ef.daysHeld = TaxRules.holdingDays(ef.date, today);
      ef.capitalGainType = TaxRules.capitalGainType(ef.date, o.fundType, today);

      if (ef.capitalGainType === 'LTCG') {
        o.ltcgGain += ef.profit;
        o.ltValue += ef.currentValue;
      } else {
        o.stcgGain += ef.profit;
        o.stValue += ef.currentValue;
      }
    }
    o.currentInvested = Math.round(invested / 10000000);
    o.currentUnits = units > 0.00001 ? units / 1000 : 0;
    o.currentValue = o.latestPrice ? o.currentUnits * o.latestPrice : 0;
    o.profit = o.currentValue - o.currentInvested;
    o.color = stringToColour(o.mfName);
  }

  let totalInvested = 0;
  for (const o of out) {
    totalInvested += o.currentInvested;
  }
  for (const o of out) {
    o.percentage = (o.currentInvested / totalInvested) * 100;
  }
  out.sort(byTotalCostDesc);

  return { portfolio: out, realisedProfitByDate };
};

export default getPortfolio;
