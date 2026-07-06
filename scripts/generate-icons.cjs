const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const sizes = [16, 32, 48, 128];
const outDir = path.join(__dirname, '../public/assets/icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function crc32(data) {
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = -1;
  for (const byte of data) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) | 0;
}

function createPNG(width, height, rgbPixels) {
  const SIG = Buffer.from([137,80,78,71,13,10,26,10]);
  function chunk(type, data) {
    const tb = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeInt32BE(crc32(Buffer.concat([tb, data])));
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    return Buffer.concat([lenBuf, tb, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=2;
  const raw = [];
  for (let y=0;y<height;y++) { raw.push(0); for (let x=0;x<width;x++) { const i=(y*width+x)*3; raw.push(rgbPixels[i],rgbPixels[i+1],rgbPixels[i+2]); } }
  return Buffer.concat([SIG, chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(Buffer.from(raw))), chunk('IEND',Buffer.alloc(0))]);
}

function renderIcon(size) {
  const pix = new Uint8Array(size * size * 3);
  const m = size * 0.06;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i=(y*size+x)*3;
    const t = x/size;
    // Gradient: indigo to sky
    const r = Math.round(0x63+(0x0e-0x63)*t);
    const g = Math.round(0x66+(0xa5-0x66)*t);
    const b = Math.round(0xf1+(0xe9-0xf1)*t);
    pix[i]=r; pix[i+1]=g; pix[i+2]=b;
    // Lightning bolt shape (white)
    const nx=x/size, ny=y/size;
    const inBolt = (ny>0.15&&ny<0.52&&nx>0.3&&nx<0.6&&nx<0.3+(ny-0.15)*0.9) ||
                   (ny>0.48&&ny<0.85&&nx>0.4&&nx<0.7&&nx>0.7-(ny-0.48)*0.9);
    if (inBolt) { pix[i]=255; pix[i+1]=255; pix[i+2]=255; }
  }
  return pix;
}

for (const size of sizes) {
  const png = createPNG(size, size, renderIcon(size));
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}
console.log('Done');
