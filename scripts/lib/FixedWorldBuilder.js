import { createDeterministicRng, hashSeedParts } from '../../src/core/RandomService.js';

const TERRAIN_CODES = ['R', 'G', 'D', 'F', 'M', 'W', 'B', 'S'];
const BIOME_CODES = ['o', 'c', 'g', 'f', 'd', 'h', 'w', 't'];
const CARDINAL_DIRECTIONS = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const OFFICIAL_PRESETS = Object.freeze({
  standard: { width: 256, height: 256, cityStateCount: 14 },
  large: { width: 320, height: 320, cityStateCount: 18 },
  huge: { width: 384, height: 384, cityStateCount: 24 }
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function hasOfficialPresets(presets) {
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) return false;
  const names = Object.keys(OFFICIAL_PRESETS);
  if (Object.keys(presets).length !== names.length || !names.every(name => Object.hasOwn(presets, name))) return false;
  return names.every(name => {
    const preset = presets[name];
    const expected = OFFICIAL_PRESETS[name];
    return preset
      && typeof preset === 'object'
      && !Array.isArray(preset)
      && Object.keys(preset).length === 3
      && preset.width === expected.width
      && preset.height === expected.height
      && preset.cityStateCount === expected.cityStateCount;
  });
}

function isIntegerRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validateFeatureRange(value, minimum, maximum) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && isIntegerRange(value.min, minimum, maximum)
    && isIntegerRange(value.max, minimum, maximum)
    && value.min <= value.max;
}

function validateGeneratorConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('invalid_generator_config');
  if (config.generatorVersion !== 1 || config.defaultPreset !== 'huge' || config.tileSize !== 60 || config.chunkSize !== 16) {
    throw new RangeError('invalid_generator_config');
  }
  if (!sameArray(config.groundCodes, TERRAIN_CODES) || !sameArray(config.biomeCodes, BIOME_CODES)) {
    throw new RangeError('invalid_generator_config');
  }
  if (!hasOfficialPresets(config.presets)) throw new RangeError('invalid_generator_config');

  const size = config.customSize;
  if (
    !size
    || !isIntegerRange(size.min, 32, 512)
    || !isIntegerRange(size.max, size.min, 512)
    || !isIntegerRange(size.multiple, 1, 128)
    || !isIntegerRange(size.maxCells, 1, 512 * 512)
    || size.min !== 192
    || size.max !== 512
    || size.multiple !== 32
    || size.maxCells !== 262144
  ) {
    throw new RangeError('invalid_generator_config');
  }

  const topology = config.topology;
  if (
    !topology
    || typeof topology !== 'object'
    || !Number.isFinite(topology.waterRatio)
    || topology.waterRatio < 0.1
    || topology.waterRatio > 0.45
    || !Number.isFinite(topology.waterTolerance)
    || topology.waterTolerance < 0
    || topology.waterTolerance > 0.1
    || topology.waterRatio - topology.waterTolerance <= 0
    || topology.waterRatio + topology.waterTolerance >= 1
    || !validateFeatureRange(topology.majorContinents, 1, 8)
    || !Number.isFinite(topology.majorContinents.minimumLandShare)
    || topology.majorContinents.minimumLandShare <= 0
    || topology.majorContinents.minimumLandShare >= 0.5
    || !validateFeatureRange(topology.islandChains, 1, 16)
    || !validateFeatureRange(topology.rivers, 1, 16)
    || !validateFeatureRange(topology.lakes, 1, 16)
    || !isIntegerRange(topology.maxRetries, 1, 32)
  ) {
    throw new RangeError('invalid_generator_config');
  }
  return topology;
}

function normalizeDimensions(width, height, customSize) {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < customSize.min
    || height < customSize.min
    || width > customSize.max
    || height > customSize.max
    || width % customSize.multiple !== 0
    || height % customSize.multiple !== 0
    || width * height > customSize.maxCells
  ) {
    throw new RangeError('invalid_dimensions');
  }
  return { width, height, cellCount: width * height };
}

function createWaveParameters(rng, count, minimumFrequency, maximumFrequency) {
  const waves = [];
  for (let index = 0; index < count; index += 1) {
    waves.push({
      frequencyX: minimumFrequency + rng.nextFloat() * (maximumFrequency - minimumFrequency),
      frequencyY: minimumFrequency + rng.nextFloat() * (maximumFrequency - minimumFrequency),
      phaseX: rng.nextFloat() * Math.PI * 2,
      phaseY: rng.nextFloat() * Math.PI * 2,
      amplitude: 0.45 + rng.nextFloat() * 0.55
    });
  }
  return waves;
}

function sampleWaves(waves, x, y) {
  let value = 0;
  let amplitude = 0;
  for (const wave of waves) {
    value += Math.sin(x * wave.frequencyX * Math.PI * 2 + wave.phaseX)
      * Math.cos(y * wave.frequencyY * Math.PI * 2 + wave.phaseY)
      * wave.amplitude;
    amplitude += wave.amplitude;
  }
  return amplitude === 0 ? 0 : value / amplitude;
}

