// SportIcon.js — custom single-colour sport glyphs ported from the
// "Choose Your Arena" design handoff (design_handoff_arena/app/icons.jsx).
// 24×24 viewBox, one coherent family: 1.7px rounded strokes + occasional
// solid accent. Colour flows through the SVG `color` prop via "currentColor",
// so a parent can tint the whole glyph with one `color` value.
//
//   <SportIcon id="cricket" size={34} color="#c4f82a" />

import React from 'react';
import Svg, { G, Path, Circle, Ellipse, Rect } from 'react-native-svg';

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};
const solid = { fill: 'currentColor', stroke: 'none' };

function Glyph({ id }) {
  switch (id) {
    case 'cricket': // batsman in batting stance holding a bat + ball
      return (
        <G>
          <Circle cx="9.5" cy="3.9" r="1.95" {...solid} />
          <Path {...P} strokeWidth="2" d="M9.5 5.8 Q10.5 8.8 10.1 12" />
          <Path {...P} d="M10.1 12 L8 18.7" />
          <Path {...P} d="M10.1 12 L12.5 18.7" />
          <Path {...P} d="M9.9 7.1 L14.7 9.1" />
          <Path {...P} strokeWidth="2.6" d="M14.7 9.1 L16.9 18.3" />
          <Circle cx="4.7" cy="17.4" r="1.5" {...solid} />
        </G>
      );
    case 'football': // soccer ball
      return (
        <G>
          <Circle cx="12" cy="12" r="8" {...P} />
          <Path {...P} d="M12 7.4 L15.6 10.1 L14.2 14.4 L9.8 14.4 L8.4 10.1 Z" />
          <Path {...P} strokeWidth="1.2" d="M12 4v3.4M19.5 9.6l-3.3 1M16.7 18.2l-2.1-2.9M9.4 15.3l-2.1 2.9M4.5 9.6l3.3 1" />
        </G>
      );
    case 'kabaddi': // raider lunging, arm out
      return (
        <G>
          <Circle cx="14.5" cy="6" r="2" {...solid} />
          <Path {...P} d="M14.8 8.4 L11.8 13 L6.5 13.6" />
          <Path {...P} d="M12.6 10.4 L17.4 11.4" />
          <Path {...P} d="M11.8 13 L13 17 M11.8 13 L8.2 17.6" />
        </G>
      );
    case 'hockey': // stick + ball
      return (
        <G>
          <Path {...P} d="M16.5 5 L9.5 15.5 Q8.4 17.2 10.4 17.6 L13.5 18" />
          <Circle cx="16.6" cy="17.6" r="2" {...solid} />
        </G>
      );
    case 'badminton': // shuttlecock
      return (
        <G>
          <Circle cx="12" cy="17.2" r="2.3" {...solid} />
          <Path {...P} d="M10 15.6 L7 7 M14 15.6 L17 7 M12 16 L12 6.4" />
          <Path {...P} d="M7 7 Q12 4.2 17 7" />
          <Path {...P} strokeWidth="1.2" d="M9.6 10.6 L14.4 10.6 M8.8 8.6 L15.2 8.6" />
        </G>
      );
    case 'tennis': // racquet + ball
      return (
        <G>
          <Ellipse cx="10.2" cy="9.4" rx="5" ry="5.8" {...P} rotation={-32} originX={10.2} originY={9.4} />
          <Path {...P} strokeWidth="1.1" d="M7.6 7.2 L12.4 11 M9.2 5.6 L11.4 13 M6.6 9 L11.2 12.6" />
          <Path {...P} d="M12.9 13 L17 18.4" />
          <Circle cx="17.4" cy="6.6" r="1.8" {...solid} />
        </G>
      );
    case 'basketball':
      return (
        <G>
          <Circle cx="12" cy="12" r="8" {...P} />
          <Path {...P} d="M12 4v16M4 12h16" />
          <Path {...P} d="M6.3 6.3 Q12 12 6.3 17.7 M17.7 6.3 Q12 12 17.7 17.7" />
        </G>
      );
    case 'volleyball':
      return (
        <G>
          <Circle cx="12" cy="12" r="8" {...P} />
          <Path {...P} d="M12 4 Q9 11 4.6 14.4 M12 4 Q15 11 19.4 14.4 M4.4 9.8 Q12 12 19.5 9.6 M9 19.4 Q12 12 9 4.4 M15 19.4 Q12 12 15 4.4" />
        </G>
      );
    case 'boxing': // glove
      return (
        <G>
          <Path {...P} d="M8 8.5 Q8 5 11.5 5 L14 5 Q18 5 18 9.5 L18 12 Q18 14.5 15.5 14.5 L10 14.5 Q8 14.5 8 12 Z" />
          <Path {...P} d="M8 9.4 Q5.6 9.4 5.6 11 Q5.6 12.6 8 12.6" />
          <Path {...P} d="M9.5 14.5 L9.5 17 Q9.5 19 12 19 L14.5 19 Q15.8 19 15.8 17.4 L15.8 14.5" />
          <Path {...P} strokeWidth="1.2" d="M13.5 9.6 L13.5 12" />
        </G>
      );
    case 'wrestling': // two grappling figures locking up
      return (
        <G>
          <Circle cx="7.6" cy="6.4" r="2" {...solid} />
          <Circle cx="16.4" cy="6.4" r="2" {...solid} />
          <Path {...P} d="M7.6 8.6 Q7.6 12 11 12.4 Q9.4 15 9.4 19" />
          <Path {...P} d="M16.4 8.6 Q16.4 12 13 12.4 Q14.6 15 14.6 19" />
          <Path {...P} d="M9.2 10.4 L14.8 10.4" />
        </G>
      );
    case 'tabletennis': // paddle + ball
      return (
        <G>
          <Ellipse cx="10.5" cy="9.5" rx="5.4" ry="6" {...solid} rotation={-30} originX={10.5} originY={9.5} />
          <Path {...P} d="M13.8 13.6 L16.8 18.4" />
          <Circle cx="17.6" cy="7.4" r="1.7" {...P} />
        </G>
      );
    case 'khokho': // chaser + signature centre pole
      return (
        <G>
          <Path {...P} strokeWidth="2" d="M15.6 4 L15.6 20" />
          <Circle cx="8" cy="6.4" r="1.9" {...solid} />
          <Path {...P} d="M8 8.4 L6.9 13 M6.9 13 L9.6 16.2 M6.9 13 L4.2 15.4 M8.2 10 L11.6 11.2" />
        </G>
      );
    case 'handball': // open throwing hand + ball
      return (
        <G>
          <Circle cx="14.8" cy="6.6" r="2.8" {...solid} />
          <Path {...P} d="M5.6 18.4 L5.6 13 M8 18.6 L8 11.4 M10.4 18.6 L10.4 11.8 M12.8 18.4 L12.8 13.2" />
          <Path {...P} d="M5.6 14.6 Q3.7 14.2 4.2 12.4" />
          <Path {...P} d="M5.6 18.4 Q5.6 19.2 6.6 19.2 L11.8 19.2 Q12.8 19.2 12.8 18.4" />
        </G>
      );
    case 'squash': // round-head racquet + small ball
      return (
        <G>
          <Circle cx="9.4" cy="8.2" r="4.3" {...P} />
          <Path {...P} strokeWidth="0.9" d="M9.4 4 V12.4 M5.2 8.2 H13.6 M6.6 5.3 L12.3 11 M12.3 5.3 L6.6 11" />
          <Path {...P} d="M12.2 11.4 L16.8 18" />
          <Circle cx="17.4" cy="9.4" r="1.5" {...solid} />
        </G>
      );
    case 'pickleball': // solid paddle + wiffle ball (diamond hole pattern)
      return (
        <G>
          <Rect x="5.4" y="4.4" width="8.2" height="9.4" rx="3.4" {...solid} rotation={-18} originX={9.5} originY={9} />
          <Path {...P} d="M11 13.6 L13.8 18" />
          <Circle cx="17" cy="8.4" r="2.9" {...P} />
          <G fill="currentColor" stroke="none">
            <Circle cx="17" cy="6.7" r="0.5" />
            <Circle cx="15.4" cy="8.4" r="0.5" />
            <Circle cx="18.6" cy="8.4" r="0.5" />
            <Circle cx="17" cy="10.1" r="0.5" />
          </G>
        </G>
      );
    case 'judo': // tied martial-arts belt
      return (
        <G>
          <Path {...P} strokeWidth="2.6" d="M3.5 9 H20.5" />
          <Rect x="9.9" y="7.4" width="4.2" height="3.6" rx="0.9" {...P} />
          <Path {...P} d="M10.6 11 L9.2 18.4 M13.4 11 L14.8 18.4" />
        </G>
      );
    case 'karate': // side kick figure
      return (
        <G>
          <Circle cx="7.5" cy="6.5" r="1.9" {...solid} />
          <Path {...P} d="M7.5 8.4 L9 13 M9 13 L20 13 M9 13 L7 18 M9.4 10 L5 11.5" />
        </G>
      );
    case 'golf': // flag in hole + ball
      return (
        <G>
          <Path {...P} d="M9 18 L9 5 L16 7.4 L9 9.8" />
          <Ellipse cx="11" cy="18.4" rx="6" ry="1.8" {...P} />
          <Circle cx="15.4" cy="17.2" r="1.6" {...solid} />
        </G>
      );
    case 'archery': // target + arrow
      return (
        <G>
          <Circle cx="10.6" cy="13.4" r="6.2" {...P} />
          <Circle cx="10.6" cy="13.4" r="3.2" {...P} />
          <Circle cx="10.6" cy="13.4" r="0.6" {...solid} />
          <Path {...P} d="M10.6 13.4 L20 4" />
          <Path {...P} d="M17.4 4 L20 4 L20 6.6" />
        </G>
      );
    case 'bowling': // pin + ball
      return (
        <G>
          <Path {...P} d="M9 4.6 Q11 4.6 11 7 Q11 9 10.2 10.4 Q11 12.4 11 15 Q11 19 9 19 Q7 19 7 15 Q7 12.4 7.8 10.4 Q7 9 7 7 Q7 4.6 9 4.6 Z" />
          <Circle cx="16.5" cy="14" r="4" {...P} />
          <Path {...P} strokeWidth="1" d="M15 12.4a0.7 0.7 0 1 0 0.1 0M17.6 12.4a0.7 0.7 0 1 0 0.1 0M16.4 14.6a0.7 0.7 0 1 0 0.1 0" />
        </G>
      );
    case 'snowboard': // board + bindings
      return (
        <G rotation={35} originX={12} originY={12}>
          <Rect x="10.2" y="3.4" width="3.6" height="17.2" rx="1.8" {...P} />
          <Path {...P} strokeWidth="1.2" d="M10.6 9 H13.4 M10.6 14.4 H13.4" />
        </G>
      );
    case 'rummy': // two overlapping playing cards + spade pip
      return (
        <G>
          <Rect x="3.4" y="7.2" width="9" height="12.4" rx="1.6" {...P} rotation={-14} originX={7.9} originY={13.4} />
          <Rect x="11" y="5" width="9" height="12.4" rx="1.6" {...solid} />
          <Path fill="#0d1320" stroke="none" d="M15.5 8 Q18 10.8 16.4 12.3 Q15.8 12.8 15.5 12.2 Q15.2 12.8 14.6 12.3 Q13 10.8 15.5 8 Z" />
          <Path fill="none" stroke="#0d1320" strokeWidth="1.3" strokeLinecap="round" d="M15.5 12 L15.5 14.4" />
        </G>
      );
    default:
      return <Circle cx="12" cy="12" r="7" {...P} />;
  }
}

export default function SportIcon({ id, size = 34, color = '#c4f82a', style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" color={color} style={style}>
      <Glyph id={id} />
    </Svg>
  );
}
