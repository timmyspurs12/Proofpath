import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import {
  Activity,
  Compass,
  Copy,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Plus,
  Radar,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { config, hasPublicContractConfig } from '../config';
import { useWallet } from '../context/WalletContext';
import { useWeatherPact } from '../context/WeatherPactContext';
import { shortenAddress } from '../lib/weather';
import { cn } from '../lib/utils';
import { Button, buttonStyles } from './ui/Button';
import { CopyButton } from './ui/CopyButton';
import { ContourArt } from './ui/ContourArt';
import { Logo } from './ui/Logo';
import { SourceNote } from './ui/SourceNote';

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, index: '01', end: true },
  { to: '/explorer', label: 'Pact Explorer', icon: Compass, index: '02' },
  { to: '/create', label: 'Create a Pact', icon: Plus, index: '03' },
  { to: '/resolution', label: 'Resolution Desk', icon: Radar, index: '04' },
  { to: '/activity', label: 'Activity', icon: Activity, index: '05' },
];

const pageNames: Record<string, string> = {
  '/': 'Overview',
  '/explorer': 'Pact Explorer',
  '/create': 'Create a Pact',
  '/resolution': 'Resolution Desk',
  '/activity': 'Activity & reputation',
};

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {navigation.map(({ to, label, icon: Icon, index, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group relative flex min-h-12 items-center gap-3 rounded-[4px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime',
              isActive
                ? 'bg-white/[0.09] text-white'
                : 'text-white/55 hover:bg-white/[0.05] hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute bottom-2 left-0 top-2 w-0.5 bg-lime transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon
                className={cn(
                  'h-[17px] w-[17px]',
                  isActive ? 'text-lime' : 'text-white/40 group-hover:text-white/70',
                )}
                aria-hidden="true"
              />
              <span className="flex-1">{label}</span>
              <span className="font-mono text-[9px] text-white/25">{index}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function WalletControl() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  if (wallet.status !== 'connected' || !wallet.address) {
    return (
      <Button
        variant="outline"
        className="min-h-9 border-current/15 bg-white px-3 text-xs"
        loading={wallet.status === 'connecting'}
        onClick={() => void wallet.connect()}
      >
        <Wallet className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {wallet.status === 'connecting' ? 'Connecting' : 'Connect wallet'}
        </span>
      </Button>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="flex min-h-9 items-center gap-2 rounded-[4px] border border-current/15 bg-white px-3 text-xs font-medium text-current transition-colors hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              wallet.isCorrectNetwork === false ? 'bg-coral' : 'bg-teal',
            )}
          />
          <span className="font-mono">{shortenAddress(wallet.address)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-[80] w-72 animate-fade-up rounded-md border border-current/15 bg-white p-4 shadow-lift focus:outline-none"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">
            Connected wallet
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-current">{shortenAddress(wallet.address)}</span>
            <CopyButton value={wallet.address} label="Copy" />
          </div>
          <div className="my-4 border-t border-cloud" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate">Network</span>
            <span
              className={
                wallet.isCorrectNetwork === false ? 'font-medium text-[#9B4939]' : 'text-current'
              }
            >
              {wallet.isCorrectNetwork === false
                ? 'Wrong network'
                : config.chainId
                  ? config.chainName
                  : 'Not configured'}
            </span>
          </div>
          {wallet.isCorrectNetwork === false && (
            <Button
              variant="outline"
              className="mt-3 w-full text-xs"
              onClick={() => void wallet.switchNetwork()}
            >
              Switch network
            </Button>
          )}
          <Button
            variant="ghost"
            className="mt-3 w-full text-xs"
            onClick={() => {
              wallet.disconnect();
              setOpen(false);
            }}
          >
            Disconnect locally
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-current text-white">
      <div className="px-6 pb-8 pt-6">
        <Link to="/" onClick={onNavigate} aria-label="WeatherPact overview">
          <Logo dark />
        </Link>
      </div>
      <div className="mx-6 mb-5 border-t border-white/10" />
      <div className="px-3">
        <Navigation onNavigate={onNavigate} />
      </div>
      <div className="mt-auto p-4">
        <div className="relative overflow-hidden rounded-[5px] border border-white/10 bg-white/[0.035] p-4">
          <ContourArt inverse className="absolute -right-14 -top-16 h-40 w-64 opacity-60" />
          <div className="relative">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-lime">
              Field principle 001
            </div>
            <p className="mt-3 font-heading text-sm font-medium leading-5 text-white">
              Evidence over instinct.
              <br />
              Every claim has a trail.
            </p>
            <SourceNote inverse className="mt-4 text-[10px]" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/30">
          <span>Climate intelligence</span>
          <span>v0.1</span>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { capabilities, isOnline } = useWeatherPact();
  const wallet = useWallet();
  const pageName = location.pathname.startsWith('/pacts/')
    ? 'Pact record'
    : (pageNames[location.pathname] ?? 'WeatherPact');

  return (
    <div className="min-h-screen bg-mist text-current">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded bg-lime px-4 py-2 text-sm font-semibold text-current focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>
      <div className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-cloud bg-mist/95 px-4 backdrop-blur-sm sm:px-6 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
              <Dialog.Trigger asChild>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded border border-current/15 text-current lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-current/60 data-[state=open]:animate-fade-up" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(320px,88vw)] shadow-lift focus:outline-none lg:hidden">
                  <Dialog.Title className="sr-only">WeatherPact navigation</Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white"
                      aria-label="Close navigation"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </Dialog.Close>
                  <Sidebar onNavigate={() => setMobileOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <div className="min-w-0">
              <div className="truncate font-heading text-sm font-semibold">{pageName}</div>
              <div className="mt-0.5 hidden items-center gap-1.5 text-[10px] text-slate sm:flex">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasPublicContractConfig ? 'bg-teal' : 'bg-slate/50',
                  )}
                />
                {hasPublicContractConfig
                  ? `${config.chainName} · public config present`
                  : 'Contract not connected'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/create"
              className={buttonStyles('primary', 'hidden min-h-9 px-3 text-xs md:inline-flex')}
            >
              <Plus className="h-3.5 w-3.5" />
              New pact
            </Link>
            <WalletControl />
          </div>
        </header>

        {capabilities.mode === 'preview' && (
          <div className="flex min-h-9 items-center justify-center gap-2 border-b border-[#CDD9A4] bg-[#EFF4D8] px-4 py-2 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-current sm:text-[11px]">
            <FlaskConical className="h-3.5 w-3.5 shrink-0 text-teal" aria-hidden="true" />
            <span>
              <strong>Preview mode</strong>
              <span className="hidden sm:inline"> — </span>
              <span className="block sm:inline">
                Illustrative records only. No on-chain writes.
              </span>
            </span>
          </div>
        )}
        {!isOnline && (
          <div
            role="alert"
            className="flex items-center justify-center gap-2 border-b border-coral/30 bg-coral/10 px-4 py-2 text-xs text-[#833D30]"
          >
            <WifiOff className="h-4 w-4" />
            Network unavailable. Public data and city search may not refresh.
          </div>
        )}
        {wallet.error && (
          <div
            role="alert"
            className="flex items-center justify-center gap-2 border-b border-coral/30 bg-coral/10 px-4 py-2 text-xs text-[#833D30]"
          >
            <Wallet className="h-4 w-4" />
            {wallet.error}
          </div>
        )}

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10"
        >
          <Outlet />
        </main>
        <footer className="mx-auto flex max-w-[1540px] flex-col gap-2 border-t border-cloud px-4 py-6 text-[10px] text-slate sm:flex-row sm:items-center sm:justify-between sm:px-6 xl:px-10">
          <span>WeatherPact · Weather claims, settled with evidence.</span>
          <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.08em]">
            <Copy className="h-3 w-3" />
            Public claims · non-financial reputation
          </span>
        </footer>
      </div>
    </div>
  );
}