function buildContinentalElevation(dimensions, root, topology) {
  const { width, height, cellCount } = dimensions;
  const majorTarget = root.nextInt(topology.majorContinents.min, topology.majorContinents.max);
  const sectorWidth = 1 / majorTarget;
  const centers = [];
  for (let index = 0; index < majorTarget; index += 1) {
    centers.push({
      x: (index + 0.5) * sectorWidth + (root.nextFloat() - 0.5) * sectorWidth * 0.16,
      y: 0.5 + (root.nextFloat() - 0.5) * 0.22,
      verticalRadius: 0.68 + root.nextFloat() * 0.12,
      phase: root.nextFloat() * Math.PI * 2
    });
  }
  const waves = createWaveParameters(root, 5, 0.7, 3.2);
  const values = new Float64Array(cellCount);

  for (let y = 0; y < height; y += 1) {
    const normalizedY = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5) / width;
      const sector = Math.min(majorTarget - 1, Math.floor(normalizedX * majorTarget));
      const center = centers[sector];
      const localPosition = normalizedX * majorTarget - sector;
      const boundaryDistance = Math.min(localPosition, 1 - localPosition);
      const dx = (normalizedX - center.x) / (sectorWidth * 0.55);
      const dy = (normalizedY - center.y) / center.verticalRadius;
      const continentalShape = 1.25 - dx * dx * 0.72 - dy * dy * 0.52;
      const coastalLobes = Math.sin(normalizedY * Math.PI * 5 + center.phase) * 0.08;
      const noise = sampleWaves(waves, normalizedX, normalizedY) * 0.28;
      const trench = boundaryDistance < 0.035
        ? -3.5 * (1 - boundaryDistance / 0.035)
        : 0;
      const edgeDistance = Math.min(normalizedX, 1 - normalizedX, normalizedY, 1 - normalizedY);
      const edgeOcean = edgeDistance < 0.022 ? -3 * (1 - edgeDistance / 0.022) : 0;
      const index = y * width + x;
      values[index] = continentalShape + coastalLobes + noise + trench + edgeOcean + index * 1e-12;
    }
  }
  return { values, majorTarget };
}

function chooseSeaLevelByQuantile(elevation, waterRatio) {
  const ordered = Float64Array.from(elevation.values);
  ordered.sort();
  const waterCells = Math.max(1, Math.min(ordered.length - 1, Math.round(ordered.length * waterRatio)));
  return ordered[waterCells - 1];
}

function classifyLandAndWater(elevation, seaLevel) {
  const result = new Uint8Array(elevation.values.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = elevation.values[index] > seaLevel ? 1 : 0;
  }
  return result;
}

function labelConnectedComponents(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  let nextId = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== 0) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    labels[start] = nextId;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      size += 1;
      for (const [dx, dy] of CARDINAL_DIRECTIONS) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (mask[next] && labels[next] === 0) {
          labels[next] = nextId;
          queue[tail++] = next;
        }
      }
    }
    components.push({ id: nextId, size, firstIndex: start });
    nextId += 1;
  }
  components.sort((left, right) => left.firstIndex - right.firstIndex);
  return { labels, components };
}

function retainMajorComponents(landWater, width, height, target) {
  const labeled = labelConnectedComponents(landWater, width, height);
  if (labeled.components.length < target) return false;
  const ranked = [...labeled.components].sort((left, right) => right.size - left.size || left.firstIndex - right.firstIndex);
  const retained = ranked.slice(0, target);
  const retainedIds = new Set(retained.map(component => component.id));
  for (let index = 0; index < landWater.length; index += 1) {
    if (landWater[index] && !retainedIds.has(labeled.labels[index])) landWater[index] = 0;
  }
  const retainedLand = retained.reduce((sum, component) => sum + component.size, 0);
  return retained.length === target
    && retained.every(component => component.size >= landWater.length * 0.1)
    && retainedLand >= landWater.length * 0.64;
}

function distanceFromMask(mask, sourceValue, width, height) {
  const distances = new Int32Array(mask.length);
  distances.fill(-1);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === sourceValue) {
      distances[index] = 0;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (distances[next] === -1) {
        distances[next] = distances[index] + 1;
        queue[tail++] = next;
      }
    }
  }
  return distances;
}

function addIslandChains(landWater, elevation, seaLevel, seedText, dimensions, range) {
  const { width, height } = dimensions;
  const rng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.island-chains' });
  const target = rng.nextInt(range.min, range.max);
  const distanceFromLand = distanceFromMask(landWater, 1, width, height);
  const candidates = [];
  for (let index = 0; index < landWater.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!landWater[index] && distanceFromLand[index] >= 4 && x >= 4 && y >= 4 && x < width - 4 && y < height - 4) {
      candidates.push(index);
    }
  }

  const ordered = rng.shuffle(candidates);
  const centers = [];
  const islandMask = new Uint8Array(landWater.length);
  for (const center of ordered) {
    if (centers.length >= target) break;
    const x = center % width;
    const y = Math.floor(center / width);
    if (centers.some(other => {
      const otherX = other % width;
      const otherY = Math.floor(other / width);
      return Math.abs(otherX - x) + Math.abs(otherY - y) < 12;
    })) continue;
    const horizontal = rng.nextInt(0, 1) === 0;
    const shape = horizontal
      ? [center - 1, center, center + 1]
      : [center - width, center, center + width];
    if (shape.some(index => landWater[index] || distanceFromLand[index] < 3)) continue;
    centers.push(center);
    for (let offset = 0; offset < shape.length; offset += 1) {
      const index = shape[offset];
      landWater[index] = 1;
      islandMask[index] = 1;
      elevation.values[index] = seaLevel + (offset === 1 ? 0.11 : 0.08);
    }
  }
  return centers.length === target ? { count: target, mask: islandMask } : null;
}

function buildClimateFields(elevation, landWater, seedText, dimensions) {
  const { width, height, cellCount } = dimensions;
  const temperatureRng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.temperature' });
  const rainfallRng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.rainfall' });
  const temperatureWaves = createWaveParameters(temperatureRng, 4, 0.8, 4.4);
  const rainfallWaves = createWaveParameters(rainfallRng, 5, 0.7, 5.2);
  const temperature = new Float32Array(cellCount);
  const rainfall = new Float32Array(cellCount);
  let minimumElevation = Number.POSITIVE_INFINITY;
  let maximumElevation = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cellCount; index += 1) {
    if (!landWater[index]) continue;
    minimumElevation = Math.min(minimumElevation, elevation.values[index]);
    maximumElevation = Math.max(maximumElevation, elevation.values[index]);
  }
  const span = Math.max(1e-9, maximumElevation - minimumElevation);

  for (let y = 0; y < height; y += 1) {
    const normalizedY = (y + 0.5) / height;
    const latitude = Math.abs(normalizedY * 2 - 1);
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5) / width;
      const index = y * width + x;
      const normalizedElevation = landWater[index]
        ? (elevation.values[index] - minimumElevation) / span
        : 0;
      const heatNoise = sampleWaves(temperatureWaves, normalizedX, normalizedY);
      const rainNoise = sampleWaves(rainfallWaves, normalizedX, normalizedY);
      temperature[index] = clamp(0.96 - latitude * 0.78 - normalizedElevation * 0.25 + heatNoise * 0.2);
      rainfall[index] = clamp(0.5 + rainNoise * 0.48 - latitude * 0.08 + heatNoise * 0.06);
    }
  }
  return { temperature, rainfall };
}

