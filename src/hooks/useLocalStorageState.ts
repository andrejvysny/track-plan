import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Wrapper around useState that keeps the value in sync with localStorage.
 * Initial load happens in a useEffect hook so the code is safe for environments where window is undefined.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue)

  // Load the value once from localStorage in the browser and hydrate state.
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const storedValue = window.localStorage.getItem(key)
      if (storedValue !== null) {
        setValue(JSON.parse(storedValue) as T)
      }
    } catch (error) {
      console.warn('Unable to read layout state from localStorage', error)
    }
  }, [key])

  // Persist updates back to localStorage whenever the value changes.
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn('Unable to persist layout state to localStorage', error)
    }
  }, [key, value])

  return [value, setValue]
}
