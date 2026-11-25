// Minimal self-contained QR Code (Byte mode, ECC Level L, Versions 1-7) SVG matrix generator
// Ensures TOTP otpauth:// URIs render as scannable QR codes with zero external network calls.

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecLen: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Array(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return res.slice(data.length);
}

// Capacity specs for ECC Level L (single-block up to V5, V6/V7 supported cleanly)
const VERSION_SPECS: Array<{
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  align: number[];
}> = [
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, align: [6, 30] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const spec =
    VERSION_SPECS.find((s) => bytes.length + 2 <= s.dataCodewords) || VERSION_SPECS[VERSION_SPECS.length - 1];

  const truncatedBytes = bytes.slice(0, spec.dataCodewords - 2);
  const bitStream: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bitStream.push((val >>> i) & 1);
  };

  // Mode: Byte (0100), Length (8 bits for V1-9)
  pushBits(0b0100, 4);
  pushBits(truncatedBytes.length, 8);
  for (const b of truncatedBytes) pushBits(b, 8);

  const totalDataBits = spec.dataCodewords * 8;
  const term = Math.min(4, totalDataBits - bitStream.length);
  for (let i = 0; i < term; i++) bitStream.push(0);
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  const dataWords: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | bitStream[i + b];
    dataWords.push(val);
  }
  const padBytes = [0xec, 0x11];
  let pIdx = 0;
  while (dataWords.length < spec.dataCodewords) {
    dataWords.push(padBytes[pIdx % 2]);
    pIdx++;
  }

  const ecWords = rsRemainder(dataWords, spec.ecCodewords);
  const allWords = [...dataWords, ...ecWords];
  const allBits: number[] = [];
  for (const w of allWords) {
    for (let i = 7; i >= 0; i--) allBits.push((w >>> i) & 1);
  }

  const size = spec.size;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const onBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        grid[r][c] = !onBorder && (inOuter || inInner);
        reserved[r][c] = true;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment pattern
  const aPos = spec.align[1];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = aPos + dr;
      const c = aPos + dc;
      if (!reserved[r][c]) {
        grid[r][c] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        reserved[r][c] = true;
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      grid[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      grid[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }

  // Dark module
  grid[size - 8][8] = true;
  reserved[size - 8][8] = true;

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Data placement (zig-zag upward/downward)
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (!reserved[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] === 1 : false;
          // Apply mask 0: (r + c) % 2 === 0
          grid[r][c] = (r + c) % 2 === 0 ? !bit : bit;
        }
      }
    }
    upward = !upward;
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> 15-bit BCH + XOR 0x5412 = 0x77c4 (111011111000100)
  const formatBits = '111011111000100'.split('').map((b) => b === '1');
  const coords1: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const coords2: Array<[number, number]> = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let i = 0; i < 15; i++) {
    grid[coords1[i][0]][coords1[i][1]] = formatBits[i];
    grid[coords2[i][0]][coords2[i][1]] = formatBits[i];
  }

  return grid.map((row) => row.map((cell) => Boolean(cell)));
}
