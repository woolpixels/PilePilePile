const CANVAS_SIZE = 1080;
const canvas = document.querySelector('#wordCanvas');
const ctx = canvas.getContext('2d');

const elements = Object.fromEntries([
  'wordsInput', 'wordCount', 'fontFamily', 'minFontSize', 'fontLevelCount', 'fontLevelGap',
  'fontLevelPreview', 'autoFontFit', 'wordPadding', 'paddingOutput', 'fillStrength', 'fillStrengthOutput',
  'rotationModeControl', 'rotationAngleOptions', 'density', 'densityNumber', 'densityMinusButton',
  'densityPlusButton', 'repeatWords', 'compactLayout', 'sizeModeControl', 'shapeGrid',
  'drawShapeButton', 'drawingHelp', 'undoPolygonButton', 'resetPolygonButton',
  'closePolygonButton', 'imageUpload', 'svgShapeUpload', 'invertRow', 'invertMask',
  'showShapeLayer', 'shapeLayerColor', 'shapeLayerColorText', 'shapeLayerOpacity',
  'paletteList', 'presetModeButton', 'customModeButton', 'customPaletteEditor',
  'customColors', 'addColorButton',
  'backgroundColor', 'backgroundColorText', 'backgroundOpacity', 'transparentBackground',
  'randomSettingsButton', 'regenerateButton', 'undoButton', 'redoButton',
  'exportPngButton', 'exportSvgButton', 'copySvgButton',
  'wordContextMenu', 'contextWordLabel', 'contextWordSize', 'contextWordColor',
  'resetWordStyleButton', 'saveWordStyleButton', 'closeWordContextButton',
  'wordDetailsToggle', 'wordDetailsToggleLabel', 'wordDetailsPanel', 'wordDetailsSummary', 'wordDetailsHeader', 'wordDetailsList',
  'layoutStatus', 'emptyState', 'toast'
].map((id) => [id, document.querySelector(`#${id}`)]));

const palettes = [
  { name: '鲜果', colors: ['#FF3B30', '#FF8A00', '#FFD60A', '#34C759', '#0A84FF'] },
  { name: '晴日', colors: ['#007AFF', '#32ADE6', '#64D2FF', '#30D158', '#FFD60A'] },
  { name: '紫霞', colors: ['#372B52', '#7254D8', '#B58CE4', '#E8658A', '#F2A65A'] },
  { name: '海岸', colors: ['#12355B', '#1C77C3', '#39A9DB', '#40BCD8', '#F4D35E'] },
  { name: '森林', colors: ['#163832', '#235347', '#8EB69B', '#DAF1DE', '#D4A373'] },
  { name: '日落', colors: ['#5F0F40', '#9A031E', '#FB8B24', '#E36414', '#0F4C5C'] },
  { name: '墨彩', colors: ['#171719', '#424047', '#77727D', '#A7A2AC', '#D95D7B'] }
];

