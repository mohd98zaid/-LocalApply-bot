// Generate minimal PNG icons using pure Node.js (no dependencies)
// Uses raw PNG binary format

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const sizes = [16, 32, 48, 128];
const outDir = path.join(__dirname, '../public/assets/icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// PNG encoder (no deps)
function createPNG(width, height, pixels) {
  // pixels is Uint8Array of RGBA values, row by row
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBytes, data]));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeInt32BE(crc);
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data (filter byte 0 per row, RGB only)
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    rawRows.push(0); // filter type None
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rawRows.push(pixels[i], pixels[i+1], pixels[i+2]); // RGB
    }
  }
  const raw = Buffer.from(rawRows);
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple CRC32
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) | 0;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

// Render icon pixels
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = x / size;
      const u = y / size;

      // Rounded rect mask
      const rx = size * 0.18, margin = size * 0.04;
      const inBounds =
        x >= margin && x < size - margin &&
        y >= margin && y < size - margin;

      // Simple corner rounding: distance from nearest corner
      const cx = Math.min(x - margin, 0) + Math.max(x - (size - margin - 1), 0);
      const cy = Math.min(y - margin, 0) + Math.max(y - (size - margin - 1), 0);
      const inRounded = inBounds && Math.sqrt(cx * cx + cy * cy) < rx;

      const i = (y * size + x) * 4;

      if (inBounds) {
        // Indigo (#6366f1) to Sky (#0ea5e9) gradient
        const r = Math.round(0x63 + (0x0e - 0x63) * t);
        const g = Math.round(0x66 + (0xa5 - 0x66) * t);
        const b = Math.round(0xf1 + (0xe9 - 0xf1) * t);
        pixels[i]   = r;
        pixels[i+1] = g;
        pixels[i+2] = b;
        pixels[i+3] = 255;
      } else {
        // Transparent
        pixels[i] = pixels[i+1] = pixels[i+2] = pixels[i+3] = 0;
      }

      // Lightning bolt: simple shape
      const cx2 = x / size, cy2 = y / size;
      // Bolt top part: triangle leaning right
      const inBolt = (
        (cx2 >= 0.35 && cx2 <= 0.65 && cy2 >= 0.1 && cy2 <= 0.55 && cx2 <= 0.35 + (cy2 - 0.1) * 1.2) ||
        (cx2 >= 0.35 && cx2 <= 0.70 && cy2 >= 0.45 && cy2 <= 0.9 && cx2 >= 0.65 - (cy2 - 0.45) * 1.2)
      );

      if (inBounds && inBolt) {
        pixels[i]   = 255;
        pixels[i+1] = 255;
        pixels[i+2] = 255;
        pixels[i+3] = 255;
      }
    }
  }

  return pixels;
}

for (const size of sizes) {
  const pixels = renderIcon(size);
  const png = createPNG(size, size, pixels);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`✓ icon-${size}.png`);
}

console.log('\nAll icons generated!');
