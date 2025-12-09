figma.showUI(__html__, { width: 320, height: 240 });

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
};