const fontPresets = {
  pingfang: { name: '苹方', stack: '"PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif', svg: 'PingFang SC, sans-serif' },
  songti: { name: '华文宋体', stack: '"Songti SC", "STSong", serif', svg: 'Songti SC, STSong, serif' },
  helvetica: { name: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, "PingFang SC", sans-serif', svg: 'Helvetica Neue, Helvetica, PingFang SC, sans-serif' },
  georgia: { name: 'Georgia', stack: 'Georgia, "Songti SC", serif', svg: 'Georgia, Songti SC, serif' }
};

const builtInSvgShapes = {
  'builtin-weibo': { id: 'builtin-weibo', name: '微博', dataUrl: './assets/weibo.svg' }
};

const state = {
  shape: 'square',
  colors: [...palettes[0].colors],
  customColors: [...palettes[0].colors],
  colorMode: 'preset',
  sizeMode: 'hierarchy',
  rotationMode: 'none',
  customAngles: [0, 90],
  manualLevels: null,
  currentLevels: [],
  savedShapes: [],
  selectedPalette: 0,
  placements: [],
  seed: Date.now() % 2147483647,
  styleSeed: (Date.now() + 104729) % 2147483647,
  polygon: [],
  drawing: false,
  maskImage: null,
  imageMask: null,
  imageMaskStats: null,
  activeSavedShapeId: null,
  wordOverrides: {},
  activeContextWordId: null,
  activeRegion: null,
  layoutTimer: null,
  layoutRequestId: 0
};

elements.wordsInput.value = '灵感，设计，文字，形状，色彩，排版，创意，表达，视觉，节奏，层次，留白，构成，想象，自由，编辑，字体，画布，作品，分享，图形，品牌，海报，艺术，工具，探索，生成，收藏，导出，细节';

function parseWords() {
  return elements.wordsInput.value
    .split(/[\s,，、;；]+/u)
    .map((word) => word.trim())
    .filter(Boolean);
}

function getWordOccurrences() {
  const input = parseWords();
  if (!input.length) return [];
  const target = Number(elements.density.value);
  const count = elements.repeatWords.checked ? Math.max(input.length, target) : input.length;
  return Array.from({ length: count }, (_, id) => ({ id, text: input[id % input.length] }));
}

function xorshift(seed) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function getFontLevels() {
  const min = clamp(Number(elements.minFontSize.value) || 20, 8, 260);
  const count = clamp(Number(elements.fontLevelCount.value) || 5, 2, 10);
  if (!elements.autoFontFit.checked && state.manualLevels?.length === count) return [...state.manualLevels];
  const gap = clamp(Number(elements.fontLevelGap.value) || 18, 2, 80);
  const levels = Array.from({ length: count }, (_, index) => min + index * gap);
  if (state.sizeMode !== 'similar') return levels;
  const center = levels.reduce((sum, size) => sum + size, 0) / levels.length;
  return levels.map((size) => Math.round(center + (size - center) * .38));
}

function updateLevelPreview(levels = getFontLevels()) {
  state.currentLevels = levels.map((size) => Math.round(size));
  elements.fontLevelPreview.innerHTML = state.currentLevels.map((size, index) =>
    `<input type="number" min="8" max="260" value="${size}" data-level-index="${index}" aria-label="字号档位 ${index + 1}" ${elements.autoFontFit.checked ? 'disabled' : ''} />`
  ).join('');
}

function getBaseShapeRegion() {
  if (state.shape === 'image' && state.imageMaskStats) {
    const { minX, minY, maxX, maxY } = state.imageMaskStats;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
  if (state.shape === 'custom' && state.polygon.length >= 3) {
    const xs = state.polygon.map((point) => point.x);
    const ys = state.polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  const regions = {
    square: { x: 64, y: 64, width: 952, height: 952 },
    rectangle: { x: 64, y: 205, width: 952, height: 670 },
    circle: { x: 64, y: 64, width: 952, height: 952 },
    star: { x: 64, y: 64, width: 952, height: 952 },
    heart: { x: 64, y: 64, width: 952, height: 952 },
    cloud: { x: 64, y: 125, width: 952, height: 830 }
  };
  return regions[state.shape] || { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };
}

function getShapePackingParameters() {
  const baseOccupancy = state.shape === 'star'
    ? .48
    : state.shape === 'image'
      ? .62
      : state.shape === 'custom'
        ? .62
    : state.shape === 'heart'
      ? .56
      : state.shape === 'circle'
        ? .68
        : state.shape === 'cloud'
          ? .66
          : state.shape === 'rectangle'
            ? .70
            : .74;
  const strengthMultiplier = Number(elements.fillStrength.value) / 74;
  const occupancy = Math.min(.86, baseOccupancy * strengthMultiplier);
  return {
    areaFactor: state.shape === 'circle' ? .785 : state.shape === 'star' ? .34 : state.shape === 'heart' ? .62 : state.shape === 'cloud' ? .58 : 1,
    occupancy
  };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function getActualShapeArea(region) {
  if (state.shape === 'image' && state.imageMaskStats) return state.imageMaskStats.area;
  if (state.shape === 'custom' && state.polygon.length >= 3) return polygonArea(state.polygon);
  return region.width * region.height * getShapePackingParameters().areaFactor;
}

function rotatedBounds(width, height, angle) {
  const radians = Math.abs(angle) * Math.PI / 180;
  return {
    width: Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)),
    height: Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  };
}

function chooseRotation(random) {
  if (state.rotationMode === 'none') return 0;
  const angles = state.rotationMode === 'custom'
    ? state.customAngles
    : [0, 90, 45, -45, 35, -35, 15, -15, 5, -5];
  return angles[Math.floor(random() * angles.length)] ?? 0;
}

function renderPaletteOptions() {
  elements.paletteList.innerHTML = palettes.map((palette, index) => `
    <button class="palette-option ${index === 0 ? 'active' : ''}" data-palette="${index}">
      <strong>${palette.name}</strong>
      <span class="swatches">${palette.colors.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
    </button>
  `).join('');
  renderColorMode();
}

function loadSavedShapes() {
  try {
    const saved = JSON.parse(localStorage.getItem('glyphweave.savedShapes') || '[]');
    state.savedShapes = Array.isArray(saved)
      ? saved.filter((shape) => !['新浪', '微博'].includes(shape.name))
      : [];
    localStorage.setItem('glyphweave.savedShapes', JSON.stringify(state.savedShapes));
  } catch {
    state.savedShapes = [];
  }
}

function persistSavedShapes() {
  try {
    localStorage.setItem('glyphweave.savedShapes', JSON.stringify(state.savedShapes));
  } catch {
    showToast('SVG 形状较大，浏览器无法继续保存');
  }
}

function renderSavedShapes() {
  elements.shapeGrid.querySelectorAll('.saved-shape-card').forEach((button) => button.remove());
  const addCard = elements.shapeGrid.querySelector('.add-shape-card');
  for (const shape of state.savedShapes) {
    const button = document.createElement('button');
    button.className = 'shape-card saved-shape-card';
    button.dataset.savedShape = shape.id;
    button.setAttribute('aria-label', shape.name);
    button.title = shape.name;
    const image = document.createElement('img');
    image.className = 'saved-shape-thumb';
    image.src = shape.dataUrl;
    image.alt = '';
    button.append(image);
    elements.shapeGrid.insertBefore(button, addCard);
  }
}

function activateSavedShape(shape) {
  const image = new Image();
  image.onload = () => {
    state.maskImage = image;
    updateImageMask(image, elements.invertMask.checked);
    state.shape = 'image';
    state.activeSavedShapeId = shape.id;
    state.activeRegion = null;
    state.drawing = false;
    elements.invertRow.hidden = false;
    document.querySelectorAll('.shape-card').forEach((button) => button.classList.toggle('active', button.dataset.savedShape === shape.id));
    layoutWords();
    commitHistory();
  };
  image.src = shape.dataUrl;
}

function renderColorMode() {
  const custom = state.colorMode === 'custom';
  elements.presetModeButton.classList.toggle('active', !custom);
  elements.customModeButton.classList.toggle('active', custom);
  elements.paletteList.hidden = custom;
  elements.customPaletteEditor.hidden = !custom;
  if (custom) renderCustomColors();
}

function renderCustomColors() {
  elements.customColors.innerHTML = state.customColors.map((color, index) => `
    <div class="custom-color-item" data-color-index="${index}">
      <label>颜色 ${index + 1}</label>
      <div class="color-value-input">
        <input type="color" value="${color}" aria-label="颜色 ${index + 1} 色卡" />
        <input type="text" value="${color.toUpperCase()}" maxlength="7" aria-label="颜色 ${index + 1} 色值" />
      </div>
      <button class="remove-color-button" aria-label="删除颜色 ${index + 1}">×</button>
    </div>
  `).join('');
}

function getMaskPredicate(region) {
  if (state.shape === 'custom' && state.polygon.length >= 3) {
    return (x, y) => pointInPolygon(x, y, state.polygon);
  }
  if (state.shape === 'image' && state.maskImage) {
    const mask = state.imageMask || buildImageMask(state.maskImage, elements.invertMask.checked);
    return (x, y) => mask[Math.floor(y) * CANVAS_SIZE + Math.floor(x)] === 1;
  }
  if (state.shape === 'circle') {
    const radius = Math.min(region.width, region.height) / 2;
    return (x, y) => (x - region.cx) ** 2 + (y - region.cy) ** 2 <= radius ** 2;
  }
  if (state.shape === 'star') {
    const outer = Math.min(region.width, region.height) / 2;
    const points = starPoints(region.cx, region.cy, outer, outer * .46, 5);
    return (x, y) => pointInPolygon(x, y, points);
  }
  if (state.shape === 'heart') {
    const points = heartPoints(region);
    return (x, y) => pointInPolygon(x, y, points);
  }
  if (state.shape === 'cloud') {
    return (x, y) => pointInCloud(x, y, region);
  }
  return (x, y) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height;
}

function getLayoutRegion(words, measure) {
  const fallback = getBaseShapeRegion();
  if (!elements.compactLayout.checked || state.shape === 'custom' || state.shape === 'image') {
    return { ...fallback, cx: fallback.x + fallback.width / 2, cy: fallback.y + fallback.height / 2 };
  }

  const padding = Number(elements.wordPadding.value);
  let totalArea = 0;
  let longest = 0;
  for (const word of words) {
    measure.font = `700 ${word.fontSize}px ${fontStack()}`;
    const textWidth = Math.max(8, measure.measureText(word.text).width);
    const bounds = rotatedBounds(textWidth, word.fontSize * 1.08, word.rotation);
    totalArea += (bounds.width + padding * 2) * (bounds.height + padding * 2);
    longest = Math.max(longest, bounds.width, bounds.height);
  }

  const packing = getShapePackingParameters();
  const requiredBoxArea = totalArea / (packing.areaFactor * packing.occupancy);
  const aspect = state.shape === 'rectangle' || state.shape === 'cloud' ? 1.42 : 1;
  let width = Math.sqrt(requiredBoxArea * aspect);
  let height = width / aspect;
  const minimum = Math.max(260, longest * 1.6);
  width = clamp(width, minimum, fallback.width);
  height = clamp(height, Math.min(minimum, fallback.height), fallback.height);
  const region = {
    x: (CANVAS_SIZE - width) / 2,
    y: (CANVAS_SIZE - height) / 2,
    width,
    height
  };
  return { ...region, cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2 };
}

function fitWordSizesToShape(words, measure) {
  if (!elements.autoFontFit.checked) {
    updateLevelPreview();
    return;
  }
  const region = getBaseShapeRegion();
  const packing = getShapePackingParameters();
  const targetArea = getActualShapeArea(region) * packing.occupancy;
  const padding = Number(elements.wordPadding.value);
  const originalLevels = getFontLevels();
  let totalScale = 1;

  for (let pass = 0; pass < 2; pass += 1) {
    let currentArea = 0;
    for (const word of words) {
      measure.font = `700 ${word.fontSize}px ${fontStack()}`;
      const textWidth = Math.max(8, measure.measureText(word.text).width);
      const bounds = rotatedBounds(textWidth, word.fontSize * 1.08, word.rotation);
      currentArea += (bounds.width + padding * 2) * (bounds.height + padding * 2);
    }
    if (!currentArea) break;
    const requestedScale = Math.sqrt(targetArea / currentArea);
    const currentMax = Math.max(...words.map((word) => word.fontSize));
    const safeScale = Math.min(requestedScale, 260 / currentMax);
    totalScale *= safeScale;
    words.forEach((word) => { word.fontSize = Math.max(8, Math.round(word.fontSize * safeScale)); });
    if (Math.abs(1 - safeScale) < .025) break;
  }

  updateLevelPreview(originalLevels.map((size) => Math.min(260, Math.max(8, Math.round(size * totalScale)))));
}

function buildImageMask(image, invert) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = CANVAS_SIZE;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  maskCtx.fillStyle = '#fff';
  maskCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const scale = Math.min(920 / image.width, 920 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  maskCtx.drawImage(image, (CANVAS_SIZE - width) / 2, (CANVAS_SIZE - height) / 2, width, height);
  const pixels = maskCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
  const result = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);
  for (let i = 0; i < result.length; i += 1) {
    const p = i * 4;
    const luminance = pixels[p] * .299 + pixels[p + 1] * .587 + pixels[p + 2] * .114;
    const alpha = pixels[p + 3];
    const dark = alpha > 30 && luminance < 210;
    result[i] = invert ? (dark ? 0 : 1) : (dark ? 1 : 0);
  }
  return result;
}

function getImageMaskStats(mask) {
  let area = 0;
  let minX = CANVAS_SIZE;
  let minY = CANVAS_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      if (!mask[y * CANVAS_SIZE + x]) continue;
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return area ? { area, minX, minY, maxX, maxY } : null;
}

function updateImageMask(image, invert) {
  state.imageMask = buildImageMask(image, invert);
  state.imageMaskStats = getImageMaskStats(state.imageMask);
}

function prepareWords(random) {
  const occurrences = getWordOccurrences();
  if (!occurrences.length) return [];
  const levels = getFontLevels();
  return occurrences.map(({ text, id: index }) => {
    // 先确保每个档位至少出现一次，再按层级权重随机分配其余文字。
    const guaranteedLevel = index < levels.length ? levels.length - 1 - index : null;
    const power = Math.pow(random(), 2.05);
    const levelIndex = guaranteedLevel ?? Math.floor(power * levels.length);
    const override = state.wordOverrides[index];
    return {
      id: index,
      text,
      fontSize: override?.fontSize ?? levels[clamp(levelIndex, 0, levels.length - 1)],
      color: override?.color ?? getColorForWord(index),
      rotation: chooseRotation(random),
      tie: random()
    };
  }).sort((a, b) => b.fontSize - a.fontSize || a.tie - b.tie);
}

function getEmergencySizeCandidates(fontSize) {
  const sizes = [];
  let next = Math.floor(fontSize * .82);
  while (next > 2) {
    sizes.push(next);
    const smaller = Math.floor(next * .82);
    next = smaller < next ? smaller : next - 1;
  }
  sizes.push(2);
  return sizes;
}

function uniformWordOverride(ids, property) {
  const values = ids.map((id) => state.wordOverrides[id]?.[property] ?? null);
  return values.every((value) => value === values[0]) ? values[0] : 'mixed';
}

function buildWordSizeOptions(currentSize) {
  const sizes = [...new Set([
    ...state.currentLevels,
    Number(currentSize) || null
  ].filter(Boolean))].sort((a, b) => b - a);
  return sizes.map((size, index) => (
    `<option value="${size}" ${size === Number(currentSize) ? 'selected' : ''}>${index + 1} 档 · ${size}px</option>`
  )).join('');
}

function buildWordColorOptions(currentColor) {
  const normalizedCurrent = String(currentColor || state.colors[0]).toUpperCase();
  const colors = [...state.colors];
  if (!colors.some((color) => color.toUpperCase() === normalizedCurrent)) colors.push(normalizedCurrent);
  return colors.map((color, index) => (
    `<option value="${color.toUpperCase()}" ${color.toUpperCase() === normalizedCurrent ? 'selected' : ''}>颜色 ${index + 1}</option>`
  )).join('');
}

function renderWordDetails() {
  const occurrences = getWordOccurrences();
  const groups = [];
  const byText = new Map();
  for (const occurrence of occurrences) {
    let group = byText.get(occurrence.text);
    if (!group) {
      group = { text: occurrence.text, ids: [] };
      byText.set(occurrence.text, group);
      groups.push(group);
    }
    group.ids.push(occurrence.id);
  }

  const showCount = elements.repeatWords.checked;
  elements.wordDetailsHeader.classList.toggle('show-count', showCount);
  elements.wordDetailsToggleLabel.textContent = `${elements.wordDetailsPanel.hidden ? '查看' : '收起'}词条详情 · ${groups.length}`;
  elements.wordDetailsSummary.textContent = showCount
    ? `${groups.length} 个词条 · 共 ${occurrences.length} 次`
    : `${groups.length} 个词条`;

  if (!groups.length) {
    elements.wordDetailsList.innerHTML = '<div class="word-details-empty">输入词语后可查看详情</div>';
    return;
  }

  const placementsById = new Map(state.placements.map((item) => [item.id, item]));
  elements.wordDetailsList.innerHTML = groups.map((group, rowIndex) => {
    const placements = group.ids.map((id) => placementsById.get(id)).filter(Boolean);
    const sizeOverride = uniformWordOverride(group.ids, 'fontSize');
    const colorOverride = uniformWordOverride(group.ids, 'color');
    const currentSize = typeof sizeOverride === 'number' ? sizeOverride : placements[0]?.fontSize || state.currentLevels[0];
    const currentColor = typeof colorOverride === 'string' && colorOverride !== 'mixed'
      ? colorOverride
      : placements[0]?.color || state.colors[0];
    return `
      <div class="word-detail-row word-details-grid ${showCount ? 'show-count' : ''}" data-word-ids="${group.ids.join(',')}">
        <div class="word-detail-name"><span class="word-detail-index">${String(rowIndex + 1).padStart(2, '0')}</span><strong title="${escapeXml(group.text)}">${escapeXml(group.text)}</strong></div>
        <select data-word-detail-field="fontSize" aria-label="${escapeXml(group.text)}的字号档位">
          ${buildWordSizeOptions(currentSize)}
        </select>
        <select data-word-detail-field="color" aria-label="${escapeXml(group.text)}的颜色">
          ${buildWordColorOptions(currentColor)}
        </select>
        <span class="word-detail-count">${group.ids.length}</span>
      </div>`;
  }).join('');
}

function layoutWords(successMessage = '') {
  clearTimeout(state.layoutTimer);
  const requestId = ++state.layoutRequestId;
  elements.layoutStatus.textContent = '正在生成…';
  elements.regenerateButton.disabled = true;
  requestAnimationFrame(() => {
    if (requestId !== state.layoutRequestId) return;
    const random = xorshift(state.seed);
    const words = prepareWords(xorshift(state.styleSeed));
    elements.wordCount.textContent = `${parseWords().length} 个`;
    if (!words.length) {
      state.placements = [];
      drawCanvas();
      renderWordDetails();
      elements.emptyState.hidden = false;
      elements.layoutStatus.textContent = '请输入文字';
      elements.regenerateButton.disabled = false;
      return;
    }

    elements.emptyState.hidden = true;
    const padding = Number(elements.wordPadding.value);
    const placed = [];
    const measureCanvas = document.createElement('canvas');
    const measure = measureCanvas.getContext('2d');
    fitWordSizesToShape(words, measure);
    const region = getLayoutRegion(words, measure);
    state.activeRegion = region;
    const inside = getMaskPredicate(region);
    const center = state.shape === 'custom' || state.shape === 'image' ? findMaskCenter(inside) : { x: region.cx, y: region.cy };
    let downgradedCount = 0;
    let compactFallbackCount = 0;

    for (const word of words) {
      let match = null;
      let placedSize = word.fontSize;
      const smallerLevels = state.currentLevels
        .filter((size) => size < word.fontSize)
        .sort((a, b) => b - a);
      const sizeCandidates = [...new Set([
        word.fontSize,
        ...smallerLevels,
        ...getEmergencySizeCandidates(word.fontSize)
      ])].sort((a, b) => b - a);
      const smallestRegularSize = Math.min(...state.currentLevels);

      for (const candidateSize of sizeCandidates) {
        measure.font = `700 ${candidateSize}px ${fontStack()}`;
        const metrics = measure.measureText(word.text);
        const rawWidth = Math.max(8, metrics.width);
        const rawHeight = candidateSize * 1.08;
        const bounds = rotatedBounds(rawWidth, rawHeight, word.rotation);
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;
        const offset = random() * Math.PI * 2;

        const maximumAttempts = candidateSize < smallestRegularSize ? 500 : 2600;
        for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
          let x;
          let y;
          if (attempt < maximumAttempts * .8) {
            x = region.x + random() * Math.max(1, region.width - width);
            y = region.y + random() * Math.max(1, region.height - height);
          } else {
            const spiralAttempt = attempt - Math.floor(maximumAttempts * .8);
            const t = spiralAttempt * .44;
            const radius = 2.9 * Math.sqrt(spiralAttempt) * 4.2;
            x = center.x + Math.cos(t + offset) * radius * 1.03 - width / 2;
            y = center.y + Math.sin(t + offset) * radius - height / 2;
          }
          const box = { x, y, width, height };
          if (!boxInsideMask(box, inside)) continue;
          if (placed.some((item) => boxesOverlap(box, item.box))) continue;
          match = box;
          placedSize = candidateSize;
          break;
        }
        if (match) break;
      }
      if (!match) {
        for (const emergencySize of [2, 1]) {
          measure.font = `700 ${emergencySize}px ${fontStack()}`;
          const metrics = measure.measureText(word.text);
          const bounds = rotatedBounds(Math.max(1, metrics.width), emergencySize * 1.08, word.rotation);
          const width = Math.max(1, bounds.width);
          const height = Math.max(1, bounds.height);
          for (let attempt = 0; attempt < 1200; attempt += 1) {
            const x = region.x + random() * Math.max(1, region.width - width);
            const y = region.y + random() * Math.max(1, region.height - height);
            const box = { x, y, width, height };
            if (!boxInsideMask(box, inside)) continue;
            match = box;
            placedSize = emergencySize;
            compactFallbackCount += 1;
            break;
          }
          if (match) break;
        }
      }
      if (!match) {
        measure.font = `700 1px ${fontStack()}`;
        const metrics = measure.measureText(word.text);
        const bounds = rotatedBounds(Math.max(1, metrics.width), 1.08, word.rotation);
        const width = Math.max(1, bounds.width);
        const height = Math.max(1, bounds.height);
        match = {
          x: clamp(center.x - width / 2, 0, CANVAS_SIZE - width),
          y: clamp(center.y - height / 2, 0, CANVAS_SIZE - height),
          width,
          height
        };
        placedSize = 1;
        compactFallbackCount += 1;
      }
      if (match) {
        if (placedSize < word.fontSize) downgradedCount += 1;
        placed.push({ ...word, fontSize: placedSize, box: match, x: match.x + match.width / 2, y: match.y + match.height / 2 });
      }
    }

    state.placements = placed;
    drawCanvas();
    renderWordDetails();
    const statusDetails = [];
    if (downgradedCount) statusDetails.push(`${downgradedCount} 个降档`);
    if (compactFallbackCount) statusDetails.push(`${compactFallbackCount} 个紧凑放置`);
    elements.layoutStatus.textContent = `已放置 ${placed.length}/${words.length} 个词条${statusDetails.length ? ` · ${statusDetails.join(' · ')}` : ''}`;
    elements.layoutStatus.title = '输入词条已全部放置';
    if (successMessage) showToast(`${successMessage}${elements.layoutStatus.textContent}`);
    elements.regenerateButton.disabled = false;
  });
}

