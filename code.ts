figma.showUI(__html__, { width: 420, height: 944, themeColors: true });

// Color conversion helpers for Delta E calculation
function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  // Convert RGB to XYZ
  let rr = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  let gg = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  let bb = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  rr *= 100;
  gg *= 100;
  bb *= 100;

  const x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750;
  const z = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041;

  // Convert XYZ to LAB (D65 illuminant)
  const xn = 95.047, yn = 100.0, zn = 108.883;
  
  const fx = x / xn > 0.008856 ? Math.pow(x / xn, 1/3) : (7.787 * x / xn) + 16/116;
  const fy = y / yn > 0.008856 ? Math.pow(y / yn, 1/3) : (7.787 * y / yn) + 16/116;
  const fz = z / zn > 0.008856 ? Math.pow(z / zn, 1/3) : (7.787 * z / zn) + 16/116;

  const L = (116 * fy) - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return { L, a, b: bVal };
}

function deltaE(rgb1: RGB, rgb2: RGB): number {
  const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
  const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
  
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

// Shared color utility types and functions

interface SliderParams {
  tintLightness: number;
  tintSaturation: number;
  shadeLightness: number;
  shadeSaturation: number;
}

interface KeyColor {
  position: number;
  mode: 'Light' | 'Dark';
  color: RGB;
}

function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255
  };
}

function hexToRgba(hex: string, opacity: number = 100): RGBA {
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return { r, g, b, a: opacity / 100 };
}

function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t
  };
}

function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case c.r: h = ((c.g - c.b) / d + (c.g < c.b ? 6 : 0)) / 6; break;
      case c.g: h = ((c.b - c.r) / d + 2) / 6; break;
      case c.b: h = ((c.r - c.g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r, g, b };
}

function lightenColor(c: RGB, amount: number, params: SliderParams): RGB {
  if (amount === 0) return c;
  const hsl = rgbToHsl(c);
  const lightDampen = 1.0 - (params.tintLightness / 100) * 0.7;
  const satFactor = (params.tintSaturation / 50) - 1;
  const newL = hsl.l + (1 - hsl.l) * amount * lightDampen;
  const newS = satFactor >= 0
    ? Math.min(1, hsl.s * (1 + amount * satFactor * 1.5))
    : hsl.s * (1 + amount * satFactor);
  return hslToRgb(hsl.h, Math.max(0, newS), Math.min(1, newL));
}

function darkenColor(c: RGB, amount: number, params: SliderParams): RGB {
  if (amount === 0) return c;
  const hsl = rgbToHsl(c);
  const darkDampen = 1.0 - (params.shadeLightness / 100) * 0.7;
  const satFactor = (params.shadeSaturation / 50) - 1;
  const newL = hsl.l * (1 - amount * darkDampen);
  const newS = satFactor >= 0
    ? Math.min(1, hsl.s * (1 + amount * satFactor * 1.5))
    : hsl.s * (1 + amount * satFactor);
  return hslToRgb(hsl.h, Math.max(0, newS), Math.max(0, newL));
}

function getFalloffAmount(steps: number): number {
  const falloff = [0, 0.20, 0.38, 0.55, 0.72, 0.85];
  return falloff[Math.min(steps, falloff.length - 1)];
}

function getColorAtPosition(keys: KeyColor[], pos: number, scaleStart: number, scaleEnd: number, isLight: boolean, params: SliderParams): RGB {
  if (keys.length === 0) return { r: 0.5, g: 0.5, b: 0.5 };

  let lowerKey: KeyColor | null = null;
  let upperKey: KeyColor | null = null;

  for (const key of keys) {
    if (key.position <= pos) lowerKey = key;
    if (key.position >= pos && !upperKey) upperKey = key;
  }

  if (!lowerKey && upperKey) {
    const steps = Math.round((upperKey.position - pos) / 100);
    const amount = getFalloffAmount(steps);
    return isLight ? lightenColor(upperKey.color, amount, params) : darkenColor(upperKey.color, amount, params);
  }

  if (!upperKey && lowerKey) {
    const steps = Math.round((pos - lowerKey.position) / 100);
    const amount = getFalloffAmount(steps);
    return isLight ? lightenColor(lowerKey.color, amount, params) : darkenColor(lowerKey.color, amount, params);
  }

  if (lowerKey && upperKey) {
    if (lowerKey.position === upperKey.position) return lowerKey.color;
    const t = (pos - lowerKey.position) / (upperKey.position - lowerKey.position);
    return lerpColor(lowerKey.color, upperKey.color, t);
  }

  return { r: 0.5, g: 0.5, b: 0.5 };
}

