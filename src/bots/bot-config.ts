import type { Niche, BotSpeed } from '../types/index.js';

/** Static bot definition — used to seed the bot manager on startup */
export interface BotDefinition {
  name: string;
  walletId: string;
  niche: Niche;
  sizeScale: number;
  speed: BotSpeed;
  active: boolean;
  isPaper: boolean;
}

/** Niche display metadata */
export interface NicheInfo {
  label: string;
  color: string;
}

export const NICHE_META: Record<Niche, NicheInfo> = {
  crypto:        { label: 'Crypto',        color: '#F7931A' },
  sports:        { label: 'Sports',        color: '#10B981' },
  politics:      { label: 'Politics',      color: '#3B82F6' },
  entertainment: { label: 'Entertainment', color: '#A855F7' },
  science:       { label: 'Science',       color: '#06B6D4' },
  other:         { label: 'Other',         color: '#6B7280' },
};

/**
 * Hardcoded bot definitions.
 * In production these would come from a DB or admin UI,
 * but for now this is the source of truth at startup.
 *
 * Replace wallet addresses with real ones you want to copy-trade.
 */
export const BOT_DEFINITIONS: BotDefinition[] = [
  {
    name: 'CryptoWhale Copier',
    walletId: '0xf247584e41117bbbe4cc06e4d2c95741792a5216',
    niche: 'crypto',
    sizeScale: 0.012,
    speed: 'instant',
    active: true,
    isPaper: true, // will go live first
  },
  {
    name: 'Sports Sharp',
    walletId: '0xd9e0aaca471f489be338fd0f91a26e8669a805f2',
    niche: 'sports',
    sizeScale: 0.0005,
    speed: 'delayed_5s',
    active: true,
    isPaper: true,
  },
  {
    name: 'Politics Tracker',
    walletId: '0x16cbe223607a6513ae76d1e3751c78e4eabc2704',
    niche: 'politics',
    sizeScale: 0.02,
    speed: 'delayed_30s',
    active: true,
    isPaper: true,
  },
  {
    name: 'Underdog Hunter',
    walletId: '0xff12ffde498c958dc037def603dcbcc0052f09f9',
    niche: 'sports',
    sizeScale: 0.008,
    speed: 'instant',
    active: true,
    isPaper: true,
  },
  {
    name: 'Footy King',
    walletId: '0xed61f86bb5298d2f27c21c433ce58d80b88a9aa3',
    niche: 'sports',
    sizeScale: 0.015,
    speed: 'instant',
    active: true,
    isPaper: true,
  },
];