function classifyBiomes(climate, elevation, landWater, dimensions) {
  const { width, height, cellCount } = dimensions;
  const codes = new Array(cellCount);
  let minimumElevation = Number.POSITIVE_INFINITY;
  let maximumElevation = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cellCount; index += 1) {
    if (!landWater[index]) continue;
    minimumElevation = Math.min(minimumElevation, elevation.values[index]);
    maximumElevation = Math.max(maximumElevation, elevation.values[index]);
  }
  const span = Math.max(1e-9, maximumElevation - minimumElevation);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!landWater[index]) {
        let coast = false;
        for (let dy = -1; dy <= 1 && !coast; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX >= 0 && nextY >= 0 && nextX < width && nextY < height && landWater[nextY * width + nextX]) {
              coast = true;
              break;
            }
          }
        }
        codes[index] = coast ? 'c' : 'o';
        continue;
      }
      const normalizedElevation = (elevation.values[index] - minimumElevation) / span;
      const temperature = climate.temperature[index];
      const rainfall = climate.rainfall[index];
      if (normalizedElevation >= 0.78) codes[index] = 'h';
      else if (temperature <= 0.27) codes[index] = 't';
      else if (rainfall <= 0.3 && temperature >= 0.42) codes[index] = 'd';
      else if (rainfall >= 0.7) codes[index] = 'f';
      else if (rainfall >= 0.54) codes[index] = 'w';
      else codes[index] = 'g';
    }
  }

  const rows = new Array(height);
  for (let y = 0; y < height; y += 1) rows[y] = codes.slice(y * width, (y + 1) * width).join('');
  return { codes, rows };
}

function pickLakeSites(elevation, landWater, labels, majorIds, seedText, dimensions, target) {
  const { width, height } = dimensions;
  const rng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.lake-sites' });
  const waterDistance = distanceFromMask(landWater, 0, width, height);
  const candidates = [];
  for (let index = 0; index < landWater.length; index += 1) {
    if (!landWater[index] || !majorIds.has(labels[index]) || waterDistance[index] < 6) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) continue;
    candidates.push({ index, score: elevation.values[index] + rng.nextFloat() * 0.08 });
  }
  candidates.sort((left, right) => left.score - right.score || left.index - right.index);

  const selected = [];
  const occupied = new Uint8Array(landWater.length);
  for (const candidate of candidates) {
    if (selected.length >= target) break;
    const x = candidate.index % width;
    const y = Math.floor(candidate.index / width);
    if (selected.some(site => {
      const otherX = site.center % width;
      const otherY = Math.floor(site.center / width);
      return Math.abs(otherX - x) + Math.abs(otherY - y) < 14;
    })) continue;
    const shape = [candidate.index - width, candidate.index - 1, candidate.index, candidate.index + 1, candidate.index + width];
    if (shape.some(index => !landWater[index] || labels[index] !== labels[candidate.index] || occupied[index])) continue;
    for (const index of shape) occupied[index] = 1;
    selected.push({ center: candidate.index, componentId: labels[candidate.index], indices: shape.sort((a, b) => a - b) });
  }
  selected.sort((left, right) => left.center - right.center);
  return selected.length === target ? selected : null;
}

function findRiverRoute({
  targetIndex,
  componentId,
  labels,
  lakeMask,
  riverMask,
  waterDistance,
  elevation,
  sourceElevation,
  seaLevel,
  seedText,
  riverOrdinal,
  dimensions
}) {
  const { width, height } = dimensions;
  const distances = new Int32Array(labels.length);
  const towardTarget = new Int32Array(labels.length);
  distances.fill(-1);
  towardTarget.fill(-1);
  const queue = new Int32Array(labels.length);
  let head = 0;
  let tail = 0;
  distances[targetIndex] = 0;
  queue[tail++] = targetIndex;

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (
        distances[next] !== -1
        || labels[next] !== componentId
        || riverMask[next]
        || (waterDistance[next] < 3 && next !== targetIndex)
        || (lakeMask[next] && next !== targetIndex)
      ) continue;
      distances[next] = distances[index] + 1;
      towardTarget[next] = index;
      queue[tail++] = next;
    }
  }

  const drainageFloor = Math.min(sourceElevation[targetIndex], seaLevel - 0.04);
  const drainageSlope = 0.004;
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] < 0 || riverMask[index]) continue;
    elevation.values[index] = drainageFloor + distances[index] * drainageSlope + index * 1e-10;
  }

  let selectedHead = -1;
  let selectedScore = Number.NEGATIVE_INFINITY;
  const maximumLength = Math.max(48, Math.floor(Math.min(width, height) * 0.55));
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] < 10 || distances[index] > maximumLength || lakeMask[index] || riverMask[index]) continue;
    const jitter = hashSeedParts([seedText, 'river-head', riverOrdinal, index]) / 0x1_0000_0000;
    const score = sourceElevation[index] + distances[index] * 0.001 + jitter * 0.025;
    if (score > selectedScore) {
      selectedScore = score;
      selectedHead = index;
    }
  }
  if (selectedHead < 0) return null;

  const route = [];
  let current = selectedHead;
  while (current !== -1) {
    route.push(current);
    if (current === targetIndex) break;
    current = towardTarget[current];
  }
  return route.length >= 4 && route.at(-1) === targetIndex ? route : null;
}