function findMaskCenter(inside) {
  if (inside(540, 540)) return { x: 540, y: 540 };
  for (let radius = 10; radius < 520; radius += 10) {
    for (let angle = 0; angle < Math.PI * 2; angle += .25) {
      const x = 540 + Math.cos(angle) * radius;
      const y = 540 + Math.sin(angle) * radius;
      if (inside(x, y)) return { x, y };
    }
  }
  return { x: 540, y: 540 };
}

function boxInsideMask(box, inside) {
  if (box.x < 0 || box.y < 0 || box.x + box.width >= CANVAS_SIZE || box.y + box.height >= CANVAS_SIZE) return false;
  const xs = [box.x, box.x + box.width * .5, box.x + box.width];
  const ys = [box.y, box.y + box.height * .5, box.y + box.height];
  return xs.every((x) => ys.every((y) => inside(Math.round(x), Math.round(y))));
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawCanvas() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (!elements.transparentBackground.checked) {
    ctx.save();
    ctx.globalAlpha = Number(elements.backgroundOpacity.value) / 100;
    ctx.fillStyle = elements.backgroundColor.value;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();
  }
  canvas.style.background = 'transparent';
  drawShapeLayer(ctx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const item of state.placements) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation * Math.PI / 180);
    ctx.font = `700 ${item.fontSize}px ${fontStack()}`;
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, 0, 0);
    ctx.restore();
  }
  drawWordSelection();
  if (state.drawing && state.polygon.length) drawPolygonOverlay();
}

