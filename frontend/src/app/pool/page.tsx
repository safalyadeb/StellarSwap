import { LiquidityWidget } from '../../components/pool/LiquidityWidget';

export default function PoolPage() {
  return (
    <div className="flex flex-col items-center pt-2 sm:pt-10">
      <div className="w-full max-w-[480px] mb-4 px-1">
        <h1 className="text-2xl font-bold text-txt-primary">Pool</h1>
        <p className="text-txt-tertiary text-sm">Provide liquidity and earn 0.3% of all swaps in the pool.</p>
      </div>
      <LiquidityWidget />
    </div>
  );
}
