figma.showUI(__html__, { width: 320, height: 300 });

// Send collections to UI on load
async function updateCollections() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionData = collections.map(c => ({ id: c.id, name: c.name }));
  figma.ui.postMessage({ type: 'collections', collections: collectionData });
}

updateCollections();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-variables') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Please select at least one layer' });
      return;
    }

    // Get or create collection
    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    if (msg.collectionId) {
      collection = collections.find(c => c.id === msg.collectionId)!;
    } else {
      // Create new collection
      collection = figma.variables.createVariableCollection('Color Variables');
    }

    const createdCount = { new: 0, updated: 0 };

    for (const node of selection) {
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        const fill = node.fills[0];
        
        if (fill.type === 'SOLID') {
          const fullName = node.name;
          const color = fill.color;
          
          // Parse layer name for mode pattern: "variableName -modeName"
          let variableName = fullName;
          let modeName: string | null = null;
          
          if (fullName.includes(' -')) {
            const parts = fullName.split(' -');
            variableName = parts[0].trim();
            modeName = parts[1].trim();
          }
          
          // Get or create the mode
          let modeId: string;
          if (modeName) {
            // Check if mode exists
            let existingMode = collection.modes.find(m => m.name === modeName);
            
            if (!existingMode) {
              // Create new mode
              modeId = collection.addMode(modeName);
            } else {
              modeId = existingMode.modeId;
            }
          } else {
            // Use default mode
            modeId = collection.modes[0].modeId;
          }
          
          // Check if variable already exists
          const existingVariables = collection.variableIds
            .map(id => figma.variables.getVariableById(id))
            .filter((v): v is Variable => v !== null);
          
          const existingVar = existingVariables.find(v => v.name === variableName);
          
          const colorValue = {
            r: color.r,
            g: color.g,
            b: color.b,
            a: fill.opacity !== undefined ? fill.opacity : 1
          };
          
          if (existingVar) {
            // Update existing variable
            existingVar.setValueForMode(modeId, colorValue);
            createdCount.updated++;
          } else {
            // Create new variable
            const variable = figma.variables.createVariable(variableName, collection.id, 'COLOR');
            variable.setValueForMode(modeId, colorValue);
            createdCount.new++;
          }
        }
      }
    }

    figma.ui.postMessage({ 
      type: 'success', 
      message: `Created ${createdCount.new} new variables, updated ${createdCount.updated} existing variables` 
    });
    
    // Update collections list
    updateCollections();
  }

  if (msg.type === 'refresh-collections') {
    updateCollections();
  }

  if (msg.type === 'extract-primitives') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'extract-error', message: 'Please select at least one layer' });
      return;
    }

    // Get or create collection
    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    if (msg.collectionId) {
      collection = collections.find(c => c.id === msg.collectionId)!;
    } else {
      collection = figma.variables.createVariableCollection('Primitives');
    }

    const createdCount = { new: 0, updated: 0, skipped: 0 };

    // Sort selection by parent, then by position within parent (matching layer panel order)
    const sortedSelection = [...selection].sort((a, b) => {
      const parentA = a.parent;
      const parentB = b.parent;
      
      // If different parents, sort by parent index within grandparent
      if (parentA !== parentB && parentA?.parent === parentB?.parent) {
        const grandparent = parentA?.parent;
        if (grandparent && 'children' in grandparent) {
          const indexA = grandparent.children.indexOf(parentA as SceneNode);
          const indexB = grandparent.children.indexOf(parentB as SceneNode);
          return indexA - indexB;
        }
      }
      
      // Same parent: sort by index within parent
      if (parentA && 'children' in parentA) {
        const indexA = parentA.children.indexOf(a as SceneNode);
        const indexB = parentA.children.indexOf(b as SceneNode);
        return indexA - indexB;
      }
      return 0;
    });

    for (const node of sortedSelection) {
      if (!('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) {
        createdCount.skipped++;
        continue;
      }

      const fill = node.fills[0];
      if (fill.type !== 'SOLID') {
        createdCount.skipped++;
        continue;
      }

      // Get foreground color and layer opacity
      const fgColor = fill.color;
      const fillOpacity = fill.opacity !== undefined ? fill.opacity : 1;
      const layerOpacity = 'opacity' in node ? node.opacity : 1;
      const totalOpacity = fillOpacity * layerOpacity;

      // Get parent frame's background color
      const parent = node.parent;
      let bgColor = { r: 1, g: 1, b: 1 }; // Default to white
      
      if (parent && 'fills' in parent && Array.isArray(parent.fills) && parent.fills.length > 0) {
        const parentFill = parent.fills[0];
        if (parentFill.type === 'SOLID') {
          bgColor = parentFill.color;
        }
      }

      // Alpha blend: result = fg * alpha + bg * (1 - alpha)
      const blendedColor = {
        r: fgColor.r * totalOpacity + bgColor.r * (1 - totalOpacity),
        g: fgColor.g * totalOpacity + bgColor.g * (1 - totalOpacity),
        b: fgColor.b * totalOpacity + bgColor.b * (1 - totalOpacity),
        a: 1
      };

      // Build variable name from the applied variable's name (last segment only)
      let groupName = 'Ungrouped';
      
      // Check if fill has a bound variable
      if (fill.boundVariables?.color) {
        const boundVar = figma.variables.getVariableById(fill.boundVariables.color.id);
        if (boundVar) {
          // Get only the last part of the variable name (e.g., "Group/Group/Red" → "Red")
          const parts = boundVar.name.split('/');
          groupName = parts[parts.length - 1];
        }
      }
      
      const variableName = `${groupName}/${node.name}`;

      // Check if variable already exists
      const existingVariables = collection.variableIds
        .map(id => figma.variables.getVariableById(id))
        .filter((v): v is Variable => v !== null);
      
      const existingVar = existingVariables.find(v => v.name === variableName);
      const modeId = collection.modes[0].modeId;

      if (existingVar) {
        existingVar.setValueForMode(modeId, blendedColor);
        createdCount.updated++;
      } else {
        const variable = figma.variables.createVariable(variableName, collection.id, 'COLOR');
        variable.setValueForMode(modeId, blendedColor);
        createdCount.new++;
      }
    }

    figma.ui.postMessage({ 
      type: 'extract-success', 
      message: `Created ${createdCount.new} new, updated ${createdCount.updated}, skipped ${createdCount.skipped}` 
    });
    
    updateCollections();
  }

  if (msg.type === 'interpolate-colors') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'interpolate-error', message: 'Please select key color layers' });
      return;
    }

    // Get or create collection
    let collection: VariableCollection;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    if (msg.collectionId) {
      collection = collections.find(c => c.id === msg.collectionId)!;
    } else {
      collection = figma.variables.createVariableCollection('Interpolated Colors');
    }

    // Parse selection into key colors
    interface KeyColor {
      position: number;
      mode: 'Light' | 'Dark';
      color: RGB;
      groupName: string;
    }

    const keyColors: KeyColor[] = [];
    let groupName = 'Color';

    for (const node of selection) {
      if (!('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) continue;
      const fill = node.fills[0];
      if (fill.type !== 'SOLID') continue;

      // Get group name from parent
      if (node.parent) {
        groupName = node.parent.name;
      }

      // Parse layer name: "300", "500 (Light)", "500 (Dark)", "700"
      const name = node.name.trim();
      let position: number;
      let mode: 'Light' | 'Dark';

      if (name.includes('(Light)')) {
        position = parseInt(name.replace('(Light)', '').trim());
        mode = 'Light';
      } else if (name.includes('(Dark)')) {
        position = parseInt(name.replace('(Dark)', '').trim());
        mode = 'Dark';
      } else {
        position = parseInt(name);
        // Determine mode based on position: <= 500 is Light, > 500 is Dark
        mode = position <= 500 ? 'Light' : 'Dark';
      }

      if (!isNaN(position)) {
        keyColors.push({
          position,
          mode,
          color: fill.color,
          groupName
        });
      }
    }

    if (keyColors.length === 0) {
      figma.ui.postMessage({ type: 'interpolate-error', message: 'No valid key colors found. Name layers like "300", "500 (Light)", etc.' });
      return;
    }

    // Separate into Light and Dark keys
    const lightKeys = keyColors.filter(k => k.mode === 'Light').sort((a, b) => a.position - b.position);
    const darkKeys = keyColors.filter(k => k.mode === 'Dark').sort((a, b) => a.position - b.position);

    // Helper: linear interpolation between two colors
    function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
      return {
        r: c1.r + (c2.r - c1.r) * t,
        g: c1.g + (c2.g - c1.g) * t,
        b: c1.b + (c2.b - c1.b) * t
      };
    }

    // Helper: lighten color (mix toward white)
    function lightenColor(c: RGB, amount: number): RGB {
      return lerpColor(c, { r: 1, g: 1, b: 1 }, amount);
    }

    // Helper: darken color (mix toward black)
    function darkenColor(c: RGB, amount: number): RGB {
      return lerpColor(c, { r: 0, g: 0, b: 0 }, amount);
    }

    // Helper: interpolate color at position given sorted key array
    function getColorAtPosition(keys: KeyColor[], pos: number, scaleStart: number, scaleEnd: number, isLight: boolean): RGB {
      if (keys.length === 0) {
        return { r: 0.5, g: 0.5, b: 0.5 }; // Fallback gray
      }

      // Find surrounding keys
      let lowerKey: KeyColor | null = null;
      let upperKey: KeyColor | null = null;

      for (const key of keys) {
        if (key.position <= pos) lowerKey = key;
        if (key.position >= pos && !upperKey) upperKey = key;
      }

      // Handle edge cases with auto-lighten/darken
      if (!lowerKey && upperKey) {
        // Position is before first key - lighten/darken toward scale start
        const t = (upperKey.position - pos) / (upperKey.position - scaleStart);
        return isLight ? lightenColor(upperKey.color, t * 0.9) : darkenColor(upperKey.color, t * 0.9);
      }

      if (!upperKey && lowerKey) {
        // Position is after last key - lighten/darken toward scale end
        const t = (pos - lowerKey.position) / (scaleEnd - lowerKey.position);
        return isLight ? lightenColor(lowerKey.color, t * 0.9) : darkenColor(lowerKey.color, t * 0.9);
      }

      if (lowerKey && upperKey) {
        if (lowerKey.position === upperKey.position) {
          return lowerKey.color;
        }
        // Interpolate between keys
        const t = (pos - lowerKey.position) / (upperKey.position - lowerKey.position);
        return lerpColor(lowerKey.color, upperKey.color, t);
      }

      return { r: 0.5, g: 0.5, b: 0.5 };
    }

    const createdCount = { new: 0, updated: 0 };
    const modeId = collection.modes[0].modeId;

    // Get existing variables for update check
    const existingVariables = collection.variableIds
      .map(id => figma.variables.getVariableById(id))
      .filter((v): v is Variable => v !== null);

    // Generate Light scale: 000-500
    const lightPositions = [0, 100, 200, 300, 400, 500];
    for (const pos of lightPositions) {
      const color = getColorAtPosition(lightKeys, pos, 0, 500, true);
      // Only 500 gets the (Light) suffix
      const posStr = pos.toString().padStart(3, '0');
      const varName = pos === 500 ? `${groupName}/${posStr} (Light)` : `${groupName}/${posStr}`;
      
      const colorValue = { r: color.r, g: color.g, b: color.b, a: 1 };
      const existingVar = existingVariables.find(v => v.name === varName);

      if (existingVar) {
        existingVar.setValueForMode(modeId, colorValue);
        createdCount.updated++;
      } else {
        const variable = figma.variables.createVariable(varName, collection.id, 'COLOR');
        variable.setValueForMode(modeId, colorValue);
        createdCount.new++;
      }
    }

    // Generate Dark scale: 500-1000
    const darkPositions = [500, 600, 700, 800, 900, 1000];
    for (const pos of darkPositions) {
      const color = getColorAtPosition(darkKeys, pos, 500, 1000, false);
      // Only 500 gets the (Dark) suffix
      const posStr = pos.toString().padStart(3, '0');
      const varName = pos === 500 ? `${groupName}/${posStr} (Dark)` : `${groupName}/${posStr}`;
      
      const colorValue = { r: color.r, g: color.g, b: color.b, a: 1 };
      const existingVar = existingVariables.find(v => v.name === varName);

      if (existingVar) {
        existingVar.setValueForMode(modeId, colorValue);
        createdCount.updated++;
      } else {
        const variable = figma.variables.createVariable(varName, collection.id, 'COLOR');
        variable.setValueForMode(modeId, colorValue);
        createdCount.new++;
      }
    }

    figma.ui.postMessage({ 
      type: 'interpolate-success', 
      message: `Created ${createdCount.new} new, updated ${createdCount.updated} variables` 
    });
    
    updateCollections();
  }

  if (msg.type === 'generate-layers') {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collection = collections.find(c => c.id === msg.collectionId);
    
    if (!collection) {
      figma.ui.postMessage({ type: 'generate-error', message: 'Collection not found' });
      return;
    }

    // Get all color variables from the collection
    const variables = collection.variableIds
      .map(id => figma.variables.getVariableById(id))
      .filter((v): v is Variable => v !== null && v.resolvedType === 'COLOR');

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
          
          // Apply color (not connected to variable)
          rect.fills = [{
            type: 'SOLID',
            color: { r: colorValue.r, g: colorValue.g, b: colorValue.b },
            opacity: colorValue.a !== undefined ? colorValue.a : 1
          }];

          modeFrame.appendChild(rect);
          layerCount++;
        }

        groupFrame.appendChild(modeFrame);
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
};

