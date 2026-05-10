/**
 * Processes a human face image: Crops, removes background, and returns a Base64 string.
 * @param {string} imageUrl - Public URL of the target image
 * @returns {Promise<{ src: string, data: object }>}
 */
export async function processFaceImage(imageUrl) {
  const VISION_BASE = 'https://vision.casitaapps.com';

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });

  // 1. Get geometry from API
  const formData = new FormData();
  formData.append('imageUrl', imageUrl);

  const analyzeRes = await fetch(`${VISION_BASE}/analyze`, {
    method: 'POST',
    body: formData
  });
  
  const data = await analyzeRes.json();
  if (!data || data.ok !== true) throw new Error('Vision API failed');

  // 2. Load the original image
  const img = await loadImage(`${VISION_BASE}/image/${data.imageKey}`);

  // 3. Setup Main Canvas & Cropping Math
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
  if (data.cropBox) {
    sx = data.cropBox.xMin * img.width;
    sy = data.cropBox.yMin * img.height;
    sWidth = (data.cropBox.xMax - data.cropBox.xMin) * img.width;
    sHeight = (data.cropBox.yMax - data.cropBox.yMin) * img.height;
  }

  // Optimize resolution (Max 256px)
  const maxRes = 256;
  const scale = Math.min(1, maxRes / sWidth, maxRes / sHeight);
  const cW = Math.floor(sWidth * scale);
  const cH = Math.floor(sHeight * scale);
  
  canvas.width = cW;
  canvas.height = cH;
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, cW, cH);

  // 4. Background Masking via Pixel Array Manipulation
  if (data.maskAvailable && data.maskUrl) {
    const maskImg = await loadImage(data.maskUrl);
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = cW;
    maskCanvas.height = cH;
    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

    const mScaleX = maskImg.width / img.width;
    const mScaleY = maskImg.height / img.height;
    
    // Draw mask matching the cropped bounds
    mCtx.drawImage(
      maskImg,
      sx * mScaleX, sy * mScaleY, sWidth * mScaleX, sHeight * mScaleY,
      0, 0, cW, cH
    );

    const mainPixels = ctx.getImageData(0, 0, cW, cH);
    const maskPixels = mCtx.getImageData(0, 0, cW, cH);

    // Detect if mask uses Alpha channel or Grayscale
    let usesAlpha = false;
    for (let i = 3; i < maskPixels.data.length; i += 16) {
      if (maskPixels.data[i] < 255) { usesAlpha = true; break; }
    }

    // Apply mask to main image
    for (let i = 0; i < mainPixels.data.length; i += 4) {
      const maskIntensity = usesAlpha ? maskPixels.data[i + 3] : maskPixels.data[i];
      mainPixels.data[i + 3] = (mainPixels.data[i + 3] * maskIntensity) / 255;
    }
    
    ctx.putImageData(mainPixels, 0, 0);
  }

  // 5. Return Output
  return {
    src: canvas.toDataURL('image/png'),
    rawVisionData: data
  };
}