function carveRiversAndLakes(elevation, landWater, seaLevel, seedText, topology, dimensions) {
  const { width, height } = dimensions;
  const labeled = labelConnectedComponents(landWater, width, height);
  const landCells = labeled.components.reduce((sum, component) => sum + component.size, 0);
  const threshold = landCells * topology.majorContinents.minimumLandShare;
  const majorIds = new Set(labeled.components.filter(component => component.size >= threshold).map(component => component.id));
  const lakeRng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.lakes' });
  const riverRng = createDeterministicRng({ worldSeed: seedText, namespace: 'world.rivers' });
  const lakeTarget = lakeRng.nextInt(topology.lakes.min, topology.lakes.max);
  const riverTarget = riverRng.nextInt(topology.rivers.min, topology.rivers.max);
  const waterDistance = distanceFromMask(landWater, 0, width, height);
  const sites = pickLakeSites(elevation, landWater, labeled.labels, majorIds, seedText, dimensions, lakeTarget);
  if (!sites) return null;

  const lakeMask = new Uint8Array(landWater.length);
  const riverMask = new Uint8Array(landWater.length);
  const lakes = sites.map((site, index) => {
    for (const cellIndex of site.indices) {
      lakeMask[cellIndex] = 1;
      elevation.values[cellIndex] = Math.min(elevation.values[cellIndex], seaLevel - 0.04);
    }
    return {
      lakeId: `lake_${String(index + 1).padStart(3, '0')}`,
      componentId: site.componentId,
      cellIndices: site.indices,
      cells: site.indices.map(cellIndex => ({ x: cellIndex % width, y: Math.floor(cellIndex / width) }))
    };
  });

  const terminalUse = new Map();
  const riverCells = [];
  const sourceElevation = Float64Array.from(elevation.values);
  for (let ordinal = 0; ordinal < riverTarget; ordinal += 1) {
    const lake = lakes[ordinal % lakes.length];
    const used = terminalUse.get(lake.lakeId) || 0;
    const targetIndex = lake.cellIndices[used % lake.cellIndices.length];
    terminalUse.set(lake.lakeId, used + 1);
    const route = findRiverRoute({
      targetIndex,
      componentId: lake.componentId,
      labels: labeled.labels,
      lakeMask,
      riverMask,
      waterDistance,
      elevation,
      sourceElevation,
      seaLevel,
      seedText,
      riverOrdinal: ordinal,
      dimensions
    });
    if (!route) return null;

    const riverId = `river_${String(ordinal + 1).padStart(3, '0')}`;
    for (let order = 0; order < route.length; order += 1) {
      const cellIndex = route[order];
      riverMask[cellIndex] = 1;
      riverCells.push({
        riverId,
        order,
        x: cellIndex % width,
        y: Math.floor(cellIndex / width),
        elevation: Number(elevation.values[cellIndex].toFixed(8))
      });
    }
  }

  return {
    riverCells,
    lakes: lakes.map(({ lakeId, cells }) => ({ lakeId, cells }))
  };
}

function stabilizeIslandComponents(terrainRows, islandMask, minimumLandShare) {
  const height = terrainRows.length;
  const width = terrainRows[0].length;
  const mutableRows = terrainRows.map(row => [...row]);
  const landMask = new Uint8Array(width * height);
  let landCells = 0;
  for (let index = 0; index < landMask.length; index += 1) {
    const code = mutableRows[Math.floor(index / width)][index % width];
    if (code !== 'S' && code !== 'W') {
      landMask[index] = 1;
      landCells += 1;
    }
  }
  const labeled = labelConnectedComponents(landMask, width, height);
  const threshold = landCells * minimumLandShare;
  const intendedIslandIds = new Set();
  for (let index = 0; index < islandMask.length; index += 1) {
    if (islandMask[index] && labeled.labels[index] !== 0) intendedIslandIds.add(labeled.labels[index]);
  }
  const discardedIds = new Set(
    labeled.components
      .filter(component => component.size < threshold && !intendedIslandIds.has(component.id))
      .map(component => component.id)
  );
  if (discardedIds.size === 0) return terrainRows;
  for (let index = 0; index < landMask.length; index += 1) {
    if (discardedIds.has(labeled.labels[index])) mutableRows[Math.floor(index / width)][index % width] = 'S';
  }
  return mutableRows.map(row => row.join(''));
}

function placeMountainBarrierBand(terrainRows) {
  const mutableRows = terrainRows.map(row => [...row]);
  let best = null;
  for (let y = 0; y < mutableRows.length; y += 1) {
    let start = 0;
    while (start < mutableRows[y].length) {
      if (mutableRows[y][start] !== 'M') {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < mutableRows[y].length && mutableRows[y][end] === 'M') end += 1;
      const length = end - start;
      if (length >= 3 && (!best || length > best.length)) best = { y, start, length };
      start = end;
    }
  }
  if (!best) return terrainRows;
  const bandStart = best.start + Math.floor((best.length - 3) / 2);
  for (let x = bandStart; x < bandStart + 3; x += 1) mutableRows[best.y][x] = 'B';
  return mutableRows.map(row => row.join(''));
}

function applyHydrologyToBiomeRows(biomeRows, hydrology) {
  const mutableRows = biomeRows.map(row => [...row]);
  for (const cell of hydrology.riverCells) mutableRows[cell.y][cell.x] = 'c';
  for (const lake of hydrology.lakes) {
    for (const cell of lake.cells) mutableRows[cell.y][cell.x] = 'c';
  }
  return mutableRows.map(row => row.join(''));
}

