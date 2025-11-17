import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

const canUseLocalStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

function readStoredValue<T>(key: string): T | null {
  if (!canUseLocalStorage) {
    return null
  }

  try {
    const storedValue = window.localStorage.getItem(key)
    if (!storedValue) {
      return null
    }

    return JSON.parse(storedValue) as T
  } catch (error) {
    console.warn('Unable to read layout state from localStorage', error)
    return null
  }
}

function persistValue<T>(key: string, value: T) {
  if (!canUseLocalStorage) {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn('Unable to persist layout state to localStorage', error)
  }
}

/**
 * useLocalStorageState keeps a piece of state in sync with localStorage.
 *
 * - Reads the stored value synchronously during the initial render so we never
 *   clobber existing data with defaults.
 * - Persists every mutation back to localStorage with error handling for
 *   browsers that restrict access to storage.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = readStoredValue<T>(key)
    return stored ?? defaultValue
  })

  useEffect(() => {
    persistValue(key, value)
  }, [key, value])

  return [value, setValue]
}