function drawWordSelection() {
  if (state.activeContextWordId === null || state.drawing) return;
  const item = state.placements.find((word) => word.id === state.activeContextWordId);
  if (!item) return;
  const { x, y, width, height } = item.box;
  const handleSize = 10;
  const corners = [
    [x, y], [x + width, y], [x, y + height], [x + width, y + height]
  ];
  ctx.save();
  ctx.strokeStyle = '#0D99FF';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);
  for (const [cornerX, cornerY] of corners) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cornerX - handleSize / 2, cornerY - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(cornerX - handleSize / 2, cornerY - handleSize / 2, handleSize, handleSize);
  }
  ctx.restore();
}

function drawShapeLayer(targetContext) {
  if (!elements.showShapeLayer.checked) return;
  const region = state.activeRegion || getBaseShapeRegion();
  targetContext.save();
  targetContext.globalAlpha = Number(elements.shapeLayerOpacity.value) / 100;
  targetContext.fillStyle = elements.shapeLayerColor.value;

  if (state.shape === 'image' && state.imageMask) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskCanvas.height = CANVAS_SIZE;
    const maskContext = maskCanvas.getContext('2d');
    const imageData = maskContext.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const color = parseHexColor(elements.shapeLayerColor.value);
    for (let i = 0; i < state.imageMask.length; i += 1) {
      if (!state.imageMask[i]) continue;
      const pixel = i * 4;
      imageData.data[pixel] = color[0];
      imageData.data[pixel + 1] = color[1];
      imageData.data[pixel + 2] = color[2];
      imageData.data[pixel + 3] = 255;
    }
    maskContext.putImageData(imageData, 0, 0);
    targetContext.drawImage(maskCanvas, 0, 0);
    targetContext.restore();
    return;
  }

  targetContext.beginPath();
  if (state.shape === 'circle') {
    targetContext.arc(region.cx, region.cy, Math.min(region.width, region.height) / 2, 0, Math.PI * 2);
  } else if (state.shape === 'star') {
    const outer = Math.min(region.width, region.height) / 2;
    const points = starPoints(region.cx, region.cy, outer, outer * .46, 5);
    points.forEach((point, index) => index ? targetContext.lineTo(point.x, point.y) : targetContext.moveTo(point.x, point.y));
    targetContext.closePath();
  } else if (state.shape === 'heart') {
    const points = heartPoints(region);
    points.forEach((point, index) => index ? targetContext.lineTo(point.x, point.y) : targetContext.moveTo(point.x, point.y));
    targetContext.closePath();
  } else if (state.shape === 'cloud') {
    const { cx, cy, width, height } = region;
    targetContext.ellipse(cx - width * .25, cy + height * .02, width * .23, height * .31, 0, 0, Math.PI * 2);
    targetContext.ellipse(cx, cy - height * .16, width * .29, height * .38, 0, 0, Math.PI * 2);
    targetContext.ellipse(cx + width * .28, cy + height * .04, width * .22, height * .28, 0, 0, Math.PI * 2);
    targetContext.rect(cx - width * .47, cy, width * .94, height * .31);
  } else if (state.shape === 'custom' && state.polygon.length >= 3) {
    state.polygon.forEach((point, index) => index ? targetContext.lineTo(point.x, point.y) : targetContext.moveTo(point.x, point.y));
    targetContext.closePath();
  } else {
    targetContext.rect(region.x, region.y, region.width, region.height);
  }
  targetContext.fill();
  targetContext.restore();
}