function mapToLegacyGroundCodes({ landWater, biomeRows, hydrology, islandMask, minimumLandShare, dimensions }) {
  const { width, height } = dimensions;
  const riverMask = new Uint8Array(width * height);
  const lakeMask = new Uint8Array(width * height);
  for (const cell of hydrology.riverCells) riverMask[cell.y * width + cell.x] = 1;
  for (const lake of hydrology.lakes) {
    for (const cell of lake.cells) lakeMask[cell.y * width + cell.x] = 1;
  }

  const rows = new Array(height);
  for (let y = 0; y < height; y += 1) {
    const row = new Array(width);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (lakeMask[index]) row[x] = 'W';
      else if (riverMask[index]) row[x] = 'S';
      else if (!landWater[index]) {
        let coast = false;
        for (let dy = -1; dy <= 1 && !coast; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX >= 0 && nextY >= 0 && nextX < width && nextY < height && landWater[nextY * width + nextX]) {
              coast = true;
              break;
            }
          }
        }
        row[x] = coast ? 'S' : 'W';
      } else {
        const biome = biomeRows[y][x];
        row[x] = biome === 'h' ? 'M'
          : biome === 'd' ? 'D'
            : biome === 'f' || biome === 'w' ? 'F'
              : biome === 't' ? 'R'
                : 'G';
      }
    }
    rows[y] = row.join('');
  }
  return stabilizeIslandComponents(placeMountainBarrierBand(rows), islandMask, minimumLandShare);
}

function measureTopology(terrainRows, hydrology, minimumLandShare) {
  const height = terrainRows.length;
  const width = terrainRows[0].length;
  const landMask = new Uint8Array(width * height);
  let waterCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const water = terrainRows[y][x] === 'S' || terrainRows[y][x] === 'W';
      if (water) waterCells += 1;
      else landMask[y * width + x] = 1;
    }
  }
  const labeled = labelConnectedComponents(landMask, width, height);
  const landCells = width * height - waterCells;
  const majorThreshold = landCells * minimumLandShare;
  const majorContinents = labeled.components.filter(component => component.size >= majorThreshold).length;
  const islandChains = labeled.components.filter(component => component.size < majorThreshold).length;
  return {
    waterRatio: waterCells / (width * height),
    majorContinents,
    islandChains,
    riverCount: new Set(hydrology.riverCells.map(cell => cell.riverId)).size,
    lakeCount: hydrology.lakes.length
  };
}

function checksumBlueprint(blueprint) {
  return hashSeedParts([JSON.stringify(blueprint)]).toString(16).padStart(8, '0');
}

function topologyWithinBudget(metrics, topology) {
  return Math.abs(metrics.waterRatio - topology.waterRatio) <= topology.waterTolerance
    && metrics.majorContinents >= topology.majorContinents.min
    && metrics.majorContinents <= topology.majorContinents.max
    && metrics.islandChains >= topology.islandChains.min
    && metrics.islandChains <= topology.islandChains.max
    && metrics.riverCount >= topology.rivers.min
    && metrics.riverCount <= topology.rivers.max
    && metrics.lakeCount >= topology.lakes.min
    && metrics.lakeCount <= topology.lakes.max;
}

