# Fase 7 — SDK Front (MabelCoins)

## Archivos
- `src/modules/mabelcoins/mabelcoins-sdk.js`

## Uso rápido (en cualquier módulo)
```js
import { Coins, Missions, Promo, Recovery } from './src/modules/mabelcoins/mabelcoins-sdk.js';

// Balance
const b = await Coins.getBalance();

// Emitir evento de misión (ej. al guardar equipo)
await Missions.emit('TEAM_SAVED', { teamId: 'abc123' });

// Canjear código
await Promo.redeem('MABEL100');

// Recovery Key
const { hasRecoveryKey } = await Recovery.status();
if (!hasRecoveryKey) {
  const { recoveryKey } = await Recovery.generate();
  // Mostrar SOLO 1 vez al usuario y pedir que la guarde.
}
```

## Nota
Este SDK asume que el JWT está guardado en:
- `localStorage['fhm.account.v2']` como `{ token: '...' }`
