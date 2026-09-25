export const rasterSize = pixels => [768, 1024, 1536, 2200].find(size => size >= pixels) || 2200;