export function generateTerrainBlueprint(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid_generation_input');
  const { seedText, width, height, generatorConfig } = input;
  if (typeof seedText !== 'string' || seedText.trim().length === 0 || seedText.length > 256) {
    throw new TypeError('invalid_seed');
  }
  const topology = validateGeneratorConfig(generatorConfig);
  const dimensions = normalizeDimensions(width, height, generatorConfig.customSize);
  const root = createDeterministicRng({ worldSeed: seedText, namespace: 'world.topology' });

  for (let attempt = 0; attempt < topology.maxRetries; attempt += 1) {
    const elevation = buildContinentalElevation(dimensions, root, topology);
    const seaLevel = chooseSeaLevelByQuantile(elevation, topology.waterRatio);
    const landWater = classifyLandAndWater(elevation, seaLevel);
    if (!retainMajorComponents(landWater, width, height, elevation.majorTarget)) continue;
    const islands = addIslandChains(landWater, elevation, seaLevel, seedText, dimensions, topology.islandChains);
    if (islands === null) continue;
    const climate = buildClimateFields(elevation, landWater, seedText, dimensions);
    const biomes = classifyBiomes(climate, elevation, landWater, dimensions);
    const hydrology = carveRiversAndLakes(elevation, landWater, seaLevel, seedText, topology, dimensions);
    if (!hydrology) continue;
    const biomeRows = applyHydrologyToBiomeRows(biomes.rows, hydrology);
    const terrainRows = mapToLegacyGroundCodes({
      landWater,
      biomeRows,
      hydrology,
      islandMask: islands.mask,
      minimumLandShare: topology.majorContinents.minimumLandShare,
      dimensions
    });
    const metrics = measureTopology(terrainRows, hydrology, topology.majorContinents.minimumLandShare);
    if (!topologyWithinBudget(metrics, topology)) continue;
    const blueprint = {
      schemaVersion: 1,
      seedText,
      seedHash: hashSeedParts([seedText]),
      generatorVersion: generatorConfig.generatorVersion,
      width,
      height,
      tileSize: generatorConfig.tileSize,
      terrainRows,
      biomeRows,
      hydrology,
      metrics
    };
    return { ...blueprint, generationChecksum: checksumBlueprint(blueprint) };
  }
  throw new RangeError('impossible_generation');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyTerrainPatches(rows, patches) {
  const mutable = rows.map(row => [...row]);
  for (const patch of patches || []) {
    if (!Number.isInteger(patch?.gridX) || !Number.isInteger(patch?.gridY)
      || patch.gridX < 0 || patch.gridY < 0
      || patch.gridY >= mutable.length || patch.gridX >= mutable[0].length
      || !TERRAIN_CODES.includes(patch.terrain)) {
      throw new TypeError('invalid_terrain_patch');
    }
    mutable[patch.gridY][patch.gridX] = patch.terrain;
  }
  return mutable.map(row => row.join(''));
}

/**
 * Development-only builder for the checked-in grand campaign artifact.
 * Runtime modules load the returned JSON and never import this file.
 */
export function buildFixedWorld({ width = 384, height = 384, seed, patches, template }) {
  if (!patches || typeof patches !== 'object' || !template || typeof template !== 'object') {
    throw new TypeError('invalid_fixed_world_input');
  }
  if (seed !== patches.productionSeed || patches.mapId !== 'grand_map_v1' || patches.source !== 'fixed_static') {
    throw new TypeError('invalid_fixed_world_identity');
  }

  const blueprint = generateTerrainBlueprint({
    seedText: seed,
    width,
    height,
    generatorConfig: patches
  });
  const grid = applyTerrainPatches(blueprint.terrainRows, patches.terrainPatches);
  const playerSpawn = cloneJson(patches.playerSpawn);
  const initialBuildings = cloneJson(patches.initialBuildings);
  const expeditionEntrances = (template.expeditionEntrances || []).map(entrance => ({
    ...cloneJson(entrance),
    ...(patches.expeditionEntrancePositions?.[entrance.id] || {})
  }));

  return {
    mapId: patches.mapId,
    source: patches.source,
    schemaVersion: 1,
    generationVersion: patches.generatorVersion,
    generationChecksum: blueprint.generationChecksum,
    gridWidth: width,
    gridHeight: height,
    tileSize: patches.tileSize,
    chunkSize: patches.chunkSize,
    viewportCols: template.viewportCols || 53,
    viewportRows: template.viewportRows || 26,
    groundTypes: cloneJson(template.groundTypes),
    grid,
    spawnManifest: {
      playerSpawn,
      initialBuildings: cloneJson(initialBuildings),
      ports: cloneJson(patches.ports || []),
      cityStates: [],
      wildSites: [],
      resourceNodes: []
    },
    expeditionEntrances,
    initialBuildings,
    viewportCenter: {
      defaultGridX: playerSpawn.gridX,
      defaultGridY: playerSpawn.gridY,
      useLastSavedPosition: false
    },
    waterDesign: {
      targetRatio: patches.topology.waterRatio,
      actualRatio: blueprint.metrics.waterRatio,
      navigableGrounds: ['S', 'W'],
      riverCount: blueprint.metrics.riverCount,
      lakeCount: blueprint.metrics.lakeCount,
      description: '固定大世界包含多块大陆、岛链、河流、湖泊与可航行海域。'
    }
  };
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function shapeContains(shape, x, y) {
  if (shape.type === 'ellipse') {
    const dx = (x - shape.cx) / shape.rx;
    const dy = (y - shape.cy) / shape.ry;
    return dx * dx + dy * dy <= 1;
  }
  if (shape.type === 'polygon') return pointInPolygon(x, y, shape.points || []);
  throw new TypeError('invalid_macro_shape');
}

function isWaterCode(code) {
  return code === 'W' || code === 'S';
}

const MICRO_REGION_SIZE = 25;

function deterministicCellOrder(cells, seed, namespace) {
  return [...cells].sort((left, right) => (
    hashSeedParts([seed, namespace, left.x, left.y]) - hashSeedParts([seed, namespace, right.x, right.y])
    || left.y - right.y
    || left.x - right.x
  ));
}

function cellsNearestTo(cells, targetX, targetY, seed, namespace) {
  return [...cells].sort((left, right) => {
    const leftDistance = Math.hypot(left.x - targetX, left.y - targetY);
    const rightDistance = Math.hypot(right.x - targetX, right.y - targetY);
    const leftJitter = hashSeedParts([seed, namespace, left.x, left.y]) / 0x1_0000_0000;
    const rightJitter = hashSeedParts([seed, namespace, right.x, right.y]) / 0x1_0000_0000;
    return (leftDistance + leftJitter * 2.5) - (rightDistance + rightJitter * 2.5)
      || left.y - right.y
      || left.x - right.x;
  });
}

function paintMicroEllipse(rows, waterMask, center, radiusX, radiusY, terrain, bounds, predicate = () => true) {
  for (let y = Math.max(bounds.startY, center.y - radiusY); y <= Math.min(bounds.endY - 1, center.y + radiusY); y += 1) {
    for (let x = Math.max(bounds.startX, center.x - radiusX); x <= Math.min(bounds.endX - 1, center.x + radiusX); x += 1) {
      const normalizedX = (x - center.x) / Math.max(1, radiusX);
      const normalizedY = (y - center.y) / Math.max(1, radiusY);
      if (normalizedX * normalizedX + normalizedY * normalizedY > 1) continue;
      if (!waterMask[y][x] && predicate(rows[y][x], x, y)) rows[y][x] = terrain;
    }
  }
}

function hasLandRectangle(waterMask, center, radiusX, radiusY, bounds) {
  if (center.x - radiusX < bounds.startX || center.x + radiusX >= bounds.endX
    || center.y - radiusY < bounds.startY || center.y + radiusY >= bounds.endY) return false;
  for (let y = center.y - radiusY; y <= center.y + radiusY; y += 1) {
    for (let x = center.x - radiusX; x <= center.x + radiusX; x += 1) {
      if (waterMask[y][x]) return false;
    }
  }
  return true;
}

function scatterLandMicroBiomes(rows, seed, protectedArea = null) {
  const height = rows.length;
  const width = rows[0].length;
  const original = rows.map(row => [...row]);
  const waterMask = original.map(row => row.map(isWaterCode));
  const result = original.map((row, y) => row.map((code, x) => {
    if (waterMask[y][x]) return code;
    return 'G';
  }));
  const isProtected = (x, y) => protectedArea
    && Math.abs(x - protectedArea.gridX) <= protectedArea.radius
    && Math.abs(y - protectedArea.gridY) <= protectedArea.radius;

  for (let startY = 0; startY < height; startY += MICRO_REGION_SIZE) {
    for (let startX = 0; startX < width; startX += MICRO_REGION_SIZE) {
      const bounds = {
        startX,
        startY,
        endX: Math.min(width, startX + MICRO_REGION_SIZE),
        endY: Math.min(height, startY + MICRO_REGION_SIZE)
      };
      const landCells = [];
      let mountainBias = 0;
      for (let y = bounds.startY; y < bounds.endY; y += 1) {
        for (let x = bounds.startX; x < bounds.endX; x += 1) {
          if (waterMask[y][x]) continue;
          landCells.push({ x, y });
          if (original[y][x] === 'M' || original[y][x] === 'B') mountainBias += 1;
        }
      }
      if (landCells.length === 0) continue;
      const namespace = `${startX}:${startY}`;
      const paintable = landCells.filter(cell => !isProtected(cell.x, cell.y));
      const safeCells = paintable.length >= 8 ? paintable : landCells;
      const regionWidth = bounds.endX - bounds.startX;
      const regionHeight = bounds.endY - bounds.startY;
      const anchor = (ratioX, ratioY) => ({
        x: bounds.startX + (regionWidth - 1) * ratioX,
        y: bounds.startY + (regionHeight - 1) * ratioY
      });

      const mountainRoll = hashSeedParts([seed, 'micro-mountain-sector', namespace]) / 0x1_0000_0000;
      if (mountainBias >= 12 || mountainRoll < 0.24) {
        const target = anchor(0.5, 0.5);
        const centers = cellsNearestTo(safeCells, target.x, target.y, seed, `micro-mountain:${namespace}`);
        const center = centers.find(cell => hasLandRectangle(waterMask, cell, 4, 3, bounds) && !isProtected(cell.x, cell.y));
        if (center) {
          paintMicroEllipse(result, waterMask, center, 4, 3, 'B', bounds, (_code, x, y) => !isProtected(x, y));
          paintMicroEllipse(result, waterMask, center, 3, 2, 'M', bounds, (_code, x, y) => !isProtected(x, y));
        }
      }

      const ordinaryGround = code => code !== 'M' && code !== 'B';
      const soilTarget = anchor(0.73, 0.28);
      const soilCenter = cellsNearestTo(safeCells, soilTarget.x, soilTarget.y, seed, `micro-soil:${namespace}`)
        .find(cell => ordinaryGround(result[cell.y][cell.x]) && !isProtected(cell.x, cell.y));
      if (soilCenter) paintMicroEllipse(result, waterMask, soilCenter, 3, 2, 'D', bounds, (code, x, y) => ordinaryGround(code) && !isProtected(x, y));

      const forestTarget = anchor(0.4, 0.62);
      const forestCenter = cellsNearestTo(safeCells, forestTarget.x, forestTarget.y, seed, `micro-forest:${namespace}`)
        .find(cell => ordinaryGround(result[cell.y][cell.x]) && !isProtected(cell.x, cell.y));
      if (forestCenter) paintMicroEllipse(result, waterMask, forestCenter, 3, 2, 'F', bounds, (code, x, y) => ordinaryGround(code) && !isProtected(x, y));

      const forestCount = () => landCells.filter(cell => result[cell.y][cell.x] === 'F').length;
      for (const cell of deterministicCellOrder(safeCells, seed, `micro-forest-fill:${namespace}`)) {
        if (forestCount() >= Math.min(4, landCells.length)) break;
        if (ordinaryGround(result[cell.y][cell.x]) && !isProtected(cell.x, cell.y)) result[cell.y][cell.x] = 'F';
      }

      const rockTarget = anchor(0.66, 0.62);
      const rockCandidates = cellsNearestTo(safeCells, rockTarget.x, rockTarget.y, seed, `micro-rock:${namespace}`)
        .filter(cell => ordinaryGround(result[cell.y][cell.x]) && result[cell.y][cell.x] !== 'F' && !isProtected(cell.x, cell.y));
      const rockAnchor = rockCandidates.find(cell => (
        cell.x + 1 < bounds.endX && cell.y + 1 < bounds.endY
        && !waterMask[cell.y][cell.x + 1] && !waterMask[cell.y + 1][cell.x] && !waterMask[cell.y + 1][cell.x + 1]
        && !isProtected(cell.x + 1, cell.y) && !isProtected(cell.x, cell.y + 1) && !isProtected(cell.x + 1, cell.y + 1)
        && ordinaryGround(result[cell.y][cell.x + 1]) && ordinaryGround(result[cell.y + 1][cell.x]) && ordinaryGround(result[cell.y + 1][cell.x + 1])
        && result[cell.y][cell.x + 1] !== 'F' && result[cell.y + 1][cell.x] !== 'F' && result[cell.y + 1][cell.x + 1] !== 'F'
      ));
      if (rockAnchor) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) result[rockAnchor.y + dy][rockAnchor.x + dx] = 'R';
      }
      for (const cell of rockCandidates) {
        if (landCells.filter(candidate => result[candidate.y][candidate.x] === 'R').length >= Math.min(4, landCells.length)) break;
        if (ordinaryGround(result[cell.y][cell.x]) && result[cell.y][cell.x] !== 'F') result[cell.y][cell.x] = 'R';
      }
    }
  }
  return result;
}