function parseHexColor(value) {
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
}

function buildShapeLayerSvg() {
  if (!elements.showShapeLayer.checked) return '';
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = layerCanvas.height = CANVAS_SIZE;
  drawShapeLayer(layerCanvas.getContext('2d'));
  return `<image x="0" y="0" width="1080" height="1080" href="${layerCanvas.toDataURL('image/png')}"/>`;
}

function drawPolygonOverlay() {
  ctx.save();
  ctx.strokeStyle = '#F06B24';
  ctx.fillStyle = 'rgba(240,107,36,.10)';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  state.polygon.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  if (state.polygon.length >= 3) {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const point of state.polygon) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#F06B24';
    ctx.stroke();
  }
  ctx.restore();
}

function buildSvg() {
  const backgroundOpacity = Number(elements.backgroundOpacity.value) / 100;
  const background = elements.transparentBackground.checked ? '' : `<rect width="1080" height="1080" fill="${elements.backgroundColor.value}" fill-opacity="${backgroundOpacity}"/>`;
  const shapeLayer = buildShapeLayerSvg();
  const svgFontFamily = escapeXml(getFontPreset().svg);
  const words = state.placements.map((item) => {
    ctx.save();
    ctx.font = `700 ${item.fontSize}px ${fontStack()}`;
    const metrics = ctx.measureText(item.text);
    ctx.restore();
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? item.fontSize * .8;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? item.fontSize * .2;
    const baselineOffset = round((ascent - descent) / 2);
    const x = round(item.x);
    const y = round(item.y + baselineOffset);
    const transform = item.rotation ? ` transform="rotate(${item.rotation} ${x} ${round(item.y)})"` : '';
    return `<text x="${x}" y="${y}"${transform} text-anchor="middle" font-family="${svgFontFamily}" font-size="${item.fontSize}" font-weight="700" fill="${item.color}">${escapeXml(item.text)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">${background}${shapeLayer}${words}</svg>`;
}

function download(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function chooseShape(shape) {
  state.shape = shape;
  state.activeSavedShapeId = null;
  state.drawing = false;
  canvas.classList.remove('drawing');
  elements.drawingHelp.hidden = true;
  elements.invertRow.hidden = shape !== 'image';
  document.querySelectorAll('.shape-card').forEach((button) => button.classList.toggle('active', button.dataset.shape === shape));
  layoutWords();
}

function scheduleLayout() {
  clearTimeout(state.layoutTimer);
  state.layoutTimer = setTimeout(() => {
    layoutWords();
  }, 260);
}

function getColorForWord(index) {
  if (state.wordOverrides[index]?.color) return state.wordOverrides[index].color;
  const hash = (Math.imul(index + 1, 2654435761) ^ state.styleSeed) >>> 0;
  return state.colors[hash % state.colors.length];
}

function recolorPlacements() {
  state.placements.forEach((item) => { item.color = getColorForWord(item.id); });
  drawCanvas();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * CANVAS_SIZE / rect.width,
    y: (event.clientY - rect.top) * CANVAS_SIZE / rect.height
  };
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / ((yj - yi) || .00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function starPoints(cx, cy, outer, inner, count) {
  return Array.from({ length: count * 2 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / count;
    const radius = index % 2 ? inner : outer;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

function heartPoints(region) {
  return Array.from({ length: 120 }, (_, index) => {
    const t = index / 120 * Math.PI * 2;
    const rawX = 16 * Math.sin(t) ** 3;
    const rawY = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return {
      x: region.x + ((rawX + 17) / 34) * region.width,
      y: region.y + ((12 - rawY) / 30) * region.height
    };
  });
}

function pointInCloud(x, y, region) {
  const nx = (x - region.cx) / region.width;
  const ny = (y - region.cy) / region.height;
  const ellipse = (cx, cy, rx, ry) => ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 <= 1;
  const base = nx >= -.47 && nx <= .47 && ny >= 0 && ny <= .31;
  return base || ellipse(-.25, .02, .23, .31) || ellipse(0, -.16, .29, .38) || ellipse(.28, .04, .22, .28);
}

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
}

function getFontPreset() { return fontPresets[elements.fontFamily.value] || fontPresets.pingfang; }
function fontStack() { return getFontPreset().stack; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value) { return Math.round(value * 10) / 10; }

const HISTORY_LIMIT = 50;
const HISTORY_MERGE_DELAY = 900;
const historyValueIds = [
  'wordsInput', 'fontFamily', 'minFontSize', 'fontLevelCount', 'fontLevelGap',
  'wordPadding', 'fillStrength', 'density', 'densityNumber', 'shapeLayerColor',
  'shapeLayerColorText', 'shapeLayerOpacity', 'backgroundColor', 'backgroundColorText', 'backgroundOpacity'
];
const historyCheckedIds = [
  'autoFontFit', 'repeatWords', 'compactLayout', 'invertMask', 'showShapeLayer',
  'transparentBackground'
];
const historyObjectIds = new WeakMap();
let nextHistoryObjectId = 1;
const history = {
  undo: [],
  redo: [],
  current: null,
  lastGroup: null,
  lastCommitAt: 0,
  restoring: false
};

function historyObjectId(object) {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return null;
  if (!historyObjectIds.has(object)) historyObjectIds.set(object, nextHistoryObjectId++);
  return historyObjectIds.get(object);
}

function captureHistorySnapshot() {
  const snapshot = {
    values: Object.fromEntries(historyValueIds.map((id) => [id, elements[id].value])),
    checked: Object.fromEntries(historyCheckedIds.map((id) => [id, elements[id].checked])),
    rotationAngles: [...elements.rotationAngleOptions.querySelectorAll('[data-angle]')].map((input) => input.checked),
    shape: state.shape,
    colors: [...state.colors],
    customColors: [...state.customColors],
    colorMode: state.colorMode,
    sizeMode: state.sizeMode,
    rotationMode: state.rotationMode,
    customAngles: [...state.customAngles],
    manualLevels: state.manualLevels ? [...state.manualLevels] : null,
    selectedPalette: state.selectedPalette,
    seed: state.seed,
    styleSeed: state.styleSeed,
    polygon: state.polygon.map((point) => ({ ...point })),
    drawing: state.drawing,
    maskImage: state.maskImage,
    imageMask: state.imageMask,
    imageMaskStats: state.imageMaskStats ? { ...state.imageMaskStats } : null,
    activeSavedShapeId: state.activeSavedShapeId,
    savedShapes: state.savedShapes.map((shape) => ({ ...shape })),
    wordOverrides: JSON.parse(JSON.stringify(state.wordOverrides))
  };
  snapshot.signature = JSON.stringify({
    ...snapshot,
    maskImage: historyObjectId(snapshot.maskImage),
    imageMask: historyObjectId(snapshot.imageMask)
  });
  return snapshot;
}

function updateHistoryButtons() {
  elements.undoButton.disabled = history.undo.length === 0;
  elements.redoButton.disabled = history.redo.length === 0;
}

function commitHistory(group = null) {
  if (history.restoring || !history.current) return;
  const next = captureHistorySnapshot();
  if (next.signature === history.current.signature) return;
  const now = Date.now();
  const merge = group && group === history.lastGroup && now - history.lastCommitAt <= HISTORY_MERGE_DELAY;
  if (!merge) {
    history.undo.push(history.current);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
  }
  history.current = next;
  history.redo = [];
  history.lastGroup = group;
  history.lastCommitAt = now;
  updateHistoryButtons();
}

function restoreHistorySnapshot(snapshot) {
  history.restoring = true;
  clearTimeout(state.layoutTimer);
  Object.entries(snapshot.values).forEach(([id, value]) => { elements[id].value = value; });
  Object.entries(snapshot.checked).forEach(([id, checked]) => { elements[id].checked = checked; });
  [...elements.rotationAngleOptions.querySelectorAll('[data-angle]')].forEach((input, index) => {
    input.checked = snapshot.rotationAngles[index];
  });
  state.shape = snapshot.shape;
  state.colors = [...snapshot.colors];
  state.customColors = [...snapshot.customColors];
  state.colorMode = snapshot.colorMode;
  state.sizeMode = snapshot.sizeMode;
  state.rotationMode = snapshot.rotationMode;
  state.customAngles = [...snapshot.customAngles];
  state.manualLevels = snapshot.manualLevels ? [...snapshot.manualLevels] : null;
  state.selectedPalette = snapshot.selectedPalette;
  state.seed = snapshot.seed;
  state.styleSeed = snapshot.styleSeed;
  state.polygon = snapshot.polygon.map((point) => ({ ...point }));
  state.drawing = snapshot.drawing;
  state.maskImage = snapshot.maskImage;
  state.imageMask = snapshot.imageMask;
  state.imageMaskStats = snapshot.imageMaskStats ? { ...snapshot.imageMaskStats } : null;
  state.activeSavedShapeId = snapshot.activeSavedShapeId;
  state.savedShapes = snapshot.savedShapes.map((shape) => ({ ...shape }));
  state.wordOverrides = JSON.parse(JSON.stringify(snapshot.wordOverrides));
  state.activeContextWordId = null;
  state.activeRegion = null;

  elements.wordContextMenu.hidden = true;
  elements.sizeModeControl.querySelectorAll('[data-size-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sizeMode === state.sizeMode);
  });
  elements.rotationModeControl.querySelectorAll('[data-rotation-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.rotationMode === state.rotationMode);
  });
  elements.rotationAngleOptions.hidden = state.rotationMode !== 'custom';
  elements.minFontSize.disabled = elements.autoFontFit.checked;
  elements.fontLevelGap.disabled = elements.autoFontFit.checked;
  setDensityControlsEnabled(elements.repeatWords.checked);
  elements.invertRow.hidden = state.shape !== 'image';
  elements.shapeLayerColor.disabled = !elements.showShapeLayer.checked;
  elements.shapeLayerColorText.disabled = !elements.showShapeLayer.checked;
  elements.shapeLayerOpacity.disabled = !elements.showShapeLayer.checked;
  updateBackgroundControls();
  elements.paddingOutput.value = `${elements.wordPadding.value} px`;
  elements.fillStrengthOutput.value = `${elements.fillStrength.value}%`;
  canvas.classList.toggle('drawing', state.drawing);
  elements.drawingHelp.hidden = !state.drawing;

  renderPaletteOptions();
  elements.paletteList.querySelectorAll('[data-palette]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.palette) === state.selectedPalette);
  });
  renderSavedShapes();
  persistSavedShapes();
  document.querySelectorAll('.shape-card').forEach((button) => {
    const active = state.activeSavedShapeId
      ? button.dataset.savedShape === state.activeSavedShapeId
      : button.dataset.shape === state.shape;
    button.classList.toggle('active', active);
  });
  updateLevelPreview();
  updateAllRangeTracks();
  if (state.drawing) drawCanvas();
  else layoutWords();
  history.restoring = false;
}

function undo() {
  if (!history.undo.length) return;
  history.redo.push(history.current);
  if (history.redo.length > HISTORY_LIMIT) history.redo.shift();
  history.current = history.undo.pop();
  history.lastGroup = null;
  restoreHistorySnapshot(history.current);
  updateHistoryButtons();
}

function redo() {
  if (!history.redo.length) return;
  history.undo.push(history.current);
  if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
  history.current = history.redo.pop();
  history.lastGroup = null;
  restoreHistorySnapshot(history.current);
  updateHistoryButtons();
}

function setDensityValue(value) {
  const maximum = Number(elements.density.max) || 320;
  const next = clamp(Math.round(Number(value) || 1), 1, maximum);
  elements.density.value = String(next);
  elements.densityNumber.value = String(next);
  updateRangeTrack(elements.density);
}

function updateRangeTrack(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value) || min;
  const progress = max === min ? 0 : (value - min) / (max - min) * 100;
  input.style.setProperty('--range-progress', `${clamp(progress, 0, 100)}%`);
}

function updateAllRangeTracks() {
  document.querySelectorAll('input[type="range"]').forEach(updateRangeTrack);
}

function setDensityControlsEnabled(enabled) {
  elements.density.disabled = !enabled;
  elements.densityNumber.disabled = !enabled;
  elements.densityMinusButton.disabled = !enabled;
  elements.densityPlusButton.disabled = !enabled;
}

function closeWordContextMenu(clearSelection = false) {
  elements.wordContextMenu.hidden = true;
  if (clearSelection) {
    state.activeContextWordId = null;
    drawCanvas();
  }
}

function openWordContextMenu(event) {
  if (state.drawing) return;
  event.preventDefault();
  const point = canvasPoint(event);
  const item = [...state.placements].reverse().find((word) => (
    point.x >= word.box.x && point.x <= word.box.x + word.box.width &&
    point.y >= word.box.y && point.y <= word.box.y + word.box.height
  ));
  if (!item) return closeWordContextMenu(true);
  state.activeContextWordId = item.id;
  elements.contextWordLabel.textContent = item.text;
  elements.contextWordSize.innerHTML = buildWordSizeOptions(item.fontSize);
  elements.contextWordColor.innerHTML = buildWordColorOptions(item.color);
  elements.wordContextMenu.hidden = false;
  const menuWidth = elements.wordContextMenu.offsetWidth;
  const menuHeight = elements.wordContextMenu.offsetHeight;
  elements.wordContextMenu.style.left = `${Math.min(event.clientX + 10, innerWidth - menuWidth - 10)}px`;
  elements.wordContextMenu.style.top = `${Math.min(event.clientY + 10, innerHeight - menuHeight - 10)}px`;
  drawCanvas();
}

const historyExcludedButtons = new Set([
  'undoButton', 'redoButton', 'exportPngButton', 'exportSvgButton', 'copySvgButton'
]);

document.addEventListener('input', (event) => {
  if (!event.target.matches('input, textarea, select')) return;
  const group = `edit:${event.target.id || event.target.dataset.levelIndex || 'control'}`;
  setTimeout(() => commitHistory(group), 0);
});

document.addEventListener('change', (event) => {
  if (!event.target.matches('input, textarea, select')) return;
  setTimeout(() => commitHistory(), 0);
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button && !historyExcludedButtons.has(button.id)) setTimeout(() => commitHistory(), 0);
  if (!event.target.closest('#wordContextMenu') && event.target !== canvas) closeWordContextMenu(true);
});

elements.undoButton.addEventListener('click', undo);
elements.redoButton.addEventListener('click', redo);
document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  if (event.shiftKey) redo();
  else undo();
});

