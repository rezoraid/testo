import { LumosAdapter } from './lumos.js';
import { ShinigamiAdapter } from './shinigami.js';
import { MantaAdapter } from './manta.js';
import type { ProviderAdapter, ProviderName } from '../types/index.js';
import { config } from '../config.js';

const adapters: Record<ProviderName, ProviderAdapter> = {
  lumos: new LumosAdapter(),
  shinigami: new ShinigamiAdapter(),
  manta: new MantaAdapter(),
};

export function getAdapter(name: ProviderName): ProviderAdapter {
  const a = adapters[name];
  if (!a) throw new Error(`Unknown provider: ${name}`);
  return a;
}

export function getOrderedAdapters(preferred?: ProviderName): ProviderAdapter[] {
  const order = preferred
    ? [preferred, ...config.providerOrder.filter((p) => p !== preferred)]
    : [...config.providerOrder];
  return order.map((n) => adapters[n]).filter(Boolean);
}

export { adapters };
export type { ProviderAdapter };
