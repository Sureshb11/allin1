import { useMemo, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { haptic } from './haptics';

// Horizontal swipe steps a filter row.
//
// The menus themselves change by tapping a pill; a swipe moves you along the
// filters INSIDE the menu you're on — Matches' All/Live/Upcoming/Completed,
// Teams' My Teams/Opponents/Followed, Leagues' All/Open/Ongoing/Completed. Three
// screens want that, so the behaviour lives here rather than three times over.
//
// It's a discrete step, not a tracked pager: nothing follows the finger, the
// filter just advances when the swipe commits. A filter row has no page to drag
// — the list underneath re-filters in place — so tracking would animate a
// movement that isn't happening.
//
// Clamped, not wrapping. Swiping past the last filter landing back on the first
// makes it easy to lose track of where you are in a four-item row.
//
//   const swipe = useFilterSwipe(FILTERS, status, setStatus);
//   <GestureDetector gesture={swipe}><View style={{flex:1}}>…</View></GestureDetector>
//
// @param values  the filter list, in the order it's drawn
// @param current the selected value
// @param onChange called with the next value
export function useFilterSwipe(values, current, onChange) {
  const step = useCallback((dir) => {
    if (!Array.isArray(values) || values.length < 2) return;
    const i = values.indexOf(current);
    const from = i < 0 ? 0 : i;
    const next = Math.max(0, Math.min(values.length - 1, from + dir));
    if (next === from) return;          // already at the end — no tick, no change
    haptic.tick();
    onChange(values[next]);
  }, [values, current, onChange]);

  return useMemo(() => Gesture.Pan()
    // Claim a horizontal drag, but only a deliberate one: a filter step is a
    // bigger commitment than a page flick, and these screens are vertical lists
    // whose scrolling must stay untouched.
    .activeOffsetX([-24, 24])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      'worklet';
      const far = Math.abs(e.translationX) > 60;
      const fast = Math.abs(e.velocityX) > 500;
      if (!far && !fast) return;        // a stray drag shouldn't move the filter
      // Swipe left = forward through the row, the direction the content moves.
      runOnJS(step)(e.translationX < 0 ? 1 : -1);
    }), [step]);
}

export default useFilterSwipe;
