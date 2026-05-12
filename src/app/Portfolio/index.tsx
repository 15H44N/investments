import { useState } from "react";

import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { formatCurrency, getSummary, renderProfit, formatDate } from "@/utils/functions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableBody, TableHead, TableHeader, TableRow, Table } from "@/components/ui/table";

import { ExistingFund, Portfolio as PortfolioType, PortfolioRow } from "@/types/investments";
import { CapitalGainType, FundType, TaxRules } from "@/utils/tax/TaxRules";

// ─── Meta shape passed to the table ──────────────────────────────────────────
// Accessible in column footer renderers via `table.options.meta as PortfolioMeta`

interface PortfolioMeta {
  invested: number;
  currentProfit: number;
  realisedProfit: number;
  totalValue: number;
  totalLtcgGain: number;
  totalStcgGain: number;
  estimatedTax: number;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatUnits = (units: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(units);

function formatDaysHeld(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

// ─── Chips & Badges ───────────────────────────────────────────────────────────

function PlanChip({ isDirect }: { isDirect: boolean }) {
  return isDirect ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
      Direct
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
      Regular
    </span>
  );
}

function FundTypeChip({ type }: { type: FundType }) {
  const styles: Record<FundType, string> = {
    equity: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
    debt: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
    hybrid: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-400",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles[type]}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function CapGainBadge({ type }: { type: CapitalGainType }) {
  if (type === "LTCG")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
        LT
      </span>
    );
  if (type === "STCG")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
        ST
      </span>
    );
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
      Slab
    </span>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────
//
// Default visible: ISIN · Fund Name · Plan · Type · Units · Invested · Returns · LT · ST · Tax Est. · Value
// Hidden by default (via INITIAL_VISIBILITY): Realised Returns · Folio
//
// Footer values come from table.options.meta (PortfolioMeta), so they stay
// perfectly aligned with their column regardless of which columns are hidden.

const columns: ColumnDef<PortfolioRow>[] = [
  {
    id: "ISIN",
    header: "ISIN",
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
        {row.original.isin.join(" / ")}
      </div>
    ),
  },
  {
    accessorKey: "mfName",
    id: "Fund Name",
    enableHiding: false,
    header: "Fund Name",
    footer: () => <span className="font-medium">Total</span>,
  },
  {
    id: "Plan",
    header: "Plan",
    cell: ({ row }) => <PlanChip isDirect={row.original.isDirectPlan} />,
  },
  {
    id: "Type",
    header: "Type",
    cell: ({ row }) => <FundTypeChip type={row.original.fundType} />,
  },
  {
    accessorKey: "currentUnits",
    header: () => <div className="text-right">Current Units</div>,
    id: "Current Units",
    cell: ({ row }) => <div className="text-right">{formatUnits(row.original.currentUnits)}</div>,
  },
  {
    accessorKey: "currentInvested",
    header: () => <div className="text-right">Current Invested</div>,
    id: "Current Invested",
    enableHiding: false,
    cell: ({ row }) => <div className="text-right">{formatCurrency(row.original.currentInvested)}</div>,
    footer: ({ table }) => {
      const { invested } = (table.options.meta ?? {}) as PortfolioMeta;
      return <div className="text-right">{formatCurrency(invested ?? 0)}</div>;
    },
  },
  {
    accessorKey: "profit",
    header: () => <div className="text-right">Current Returns</div>,
    id: "Current Returns",
    cell: ({ row }) => renderProfit(row.original.profit),
    footer: ({ table }) => {
      const { currentProfit } = (table.options.meta ?? {}) as PortfolioMeta;
      return renderProfit(currentProfit ?? 0);
    },
  },
  {
    accessorKey: "realisedProfit",
    header: () => <div className="text-right">Realised Returns</div>,
    id: "Realised Returns",
    cell: ({ row }) => renderProfit(row.original.realisedProfit),
    footer: ({ table }) => {
      const { realisedProfit } = (table.options.meta ?? {}) as PortfolioMeta;
      return renderProfit(realisedProfit ?? 0);
    },
  },
  {
    id: "LT Gains",
    header: () => <div className="text-right">LT Gains</div>,
    cell: ({ row }) => {
      const { fundType, ltcgGain, ltValue } = row.original;
      if (fundType === "debt" || ltValue === 0)
        return <div className="text-right text-xs text-muted-foreground">—</div>;
      return renderProfit(ltcgGain);
    },
    footer: ({ table }) => {
      const { totalLtcgGain } = (table.options.meta ?? {}) as PortfolioMeta;
      if (!totalLtcgGain) return null;
      return renderProfit(totalLtcgGain);
    },
  },
  {
    id: "ST Gains",
    header: () => <div className="text-right">ST Gains</div>,
    cell: ({ row }) => {
      const { fundType, stcgGain, stValue } = row.original;
      if (fundType === "debt")
        return <div className="text-right text-xs text-muted-foreground">Slab</div>;
      if (stValue === 0)
        return <div className="text-right text-xs text-muted-foreground">—</div>;
      return renderProfit(stcgGain);
    },
    footer: ({ table }) => {
      const { totalStcgGain } = (table.options.meta ?? {}) as PortfolioMeta;
      if (!totalStcgGain) return null;
      return renderProfit(totalStcgGain);
    },
  },
  {
    id: "Tax Est.",
    header: () => <div className="text-right">Tax Est.</div>,
    cell: ({ row }) => {
      const { fundType, ltcgGain, stcgGain } = row.original;
      if (fundType === "debt")
        return <div className="text-right text-xs text-muted-foreground">Slab</div>;
      const tax =
        Math.max(0, ltcgGain) * TaxRules.taxRate("LTCG")! +
        Math.max(0, stcgGain) * TaxRules.taxRate("STCG")!;
      if (tax === 0) return <div className="text-right text-xs text-muted-foreground">—</div>;
      return <div className="text-right tabular-nums">{formatCurrency(tax)}</div>;
    },
    footer: ({ table }) => {
      const { estimatedTax, totalLtcgGain, totalStcgGain } = (table.options.meta ?? {}) as PortfolioMeta;
      if (!estimatedTax) return null;
      return (
        <div
          className="text-right tabular-nums"
          title={`After ₹1.25L LTCG exemption. LTCG: ${formatCurrency(totalLtcgGain ?? 0)} × 12.5%, STCG: ${formatCurrency(totalStcgGain ?? 0)} × 20%`}
        >
          {formatCurrency(estimatedTax)}
        </div>
      );
    },
  },
  {
    accessorKey: "currentValue",
    header: () => <div className="text-right">Current Value</div>,
    id: "Current Value",
    enableHiding: false,
    cell: ({ row }) => <div className="text-right">{formatCurrency(row.original.currentValue)}</div>,
    footer: ({ table }) => {
      const { totalValue } = (table.options.meta ?? {}) as PortfolioMeta;
      return <div className="text-right">{formatCurrency(totalValue ?? 0)}</div>;
    },
  },
  {
    id: "Folio",
    header: "Folio",
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground whitespace-nowrap">
        {row.original.folio.join(", ")}
      </div>
    ),
  },
];