function hasNeighbor(rows, x, y, predicate) {
  const height = rows.length;
  const width = rows[0].length;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && predicate(rows[ny][nx])) return true;
    }
  }
  return false;
}

function getWaterComponents(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const visited = new Uint8Array(width * height);
  const components = [];
  for (let start = 0; start < visited.length; start += 1) {
    const startX = start % width;
    const startY = Math.floor(start / width);
    if (visited[start] || !isWaterCode(rows[startY][startX])) continue;
    const queue = [start];
    const cells = [];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      cells.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [dx, dy] of CARDINAL_DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!visited[next] && isWaterCode(rows[ny][nx])) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(cells);
  }
  return components.sort((left, right) => right.length - left.length || left[0] - right[0]);
}

function connectWaterNetwork(rows) {
  const height = rows.length;
  const width = rows[0].length;
  while (true) {
    const components = getWaterComponents(rows);
    if (components.length <= 1) return;
    const main = new Set(components[0]);
    const parent = new Int32Array(width * height);
    parent.fill(-1);
    const visited = new Uint8Array(width * height);
    const queue = [...components[0]];
    for (const index of queue) visited[index] = 1;
    let target = -1;
    for (let head = 0; head < queue.length && target < 0; head += 1) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [dx, dy] of CARDINAL_DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next]) continue;
        visited[next] = 1;
        parent[next] = index;
        if (isWaterCode(rows[ny][nx]) && !main.has(next)) {
          target = next;
          break;
        }
        queue.push(next);
      }
    }
    if (target < 0) throw new RangeError('macro_water_network_unreachable');
    for (let cursor = target; cursor >= 0 && !main.has(cursor); cursor = parent[cursor]) {
      rows[Math.floor(cursor / width)][cursor % width] = 'W';
    }
  }
}