function get500KeyColor(keys: KeyColor[]): RGB {
  if (keys.length === 0) return { r: 0.5, g: 0.5, b: 0.5 };
  const key500 = keys.find(k => k.position === 500)
    || keys.reduce((prev, curr) =>
        Math.abs(curr.position - 500) < Math.abs(prev.position - 500) ? curr : prev
      );
  return key500.color;
}

function getAlphaForPosition(pos: number): number {
  const alphaMap: { [key: number]: number } = {
    0: 0.20, 100: 0.48, 200: 0.64, 300: 0.88, 400: 0.94, 500: 1.0,
    600: 0.94, 700: 0.88, 800: 0.64, 900: 0.48, 1000: 0.20
  };
  return alphaMap[pos] ?? 1.0;
}

// Spectrum variable name pattern: "GroupName/Opaque|Opacity/Position (Light|Dark)?"
const SPECTRUM_VAR_REGEX = /^(.+)\/(Opaque|Opacity)\/(\d{3,4})(?:\s*\((Light|Dark)\))?$/;

function parseSpectrumVarName(name: string) {
  const match = name.match(SPECTRUM_VAR_REGEX);
  if (!match) return null;
  return {
    group: match[1],
    type: match[2] as 'Opaque' | 'Opacity',
    position: parseInt(match[3]),
    mode: match[4] as 'Light' | 'Dark' | undefined
  };
}

// Send collections to UI on load
async function updateCollections() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionData = collections.map(c => ({ id: c.id, name: c.name }));
  figma.ui.postMessage({ type: 'collections', collections: collectionData });
}

