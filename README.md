# Color to Variable

A Figma plugin that converts layer fill colors into color variables based on layer names.

## Features

- Select layers with fill colors
- Automatically create color variables named after the layers
- Choose existing collection or create a new one
- Updates existing variables if they already exist

## Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. In Figma: `Plugins` → `Development` → `Import plugin from manifest`
5. Select the `manifest.json` file

## Usage

1. Select one or more layers with fill colors
2. Run the plugin
3. Choose a collection from the dropdown (or leave it to create a new one)
4. Click "Create Variables"
5. The plugin will create/update color variables with the layer names

## Development

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and compile automatically

