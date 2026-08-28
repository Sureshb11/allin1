import { useRef, useCallback, useEffect } from 'react';

/**
 * A hook to automatically manage keyboard focus navigation for sequential fields.
 * 
 * @param {string[]} fieldKeys - Ordered array of logical field keys (top to bottom).
 * @returns {Function} getFieldProps(key, onFinalSubmit, finalReturnKey = 'done') -> Props to spread on TextInput
 */
export function useFocusOrder(fieldKeys) {
  const refs = useRef({});
  const keysRef = useRef(fieldKeys);

  // Keep track of the latest fieldKeys in a ref so we don't break memoization of getFieldProps
  useEffect(() => {
    keysRef.current = fieldKeys;
  }, [fieldKeys]);

  const getFieldProps = useCallback((key, onFinalSubmit, finalReturnKey = 'done') => {
    return {
      ref: (el) => {
        if (el) {
          refs.current[key] = el;
        } else {
          delete refs.current[key];
        }
      },
      // Determine if this is the last field in the provided keys
      returnKeyType: keysRef.current[keysRef.current.length - 1] === key ? finalReturnKey : 'next',
      blurOnSubmit: keysRef.current[keysRef.current.length - 1] === key,
      onSubmitEditing: () => {
        const keys = keysRef.current;
        const idx = keys.indexOf(key);
        
        let focusedNext = false;
        if (idx >= 0 && idx < keys.length - 1) {
          // Find next mounted field
          let nextIdx = idx + 1;
          while (nextIdx < keys.length) {
            const nextKey = keys[nextIdx];
            if (refs.current[nextKey]) {
              refs.current[nextKey].focus();
              focusedNext = true;
              break;
            }
            nextIdx++;
          }
        }
        
        // If it's the last field (or we didn't find any subsequent field to focus)
        if (!focusedNext && onFinalSubmit) {
          onFinalSubmit();
        }
      }
    };
  }, []);

  return getFieldProps;
}
