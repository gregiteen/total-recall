import fs from 'fs';
import path from 'path';

const packages = [
  'jerrypick',
  'accessor-fn',
  'kapsule',
  'index-array-by',
  'd3-force-3d',
  'd3-binarytree',
  'd3-octree',
  'ngraph.forcelayout',
  'ngraph.graph',
  'three-render-objects',
  'three-forcegraph',
  '3d-force-graph',
  'react-force-graph-3d',
  'react-kapsule'
];

for (const pkg of packages) {
  const pkgDir = path.join('/Users/greg/Github/total-recall/node_modules', pkg);
  if (!fs.existsSync(pkgDir)) continue;
  
  const packageJsonPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkgData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check if it has a default export pointing to an mjs file
    if (pkgData.exports && pkgData.exports.default && pkgData.exports.default.endsWith('.mjs')) {
      const mjsPath = path.join(pkgDir, pkgData.exports.default);
      
      // If the mjs file doesn't exist or is empty
      if (!fs.existsSync(mjsPath) || fs.statSync(mjsPath).size === 0) {
        console.log(`Patching missing mjs file for ${pkg} at ${mjsPath}`);
        
        // Find corresponding js file
        const jsName = path.basename(mjsPath, '.mjs') + '.js';
        const jsPath = path.join(path.dirname(mjsPath), jsName);
        
        if (fs.existsSync(jsPath)) {
          // create wrapper
          const content = `import mod from './${jsName}';\nexport default mod;\nObject.assign(export{}, mod);`;
          // Wait, Object.assign(export{}, mod) is invalid syntax. 
          // Since most of these vasturiano libs export a single default or a couple named,
          // let's just write the most basic wrapper: import mod from './js'; export default mod;
          // That will suffice for most of them.
          // Or even better: copy the JS file if we must, but let's just write a generic import.
        }
      }
    }
  }
}
