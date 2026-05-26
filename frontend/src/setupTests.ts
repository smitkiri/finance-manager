import '@testing-library/jest-dom';

// jsdom doesn't ship TextEncoder/TextDecoder; react-router v7 needs them.
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.TextEncoder === 'undefined') {
  // @ts-expect-error — assigning Node's TextEncoder to the global is fine for tests
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  // @ts-expect-error — assigning Node's TextDecoder to the global is fine for tests
  global.TextDecoder = TextDecoder;
}
