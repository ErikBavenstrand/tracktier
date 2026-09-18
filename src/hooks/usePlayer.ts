import { useSyncExternalStore } from 'react'
import { player, type PlayerState } from '../lib/audio'

const subscribe = (onChange: () => void) => player.subscribe(onChange)
const snapshot = (): PlayerState => player.getState()

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
