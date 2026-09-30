#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the root directory (parent of scripts directory)
const rootDir = path.dirname(__dirname);

// Paths
const sourceFile = path.join(rootDir, 'apps', 'web', 'build', 'server', 'index.js');
const targetDir = path.join(rootDir, 'netlify', 'functions', 'build-server');
const targetFile = path.join(targetDir, 'index.js');

console.log(`[Build] Copying server build...`);
console.log(`[Build] Root: ${rootDir}`);
console.log(`[Build] Source: ${sourceFile}`);
console.log(`[Build] Target: ${targetFile}`);

try {
  // Check if source exists
  if (!fs.existsSync(sourceFile)) {
    console.error(`[Build] ERROR: Source file does not exist: ${sourceFile}`);
    process.exit(1);
  }

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    console.log(`[Build] Creating directory: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy the file
  console.log(`[Build] Copying file...`);
  fs.copyFileSync(sourceFile, targetFile);

  // Verify the copy
  if (fs.existsSync(targetFile)) {
    const stats = fs.statSync(targetFile);
    console.log(`[Build] SUCCESS: File copied (${stats.size} bytes)`);
  } else {
    console.error(`[Build] ERROR: File copy failed - target file not found`);
    process.exit(1);
  }
} catch (error) {
  console.error(`[Build] ERROR: ${error.message}`);
  process.exit(1);
}
