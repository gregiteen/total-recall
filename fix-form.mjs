import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// I swapped the wrong tags.
// Let's replace the </form> before <UsageChart with </div> to restore the grid closer.
content = content.replace(
  /<\/form>\n\n\s*<UsageChart/g,
  '</div>\n\n          <UsageChart'
);

// Now find the </div> right before that grid closer and change it to </form>
content = content.replace(
  /<\/div>\n\s*<\/div>\n\n\s*<UsageChart/g,
  '</form>\n            </div>\n\n          <UsageChart'
);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
