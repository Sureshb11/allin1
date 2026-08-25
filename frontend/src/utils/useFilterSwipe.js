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
// A swipe off either END is handed to `onOverflow(dir)` when the caller supplies
// it, instead of being swallowed. That's what chains the filter row to the
// SECTION row above it: Matches' All→Live→Upcoming→Completed, one more swipe,
// and you're on Teams. Callers that don't pass it keep the old dead-end.
//
//   const swipe = useFilterSwipe(FILTERS, status, setStatus);
//   <GestureDetector gesture={swipe}><View style={{flex:1}}>…</View></GestureDetector>
//
// @param values     the filter list, in the order it's drawn
// @param current    the selected value
// @param onChange   called with the next value
// @param onOverflow optional; called with +1/-1 when a swipe runs off the end
// @param enabled  false hands the gesture to whatever is above this view. Panes
//                  inside the Pavilion pager pass false: there each filter is a
//                  PAGE, so the pager owns the drag and a competing Pan here
//                  would swallow it.
export function useFilterSwipe(values, current, onChange, onOverflow, enabled = true) {
  const step = useCallback((dir) => {
    if (!Array.isArray(values) || values.length < 2) return;
    const i = values.indexOf(current);
    const from = i < 0 ? 0 : i;
    const next = Math.max(0, Math.min(values.length - 1, from + dir));
    if (next === from) {
      // Off the end of this row: let the caller carry the swipe outward to the
      // next section. Still ticks, because something DID happen.
      if (onOverflow) { haptic.tick(); onOverflow(dir); }
      return;
    }
    haptic.tick();
    onChange(values[next]);
  }, [values, current, onChange, onOverflow]);

  return useMemo(() => Gesture.Pan()
    .enabled(enabled !== false)
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
    }), [step, enabled]);
}

export default useFilterSwipe;
