import { isAddress, getAddress } from 'ethers';
import { createLogger } from './logger.js';

const log = createLogger('wallet');

/**
 * Validates and checksums an Ethereum wallet address.
 * Returns the checksummed address or null if invalid.
 */
export function validateAddress(address: string): string | null {
  if (!isAddress(address)) {
    log.warn({ address }, 'Invalid wallet address rejected');
    return null;
  }
  return getAddress(address);
}

/**
 * Validates an address and throws if invalid.
 * Use at bot registration boundaries.
 */
export function requireValidAddress(address: string): string {
  const checksummed = validateAddress(address);
  if (!checksummed) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return checksummed;
}
