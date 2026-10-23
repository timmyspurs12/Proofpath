import { Check, Minus, X } from 'lucide-react';
import { config, hasPublicContractConfig } from '../config';
import { useWallet } from '../context/WalletContext';
import { useWeatherPact } from '../context/WeatherPactContext';
import { cn } from '../lib/utils';

export function ConnectionRequirements({ action = 'write' }: { action?: 'write' | 'resolve' }) {
  const wallet = useWallet();
  const { capabilities } = useWeatherPact();
  const adapterReady = action === 'write' ? capabilities.canWrite : capabilities.canResolve;
  const rows = [
    {
      label: 'Contract configuration',
      value: hasPublicContractConfig ? `${config.chainName} configured` : 'Contract not connected',
      ready: hasPublicContractConfig,
    },
    {
      label: 'Wallet',
      value: wallet.address ? 'Wallet connected' : 'Wallet disconnected',
      ready: Boolean(wallet.address),
    },
    {
      label: 'Network',
      value: !config.chainId
        ? 'Expected chain not configured'
        : wallet.isCorrectNetwork
          ? 'Correct network'
          : wallet.address
            ? 'Wrong network'
            : 'Waiting for wallet',
      ready: wallet.isCorrectNetwork === true,
    },
    {
      label: 'GenLayer adapter',
      value: adapterReady ? 'Writes enabled' : 'Integration required · preview only',
      ready: adapterReady,
    },
  ];

  return (
    <div className="divide-y divide-cloud rounded-[5px] border border-cloud bg-white">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 px-4 py-3">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              row.ready ? 'bg-teal/10 text-teal' : 'bg-current/5 text-slate',
            )}
          >
            {row.ready ? (
              <Check className="h-3 w-3" />
            ) : row.label === 'Network' && wallet.isCorrectNetwork === false ? (
              <X className="h-3 w-3 text-coral" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-current">{row.label}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate">{row.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