function refineWaterRatio(rows, targetRatio, seed) {
  const height = rows.length;
  const width = rows[0].length;
  const target = Math.round(width * height * targetRatio);
  let water = rows.flat().filter(isWaterCode).length;
  const fillWater = water > target;
  while (water !== target) {
    const candidates = [];
    for (let y = 3; y < height - 3; y += 1) {
      for (let x = 3; x < width - 3; x += 1) {
        const currentWater = isWaterCode(rows[y][x]);
        if (fillWater !== currentWater) continue;
        const touchesOther = hasNeighbor(rows, x, y, code => isWaterCode(code) !== currentWater);
        if (!touchesOther) continue;
        candidates.push({ x, y, score: hashSeedParts([seed, 'macro-coast', fillWater ? 'fill' : 'carve', x, y]) });
      }
    }
    if (candidates.length === 0) throw new RangeError('macro_water_ratio_unreachable');
    candidates.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    const count = Math.min(Math.abs(water - target), candidates.length);
    for (let index = 0; index < count; index += 1) {
      const { x, y } = candidates[index];
      rows[y][x] = fillWater ? 'G' : 'W';
    }
    water += fillWater ? -count : count;
  }
}

function buildMacroRows(width, height, macroTemplate, seed, patches) {
  if (!macroTemplate || macroTemplate.templateId !== 'reference_world_2026' || macroTemplate.mapId !== 'grand_map_v2') {
    throw new TypeError('invalid_macro_template');
  }
  const rows = Array.from({ length: height }, () => Array(width).fill('W'));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((macroTemplate.landShapes || []).some(shape => shapeContains(shape, x + 0.5, y + 0.5))) rows[y][x] = 'G';
    }
  }
  for (const shape of macroTemplate.waterCutouts || []) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if (shapeContains(shape, x + 0.5, y + 0.5)) rows[y][x] = 'W';
    }
  }
  for (const shape of macroTemplate.islandShapes || []) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if (shapeContains(shape, x + 0.5, y + 0.5)) rows[y][x] = 'G';
    }
  }
  refineWaterRatio(rows, macroTemplate.targetWaterRatio, seed);
  connectWaterNetwork(rows);
  for (const shape of macroTemplate.terrainShapes || []) {
    if (!TERRAIN_CODES.includes(shape.fill) || isWaterCode(shape.fill)) throw new TypeError('invalid_macro_terrain');
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isWaterCode(rows[y][x]) && shapeContains(shape, x + 0.5, y + 0.5)) rows[y][x] = shape.fill;
      }
    }
  }
  const beforeCoast = rows.map(row => [...row]);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (isWaterCode(beforeCoast[y][x])) {
        if (hasNeighbor(beforeCoast, x, y, code => !isWaterCode(code))) rows[y][x] = 'S';
      }
    }
  }
  const spawn = patches.playerSpawn;
  for (let y = spawn.gridY - 5; y <= spawn.gridY + 5; y += 1) {
    for (let x = spawn.gridX - 5; x <= spawn.gridX + 5; x += 1) {
      if (y >= 0 && x >= 0 && y < height && x < width && !isWaterCode(rows[y][x])) rows[y][x] = 'G';
    }
  }
  const microRows = scatterLandMicroBiomes(rows, seed, { ...spawn, radius: 5 });
  const patched = applyTerrainPatches(microRows.map(row => row.join('')), patches.terrainPatches || []).map(row => [...row]);
  return patched.map(row => row.join(''));
}

export function buildTemplateDrivenWorld({ width = 384, height = 384, macroTemplate, seed, patches, template }) {
  if (!patches || patches.mapId !== 'grand_map_v2' || seed !== patches.productionSeed) throw new TypeError('invalid_fixed_world_identity');
  const grid = buildMacroRows(width, height, macroTemplate, seed, patches);
  const waterCells = [...grid.join('')].filter(isWaterCode).length;
  const waterRatio = waterCells / (width * height);
  const checksum = hashSeedParts([macroTemplate.templateId, seed, ...grid]).toString(16).padStart(8, '0');
  const playerSpawn = cloneJson(patches.playerSpawn);
  const initialBuildings = cloneJson(patches.initialBuildings);
  return {
    mapId: patches.mapId,
    source: patches.source,
    schemaVersion: 1,
    generationVersion: patches.generatorVersion,
    generationChecksum: checksum,
    generation: {
      templateId: macroTemplate.templateId,
      metrics: { waterRatio },
      microDistribution: {
        regionSize: MICRO_REGION_SIZE,
        guaranteedTerrain: ['F', 'R'],
        description: '陆地按25×25微区打散为小型森林、土壤、矿脉与等高线山体；宏观水系掩码保持不变。'
      }
    },
    gridWidth: width,
    gridHeight: height,
    tileSize: patches.tileSize,
    chunkSize: patches.chunkSize,
    viewportCols: template.viewportCols || 53,
    viewportRows: template.viewportRows || 26,
    groundTypes: cloneJson(template.groundTypes),
    grid,
    spawnManifest: {
      playerSpawn,
      initialBuildings,
      ports: cloneJson(patches.ports || []),
      cityStates: [],
      wildSites: [],
      resourceNodes: []
    },
    expeditionEntrances: (template.expeditionEntrances || []).map(entrance => ({
      ...cloneJson(entrance), ...(patches.expeditionEntrancePositions?.[entrance.id] || {})
    })),
    initialBuildings,
    viewportCenter: { defaultGridX: playerSpawn.gridX, defaultGridY: playerSpawn.gridY, useLastSavedPosition: false },
    waterDesign: {
      targetRatio: macroTemplate.targetWaterRatio,
      actualRatio: waterRatio,
      navigableGrounds: ['S', 'W'],
      riverCount: 0,
      lakeCount: (macroTemplate.waterCutouts || []).length,
      description: '固定参考式大陆、内海、海峡与岛链布局。'
    }
  };
}