updateCollections();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate-spectrum') {
    try {
    const { collectionId, entries } = msg;
    const tintLightness: number = msg.tintLightness ?? 50;
    const tintSaturation: number = msg.tintSaturation ?? 50;
    const shadeLightness: number = msg.shadeLightness ?? 50;
    const shadeSaturation: number = msg.shadeSaturation ?? 50;
    const inputOnly: boolean = msg.inputOnly ?? false;
    const inputMode: string = msg.inputMode ?? 'Light';
    const isLightInput = (inputMode === 'Light' || inputMode === 'IC - Light');

    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    if (collectionId) {
      collection = collections.find(c => c.id === collectionId)!;
      if (!collection) {
        figma.ui.postMessage({ type: 'spectrum-error', message: 'Collection not found' });
        return;
      }
    } else {
      collection = figma.variables.createVariableCollection('Spectrum Colors');
    }

    const modeId = collection.modes[0].modeId;

    const sliderParams: SliderParams = {
      tintLightness, tintSaturation, shadeLightness, shadeSaturation
    };

    const existingVariables = (await Promise.all(
      collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
    )).filter((v): v is Variable => v !== null);

    const existingVarMap = new Map<string, Variable>();
    for (const v of existingVariables) {
      existingVarMap.set(v.name, v);
    }

    let created = 0;
    let updated = 0;

    function createOrUpdateVariable(varName: string, colorValue: RGBA) {
      const existingVar = existingVarMap.get(varName);
      if (existingVar) {
        existingVar.setValueForMode(modeId, colorValue);
        updated++;
      } else {
        try {
          const variable = figma.variables.createVariable(varName, collection, 'COLOR');
          variable.setValueForMode(modeId, colorValue);
          existingVarMap.set(varName, variable);
          created++;
        } catch (createErr: any) {
          const trimmed = varName.trim();
          const fallback = existingVarMap.get(trimmed)
            || existingVariables.find(v => v.name.trim() === trimmed);
          if (fallback) {
            fallback.setValueForMode(modeId, colorValue);
            existingVarMap.set(varName, fallback);
            updated++;
          }
        }
      }
    }

    for (const entry of entries) {
      const { groupName, keyColors } = entry;

      const parsedKeys: KeyColor[] = keyColors.map((k: { position: number; mode: string; hex: string }) => ({
        position: k.position,
        mode: k.mode as 'Light' | 'Dark',
        color: hexToRgb(k.hex)
      }));

      const lightKeys = parsedKeys.filter(k => k.mode === 'Light').sort((a, b) => a.position - b.position);
      const darkKeys = parsedKeys.filter(k => k.mode === 'Dark').sort((a, b) => a.position - b.position);

      if (!inputOnly || isLightInput) {
        const lightPositions = [0, 100, 200, 300, 400, 500];
        const light500Color = get500KeyColor(lightKeys);

        for (const pos of lightPositions) {
          const posStr = pos.toString().padStart(3, '0');
          const posSuffix = pos === 500 ? `${posStr} (Light)` : posStr;

          const opaqueColor = getColorAtPosition(lightKeys, pos, 0, 500, true, sliderParams);
          createOrUpdateVariable(`${groupName}/Opaque/${posSuffix}`, { r: opaqueColor.r, g: opaqueColor.g, b: opaqueColor.b, a: 1 });
          createOrUpdateVariable(`${groupName}/Opacity/${posSuffix}`, { r: light500Color.r, g: light500Color.g, b: light500Color.b, a: getAlphaForPosition(pos) });
        }
      }

      if (!inputOnly || !isLightInput) {
        const darkPositions = [500, 600, 700, 800, 900, 1000];
        const dark500Color = get500KeyColor(darkKeys);

        for (const pos of darkPositions) {
          const posStr = pos.toString().padStart(3, '0');
          const posSuffix = pos === 500 ? `${posStr} (Dark)` : posStr;

          const opaqueColor = getColorAtPosition(darkKeys, pos, 500, 1000, false, sliderParams);
          createOrUpdateVariable(`${groupName}/Opaque/${posSuffix}`, { r: opaqueColor.r, g: opaqueColor.g, b: opaqueColor.b, a: 1 });
          createOrUpdateVariable(`${groupName}/Opacity/${posSuffix}`, { r: dark500Color.r, g: dark500Color.g, b: dark500Color.b, a: getAlphaForPosition(pos) });
        }
      }
    }

    figma.ui.postMessage({
      type: 'spectrum-success',
      message: `Spectrum: created ${created}, updated ${updated} variables`
    });

    updateCollections();
    } catch (err: any) {
      figma.ui.postMessage({
        type: 'spectrum-error',
        message: `Error: ${err?.message || err}`
      });
    }
  }

  if (msg.type === 'refresh-collections') {
    updateCollections();
  }

  if (msg.type === 'scan-colors') {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collection = collections.find(c => c.id === msg.collectionId);
    
    if (!collection) {
      figma.ui.postMessage({ type: 'scan-error', message: 'Collection not found' });
      return;
    }

    // Get all color variables from the collection
    const variables = (await Promise.all(
      collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
    )).filter((v): v is Variable => v !== null && v.resolvedType === 'COLOR');

    if (variables.length === 0) {
      figma.ui.postMessage({ type: 'scan-error', message: 'No color variables in this collection' });
      return;
    }

    // Get nodes to scan
    const selection = figma.currentPage.selection;
    let nodesToScan: SceneNode[] = [];
    
    if (selection.length > 0) {
      // Scan selected nodes and their children
      const collectNodes = (node: SceneNode) => {
        nodesToScan.push(node);
        if ('children' in node) {
          for (const child of node.children) {
            collectNodes(child);
          }
        }
      };
      for (const node of selection) {
        collectNodes(node);
      }
    } else {
      // Scan all nodes on the page
      const collectNodes = (node: SceneNode) => {
        nodesToScan.push(node);
        if ('children' in node) {
          for (const child of node.children) {
            collectNodes(child);
          }
        }
      };
      for (const child of figma.currentPage.children) {
        collectNodes(child);
      }
    }

    let autoConnected = 0;
    const suggestions: Array<{
      nodeId: string;
      layerName: string;
      property: 'fill' | 'stroke';
      color: RGB;
      varId: string;
      varName: string;
      deltaE: number;
      modeName: string;
    }> = [];

    // Build variable color map for ALL modes
    const varColors: Array<{ variable: Variable; color: RGB; modeName: string }> = [];
    for (const variable of variables) {
      for (const mode of collection.modes) {
        const value = variable.valuesByMode[mode.modeId];
        if (value && typeof value === 'object' && 'r' in value) {
          varColors.push({ 
            variable, 
            color: { r: value.r, g: value.g, b: value.b },
            modeName: mode.name
          });
        }
      }
    }

    for (const node of nodesToScan) {
      // Check fills
      if ('fills' in node && Array.isArray(node.fills)) {
        for (let i = 0; i < node.fills.length; i++) {
          const fill = node.fills[i];
          if (fill.type !== 'SOLID') continue;
          
          // Skip if already bound to a variable (unless override is enabled)
          if (fill.boundVariables?.color && !msg.overrideExisting) continue;
          
          // If override is enabled and there's an existing bound variable, try to match by name first
          if (msg.overrideExisting && fill.boundVariables?.color) {
            const existingVarId = fill.boundVariables.color.id;
            const existingVar = await figma.variables.getVariableByIdAsync(existingVarId);
            
            if (existingVar) {
              const nameMatch = variables.find(v => v.name === existingVar.name);
              
              if (nameMatch) {
                // Found a name match - rebind to it
                const solidFill: SolidPaint = {
                  type: 'SOLID',
                  color: fill.color,
                  opacity: fill.opacity
                };
                const boundFill = figma.variables.setBoundVariableForPaint(solidFill, 'color', nameMatch);
                const newFills = [...node.fills];
                newFills[i] = boundFill;
                (node as GeometryMixin).fills = newFills;
                autoConnected++;
                continue;
              }
              // No name match found - fall through to Delta E matching
            }
          }
          
          const nodeColor: RGB = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
          
          // Find best matching variable across all modes (Delta E color matching)
          let bestMatch: { variable: Variable; dE: number; modeName: string } | null = null;
          for (const vc of varColors) {
            const dE = deltaE(nodeColor, vc.color);
            if (!bestMatch || dE < bestMatch.dE) {
              bestMatch = { variable: vc.variable, dE, modeName: vc.modeName };
            }
          }

          if (bestMatch) {
            if (bestMatch.dE < 0.5) {
              // Exact match - auto-connect
              const solidFill: SolidPaint = {
                type: 'SOLID',
                color: fill.color,
                opacity: fill.opacity
              };
              const boundFill = figma.variables.setBoundVariableForPaint(solidFill, 'color', bestMatch.variable);
              const newFills = [...node.fills];
              newFills[i] = boundFill;
              (node as GeometryMixin).fills = newFills;
              autoConnected++;
            } else if (bestMatch.dE < 10) {
              // Close match - add to suggestions
              suggestions.push({
                nodeId: node.id,
                layerName: node.name,
                property: 'fill',
                color: nodeColor,
                varId: bestMatch.variable.id,
                varName: bestMatch.variable.name,
                deltaE: bestMatch.dE,
                modeName: bestMatch.modeName
              });
            }
          }
        }
      }

      // Check strokes
      if ('strokes' in node && Array.isArray(node.strokes)) {
        for (let i = 0; i < node.strokes.length; i++) {
          const stroke = node.strokes[i];
          if (stroke.type !== 'SOLID') continue;
          
          // Skip if already bound to a variable (unless override is enabled)
          if (stroke.boundVariables?.color && !msg.overrideExisting) continue;
          
          // If override is enabled and there's an existing bound variable, try to match by name first
          if (msg.overrideExisting && stroke.boundVariables?.color) {
            const existingVarId = stroke.boundVariables.color.id;
            const existingVar = await figma.variables.getVariableByIdAsync(existingVarId);
            
            if (existingVar) {
              // Look for a variable with the same name in the selected collection
              const nameMatch = variables.find(v => v.name === existingVar.name);
              
              if (nameMatch) {
                // Found a name match - rebind to it
                const solidStroke: SolidPaint = {
                  type: 'SOLID',
                  color: stroke.color,
                  opacity: stroke.opacity
                };
                const boundStroke = figma.variables.setBoundVariableForPaint(solidStroke, 'color', nameMatch);
                const newStrokes = [...node.strokes];
                newStrokes[i] = boundStroke;
                (node as GeometryMixin).strokes = newStrokes;
                autoConnected++;
                continue; // Move to next stroke
              }
              // No name match found - fall through to Delta E matching
            }
          }
          
          const nodeColor: RGB = { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b };
          
          // Find best matching variable across all modes (Delta E color matching)
          let bestMatch: { variable: Variable; dE: number; modeName: string } | null = null;
          for (const vc of varColors) {
            const dE = deltaE(nodeColor, vc.color);
            if (!bestMatch || dE < bestMatch.dE) {
              bestMatch = { variable: vc.variable, dE, modeName: vc.modeName };
            }
          }
          
          if (bestMatch) {
            if (bestMatch.dE < 0.5) {
              // Exact match - auto-connect
              const solidStroke: SolidPaint = {
                type: 'SOLID',
                color: stroke.color,
                opacity: stroke.opacity
              };
              const boundStroke = figma.variables.setBoundVariableForPaint(solidStroke, 'color', bestMatch.variable);
              const newStrokes = [...node.strokes];
              newStrokes[i] = boundStroke;
              (node as GeometryMixin).strokes = newStrokes;
              autoConnected++;
            } else if (bestMatch.dE < 10) {
              // Close match - add to suggestions
              suggestions.push({
                nodeId: node.id,
                layerName: node.name,
                property: 'stroke',
                color: nodeColor,
                varId: bestMatch.variable.id,
                varName: bestMatch.variable.name,
                deltaE: bestMatch.dE,
                modeName: bestMatch.modeName
              });
            }
          }
        }
      }
    }

    // Sort suggestions by delta E (closest first)
    suggestions.sort((a, b) => a.deltaE - b.deltaE);

    figma.ui.postMessage({
      type: 'scan-success',
      autoConnected,
      suggestions
    });
  }

  if (msg.type === 'connect-color') {
    const { nodeId, property, varId } = msg;
    
    const node = await figma.getNodeByIdAsync(nodeId) as SceneNode;
    if (!node) {
      figma.ui.postMessage({ type: 'connect-error', message: 'Node not found' });
      return;
    }

    const variable = await figma.variables.getVariableByIdAsync(varId);
    if (!variable) {
      figma.ui.postMessage({ type: 'connect-error', message: 'Variable not found' });
      return;
    }

    if (property === 'fill' && 'fills' in node && Array.isArray(node.fills)) {
      const newFills = node.fills.map((fill, i) => {
        if (i === 0 && fill.type === 'SOLID') {
          const solidFill: SolidPaint = {
            type: 'SOLID',
            color: fill.color,
            opacity: fill.opacity
          };
          return figma.variables.setBoundVariableForPaint(solidFill, 'color', variable);
        }
        return fill;
      });
      (node as GeometryMixin).fills = newFills;
    }

    if (property === 'stroke' && 'strokes' in node && Array.isArray(node.strokes)) {
      const newStrokes = node.strokes.map((stroke, i) => {
        if (i === 0 && stroke.type === 'SOLID') {
          const solidStroke: SolidPaint = {
            type: 'SOLID',
            color: stroke.color,
            opacity: stroke.opacity
          };
          return figma.variables.setBoundVariableForPaint(solidStroke, 'color', variable);
        }
        return stroke;
      });
      (node as GeometryMixin).strokes = newStrokes;
    }

    figma.ui.postMessage({ type: 'connect-success' });
  }

  if (msg.type === 'generate-layers') {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collection = collections.find(c => c.id === msg.collectionId);
    
    if (!collection) {
      figma.ui.postMessage({ type: 'generate-error', message: 'Collection not found' });
      return;
    }

    // Get all color variables from the collection
    const variables = (await Promise.all(
      collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
    )).filter((v): v is Variable => v !== null && v.resolvedType === 'COLOR');

    if (variables.length === 0) {
      figma.ui.postMessage({ type: 'generate-error', message: 'No color variables found in this collection' });
      return;
    }

    // Create a frame to hold all the swatches
    const containerFrame = figma.createFrame();
    containerFrame.name = `${collection.name} - Color Swatches`;
    containerFrame.layoutMode = 'HORIZONTAL';
    containerFrame.itemSpacing = 32;
    containerFrame.paddingTop = 16;
    containerFrame.paddingBottom = 16;
    containerFrame.paddingLeft = 16;
    containerFrame.paddingRight = 16;
    containerFrame.primaryAxisSizingMode = 'AUTO';
    containerFrame.counterAxisSizingMode = 'AUTO';
    containerFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    let layerCount = 0;

    // Group variables by their prefix (e.g., "Label/Primary" -> "Label")
    const groupedVariables = new Map<string, Variable[]>();
    for (const variable of variables) {
      const parts = variable.name.split('/');
      const groupName = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Ungrouped';
      
      if (!groupedVariables.has(groupName)) {
        groupedVariables.set(groupName, []);
      }
      groupedVariables.get(groupName)!.push(variable);
    }

    // Create frames for each group
    for (const [groupName, groupVariables] of groupedVariables) {
      const groupFrame = figma.createFrame();
      groupFrame.name = groupName;
      groupFrame.layoutMode = 'HORIZONTAL';
      groupFrame.itemSpacing = 24;
      groupFrame.primaryAxisSizingMode = 'AUTO';
      groupFrame.counterAxisSizingMode = 'AUTO';
      groupFrame.fills = [];

      if (msg.perMode) {
        // Create a frame for each mode within this group
        for (const mode of collection.modes) {
          const modeFrame = figma.createFrame();
          modeFrame.name = mode.name;
          modeFrame.layoutMode = 'VERTICAL';
          modeFrame.itemSpacing = 8;
          modeFrame.primaryAxisSizingMode = 'AUTO';
          modeFrame.counterAxisSizingMode = 'AUTO';
          modeFrame.fills = [];

          // Add rectangles for each variable in this mode
          for (const variable of groupVariables) {
            const value = variable.valuesByMode[mode.modeId];
            
            // Skip if not a color value or is an alias
            if (!value || typeof value !== 'object' || !('r' in value)) continue;

            const colorValue = value as RGBA;
            
            // Create rectangle
            const rect = figma.createRectangle();
            rect.resize(200, 200);
            
            // Name with convention: "variableName -modeName"
            rect.name = `${variable.name} -${mode.name}`;
            
            if (msg.bindVariables) {
              // Bind variable to fill
              const solidFill: SolidPaint = {
                type: 'SOLID',
                color: { r: colorValue.r, g: colorValue.g, b: colorValue.b },
                opacity: colorValue.a !== undefined ? colorValue.a : 1
              };
              const boundFill = figma.variables.setBoundVariableForPaint(solidFill, 'color', variable);
              rect.fills = [boundFill];
            } else {
              // Apply color (not connected to variable)
              rect.fills = [{
                type: 'SOLID',
                color: { r: colorValue.r, g: colorValue.g, b: colorValue.b },
                opacity: colorValue.a !== undefined ? colorValue.a : 1
              }];
            }

            modeFrame.appendChild(rect);
            layerCount++;
          }

          groupFrame.appendChild(modeFrame);
        }
      } else {
        // Single mode: use first mode with header + horizontal rects
        const modeId = collection.modes[0].modeId;
        
        // Group frame is vertical to stack header above rects
        groupFrame.layoutMode = 'VERTICAL';
        groupFrame.itemSpacing = 12;

        // Add header text with group name
        await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
        const header = figma.createText();
        header.fontName = { family: "Inter", style: "Semi Bold" };
        header.characters = groupName;
        header.fontSize = 14;
        header.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
        groupFrame.appendChild(header);

        // Create horizontal container for rects
        const rectsFrame = figma.createFrame();
        rectsFrame.name = 'Swatches';
        rectsFrame.layoutMode = 'HORIZONTAL';
        rectsFrame.itemSpacing = 8;
        rectsFrame.primaryAxisSizingMode = 'AUTO';
        rectsFrame.counterAxisSizingMode = 'AUTO';
        rectsFrame.fills = [];

        for (const variable of groupVariables) {
          const value = variable.valuesByMode[modeId];
          
          // Skip if not a color value or is an alias
          if (!value || typeof value !== 'object' || !('r' in value)) continue;

          const colorValue = value as RGBA;
          
          // Create rectangle
          const rect = figma.createRectangle();
          rect.resize(200, 200);
          
          // Name without mode suffix
          rect.name = variable.name;
          
          if (msg.bindVariables) {
            // Bind variable to fill
            const solidFill: SolidPaint = {
              type: 'SOLID',
              color: { r: colorValue.r, g: colorValue.g, b: colorValue.b },
              opacity: colorValue.a !== undefined ? colorValue.a : 1
            };
            const boundFill = figma.variables.setBoundVariableForPaint(solidFill, 'color', variable);
            rect.fills = [boundFill];
          } else {
            // Apply color (not connected to variable)
            rect.fills = [{
              type: 'SOLID',
              color: { r: colorValue.r, g: colorValue.g, b: colorValue.b },
              opacity: colorValue.a !== undefined ? colorValue.a : 1
            }];
          }

          rectsFrame.appendChild(rect);
          layerCount++;
        }

        groupFrame.appendChild(rectsFrame);
      }

      containerFrame.appendChild(groupFrame);
    }

    // Position the frame in view
    containerFrame.x = figma.viewport.center.x - containerFrame.width / 2;
    containerFrame.y = figma.viewport.center.y - containerFrame.height / 2;

    // Select the container
    figma.currentPage.selection = [containerFrame];
    figma.viewport.scrollAndZoomIntoView([containerFrame]);

    figma.ui.postMessage({ 
      type: 'generate-success', 
      message: `Generated ${layerCount} color swatches` 
    });
  }

  if (msg.type === 'generate-mode-colors') {
    const { collectionId, varName, colors, opacities, selectedModes } = msg;

    // Get or create collection
    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    if (collectionId) {
      collection = collections.find(c => c.id === collectionId)!;
      if (!collection) {
        figma.ui.postMessage({ type: 'modemaker-error', message: 'Collection not found' });
        return;
      }
    } else {
      collection = figma.variables.createVariableCollection('Mode Colors');
    }

    // Use selected modes or default to all 4
    const modeNames = selectedModes || ['Light', 'Dark', 'IC - Light', 'IC - Dark'];
    const modeIds: { [key: string]: string } = {};

    for (const modeName of modeNames) {
      const existingMode = collection.modes.find(m => m.name === modeName);
      if (existingMode) {
        modeIds[modeName] = existingMode.modeId;
      } else {
        // Create new mode (or rename default if it's the first custom mode)
        if (collection.modes.length === 1 && collection.modes[0].name === 'Mode 1') {
          collection.renameMode(collection.modes[0].modeId, modeName);
          modeIds[modeName] = collection.modes[0].modeId;
        } else {
          modeIds[modeName] = collection.addMode(modeName);
        }
      }
    }

    // Check if variable already exists
    const existingVariables = (await Promise.all(
      collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
    )).filter((v): v is Variable => v !== null);
    
    let variable = existingVariables.find(v => v.name === varName);
    let isUpdate = false;
    
    if (variable) {
      isUpdate = true;
    } else {
      variable = figma.variables.createVariable(varName, collection, 'COLOR');
    }

    // Set values for selected modes with appropriate opacity
    for (const modeName of modeNames) {
      const hexColor = colors[modeName];
      const modeOpacity = opacities ? opacities[modeName] : 100;
      if (hexColor && modeIds[modeName]) {
        variable.setValueForMode(modeIds[modeName], hexToRgba(hexColor, modeOpacity));
      }
    }

    figma.ui.postMessage({ 
      type: 'modemaker-success', 
      message: isUpdate ? `Updated "${varName}" with ${modeNames.length} mode${modeNames.length > 1 ? 's' : ''}` : `Created "${varName}" with ${modeNames.length} mode${modeNames.length > 1 ? 's' : ''}`
    });
    
    updateCollections();
  }

  if (msg.type === 'get-selection-fills') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'modemaker-error', message: 'Please select at least one layer' });
      return;
    }
    const fills: Array<{
      name: string;
      nodeId: string;
      hex: string;
      opacity: number;
      boundVariable?: {
        id: string;
        name: string;
        collectionId: string;
        isSpectrum: boolean;
        spectrumGroup?: string;
        spectrumType?: string;
        spectrumPosition?: number;
        spectrumMode?: string;
      };
    }> = [];
    for (const node of selection) {
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        const fill = node.fills[0];
        if (fill.type === 'SOLID') {
          const r = Math.round(fill.color.r * 255).toString(16).padStart(2, '0').toUpperCase();
          const g = Math.round(fill.color.g * 255).toString(16).padStart(2, '0').toUpperCase();
          const b = Math.round(fill.color.b * 255).toString(16).padStart(2, '0').toUpperCase();

          let boundVariable: typeof fills[0]['boundVariable'] = undefined;

          if (fill.boundVariables?.color) {
            const varId = fill.boundVariables.color.id;
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (variable) {
              const spectrum = parseSpectrumVarName(variable.name);
              boundVariable = {
                id: variable.id,
                name: variable.name,
                collectionId: variable.variableCollectionId,
                isSpectrum: !!spectrum,
                spectrumGroup: spectrum?.group,
                spectrumType: spectrum?.type,
                spectrumPosition: spectrum?.position,
                spectrumMode: spectrum?.mode,
              };
            }
          }

          fills.push({
            name: node.name,
            nodeId: node.id,
            hex: r + g + b,
            opacity: Math.round((fill.opacity !== undefined ? fill.opacity : 1) * 100),
            boundVariable
          });
        }
      }
    }
    if (fills.length === 0) {
      figma.ui.postMessage({ type: 'modemaker-error', message: 'No layers with solid fills found in selection' });
      return;
    }
    figma.ui.postMessage({ type: 'selection-fills', fills });
  }

  if (msg.type === 'generate-bulk-mode-colors') {
    const { collectionId, entries, selectedModes, selectedInputMode, applyToLayers } = msg;

    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    if (collectionId) {
      collection = collections.find(c => c.id === collectionId)!;
      if (!collection) {
        figma.ui.postMessage({ type: 'modemaker-error', message: 'Collection not found' });
        return;
      }
    } else {
      collection = figma.variables.createVariableCollection('Mode Colors');
    }

    const modeNames: string[] = selectedModes || ['Light', 'Dark', 'IC - Light', 'IC - Dark'];
    const modeIds: { [key: string]: string } = {};

    for (const modeName of modeNames) {
      const existingMode = collection.modes.find(m => m.name === modeName);
      if (existingMode) {
        modeIds[modeName] = existingMode.modeId;
      } else {
        if (collection.modes.length === 1 && collection.modes[0].name === 'Mode 1') {
          collection.renameMode(collection.modes[0].modeId, modeName);
          modeIds[modeName] = collection.modes[0].modeId;
        } else {
          modeIds[modeName] = collection.addMode(modeName);
        }
      }
    }

    const allColorVars = await figma.variables.getLocalVariablesAsync('COLOR');

    const existingVariables = (await Promise.all(
      collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
    )).filter((v): v is Variable => v !== null);

    let created = 0;
    let updated = 0;
    let aliased = 0;
    const entryVariableMap: Array<{ nodeId: string; variable: Variable }> = [];

    for (const entry of entries) {
      const { varName, nodeId, colors, opacities, boundVariable } = entry;
      if (!colors) continue;

      let variable = existingVariables.find(v => v.name === varName);
      if (variable) {
        updated++;
      } else {
        variable = figma.variables.createVariable(varName, collection, 'COLOR');
        existingVariables.push(variable);
        created++;
      }

      if (nodeId) {
        entryVariableMap.push({ nodeId, variable });
      }

      for (const modeName of modeNames) {
        if (!modeIds[modeName]) continue;

        // Tier 1: Spectrum variable — alias to mirrored position
        if (boundVariable?.isSpectrum) {
          const pos = boundVariable.spectrumPosition;
          const specType = boundVariable.spectrumType;
          const specGroup = boundVariable.spectrumGroup;

          let targetVarName: string;
          if (pos === 500) {
            // 500 IC modes use offset positions for increased contrast
            if (modeName === 'Light') {
              targetVarName = `${specGroup}/${specType}/500 (Light)`;
            } else if (modeName === 'Dark') {
              targetVarName = `${specGroup}/${specType}/500 (Dark)`;
            } else if (modeName === 'IC - Light') {
              targetVarName = `${specGroup}/${specType}/600`;
            } else {
              targetVarName = `${specGroup}/${specType}/400`;
            }
          } else {
            const isInputLight = (selectedInputMode === 'Light' || selectedInputMode === 'IC - Light');
            const lightPos = isInputLight ? pos : (1000 - pos);
            const darkPos = isInputLight ? (1000 - pos) : pos;
            const icLightPos = Math.min(1000, lightPos + 100);
            const icDarkPos = Math.max(0, darkPos - 100);

            let targetPos: number;
            if (modeName === 'Light') targetPos = lightPos;
            else if (modeName === 'Dark') targetPos = darkPos;
            else if (modeName === 'IC - Light') targetPos = icLightPos;
            else targetPos = icDarkPos;

            targetVarName = `${specGroup}/${specType}/${targetPos.toString().padStart(3, '0')}`;
          }

          const targetVar = allColorVars.find(v => v.name === targetVarName);
          if (targetVar) {
            variable.setValueForMode(modeIds[modeName], figma.variables.createVariableAlias(targetVar));
            aliased++;
            continue;
          }
        }

        // Tier 2: Non-spectrum bound variable — alias for input mode, generate for others
        if (boundVariable && !boundVariable.isSpectrum) {
          const isInputMode = (modeName === selectedInputMode);
          const isIcMirror =
            (selectedInputMode === 'Light' && modeName === 'IC - Light') ||
            (selectedInputMode === 'Dark' && modeName === 'IC - Dark') ||
            (selectedInputMode === 'IC - Light' && modeName === 'Light') ||
            (selectedInputMode === 'IC - Dark' && modeName === 'Dark');

          if (isInputMode || isIcMirror) {
            const sourceVar = await figma.variables.getVariableByIdAsync(boundVariable.id);
            if (sourceVar) {
              variable.setValueForMode(modeIds[modeName], figma.variables.createVariableAlias(sourceVar));
              aliased++;
              continue;
            }
          }
        }

        // Tier 3: Fallback — use pre-generated color values
        const hexColor = colors[modeName];
        const modeOpacity = opacities ? opacities[modeName] : 100;
        if (hexColor) {
          variable.setValueForMode(modeIds[modeName], hexToRgba(hexColor, modeOpacity));
        }
      }
    }

    let applied = 0;
    if (applyToLayers && entryVariableMap.length > 0) {
      for (const { nodeId, variable } of entryVariableMap) {
        const node = await figma.getNodeByIdAsync(nodeId) as SceneNode;
        if (!node || !('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) continue;
        const fill = node.fills[0];
        if (fill.type !== 'SOLID') continue;
        const solidFill: SolidPaint = {
          type: 'SOLID',
          color: fill.color,
          opacity: fill.opacity
        };
        const boundFill = figma.variables.setBoundVariableForPaint(solidFill, 'color', variable);
        const newFills = [...node.fills];
        newFills[0] = boundFill;
        (node as GeometryMixin).fills = newFills;
        applied++;
      }
    }

    const parts = [`created ${created}`, `updated ${updated}`, `aliased ${aliased} mode values`];
    if (applied > 0) parts.push(`applied to ${applied} layer${applied > 1 ? 's' : ''}`);

    figma.ui.postMessage({
      type: 'modemaker-success',
      message: `Bulk: ${parts.join(', ')} across ${modeNames.length} mode${modeNames.length > 1 ? 's' : ''}`
    });

    updateCollections();
  }
};