canvas.addEventListener('contextmenu', openWordContextMenu);
elements.closeWordContextButton.addEventListener('click', () => closeWordContextMenu());
elements.resetWordStyleButton.addEventListener('click', () => {
  const id = state.activeContextWordId;
  if (id === null) return;
  delete state.wordOverrides[id];
  layoutWords();
  commitHistory();
  closeWordContextMenu();
  showToast('已恢复默认词条设置');
});
elements.saveWordStyleButton.addEventListener('click', () => {
  const id = state.activeContextWordId;
  if (id === null) return;
  state.wordOverrides[id] = {
    fontSize: Number(elements.contextWordSize.value),
    color: elements.contextWordColor.value.toUpperCase()
  };
  layoutWords();
  commitHistory();
  closeWordContextMenu();
  showToast('已保存词条设置');
});

elements.wordDetailsToggle.addEventListener('click', () => {
  const willOpen = elements.wordDetailsPanel.hidden;
  elements.wordDetailsPanel.hidden = !willOpen;
  elements.wordDetailsToggle.setAttribute('aria-expanded', String(willOpen));
  renderWordDetails();
});

elements.wordDetailsList.addEventListener('change', (event) => {
  const select = event.target.closest('[data-word-detail-field]');
  const row = event.target.closest('[data-word-ids]');
  if (!select || !row) return;
  const ids = row.dataset.wordIds.split(',').map(Number);
  const property = select.dataset.wordDetailField;
  const value = property === 'fontSize'
    ? (select.value ? Number(select.value) : null)
    : (select.value || null);
  for (const id of ids) {
    const override = { ...(state.wordOverrides[id] || {}) };
    if (value === null) delete override[property];
    else override[property] = value;
    if (Object.keys(override).length) state.wordOverrides[id] = override;
    else delete state.wordOverrides[id];
  }
  layoutWords();
});

