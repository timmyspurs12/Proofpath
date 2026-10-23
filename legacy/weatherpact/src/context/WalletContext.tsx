import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { config } from '../config';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  chainId: string | null;
  error: string | null;
  hasProvider: boolean;
  isCorrectNetwork: boolean | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function normalizeChainId(chainId: string | null) {
  if (!chainId) return null;
  const parsed = chainId.startsWith('0x') ? Number.parseInt(chainId, 16) : Number(chainId);
  return Number.isFinite(parsed) ? String(parsed) : chainId.toLowerCase();
}

function walletError(reason: unknown) {
  const code = (reason as { code?: number })?.code;
  if (code === 4001) return 'Request rejected in your wallet. No transaction was submitted.';
  return reason instanceof Error ? reason.message : 'The wallet request could not be completed.';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasProvider = typeof window !== 'undefined' && Boolean(window.ethereum);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setStatus('error');
      setError('No injected wallet found. Install a compatible wallet to connect.');
      return;
    }
    setStatus('connecting');
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const account = accounts[0];
      if (!account) throw new Error('The wallet did not return an account.');
      const chain = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      setAddress(account);
      setChainId(chain);
      setStatus('connected');
    } catch (reason) {
      setStatus('error');
      setError(walletError(reason));
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setStatus('disconnected');
    setError(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum || !config.chainId) {
      setError('The expected GenLayer chain is not configured.');
      return;
    }
    setError(null);
    const numericChain = normalizeChainId(config.chainId);
    const hexChain = numericChain ? `0x${Number(numericChain).toString(16)}` : config.chainId;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChain }],
      });
      setChainId(hexChain);
    } catch (reason) {
      if ((reason as { code?: number })?.code === 4902 && config.chainRpcUrl) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hexChain,
                chainName: config.chainName,
                nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
                rpcUrls: [config.chainRpcUrl],
                blockExplorerUrls: config.explorerUrl ? [config.explorerUrl] : [],
              },
            ],
          });
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChain }],
          });
          setChainId(hexChain);
          return;
        } catch (addReason) {
          setError(walletError(addReason));
          return;
        }
      }
      setError(walletError(reason));
    }
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const handleAccounts = (accounts: string[]) => {
      const account = accounts[0] ?? null;
      setAddress(account);
      setStatus(account ? 'connected' : 'disconnected');
    };
    const handleChain = (nextChain: string) => setChainId(nextChain);
    provider.on('accountsChanged', handleAccounts as (...args: never[]) => void);
    provider.on('chainChanged', handleChain as (...args: never[]) => void);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccounts as (...args: never[]) => void);
      provider.removeListener?.('chainChanged', handleChain as (...args: never[]) => void);
    };
  }, []);

  const isCorrectNetwork =
    config.chainId && chainId
      ? normalizeChainId(config.chainId) === normalizeChainId(chainId)
      : null;

  const value = useMemo(
    () => ({
      status,
      address,
      chainId,
      error,
      hasProvider,
      isCorrectNetwork,
      connect,
      disconnect,
      switchNetwork,
    }),
    [
      status,
      address,
      chainId,
      error,
      hasProvider,
      isCorrectNetwork,
      connect,
      disconnect,
      switchNetwork,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