// Hidden by default (togglable via Columns dropdown)
const INITIAL_VISIBILITY: Record<string, boolean> = {
  "Realised Returns": false,
  Folio: false,
};

// ─── Lot sub-table ────────────────────────────────────────────────────────────

function LotTable({ rowData }: { rowData: PortfolioRow }) {
  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purchase Date</TableHead>
            <TableHead className="text-right">Held</TableHead>
            <TableHead className="text-center">Term</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Invested</TableHead>
            <TableHead className="text-right">Returns</TableHead>
            <TableHead className="text-right">Gain</TableHead>
            <TableHead className="text-right">Current Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowData.existingFunds.map((lot: ExistingFund, i: number) => (
            <TableRow key={i}>
              <TableCell>{formatDate(lot.date)}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatDaysHeld(lot.daysHeld)}
              </TableCell>
              <TableCell className="text-center">
                <CapGainBadge type={lot.capitalGainType} />
              </TableCell>
              <TableCell className="text-right">{formatUnits(lot.units)}</TableCell>
              <TableCell className="text-right">{formatCurrency(lot.invested)}</TableCell>
              <TableCell className="text-right">{renderProfit(lot.profit)}</TableCell>
              <TableCell className="text-right">{renderProfit(lot.gain, "percentage")}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(lot.invested + lot.profit)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Portfolio({ portfolio }: { portfolio: PortfolioType }) {
  const [fundFilter, setFundFilter] = useState("");
  const [showZeroUnits, setShowZeroUnits] = useState(false);

  const { totalValue, invested, currentProfit, realisedProfit } = getSummary(portfolio);

  const filteredPortfolio = Object.values(portfolio)
    .filter((row) => row.mfName.toLowerCase().includes(fundFilter.toLowerCase()))
    .filter((row) => (showZeroUnits ? true : Math.abs(row.currentUnits) > 0.001));

  // Aggregate LT/ST gains for equity+hybrid funds (debt is slab-rated)
  const equityRows = filteredPortfolio.filter((r) => r.fundType !== "debt");
  const totalLtcgGain = equityRows.reduce((s, r) => s + Math.max(0, r.ltcgGain), 0);
  const totalStcgGain = equityRows.reduce((s, r) => s + Math.max(0, r.stcgGain), 0);
  // Apply ₹1.25L LTCG annual exemption (Budget 2024)
  const taxableLtcg = Math.max(0, totalLtcgGain - TaxRules.LTCG_EXEMPTION);
  const estimatedTax =
    taxableLtcg * TaxRules.taxRate("LTCG")! + totalStcgGain * TaxRules.taxRate("STCG")!;

  const meta: PortfolioMeta = {
    invested,
    currentProfit,
    realisedProfit,
    totalValue,
    totalLtcgGain,
    totalStcgGain,
    estimatedTax,
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center space-x-2">
        <Switch id="show-zero" checked={showZeroUnits} onCheckedChange={setShowZeroUnits} />
        <Label htmlFor="show-zero">Show redeemed funds</Label>
      </div>
      <DataTable
        columns={columns}
        data={filteredPortfolio}
        searchValue={fundFilter}
        setSearchValue={setFundFilter}
        renderSubComponent={({ rowData }) => <LotTable rowData={rowData} />}
        showCollapsableRows
        showColumnHiding
        initialColumnVisibility={INITIAL_VISIBILITY}
        meta={meta as unknown as Record<string, unknown>}
      />
    </div>
  );
}