elements.shapeGrid.addEventListener('click', (event) => {
  const savedButton = event.target.closest('[data-saved-shape]');
  if (savedButton) {
    const saved = builtInSvgShapes[savedButton.dataset.savedShape]
      || state.savedShapes.find((shape) => shape.id === savedButton.dataset.savedShape);
    if (saved) activateSavedShape(saved);
    return;
  }
  const button = event.target.closest('[data-shape]');
  if (button) chooseShape(button.dataset.shape);
});

elements.sizeModeControl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-size-mode]');
  if (!button) return;
  state.sizeMode = button.dataset.sizeMode;
  elements.sizeModeControl.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  updateLevelPreview();
  scheduleLayout();
});

elements.paletteList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-palette]');
  if (!button) return;
  state.selectedPalette = Number(button.dataset.palette);
  state.colors = [...palettes[state.selectedPalette].colors];
  document.querySelectorAll('.palette-option').forEach((option) => option.classList.toggle('active', option === button));
  recolorPlacements();
});

elements.presetModeButton.addEventListener('click', () => {
  state.colorMode = 'preset';
  state.colors = [...palettes[state.selectedPalette].colors];
  renderColorMode();
  recolorPlacements();
});

elements.customModeButton.addEventListener('click', () => {
  state.colorMode = 'custom';
  state.customColors = [...state.colors];
  state.colors = state.customColors;
  renderColorMode();
  recolorPlacements();
});

elements.customColors.addEventListener('input', (event) => {
  const row = event.target.closest('[data-color-index]');
  if (!row) return;
  const index = Number(row.dataset.colorIndex);
  const colorInput = row.querySelector('input[type="color"]');
  const textInput = row.querySelector('input[type="text"]');
  if (event.target.type === 'color') {
    state.customColors[index] = event.target.value.toUpperCase();
    textInput.value = state.customColors[index];
  } else if (/^#[0-9a-f]{6}$/i.test(event.target.value)) {
    state.customColors[index] = event.target.value.toUpperCase();
    colorInput.value = state.customColors[index];
  } else {
    return;
  }
  state.colors = state.customColors;
  recolorPlacements();
});

elements.customColors.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-color-button');
  const row = event.target.closest('[data-color-index]');
  if (!button || !row) return;
  if (state.customColors.length <= 1) return showToast('至少保留 1 个颜色');
  state.customColors.splice(Number(row.dataset.colorIndex), 1);
  state.colors = state.customColors;
  renderCustomColors();
  recolorPlacements();
});

elements.addColorButton.addEventListener('click', () => {
  if (state.customColors.length >= 8) return showToast('最多添加 8 个颜色');
  state.customColors.push('#F06B24');
  state.colors = state.customColors;
  renderCustomColors();
  recolorPlacements();
});

function finishPolygon() {
  if (state.polygon.length < 3) return showToast('至少需要 3 个节点');
  state.drawing = false;
  canvas.classList.remove('drawing');
  elements.drawingHelp.hidden = true;
  layoutWords();
  commitHistory();
}

elements.drawShapeButton.addEventListener('click', () => {
  state.drawing = true;
  state.shape = 'custom';
  state.polygon = [];
  state.placements = [];
  canvas.classList.add('drawing');
  elements.drawingHelp.hidden = false;
  elements.invertRow.hidden = true;
  document.querySelectorAll('.shape-card').forEach((button) => button.classList.remove('active'));
  drawCanvas();
});

canvas.addEventListener('click', (event) => {
  if (!state.drawing) {
    openWordContextMenu(event);
    return;
  }
  if (event.detail > 1) return;
  state.polygon.push(canvasPoint(event));
  drawCanvas();
  commitHistory();
});

canvas.addEventListener('dblclick', (event) => {
  if (!state.drawing) return;
  event.preventDefault();
  finishPolygon();
});

elements.undoPolygonButton.addEventListener('click', () => {
  if (!state.drawing || !state.polygon.length) return;
  state.polygon.pop();
  drawCanvas();
});

elements.resetPolygonButton.addEventListener('click', () => {
  if (!state.drawing) return;
  state.polygon = [];
  drawCanvas();
});

elements.closePolygonButton.addEventListener('click', finishPolygon);

elements.imageUpload.addEventListener('change', () => {
  const file = elements.imageUpload.files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    state.maskImage = image;
    updateImageMask(image, elements.invertMask.checked);
    chooseShape('image');
    showToast('图片已转换为形状');
    commitHistory();
  };
  image.src = URL.createObjectURL(file);
});

elements.svgShapeUpload.addEventListener('change', () => {
  const file = elements.svgShapeUpload.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
    showToast('请选择 SVG 文件');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const saved = {
      id: `shape-${Date.now()}`,
      name: file.name.replace(/\.svg$/i, '').slice(0, 8) || 'SVG',
      dataUrl: String(reader.result)
    };
    state.savedShapes.push(saved);
    persistSavedShapes();
    renderSavedShapes();
    activateSavedShape(saved);
    elements.svgShapeUpload.value = '';
    showToast('SVG 已添加到预置形状');
  };
  reader.readAsDataURL(file);
});

