import { useState } from 'react';
import type { Niche, BotSpeed } from '@shared/types';
import type { CreateBotPayload } from '../lib/api.js';
import { NICHE_COLORS } from './constants.js';
import clsx from 'clsx';

interface AddBotModalProps {
  onAdd: (payload: CreateBotPayload) => Promise<void>;
  onClose: () => void;
}

const NICHES: Niche[] = ['crypto', 'sports', 'politics', 'entertainment', 'science', 'other'];
const SPEEDS: BotSpeed[] = ['instant', 'delayed_5s', 'delayed_30s'];

export function AddBotModal({ onAdd, onClose }: AddBotModalProps) {
  const [name, setName] = useState('');
  const [walletId, setWalletId] = useState('');
  const [niche, setNiche] = useState<Niche>('crypto');
  const [sizeScale, setSizeScale] = useState(1.0);
  const [speed, setSpeed] = useState<BotSpeed>('instant');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({ name, walletId, niche, sizeScale, speed, active: true });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-4">Add New Bot</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <Field label="Bot Name">
            <input
              className="input"
              placeholder="e.g. CryptoWhale Copier"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </Field>

          {/* Wallet */}
          <Field label="Watched Wallet Address">
            <input
              className="input font-mono text-sm"
              placeholder="0x..."
              value={walletId}
              onChange={e => setWalletId(e.target.value)}
              required
            />
          </Field>

          {/* Niche */}
          <Field label="Niche">
            <div className="flex flex-wrap gap-2">
              {NICHES.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNiche(n)}
                  className={clsx(
                    'text-xs px-3 py-1 rounded-full capitalize font-medium border transition-colors',
                    niche === n ? 'border-transparent text-white' : 'border-zinc-700 text-zinc-400',
                  )}
                  style={niche === n ? { backgroundColor: NICHE_COLORS[n] } : {}}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          {/* Size scale */}
          <Field label={`Size Scale: ${sizeScale.toFixed(2)}x`}>
            <input
              type="range"
              min="0.1" max="3" step="0.05"
              value={sizeScale}
              onChange={e => setSizeScale(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-0.5">
              <span>0.1x</span><span>1x</span><span>3x</span>
            </div>
          </Field>

          {/* Speed */}
          <Field label="Execution Speed">
            <div className="flex gap-2">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={clsx(
                    'flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors',
                    speed === s
                      ? 'border-blue-500 bg-blue-950 text-blue-300'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500',
                  )}
                >
                  {s.replace('delayed_', '+')}
                </button>
              ))}
            </div>
          </Field>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Bot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