elements.invertMask.addEventListener('change', () => {
  if (state.maskImage) updateImageMask(state.maskImage, elements.invertMask.checked);
  scheduleLayout();
});
elements.showShapeLayer.addEventListener('change', () => {
  const disabled = !elements.showShapeLayer.checked;
  elements.shapeLayerColor.disabled = disabled;
  elements.shapeLayerColorText.disabled = disabled;
  elements.shapeLayerOpacity.disabled = disabled;
  drawCanvas();
});
elements.shapeLayerColor.addEventListener('input', () => {
  elements.shapeLayerColorText.value = elements.shapeLayerColor.value.toUpperCase();
  drawCanvas();
});
elements.shapeLayerColorText.addEventListener('input', () => {
  if (!/^#[0-9a-f]{6}$/i.test(elements.shapeLayerColorText.value)) return;
  elements.shapeLayerColor.value = elements.shapeLayerColorText.value;
  drawCanvas();
});
elements.shapeLayerOpacity.addEventListener('input', () => {
  drawCanvas();
});
elements.shapeLayerOpacity.addEventListener('change', () => {
  elements.shapeLayerOpacity.value = String(clamp(Number(elements.shapeLayerOpacity.value) || 0, 0, 100));
  drawCanvas();
});
elements.backgroundColor.addEventListener('input', () => {
  elements.backgroundColorText.value = elements.backgroundColor.value.toUpperCase();
  drawCanvas();
});
elements.backgroundColorText.addEventListener('input', () => {
  if (!/^#[0-9a-f]{6}$/i.test(elements.backgroundColorText.value)) return;
  elements.backgroundColor.value = elements.backgroundColorText.value;
  drawCanvas();
});
elements.backgroundOpacity.addEventListener('input', drawCanvas);
elements.backgroundOpacity.addEventListener('change', () => {
  elements.backgroundOpacity.value = String(clamp(Number(elements.backgroundOpacity.value) || 0, 0, 100));
  drawCanvas();
});
function updateBackgroundControls() {
  const disabled = elements.transparentBackground.checked;
  elements.backgroundColor.disabled = disabled;
  elements.backgroundColorText.disabled = disabled;
  elements.backgroundOpacity.disabled = disabled;
}
elements.transparentBackground.addEventListener('change', () => {
  updateBackgroundControls();
  drawCanvas();
});

elements.randomSettingsButton.addEventListener('click', () => {
  const levelCount = 5 + Math.floor(Math.random() * 2);
  const minimumSize = 18 + Math.floor(Math.random() * 11);
  const levelGap = 18 + Math.floor(Math.random() * 13);
  const fillStrength = 70 + Math.floor(Math.random() * 7);
  const sizeMode = 'hierarchy';
  state.wordOverrides = {};

  elements.autoFontFit.checked = true;
  elements.minFontSize.disabled = true;
  elements.fontLevelGap.disabled = true;
  elements.fontLevelCount.value = String(levelCount);
  elements.minFontSize.value = String(minimumSize);
  elements.fontLevelGap.value = String(levelGap);
  elements.fillStrength.value = String(fillStrength);
  elements.fillStrengthOutput.value = `${fillStrength}%`;
  updateRangeTrack(elements.fillStrength);
  state.manualLevels = null;
  state.sizeMode = sizeMode;
  elements.sizeModeControl.querySelectorAll('[data-size-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sizeMode === sizeMode);
  });
  updateLevelPreview();
  layoutWords('随机字号成功！');
});

elements.regenerateButton.addEventListener('click', () => {
  state.wordOverrides = {};
  state.seed += 7919;
  layoutWords('重新排版成功！');
});
elements.exportPngButton.addEventListener('click', () => {
  const selectedWordId = state.activeContextWordId;
  state.activeContextWordId = null;
  drawCanvas();
  canvas.toBlob((blob) => {
    download(blob, 'pilepilepile.png', 'image/png');
    state.activeContextWordId = selectedWordId;
    drawCanvas();
  }, 'image/png');
});
elements.exportSvgButton.addEventListener('click', () => download(buildSvg(), 'pilepilepile.svg', 'image/svg+xml;charset=utf-8'));
elements.copySvgButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildSvg());
    showToast('SVG 已复制到剪贴板');
  } catch {
    showToast('当前环境不允许访问剪贴板');
  }
});

elements.wordsInput.addEventListener('input', () => {
  const count = Math.max(1, parseWords().length);
  elements.density.max = String(Math.max(320, count));
  elements.densityNumber.max = elements.density.max;
  setDensityValue(count);
  scheduleLayout();
});
document.addEventListener('input', (event) => {
  if (event.target.matches('input[type="range"]')) updateRangeTrack(event.target);
});
elements.fontFamily.addEventListener('change', () => {
  layoutWords();
});
elements.minFontSize.addEventListener('input', () => { state.manualLevels = null; updateLevelPreview(); scheduleLayout(); });
elements.fontLevelGap.addEventListener('input', () => { state.manualLevels = null; updateLevelPreview(); scheduleLayout(); });
elements.fontLevelCount.addEventListener('input', () => { state.manualLevels = null; updateLevelPreview(); scheduleLayout(); });
elements.fontLevelPreview.addEventListener('input', (event) => {
  const input = event.target.closest('[data-level-index]');
  if (!input || elements.autoFontFit.checked) return;
  const index = Number(input.dataset.levelIndex);
  if (!state.manualLevels) state.manualLevels = [...state.currentLevels];
  state.manualLevels[index] = clamp(Number(input.value) || 8, 8, 260);
  state.currentLevels = [...state.manualLevels];
  scheduleLayout();
});
elements.autoFontFit.addEventListener('change', () => {
  if (!elements.autoFontFit.checked) state.manualLevels = [...state.currentLevels];
  else state.manualLevels = null;
  elements.minFontSize.disabled = elements.autoFontFit.checked;
  elements.fontLevelGap.disabled = elements.autoFontFit.checked;
  updateLevelPreview();
  scheduleLayout();
});
elements.wordPadding.addEventListener('input', () => { elements.paddingOutput.value = `${elements.wordPadding.value} px`; scheduleLayout(); });
elements.fillStrength.addEventListener('input', () => { elements.fillStrengthOutput.value = `${elements.fillStrength.value}%`; scheduleLayout(); });
elements.rotationModeControl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rotation-mode]');
  if (!button) return;
  state.rotationMode = button.dataset.rotationMode;
  elements.rotationModeControl.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  elements.rotationAngleOptions.hidden = state.rotationMode !== 'custom';
  scheduleLayout();
});
elements.rotationAngleOptions.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-angle]');
  if (!checkbox) return;
  const checked = [...elements.rotationAngleOptions.querySelectorAll('[data-angle]:checked')];
  if (!checked.length) {
    checkbox.checked = true;
    showToast('自定义角度至少保留 1 项');
    return;
  }
  state.customAngles = checked.map((item) => Number(item.dataset.angle));
  scheduleLayout();
});
elements.density.addEventListener('input', () => { setDensityValue(elements.density.value); scheduleLayout(); });
elements.densityNumber.addEventListener('input', () => { setDensityValue(elements.densityNumber.value); scheduleLayout(); });
elements.densityMinusButton.addEventListener('click', () => { setDensityValue(Number(elements.density.value) - 1); scheduleLayout(); });
elements.densityPlusButton.addEventListener('click', () => { setDensityValue(Number(elements.density.value) + 1); scheduleLayout(); });
elements.repeatWords.addEventListener('change', () => {
  setDensityControlsEnabled(elements.repeatWords.checked);
  scheduleLayout();
});
elements.compactLayout.addEventListener('change', scheduleLayout);

renderPaletteOptions();
loadSavedShapes();
renderSavedShapes();
updateLevelPreview();
setDensityControlsEnabled(false);
updateBackgroundControls();
updateAllRangeTracks();
layoutWords();
history.current = captureHistorySnapshot();
updateHistoryButtons();
